import { shuffle } from "./shuffle";

export type SortMode = "random" | "newestFirst" | "oldestFirst";

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
