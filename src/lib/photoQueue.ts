import AsyncStorage from "@react-native-async-storage/async-storage";
import { buildQueue, SortMode } from "./buildQueue";
import { computeHash } from "./dHash";
import { reconcileAgainstLibrary } from "./groupReviewSession";
import { getKeptIds } from "./keptRegistry";
import { fetchAllPhotoIds, getAccessLevel } from "./mediaLibrary";
import { createPersistedJSON } from "./persistedJSON";
import { applyTopUpResult, PoolTopUpDependencies, PoolTopUpResult, topUpPool } from "./poolTopUp";
import { filterUnscanned, getGroupedIds, getHash, recordScanPass } from "./scanStatus";
import { getPendingGroups, setPendingGroups } from "./similarGroups";
import { nearestChronologicalNeighbors } from "./similarityMatch";
import { getSortMode } from "./sortPreference";

const QUEUE_KEY = "photoQueue:shuffledQueue";

const queueStore = createPersistedJSON<string[]>(AsyncStorage, QUEUE_KEY, []);

async function readQueue(): Promise<string[]> {
  return queueStore.get();
}

async function writeQueue(queue: string[]): Promise<void> {
  await queueStore.set(queue);
}

// Ids handed back to the queue by a top-up — the lone survivors of Similar Groups
// it retired. They were excluded from the queue as `grouped` and would otherwise
// sit out every flow until some later rebuild noticed them.
function appendMissing(queue: string[], ids: string[]): string[] {
  if (ids.length === 0) return queue;
  const present = new Set(queue);
  return [...queue, ...ids.filter((id) => !present.has(id))];
}

export async function rebuildQueue(mode?: SortMode): Promise<number> {
  const sortMode = mode ?? (await getSortMode());
  const [newestFirstIds, keptIds, groupedIds] = await Promise.all([
    fetchAllPhotoIds(),
    getKeptIds(),
    getGroupedIds(),
  ]);
  const baseQueue = buildQueue(newestFirstIds, keptIds, groupedIds, sortMode);
  // Hand the corpus straight to the top-up: it needs the same two fetches, and
  // enumerating a large library twice per rebuild is the most expensive thing
  // this function could do.
  const { result, returnedIds } = await topUpQueue(baseQueue.length, {
    chronologicalIds: newestFirstIds,
    keptIds,
  });
  const queue = appendMissing(applyTopUpResult(baseQueue, result), returnedIds);
  await writeQueue(queue);
  return queue.length;
}

interface Corpus {
  chronologicalIds: string[];
  unreviewedIds: string[];
}

interface TopUpContext {
  deps: PoolTopUpDependencies;
  loadCorpus: () => Promise<Corpus>;
}

export interface TopUpOutcome {
  result: PoolTopUpResult;
  returnedIds: string[];
}

// The chronological corpus/kept-ids fetch is only ever needed once poolSize
// drops to the low-water mark — topUpPool's fast path never calls these, so
// deferring the fetch inside them (instead of always prefetching before the
// call) keeps a healthy-sized pool free of the fetchAllPhotoIds() cost. The
// loader is memoized, so a caller that needs the corpus after the pass — the
// reconciliation below — reuses the one the scan already paid for, and a caller
// that already holds it seeds the memo instead of re-enumerating.
function createTopUpContext(seed?: { chronologicalIds: string[]; keptIds: Set<string> }): TopUpContext {
  const derive = (chronologicalIds: string[], keptIds: Set<string>): Corpus => ({
    chronologicalIds,
    unreviewedIds: chronologicalIds.filter((id) => !keptIds.has(id)),
  });

  let corpus: Promise<Corpus> | null = seed
    ? Promise.resolve(derive(seed.chronologicalIds, seed.keptIds))
    : null;
  const loadCorpus = () => {
    if (!corpus) {
      corpus = Promise.all([fetchAllPhotoIds(), getKeptIds()]).then(([chronologicalIds, keptIds]) =>
        derive(chronologicalIds, keptIds)
      );
    }
    return corpus;
  };

  return {
    loadCorpus,
    deps: {
      listUnscannedCandidates: async () => {
        const { unreviewedIds } = await loadCorpus();
        return filterUnscanned(unreviewedIds);
      },
      chronologicalNeighborIds: async (id, count) => {
        const { chronologicalIds } = await loadCorpus();
        return nearestChronologicalNeighbors(chronologicalIds, id, count);
      },
      getHash,
      computeHash,
      now: () => Date.now(),
    },
  };
}

// A library enumeration only confirms what's *gone* when it covers the whole
// library. Under limited access it's the user's chosen subset, so an absent id
// says nothing — pruning against it would forget photos the user still owns
// (ADR-0002). Undefined means "don't conclude anything from absence".
//
// An empty enumeration is refused too. "The user owns no photos" and "the
// enumeration came back wrong" look identical from here, and only one of them
// justifies discarding every scan record the app has.
async function loadLibraryIds(context: TopUpContext): Promise<Set<string> | undefined> {
  if ((await getAccessLevel()) !== "all") return undefined;
  const { chronologicalIds } = await context.loadCorpus();
  return chronologicalIds.length === 0 ? undefined : new Set(chronologicalIds);
}

// Reconciling needs a library enumeration, which is the exact cost topUpPool's
// fast path exists to avoid — so a pool that never runs dry would otherwise pay
// it on every single StartScreen mount. Once per app run is enough: groups
// collapse when photos are deleted outside the app, which the user has to leave
// to do. A stale count within one run still self-corrects on the review screen.
let reconciledThisRun = false;

// Hashes a random sample of unscanned photos (when the pool needs it), persists
// what it finds, and reconciles the pending Similar Groups against the library —
// see poolTopUp.ts / docs/adr/0001-windowed-random-similarity-scan.md.
async function topUpQueue(
  poolSize: number,
  seed?: { chronologicalIds: string[]; keptIds: Set<string> }
): Promise<TopUpOutcome> {
  const existingGroups = await getPendingGroups();
  const context = createTopUpContext(seed);
  const result = await topUpPool(poolSize, existingGroups, context.deps);

  // A pass that scanned already holds the corpus, so reconciling is free there.
  // Otherwise it's only worth an enumeration when there are groups to reconcile
  // and this run hasn't done it yet.
  const shouldReconcile =
    result.scanned || (result.groups.length > 0 && (!reconciledThisRun || seed !== undefined));
  if (!shouldReconcile) return { result, returnedIds: [] };

  const libraryIds = await loadLibraryIds(context);
  const reconciled =
    libraryIds === undefined
      ? { pending: result.groups, survivorIds: [] }
      : reconcileAgainstLibrary(result.groups, libraryIds);
  // Only a reconciliation that actually happened counts. Refusing the snapshot
  // costs a permission read, not an enumeration, and the access it refused on
  // can be widened from the start screen mid-run.
  if (libraryIds !== undefined) reconciledThisRun = true;

  // Three writes, ordered so that dying between any two of them leaves a photo
  // over-exposed rather than lost. A member that is `grouped` with no pending
  // group containing it is unreachable from every flow — buildQueue skips it and
  // no review can retire it — so `grouped` must never be the state that outlives
  // its group:
  //
  //   1. survivors leave `grouped` while their group is still pending — a crash
  //      here just replays that review (the ordering retireGroup uses),
  //   2. the pending list moves, adding this pass's groups and dropping retired
  //      ones,
  //   3. this pass's members become `grouped`, after the groups holding them
  //      exist — a crash here leaves them `cleared` and still reviewable.
  if (reconciled.survivorIds.length > 0) {
    await recordScanPass({ cleared: [], grouped: [], resolved: reconciled.survivorIds });
  }
  if (result.scanned || reconciled.pending !== result.groups) {
    await setPendingGroups(reconciled.pending);
  }
  if (result.scanned || libraryIds !== undefined) {
    await recordScanPass({ cleared: result.cleared, grouped: result.grouped, libraryIds });
  }

  return {
    result: { ...result, groups: reconciled.pending },
    returnedIds: reconciled.survivorIds,
  };
}

export async function ensureQueue(): Promise<number> {
  const queue = await readQueue();
  if (queue.length === 0) {
    // rebuildQueue tops up on its own, so a cold start gets a scan pass too.
    return rebuildQueue();
  }

  const { result, returnedIds } = await topUpQueue(queue.length);
  const updated = appendMissing(applyTopUpResult(queue, result), returnedIds);
  if (result.scanned || returnedIds.length > 0) await writeQueue(updated);
  return updated.length;
}

export async function remainingCount(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

export async function takeNextBatch(n = 30): Promise<string[]> {
  const queue = await readQueue();
  const batch = queue.slice(0, n);
  await writeQueue(queue.slice(n));
  return batch;
}

export async function returnToQueue(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const queue = await readQueue();
  await writeQueue([...ids, ...queue]);
}
