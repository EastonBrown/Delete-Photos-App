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
// nearest chronological neighbors — whether cached earlier this same pass
// (via the local session cache below) or in a past pass (via deps.getHash).
// A matched neighbor is reclassified grouped either way, so a chain like
// A~B~C still ends up correctly grouped even though A and C are never
// compared directly — see mergeMatch's single-linkage semantics in
// similarityMatch.ts — and no group member is ever left with a stale
// `cleared` scan status.
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
    const matchedNeighbors: ScannedPhoto[] = [];
    for (const neighborId of neighborIds) {
      const neighborHash = sessionHashes.get(neighborId) ?? (await deps.getHash(neighborId));
      if (neighborHash !== undefined && isSimilarHash(hash, neighborHash, similarityThreshold)) {
        matchedNeighbors.push({ id: neighborId, hash: neighborHash });
      }
    }

    if (matchedNeighbors.length > 0) {
      reclassifyAsGrouped(id, hash);
      for (const neighbor of matchedNeighbors) {
        groups = mergeMatch(groups, id, neighbor.id);
        // Reclassify the neighbor too, even when it was only ever cleared in
        // a past pass (found via deps.getHash) — it's now a live member of a
        // Similar Group, so its scan status must flip to grouped as well, or
        // buildQueue would keep offering it in the normal per-photo queue.
        reclassifyAsGrouped(neighbor.id, neighbor.hash);
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

// Reconciles a persisted queue against a completed top-up: drops newly-grouped
// ids (no longer eligible for the normal per-photo queue) and appends
// newly-cleared ids that aren't already present — a queue built via a full
// buildQueue rebuild may already include every unscanned id, so this avoids
// duplicating them.
export function applyTopUpResult(queue: string[], result: PoolTopUpResult): string[] {
  if (!result.scanned) return queue;

  const groupedIds = new Set(result.grouped.map((photo) => photo.id));
  const remaining = queue.filter((id) => !groupedIds.has(id));

  const remainingIds = new Set(remaining);
  const newlyClearedIds = result.cleared
    .map((photo) => photo.id)
    .filter((id) => !remainingIds.has(id));

  return [...remaining, ...newlyClearedIds];
}
