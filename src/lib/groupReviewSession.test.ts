import { describe, expect, it } from "vitest";
import { AssetLookup, PhotoAsset } from "../types";
import {
  advance,
  createGroupReviewSession,
  currentGroup,
  isComplete,
  markedAssets,
  resolveGroups,
  ReviewableGroup,
  toggleMark,
} from "./groupReviewSession";

function asset(id: string): PhotoAsset {
  return { id, uri: `uri-${id}`, width: 100, height: 100 };
}

// Every id the caller looked up lands in this map. Ids given as `found` resolved to
// a real asset; anything else is named explicitly, because the whole point of the
// three states is that "couldn't load it" and "it's gone" are not the same answer.
function lookups(spec: Record<string, "found" | "missing" | "unavailable">) {
  const map = new Map<string, AssetLookup>();
  for (const [id, status] of Object.entries(spec)) {
    map.set(id, status === "found" ? { status, asset: asset(id) } : { status });
  }
  return map;
}

function allFound(...ids: string[]) {
  return lookups(Object.fromEntries(ids.map((id) => [id, "found" as const])));
}

function group(...ids: string[]): ReviewableGroup {
  return { ids, photos: ids.map(asset) };
}

describe("resolveGroups", () => {
  it("resolves a fully-resolvable group into its assets", () => {
    const result = resolveGroups([["a", "b"]], allFound("a", "b"));

    expect(result.reviewable).toEqual([{ ids: ["a", "b"], photos: [asset("a"), asset("b")] }]);
    expect(result.collapsed).toEqual([]);
    expect(result.deferred).toEqual([]);
  });

  it("preserves member order within a group", () => {
    const result = resolveGroups([["c", "a", "b"]], allFound("a", "b", "c"));

    expect(result.reviewable[0].photos.map((a) => a.id)).toEqual(["c", "a", "b"]);
  });

  it("drops missing members but keeps the group when two still resolve", () => {
    const result = resolveGroups(
      [["a", "gone", "b"]],
      lookups({ a: "found", gone: "missing", b: "found" })
    );

    expect(result.reviewable[0].photos).toEqual([asset("a"), asset("b")]);
    expect(result.collapsed).toEqual([]);
  });

  it("keeps the original id list as the group's identity so it can be removed from pending", () => {
    const result = resolveGroups(
      [["a", "gone", "b"]],
      lookups({ a: "found", gone: "missing", b: "found" })
    );

    expect(result.reviewable[0].ids).toEqual(["a", "gone", "b"]);
  });

  it("collapses a group when only one member survives", () => {
    const result = resolveGroups([["a", "gone"]], lookups({ a: "found", gone: "missing" }));

    expect(result.reviewable).toEqual([]);
    expect(result.collapsed).toEqual([["a", "gone"]]);
  });

  it("collapses a group when every member is gone", () => {
    const result = resolveGroups(
      [["gone", "alsoGone"]],
      lookups({ gone: "missing", alsoGone: "missing" })
    );

    expect(result.reviewable).toEqual([]);
    expect(result.collapsed).toEqual([["gone", "alsoGone"]]);
  });

  // The rule the whole three-state distinction exists for: a photo we merely failed
  // to load is not a deleted photo, so its group must survive to be reviewed later.
  it("defers rather than collapses when a member is only unavailable", () => {
    const result = resolveGroups([["a", "cloud"]], lookups({ a: "found", cloud: "unavailable" }));

    expect(result.reviewable).toEqual([]);
    expect(result.collapsed).toEqual([]);
    expect(result.deferred).toEqual([["a", "cloud"]]);
  });

  it("defers a group whose members are all unavailable", () => {
    const result = resolveGroups(
      [["cloudA", "cloudB"]],
      lookups({ cloudA: "unavailable", cloudB: "unavailable" })
    );

    expect(result.collapsed).toEqual([]);
    expect(result.deferred).toEqual([["cloudA", "cloudB"]]);
  });

  // Two survivors are enough to make a real comparison, so an unavailable third
  // shouldn't block the review — it returns to the normal queue when the group retires.
  it("still reviews a group with two survivors and one unavailable member", () => {
    const result = resolveGroups(
      [["a", "b", "cloud"]],
      lookups({ a: "found", b: "found", cloud: "unavailable" })
    );

    expect(result.reviewable[0].photos).toEqual([asset("a"), asset("b")]);
    expect(result.deferred).toEqual([]);
  });

  it("collapses only when every non-surviving member is confirmed missing", () => {
    const result = resolveGroups(
      [["a", "gone", "cloud"]],
      lookups({ a: "found", gone: "missing", cloud: "unavailable" })
    );

    expect(result.collapsed).toEqual([]);
    expect(result.deferred).toEqual([["a", "gone", "cloud"]]);
  });

  // An id absent from the map was never looked up. Treating that as missing would
  // retire a group on the strength of a lookup that never happened.
  it("treats an unlooked-up id as unavailable rather than missing", () => {
    const result = resolveGroups([["a", "never"]], allFound("a"));

    expect(result.collapsed).toEqual([]);
    expect(result.deferred).toEqual([["a", "never"]]);
  });

  it("separates reviewable, collapsed and deferred groups in one pass", () => {
    const result = resolveGroups(
      [
        ["a", "b"],
        ["c", "gone"],
        ["d", "cloud"],
        ["e", "f", "g"],
      ],
      lookups({
        a: "found",
        b: "found",
        c: "found",
        gone: "missing",
        d: "found",
        cloud: "unavailable",
        e: "found",
        f: "found",
        g: "found",
      })
    );

    expect(result.reviewable.map((g) => g.ids)).toEqual([
      ["a", "b"],
      ["e", "f", "g"],
    ]);
    expect(result.collapsed).toEqual([["c", "gone"]]);
    expect(result.deferred).toEqual([["d", "cloud"]]);
  });
});

describe("createGroupReviewSession", () => {
  it("starts on the first group with nothing marked", () => {
    const groups = [group("a", "b")];
    const state = createGroupReviewSession(groups);

    expect(state.index).toBe(0);
    expect(state.marked).toEqual([]);
    expect(currentGroup(state)).toEqual(groups[0]);
  });

  it("is immediately complete when there are no groups", () => {
    const state = createGroupReviewSession([]);

    expect(isComplete(state)).toBe(true);
    expect(currentGroup(state)).toBeUndefined();
  });
});

describe("toggleMark", () => {
  it("marks an unmarked photo for deletion", () => {
    const state = createGroupReviewSession([group("a", "b")]);

    expect(toggleMark(state, "a").marked).toEqual(["a"]);
  });

  it("unmarks an already-marked photo", () => {
    let state = createGroupReviewSession([group("a", "b")]);
    state = toggleMark(state, "a");

    expect(toggleMark(state, "a").marked).toEqual([]);
  });

  it("allows every photo in the group to be marked", () => {
    let state = createGroupReviewSession([group("a", "b")]);
    state = toggleMark(state, "a");
    state = toggleMark(state, "b");

    expect(state.marked).toEqual(["a", "b"]);
    expect(markedAssets(state)).toEqual([asset("a"), asset("b")]);
  });

  it("does not mutate the previous state", () => {
    const state = createGroupReviewSession([group("a", "b")]);
    toggleMark(state, "a");

    expect(state.marked).toEqual([]);
  });
});

describe("markedAssets", () => {
  it("is empty for a fresh group, so every photo starts as keep", () => {
    const state = createGroupReviewSession([group("a", "b")]);

    expect(markedAssets(state)).toEqual([]);
  });

  it("returns the marked photos of the current group as assets", () => {
    let state = createGroupReviewSession([group("a", "b")]);
    state = toggleMark(state, "b");

    expect(markedAssets(state)).toEqual([asset("b")]);
  });

  it("never returns a photo that no longer resolves, even if its id is marked", () => {
    const shrunk: ReviewableGroup = { ids: ["a", "gone", "b"], photos: [asset("a"), asset("b")] };
    let state = createGroupReviewSession([shrunk]);
    state = toggleMark(state, "gone");

    expect(markedAssets(state)).toEqual([]);
  });
});

describe("advance", () => {
  it("moves to the next group", () => {
    const groups = [group("a", "b"), group("c", "d")];
    const state = advance(createGroupReviewSession(groups));

    expect(state.index).toBe(1);
    expect(currentGroup(state)).toEqual(groups[1]);
  });

  it("clears marks so they never leak into the next group", () => {
    const groups = [group("a", "b"), group("c", "d")];
    let state = createGroupReviewSession(groups);
    state = toggleMark(state, "a");
    state = advance(state);

    expect(state.marked).toEqual([]);
    expect(markedAssets(state)).toEqual([]);
  });

  it("completes the session after the last group", () => {
    const state = advance(createGroupReviewSession([group("a", "b")]));

    expect(isComplete(state)).toBe(true);
    expect(currentGroup(state)).toBeUndefined();
  });

  it("is not complete while groups remain", () => {
    const groups = [group("a", "b"), group("c", "d")];

    expect(isComplete(advance(createGroupReviewSession(groups)))).toBe(false);
  });
});
