import { describe, expect, it } from "vitest";
import { buildQueue } from "./buildQueue";

describe("buildQueue", () => {
  it("filters out kept ids", () => {
    const result = buildQueue(["a", "b", "c"], new Set(["b"]), new Set(), "newestFirst");
    expect(result).toEqual(["a", "c"]);
  });

  it("filters out grouped ids", () => {
    const result = buildQueue(["a", "b", "c"], new Set(), new Set(["b"]), "newestFirst");
    expect(result).toEqual(["a", "c"]);
  });

  it("filters out both kept and grouped ids together", () => {
    const result = buildQueue(["a", "b", "c", "d"], new Set(["a"]), new Set(["c"]), "newestFirst");
    expect(result).toEqual(["b", "d"]);
  });

  it("newestFirst keeps the input order untouched", () => {
    const result = buildQueue(["a", "b", "c"], new Set(), new Set(), "newestFirst");
    expect(result).toEqual(["a", "b", "c"]);
  });

  it("oldestFirst reverses the filtered ids", () => {
    const result = buildQueue(["a", "b", "c"], new Set(), new Set(), "oldestFirst");
    expect(result).toEqual(["c", "b", "a"]);
  });

  it("random returns a permutation of the unreviewed, ungrouped ids", () => {
    const result = buildQueue(["a", "b", "c", "d"], new Set(["b"]), new Set(["d"]), "random");
    expect([...result].sort()).toEqual(["a", "c"]);
  });

  it("returns an empty queue when everything is kept or grouped", () => {
    const result = buildQueue(["a", "b"], new Set(["a"]), new Set(["b"]), "newestFirst");
    expect(result).toEqual([]);
  });

  it("returns an empty queue for empty input", () => {
    expect(buildQueue([], new Set(), new Set(), "random")).toEqual([]);
  });
});
