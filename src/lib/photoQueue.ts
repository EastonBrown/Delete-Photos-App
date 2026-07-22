import AsyncStorage from "@react-native-async-storage/async-storage";
import { buildQueue, SortMode } from "./buildQueue";
import { computeHash } from "./dHash";
import { getKeptIds } from "./keptRegistry";
import { fetchAllPhotoIds } from "./mediaLibrary";
import { createPersistedJSON } from "./persistedJSON";
import { applyTopUpResult, PoolTopUpDependencies, PoolTopUpResult, topUpPool } from "./poolTopUp";
import { filterUnscanned, getGroupedIds, getHash, setCleared, setGrouped } from "./scanStatus";
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

export async function rebuildQueue(mode?: SortMode): Promise<number> {
  const sortMode = mode ?? (await getSortMode());
  const [newestFirstIds, keptIds, groupedIds] = await Promise.all([
    fetchAllPhotoIds(),
    getKeptIds(),
    getGroupedIds(),
  ]);
  const baseQueue = buildQueue(newestFirstIds, keptIds, groupedIds, sortMode);
  const result = await topUpQueue(baseQueue.length);
  const queue = applyTopUpResult(baseQueue, result);
  await writeQueue(queue);
  return queue.length;
}

// The chronological corpus/kept-ids fetch is only ever needed once poolSize
// drops to the low-water mark — topUpPool's fast path never calls these, so
// deferring the fetch inside them (instead of always prefetching before the
// call) keeps a healthy-sized pool free of the fetchAllPhotoIds() cost.
function createTopUpDependencies(): PoolTopUpDependencies {
  let corpus: Promise<{ chronologicalIds: string[]; unreviewedIds: string[] }> | null = null;
  const loadCorpus = () => {
    if (!corpus) {
      corpus = Promise.all([fetchAllPhotoIds(), getKeptIds()]).then(
        ([chronologicalIds, keptIds]) => ({
          chronologicalIds,
          unreviewedIds: chronologicalIds.filter((id) => !keptIds.has(id)),
        })
      );
    }
    return corpus;
  };

  return {
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
  };
}

// Hashes a random sample of unscanned photos (when the pool needs it) and
// persists what it finds — see poolTopUp.ts / docs/adr/0001-windowed-random-similarity-scan.md.
async function topUpQueue(poolSize: number): Promise<PoolTopUpResult> {
  const existingGroups = await getPendingGroups();
  const result = await topUpPool(poolSize, existingGroups, createTopUpDependencies());
  if (!result.scanned) return result;

  await Promise.all([
    ...result.cleared.map(({ id, hash }) => setCleared(id, hash)),
    ...result.grouped.map(({ id, hash }) => setGrouped(id, hash)),
    setPendingGroups(result.groups),
  ]);

  return result;
}

export async function ensureQueue(): Promise<number> {
  const queue = await readQueue();
  if (queue.length === 0) {
    // rebuildQueue tops up on its own, so a cold start gets a scan pass too.
    return rebuildQueue();
  }

  const result = await topUpQueue(queue.length);
  const updated = applyTopUpResult(queue, result);
  if (result.scanned) await writeQueue(updated);
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
