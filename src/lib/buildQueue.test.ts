import { describe, expect, it } from "vitest";
import { buildQueue } from "./buildQueue";

describe("buildQueue", () => {
  it("filters out kept ids", () => {
    const result = buildQueue(["a", "b", "c"], new Set(["b"]), "newestFirst");
    expect(result).toEqual(["a", "c"]);
  });

  it("newestFirst keeps the input order untouched", () => {
    const result = buildQueue(["a", "b", "c"], new Set(), "newestFirst");
    expect(result).toEqual(["a", "b", "c"]);
  });

  it("oldestFirst reverses the filtered ids", () => {
    const result = buildQueue(["a", "b", "c"], new Set(), "oldestFirst");
    expect(result).toEqual(["c", "b", "a"]);
  });

  it("random returns a permutation of the unreviewed ids, excluding kept ones", () => {
    const result = buildQueue(["a", "b", "c", "d"], new Set(["b"]), "random");
    expect([...result].sort()).toEqual(["a", "c", "d"]);
  });

  it("returns an empty queue when everything is kept", () => {
    const result = buildQueue(["a", "b"], new Set(["a", "b"]), "newestFirst");
    expect(result).toEqual([]);
  });

  it("returns an empty queue for empty input", () => {
    expect(buildQueue([], new Set(), "random")).toEqual([]);
  });
});
