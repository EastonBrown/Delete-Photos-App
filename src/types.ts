export interface PhotoAsset {
  id: string;
  uri: string;
  width: number;
  height: number;
}

export type SwipeDirection = "left" | "right";

export interface SwipeDecision {
  asset: PhotoAsset;
  direction: SwipeDirection;
}
