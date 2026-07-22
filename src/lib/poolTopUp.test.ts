import { describe, expect, it, vi } from "vitest";
import { applyTopUpResult, PoolTopUpDependencies, PoolTopUpResult, topUpPool } from "./poolTopUp";

function makeDeps(overrides: Partial<PoolTopUpDependencies> = {}): PoolTopUpDependencies {
  return {
    listUnscannedCandidates: vi.fn().mockResolvedValue([]),
    chronologicalNeighborIds: vi.fn().mockResolvedValue([]),
    getHash: vi.fn().mockResolvedValue(undefined),
    computeHash: vi.fn().mockResolvedValue(0n),
    now: vi.fn().mockReturnValue(0),
    ...overrides,
  };
}

describe("topUpPool", () => {
  it("takes the fast path with zero hashing calls when the pool is above the low-water mark", async () => {
    const deps = makeDeps();

    const result = await topUpPool(5001, [], deps, { lowWaterMark: 5000, highWaterMark: 10000 });

    expect(result).toEqual({ scanned: false, cleared: [], grouped: [], groups: [] });
    expect(deps.listUnscannedCandidates).not.toHaveBeenCalled();
    expect(deps.computeHash).not.toHaveBeenCalled();
  });

  it("runs a top-up at (not just below) the low-water mark", async () => {
    const deps = makeDeps({
      listUnscannedCandidates: vi.fn().mockResolvedValue(["a"]),
    });

    const result = await topUpPool(5000, [], deps, { lowWaterMark: 5000, highWaterMark: 10000 });

    expect(result.scanned).toBe(true);
    expect(deps.computeHash).toHaveBeenCalledWith("a");
  });

  it("clears every candidate when none match a cached neighbor hash", async () => {
    const deps = makeDeps({
      listUnscannedCandidates: vi.fn().mockResolvedValue(["a", "b", "c"]),
      chronologicalNeighborIds: vi.fn().mockResolvedValue([]),
    });

    const result = await topUpPool(100, [], deps, { lowWaterMark: 200, highWaterMark: 1000 });

    expect(result.scanned).toBe(true);
    expect(result.cleared.map((p) => p.id).sort()).toEqual(["a", "b", "c"]);
    expect(result.grouped).toEqual([]);
    expect(result.groups).toEqual([]);
  });

  it("stops the top-up once the high-water mark is reached", async () => {
    const candidates = Array.from({ length: 10 }, (_, i) => `id-${i}`);
    const deps = makeDeps({
      listUnscannedCandidates: vi.fn().mockResolvedValue(candidates),
      chronologicalNeighborIds: vi.fn().mockResolvedValue([]),
    });

    const result = await topUpPool(5, [], deps, { lowWaterMark: 5, highWaterMark: 8 });

    expect(result.cleared).toHaveLength(3);
    expect(deps.computeHash).toHaveBeenCalledTimes(3);
  });

  it("stops the top-up at the time budget even if the high-water mark isn't reached", async () => {
    const candidates = Array.from({ length: 10 }, (_, i) => `id-${i}`);
    let elapsed = 0;
    const deps = makeDeps({
      listUnscannedCandidates: vi.fn().mockResolvedValue(candidates),
      chronologicalNeighborIds: vi.fn().mockResolvedValue([]),
      now: vi.fn(() => elapsed),
      computeHash: vi.fn().mockImplementation(async (id: string) => {
        elapsed += 400;
        return 0n;
      }),
    });

    const result = await topUpPool(5, [], deps, {
      lowWaterMark: 5,
      highWaterMark: 1000,
      timeBudgetMs: 1000,
    });

    expect(result.cleared.length).toBeLessThan(candidates.length);
    expect(result.cleared.length).toBeGreaterThan(0);
  });

  it("stops gracefully when unscanned candidates are exhausted", async () => {
    const deps = makeDeps({
      listUnscannedCandidates: vi.fn().mockResolvedValue(["a", "b", "c"]),
      chronologicalNeighborIds: vi.fn().mockResolvedValue([]),
    });

    const result = await topUpPool(5, [], deps, { lowWaterMark: 5, highWaterMark: 1000 });

    expect(result.cleared).toHaveLength(3);
    expect(result.scanned).toBe(true);
  });

  it("groups a candidate that matches a previously-cached neighbor hash, reclassifying the neighbor too", async () => {
    const deps = makeDeps({
      listUnscannedCandidates: vi.fn().mockResolvedValue(["b"]),
      chronologicalNeighborIds: vi.fn().mockImplementation(async (id: string) =>
        id === "b" ? ["a"] : []
      ),
      getHash: vi.fn().mockImplementation(async (id: string) => (id === "a" ? 0n : undefined)),
      computeHash: vi.fn().mockResolvedValue(0n),
    });

    const result = await topUpPool(5, [], deps, { lowWaterMark: 5, highWaterMark: 1000 });

    expect(result.cleared).toEqual([]);
    // "a" was only ever known via getHash (cleared in a past pass), but it's
    // now a group member, so it must be reclassified grouped too — otherwise
    // buildQueue would keep offering it in the normal per-photo queue.
    expect(result.grouped.map((p) => p.id).sort()).toEqual(["a", "b"]);
    expect(result.groups).toEqual([["b", "a"]]);
  });

  it("groups candidates that only match each other within the same top-up pass, with neither left in cleared", async () => {
    const deps = makeDeps({
      listUnscannedCandidates: vi.fn().mockResolvedValue(["p", "q"]),
      chronologicalNeighborIds: vi.fn().mockImplementation(async (id: string) =>
        id === "p" ? ["q"] : ["p"]
      ),
      computeHash: vi.fn().mockResolvedValue(0n),
    });

    const result = await topUpPool(5, [], deps, { lowWaterMark: 5, highWaterMark: 1000 });

    // Whichever of p/q is processed first is provisionally cleared (the other
    // isn't hashed yet), then reclassified to grouped once the second one
    // discovers the match — so neither should be left in `cleared`.
    expect(result.cleared).toEqual([]);
    expect(result.grouped.map((p) => p.id).sort()).toEqual(["p", "q"]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].sort()).toEqual(["p", "q"]);
    // Whichever of p/q is processed first can't find the other in the session
    // cache yet and falls back to getHash; the second one finds it cached
    // locally and skips getHash entirely — so it's called once, not twice.
    expect(deps.getHash).toHaveBeenCalledTimes(1);
  });

  it("merges a new match transitively into an existing pending group", async () => {
    const deps = makeDeps({
      listUnscannedCandidates: vi.fn().mockResolvedValue(["c"]),
      chronologicalNeighborIds: vi.fn().mockResolvedValue(["b"]),
      getHash: vi.fn().mockImplementation(async (id: string) => (id === "b" ? 0n : undefined)),
      computeHash: vi.fn().mockResolvedValue(0n),
    });

    const result = await topUpPool(5, [["a", "b"]], deps, {
      lowWaterMark: 5,
      highWaterMark: 1000,
    });

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].sort()).toEqual(["a", "b", "c"]);
    // "b" was already cleared in a past pass (found via getHash) but is now
    // pulled into the group, so it's reclassified grouped alongside "c".
    expect(result.grouped.map((p) => p.id).sort()).toEqual(["b", "c"]);
  });

  it("leaves unrelated existing pending groups untouched", async () => {
    const deps = makeDeps({
      listUnscannedCandidates: vi.fn().mockResolvedValue(["a", "b"]),
      chronologicalNeighborIds: vi.fn().mockResolvedValue([]),
    });

    const result = await topUpPool(5, [["x", "y"]], deps, {
      lowWaterMark: 5,
      highWaterMark: 1000,
    });

    expect(result.groups).toEqual([["x", "y"]]);
  });
});

describe("applyTopUpResult", () => {
  function makeResult(overrides: Partial<PoolTopUpResult> = {}): PoolTopUpResult {
    return { scanned: true, cleared: [], grouped: [], groups: [], ...overrides };
  }

  it("returns the queue untouched when no top-up ran", () => {
    const queue = applyTopUpResult(["a", "b"], makeResult({ scanned: false }));
    expect(queue).toEqual(["a", "b"]);
  });

  it("drops newly-grouped ids that were already in the queue", () => {
    const queue = applyTopUpResult(
      ["a", "b", "c"],
      makeResult({ grouped: [{ id: "b", hash: 0n }] })
    );
    expect(queue).toEqual(["a", "c"]);
  });

  it("appends newly-cleared ids that weren't already in the queue", () => {
    const queue = applyTopUpResult(["a"], makeResult({ cleared: [{ id: "b", hash: 0n }] }));
    expect(queue).toEqual(["a", "b"]);
  });

  it("doesn't duplicate a newly-cleared id that was already in the queue", () => {
    const queue = applyTopUpResult(["a", "b"], makeResult({ cleared: [{ id: "b", hash: 0n }] }));
    expect(queue).toEqual(["a", "b"]);
  });

  it("applies both drops and appends together", () => {
    const queue = applyTopUpResult(
      ["a", "b", "c"],
      makeResult({
        grouped: [{ id: "b", hash: 0n }],
        cleared: [{ id: "d", hash: 0n }],
      })
    );
    expect(queue).toEqual(["a", "c", "d"]);
  });
});
