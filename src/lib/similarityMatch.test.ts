import { describe, expect, it } from "vitest";
import {
  hammingDistance,
  isSimilarHash,
  mergeMatch,
  nearestChronologicalNeighbors,
} from "./similarityMatch";

describe("hammingDistance", () => {
  it("is zero for identical hashes", () => {
    expect(hammingDistance(0b1011n, 0b1011n)).toBe(0);
  });

  it("counts the differing bits", () => {
    expect(hammingDistance(0b0000n, 0b1111n)).toBe(4);
    expect(hammingDistance(0b1010n, 0b0101n)).toBe(4);
    expect(hammingDistance(0b1010n, 0b1011n)).toBe(1);
  });

  it("is symmetric", () => {
    expect(hammingDistance(0b1100n, 0b0011n)).toBe(hammingDistance(0b0011n, 0b1100n));
  });

  it("handles full 64-bit-width hashes", () => {
    const a = 0xffffffffffffffffn;
    const b = 0x0000000000000000n;
    expect(hammingDistance(a, b)).toBe(64);
  });
});

describe("nearestChronologicalNeighbors", () => {
  it("returns the closest ids on either side, nearest first", () => {
    const result = nearestChronologicalNeighbors(["a", "b", "c", "d", "e"], "c", 2);
    expect(result).toEqual(["b", "d"]);
  });

  it("expands outward once the immediate neighbors are exhausted", () => {
    const result = nearestChronologicalNeighbors(["a", "b", "c", "d", "e"], "c", 4);
    expect(result).toEqual(["b", "d", "a", "e"]);
  });

  it("only looks forward when the target is at the start of the list", () => {
    const result = nearestChronologicalNeighbors(["a", "b", "c", "d"], "a", 2);
    expect(result).toEqual(["b", "c"]);
  });

  it("only looks backward when the target is at the end of the list", () => {
    const result = nearestChronologicalNeighbors(["a", "b", "c", "d"], "d", 2);
    expect(result).toEqual(["c", "b"]);
  });

  it("returns every other id when count exceeds the list size", () => {
    const result = nearestChronologicalNeighbors(["a", "b", "c"], "b", 10);
    expect(result).toEqual(["a", "c"]);
  });

  it("returns an empty list when the target id isn't present", () => {
    const result = nearestChronologicalNeighbors(["a", "b", "c"], "z", 2);
    expect(result).toEqual([]);
  });
});

describe("mergeMatch", () => {
  it("creates a new group when neither id belongs to one yet", () => {
    const result = mergeMatch([], "a", "b");
    expect(result).toEqual([["a", "b"]]);
  });

  it("adds the new id to an existing group containing the other id", () => {
    const result = mergeMatch([["a", "b"]], "b", "c");
    expect(result).toEqual([["a", "b", "c"]]);
  });

  it("merges two existing groups when a match bridges them", () => {
    const result = mergeMatch([["a", "b"], ["c", "d"]], "b", "c");
    expect(result).toHaveLength(1);
    expect(result[0].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("is a no-op when both ids are already in the same group", () => {
    const result = mergeMatch([["a", "b", "c"]], "a", "c");
    expect(result).toEqual([["a", "b", "c"]]);
  });

  it("leaves unrelated groups untouched", () => {
    const result = mergeMatch([["x", "y"]], "a", "b");
    expect(result).toEqual([
      ["x", "y"],
      ["a", "b"],
    ]);
  });

  it("keeps a chain transitively grouped even without a direct match", () => {
    // A~B, B~C, but A and C are never compared directly — the defining case.
    const afterFirst = mergeMatch([], "a", "b");
    const afterSecond = mergeMatch(afterFirst, "b", "c");
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0].sort()).toEqual(["a", "b", "c"]);
  });
});

describe("isSimilarHash", () => {
  it("treats hashes below the threshold as similar", () => {
    expect(isSimilarHash(0b0000n, 0b0011n, 3)).toBe(true); // distance 2 < 3
  });

  it("treats a distance exactly at the threshold as not similar", () => {
    expect(isSimilarHash(0b0000n, 0b0111n, 3)).toBe(false); // distance 3 === 3
  });

  it("treats hashes above the threshold as not similar", () => {
    expect(isSimilarHash(0b0000n, 0b1111n, 3)).toBe(false); // distance 4 > 3
  });

  it("defaults to the standard dHash threshold when none is given", () => {
    // 4 bits differ, comfortably under the ~5-bit default
    expect(isSimilarHash(0b0000n, 0b1111n)).toBe(true);
  });
});
