import { PhotoAsset } from "../types";

// A Similar Group only means something as a comparison, so it needs at least two
// surviving members. Groups can shrink below that when photos are deleted outside
// the app — those are degenerate and get dropped from pending rather than reviewed.
const MIN_GROUP_SIZE = 2;

export interface ReviewableGroup {
  // The group's original id list — its identity in pending Similar Groups storage.
  // Kept separate from `photos` because removeGroup() matches on the exact stored
  // member set, which still includes members that no longer resolve.
  ids: string[];
  // The members that still resolve to a real asset, in their original order.
  photos: PhotoAsset[];
}

export interface GroupReviewSessionState {
  groups: ReviewableGroup[];
  index: number;
  // Ids in the current group marked for deletion. Empty means every photo is kept,
  // which is the starting state for each group.
  marked: string[];
}

export interface ResolvedGroups {
  reviewable: ReviewableGroup[];
  // The original id lists of groups that can no longer be reviewed, so the caller
  // can remove them from pending Similar Groups via removeGroup().
  degenerate: string[][];
}

export function resolveGroups(
  idGroups: string[][],
  assetsById: ReadonlyMap<string, PhotoAsset>
): ResolvedGroups {
  const reviewable: ReviewableGroup[] = [];
  const degenerate: string[][] = [];

  for (const ids of idGroups) {
    const photos = ids
      .map((id) => assetsById.get(id))
      .filter((a): a is PhotoAsset => a !== undefined);

    if (photos.length >= MIN_GROUP_SIZE) {
      reviewable.push({ ids, photos });
    } else {
      degenerate.push(ids);
    }
  }

  return { reviewable, degenerate };
}

export function createGroupReviewSession(groups: ReviewableGroup[]): GroupReviewSessionState {
  return { groups, index: 0, marked: [] };
}

export function currentGroup(state: GroupReviewSessionState): ReviewableGroup | undefined {
  return state.groups[state.index];
}

export function isComplete(state: GroupReviewSessionState): boolean {
  return state.index >= state.groups.length;
}

export function toggleMark(
  state: GroupReviewSessionState,
  id: string
): GroupReviewSessionState {
  const marked = state.marked.includes(id)
    ? state.marked.filter((markedId) => markedId !== id)
    : [...state.marked, id];
  return { ...state, marked };
}

// Derived from the current group's resolvable photos, so an id that no longer
// resolves can never reach confirmReview as a deletion target.
export function markedAssets(state: GroupReviewSessionState): PhotoAsset[] {
  const group = currentGroup(state);
  if (!group) return [];
  return group.photos.filter((asset) => state.marked.includes(asset.id));
}

// Marks are per-group — advancing always starts the next group fresh, with every
// photo kept by default.
export function advance(state: GroupReviewSessionState): GroupReviewSessionState {
  return { ...state, index: state.index + 1, marked: [] };
}
