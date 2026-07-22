export type SortMode = "random" | "newestFirst" | "oldestFirst";

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// newestFirstIds must already be ordered newest-first (creationTime descending,
// as fetchAllPhotoIds() returns) — buildQueue only filters/reorders, it never sorts by date.
export function buildQueue(
  newestFirstIds: string[],
  keptIds: Set<string>,
  sortMode: SortMode
): string[] {
  const unreviewed = newestFirstIds.filter((id) => !keptIds.has(id));
  if (sortMode === "random") return shuffle(unreviewed);
  if (sortMode === "oldestFirst") return [...unreviewed].reverse();
  return unreviewed;
}
