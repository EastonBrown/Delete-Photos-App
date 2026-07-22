import { PhotoAsset } from "../types";

export interface ReviewDependencies {
  deleteAssets: (ids: string[]) => Promise<boolean>;
  markKept: (ids: string[]) => Promise<void>;
  incrementKept: (delta: number) => Promise<void>;
  incrementDeleted: (delta: number) => Promise<void>;
}

export type ConfirmReviewResult = { ok: true } | { ok: false; reason: string };

export async function confirmReview(
  candidates: PhotoAsset[],
  toDelete: PhotoAsset[],
  deps: ReviewDependencies
): Promise<ConfirmReviewResult> {
  try {
    const deleteIds = toDelete.map((a) => a.id);
    const success = await deps.deleteAssets(deleteIds);
    if (!success) {
      return { ok: false, reason: "Delete was cancelled or not completed." };
    }

    const kept = candidates.filter((a) => !toDelete.some((d) => d.id === a.id));
    await deps.markKept(kept.map((a) => a.id));
    await deps.incrementKept(kept.length);
    await deps.incrementDeleted(deleteIds.length);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Please try again." };
  }
}
