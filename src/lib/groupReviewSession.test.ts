import { describe, expect, it } from "vitest";
import { PhotoAsset } from "../types";
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

function assetMap(...ids: string[]): Map<string, PhotoAsset> {
  return new Map(ids.map((id) => [id, asset(id)]));
}

function group(...ids: string[]): ReviewableGroup {
  return { ids, photos: ids.map(asset) };
}

describe("resolveGroups", () => {
  it("resolves a fully-resolvable group into its assets", () => {
    const result = resolveGroups([["a", "b"]], assetMap("a", "b"));

    expect(result.reviewable).toEqual([{ ids: ["a", "b"], photos: [asset("a"), asset("b")] }]);
    expect(result.degenerate).toEqual([]);
  });

  it("preserves member order within a group", () => {
    const result = resolveGroups([["c", "a", "b"]], assetMap("a", "b", "c"));

    expect(result.reviewable[0].photos.map((a) => a.id)).toEqual(["c", "a", "b"]);
  });

  it("drops unresolvable members but keeps the group when two still resolve", () => {
    const result = resolveGroups([["a", "gone", "b"]], assetMap("a", "b"));

    expect(result.reviewable[0].photos).toEqual([asset("a"), asset("b")]);
    expect(result.degenerate).toEqual([]);
  });

  it("keeps the original id list as the group's identity so it can be removed from pending", () => {
    const result = resolveGroups([["a", "gone", "b"]], assetMap("a", "b"));

    expect(result.reviewable[0].ids).toEqual(["a", "gone", "b"]);
  });

  it("reports a group as degenerate when only one member resolves", () => {
    const result = resolveGroups([["a", "gone"]], assetMap("a"));

    expect(result.reviewable).toEqual([]);
    expect(result.degenerate).toEqual([["a", "gone"]]);
  });

  it("reports a group as degenerate when no member resolves", () => {
    const result = resolveGroups([["gone", "alsoGone"]], assetMap());

    expect(result.reviewable).toEqual([]);
    expect(result.degenerate).toEqual([["gone", "alsoGone"]]);
  });

  it("separates reviewable and degenerate groups in one pass", () => {
    const result = resolveGroups(
      [
        ["a", "b"],
        ["c", "gone"],
        ["d", "e", "f"],
      ],
      assetMap("a", "b", "c", "d", "e", "f")
    );

    expect(result.reviewable.map((g) => g.ids)).toEqual([
      ["a", "b"],
      ["d", "e", "f"],
    ]);
    expect(result.degenerate).toEqual([["c", "gone"]]);
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
