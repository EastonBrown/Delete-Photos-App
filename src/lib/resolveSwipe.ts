import { SwipeDirection } from "../types";

export function resolveSwipe(
  dx: number,
  vx: number,
  threshold: number,
  velocityThreshold = 0.8
): SwipeDirection | null {
  const shouldSwipe = Math.abs(dx) > threshold || Math.abs(vx) > velocityThreshold;
  if (!shouldSwipe) return null;
  return dx > 0 ? "right" : "left";
}
