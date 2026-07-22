import { describe, expect, it, vi } from "vitest";
import { PhotoAsset } from "../types";
import { confirmReview, ReviewDependencies } from "./reviewSession";

function makeCandidates(n: number): PhotoAsset[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `id-${i}`,
    uri: `uri-${i}`,
    width: 100,
    height: 100,
  }));
}

function makeDeps(overrides: Partial<ReviewDependencies> = {}): ReviewDependencies {
  return {
    deleteAssets: vi.fn().mockResolvedValue(true),
    markKept: vi.fn().mockResolvedValue(undefined),
    incrementKept: vi.fn().mockResolvedValue(undefined),
    incrementDeleted: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("confirmReview", () => {
  it("deletes the marked photos and marks the rest kept", async () => {
    const candidates = makeCandidates(3);
    const toDelete = [candidates[0], candidates[1]];
    const deps = makeDeps();

    const result = await confirmReview(candidates, toDelete, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.deleteAssets).toHaveBeenCalledWith(["id-0", "id-1"]);
    expect(deps.markKept).toHaveBeenCalledWith(["id-2"]);
    expect(deps.incrementKept).toHaveBeenCalledWith(1);
    expect(deps.incrementDeleted).toHaveBeenCalledWith(2);
  });

  it("calls deleteAssets before markKept and the increments", async () => {
    const order: string[] = [];
    const candidates = makeCandidates(2);
    const deps = makeDeps({
      deleteAssets: vi.fn().mockImplementation(async () => {
        order.push("deleteAssets");
        return true;
      }),
      markKept: vi.fn().mockImplementation(async () => {
        order.push("markKept");
      }),
      incrementKept: vi.fn().mockImplementation(async () => {
        order.push("incrementKept");
      }),
      incrementDeleted: vi.fn().mockImplementation(async () => {
        order.push("incrementDeleted");
      }),
    });

    await confirmReview(candidates, [candidates[0]], deps);

    expect(order).toEqual(["deleteAssets", "markKept", "incrementKept", "incrementDeleted"]);
  });

  it("marks every candidate kept when nothing is marked for deletion", async () => {
    const candidates = makeCandidates(2);
    const deps = makeDeps();

    const result = await confirmReview(candidates, [], deps);

    expect(result).toEqual({ ok: true });
    expect(deps.deleteAssets).toHaveBeenCalledWith([]);
    expect(deps.markKept).toHaveBeenCalledWith(["id-0", "id-1"]);
    expect(deps.incrementKept).toHaveBeenCalledWith(2);
    expect(deps.incrementDeleted).toHaveBeenCalledWith(0);
  });

  it("keeps nobody when every candidate is marked for deletion", async () => {
    const candidates = makeCandidates(2);
    const deps = makeDeps();

    const result = await confirmReview(candidates, candidates, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.markKept).toHaveBeenCalledWith([]);
    expect(deps.incrementKept).toHaveBeenCalledWith(0);
    expect(deps.incrementDeleted).toHaveBeenCalledWith(2);
  });

  it("stops after a declined delete without marking anyone kept or incrementing", async () => {
    const candidates = makeCandidates(2);
    const deps = makeDeps({ deleteAssets: vi.fn().mockResolvedValue(false) });

    const result = await confirmReview(candidates, [candidates[0]], deps);

    expect(result).toEqual({ ok: false, reason: "Delete was cancelled or not completed." });
    expect(deps.markKept).not.toHaveBeenCalled();
    expect(deps.incrementKept).not.toHaveBeenCalled();
    expect(deps.incrementDeleted).not.toHaveBeenCalled();
  });

  it("normalizes a thrown error without marking anyone kept or incrementing", async () => {
    const candidates = makeCandidates(2);
    const deps = makeDeps({
      deleteAssets: vi.fn().mockRejectedValue(new Error("permission denied")),
    });

    const result = await confirmReview(candidates, [candidates[0]], deps);

    expect(result).toEqual({ ok: false, reason: "permission denied" });
    expect(deps.markKept).not.toHaveBeenCalled();
    expect(deps.incrementKept).not.toHaveBeenCalled();
    expect(deps.incrementDeleted).not.toHaveBeenCalled();
  });

  it("falls back to a generic reason for a non-Error throw", async () => {
    const candidates = makeCandidates(1);
    const deps = makeDeps({ deleteAssets: vi.fn().mockRejectedValue("boom") });

    const result = await confirmReview(candidates, [candidates[0]], deps);

    expect(result).toEqual({ ok: false, reason: "Please try again." });
  });
});
