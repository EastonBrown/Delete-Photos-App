import { shuffle } from "./shuffle";
import { DEFAULT_SIMILARITY_THRESHOLD, Hash, isSimilarHash, mergeMatch } from "./similarityMatch";

// Defaults from the windowed similarity scan design — see
// docs/adr/0001-windowed-random-similarity-scan.md. Fixed constants for now,
// expected to be tuned after real-world use.
export const DEFAULT_LOW_WATER_MARK = 5000;
export const DEFAULT_HIGH_WATER_MARK = 10000;
export const DEFAULT_TIME_BUDGET_MS = 5000;
export const DEFAULT_NEIGHBOR_COUNT = 4;

export interface PoolTopUpDependencies {
  // Ids that are both unreviewed and unscanned — the sampling pool for a top-up.
  listUnscannedCandidates: () => Promise<string[]>;
  // Nearest chronological neighbor ids for a photo, regardless of scan status.
  chronologicalNeighborIds: (id: string, count: number) => Promise<string[]>;
  // A previously-cached hash for an already-scanned photo, undefined if unscanned.
  getHash: (id: string) => Promise<Hash | undefined>;
  computeHash: (id: string) => Promise<Hash>;
  now: () => number;
}

export interface PoolTopUpConfig {
  lowWaterMark?: number;
  highWaterMark?: number;
  timeBudgetMs?: number;
  neighborCount?: number;
  similarityThreshold?: number;
}

export interface ScannedPhoto {
  id: string;
  hash: Hash;
}

export interface PoolTopUpResult {
  // False means the pool was above the low-water mark — the fast path, no scanning.
  scanned: boolean;
  cleared: ScannedPhoto[];
  grouped: ScannedPhoto[];
  groups: string[][];
}

// Tops up the review pool when it's run low, by hashing a random sample of
// unscanned candidates and comparing each against the cached hashes of its
// nearest chronological neighbors. Neighbors hashed earlier in this same pass
// are also considered (via the local session cache below), so a chain like
// A~B~C can still group correctly even though A and C are never compared
// directly — see mergeMatch's single-linkage semantics in similarityMatch.ts.
export async function topUpPool(
  poolSize: number,
  existingGroups: string[][],
  deps: PoolTopUpDependencies,
  config: PoolTopUpConfig = {}
): Promise<PoolTopUpResult> {
  const lowWaterMark = config.lowWaterMark ?? DEFAULT_LOW_WATER_MARK;
  const highWaterMark = config.highWaterMark ?? DEFAULT_HIGH_WATER_MARK;
  const timeBudgetMs = config.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;
  const neighborCount = config.neighborCount ?? DEFAULT_NEIGHBOR_COUNT;
  const similarityThreshold = config.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;

  if (poolSize > lowWaterMark) {
    return { scanned: false, cleared: [], grouped: [], groups: existingGroups };
  }

  const startTime = deps.now();
  const candidates = shuffle(await deps.listUnscannedCandidates());

  // Keyed by id so a candidate cleared earlier this pass can be moved to
  // grouped if a later-processed candidate turns out to match it — otherwise
  // it would wrongly end up in both `cleared` and `groups` at once.
  const cleared = new Map<string, Hash>();
  const grouped = new Map<string, Hash>();
  const sessionHashes = new Map<string, Hash>();
  let groups = existingGroups;
  let currentPoolSize = poolSize;

  function reclassifyAsGrouped(candidateId: string, candidateHash: Hash): void {
    if (grouped.has(candidateId)) return;
    if (cleared.delete(candidateId)) currentPoolSize--;
    grouped.set(candidateId, candidateHash);
  }

  for (const id of candidates) {
    if (currentPoolSize >= highWaterMark) break;
    if (deps.now() - startTime >= timeBudgetMs) break;

    const hash = await deps.computeHash(id);
    sessionHashes.set(id, hash);

    const neighborIds = await deps.chronologicalNeighborIds(id, neighborCount);
    const matchedNeighbors: string[] = [];
    for (const neighborId of neighborIds) {
      const neighborHash = sessionHashes.get(neighborId) ?? (await deps.getHash(neighborId));
      if (neighborHash !== undefined && isSimilarHash(hash, neighborHash, similarityThreshold)) {
        matchedNeighbors.push(neighborId);
      }
    }

    if (matchedNeighbors.length > 0) {
      reclassifyAsGrouped(id, hash);
      for (const neighborId of matchedNeighbors) {
        groups = mergeMatch(groups, id, neighborId);
        // Only reclassify neighbors this pass itself cleared — a neighbor
        // known solely via deps.getHash was cleared in a past pass and is
        // left untouched, matching the cached-hash comparison the ADR describes.
        const neighborHash = sessionHashes.get(neighborId);
        if (neighborHash !== undefined) reclassifyAsGrouped(neighborId, neighborHash);
      }
    } else {
      cleared.set(id, hash);
      currentPoolSize++;
    }
  }

  const toScannedPhotos = (byId: Map<string, Hash>): ScannedPhoto[] =>
    [...byId].map(([photoId, hash]) => ({ id: photoId, hash }));

  return {
    scanned: true,
    cleared: toScannedPhotos(cleared),
    grouped: toScannedPhotos(grouped),
    groups,
  };
}
