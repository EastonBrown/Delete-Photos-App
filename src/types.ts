export interface PhotoAsset {
  id: string;
  uri: string;
  width: number;
  height: number;
}

// The result of resolving a persisted photo id against the media library. The
// distinction that matters is `missing` vs `unavailable`: a photo the library says
// is gone can be forgotten, but a photo we merely failed to load must never be
// treated as deleted — see docs/adr/0002-unavailable-is-not-deleted.md.
export type AssetLookup =
  | { status: "found"; asset: PhotoAsset }
  | { status: "missing" }
  | { status: "unavailable" };

export type SwipeDirection = "left" | "right";

export interface SwipeDecision {
  asset: PhotoAsset;
  direction: SwipeDirection;
}
