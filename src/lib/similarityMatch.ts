export type Hash = bigint;

export function hammingDistance(a: Hash, b: Hash): number {
  let bits = a ^ b;
  let count = 0;
  while (bits > 0n) {
    count += Number(bits & 1n);
    bits >>= 1n;
  }
  return count;
}

// ~5 bits out of a 64-bit dHash — a reasonable default, expected to be tuned after real-world use.
export const DEFAULT_SIMILARITY_THRESHOLD = 5;

// orderedIds is chronologically ordered (either direction) — "nearest" means
// closest by position in that ordering, not closest by hash value.
export function nearestChronologicalNeighbors(
  orderedIds: string[],
  targetId: string,
  count: number
): string[] {
  const targetIndex = orderedIds.indexOf(targetId);
  if (targetIndex === -1) return [];

  const neighbors: string[] = [];
  for (let distance = 1; neighbors.length < count; distance++) {
    const before = targetIndex - distance;
    const after = targetIndex + distance;
    if (before < 0 && after >= orderedIds.length) break;
    if (before >= 0) neighbors.push(orderedIds[before]);
    if (neighbors.length >= count) break;
    if (after < orderedIds.length) neighbors.push(orderedIds[after]);
  }
  return neighbors.slice(0, count);
}

export function findGroupContaining(groups: string[][], id: string): string[] | undefined {
  return groups.find((group) => group.includes(id));
}

// Single-linkage/transitive grouping: a matching pair joins into a group, and
// two matching groups merge into one — so membership grows transitively across
// separate calls even when the bridging pair (e.g. A and C) is never compared.
export function mergeMatch(groups: string[][], idA: string, idB: string): string[][] {
  const groupA = findGroupContaining(groups, idA);
  const groupB = findGroupContaining(groups, idB);

  if (groupA && groupB) {
    if (groupA === groupB) return groups;
    const merged = [...new Set([...groupA, ...groupB])];
    return [merged, ...groups.filter((group) => group !== groupA && group !== groupB)];
  }

  if (groupA) return groups.map((group) => (group === groupA ? [...group, idB] : group));
  if (groupB) return groups.map((group) => (group === groupB ? [...group, idA] : group));

  return [...groups, [idA, idB]];
}

export function isSimilarHash(
  a: Hash,
  b: Hash,
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD
): boolean {
  return hammingDistance(a, b) < threshold;
}
