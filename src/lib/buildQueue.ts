import { shuffle } from "./shuffle";

export type SortMode = "random" | "newestFirst" | "oldestFirst";

// newestFirstIds must already be ordered newest-first (creationTime descending,
// as fetchAllPhotoIds() returns) — buildQueue only filters/reorders, it never sorts by date.
// groupedIds are photos pending Similar Group review — excluded here so they're
// only ever reviewed through that flow, never the per-photo queue too.
export function buildQueue(
  newestFirstIds: string[],
  keptIds: Set<string>,
  groupedIds: Set<string>,
  sortMode: SortMode
): string[] {
  const eligible = newestFirstIds.filter((id) => !keptIds.has(id) && !groupedIds.has(id));
  if (sortMode === "random") return shuffle(eligible);
  if (sortMode === "oldestFirst") return [...eligible].reverse();
  return eligible;
}
