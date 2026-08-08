import { AssetLookup, PhotoAsset } from "../types";

// A Similar Group only means something as a comparison, so it needs at least two
// surviving members. Groups can shrink below that when photos are deleted outside
// the app — those have collapsed and get dropped from pending rather than reviewed.
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
  // The original id lists of collapsed groups — too few members survive and every
  // one that didn't is confirmed gone. Safe for the caller to retire via
  // removeGroup(), which hands any lone survivor back to the per-photo queue.
  collapsed: string[][];
  // Groups that can't be judged right now because at least one member failed to
  // load. Left pending, untouched: they may well be reviewable on the next attempt.
  deferred: string[][];
}

export function resolveGroups(
  idGroups: string[][],
  lookupsById: ReadonlyMap<string, AssetLookup>
): ResolvedGroups {
  const reviewable: ReviewableGroup[] = [];
  const collapsed: string[][] = [];
  const deferred: string[][] = [];

  for (const ids of idGroups) {
    // An id nobody looked up is unavailable, not missing. Defaulting the other way
    // would retire a group on the strength of a lookup that never happened.
    const results = ids.map(
      (id): AssetLookup => lookupsById.get(id) ?? { status: "unavailable" }
    );
    const photos = results
      .filter((r) => r.status === "found")
      .map((r) => (r as { status: "found"; asset: PhotoAsset }).asset);

    if (photos.length >= MIN_GROUP_SIZE) {
      // Two survivors make a real comparison. An unavailable third doesn't block it —
      // retiring the group returns that member to the normal per-photo queue.
      reviewable.push({ ids, photos });
    } else if (results.some((r) => r.status === "unavailable")) {
      deferred.push(ids);
    } else {
      collapsed.push(ids);
    }
  }

  return { reviewable, collapsed, deferred };
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
