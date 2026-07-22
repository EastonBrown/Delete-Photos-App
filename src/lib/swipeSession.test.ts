import { describe, expect, it } from "vitest";
import { PhotoAsset } from "../types";
import { applySwipe, createSwipeSession, quit, skip, undo } from "./swipeSession";

function makeCards(n: number): PhotoAsset[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `id-${i}`,
    uri: `uri-${i}`,
    width: 100,
    height: 100,
  }));
}

describe("applySwipe", () => {
  it("swiping right advances index, emits markKept + incrementKept + incrementReviewed", () => {
    const state = createSwipeSession(makeCards(2));
    const { state: next, effects } = applySwipe(state, "right");

    expect(next.index).toBe(1);
    expect(next.pendingDelete).toEqual([]);
    expect(next.history).toEqual([{ asset: state.cards[0], direction: "right" }]);
    expect(effects).toEqual([
      { type: "markKept", ids: ["id-0"] },
      { type: "incrementKept", delta: 1 },
      { type: "incrementReviewed", delta: 1 },
    ]);
  });

  it("swiping left advances index, queues pendingDelete, emits only incrementReviewed", () => {
    const state = createSwipeSession(makeCards(2));
    const { state: next, effects } = applySwipe(state, "left");

    expect(next.index).toBe(1);
    expect(next.pendingDelete).toEqual([state.cards[0]]);
    expect(effects).toEqual([{ type: "incrementReviewed", delta: 1 }]);
  });

  it("swiping the last card emits sessionComplete with pendingDelete", () => {
    const state = createSwipeSession(makeCards(1));
    const { effects } = applySwipe(state, "left");

    expect(effects).toEqual([
      { type: "incrementReviewed", delta: 1 },
      { type: "sessionComplete", pendingDelete: [state.cards[0]] },
    ]);
  });

  it("is a no-op past the end of the deck", () => {
    const state = createSwipeSession(makeCards(0));
    const { state: next, effects } = applySwipe(state, "right");

    expect(next).toEqual(state);
    expect(effects).toEqual([]);
  });
});

describe("undo", () => {
  it("reverses a right swipe: unmarks kept, decrements kept and reviewed, steps index back", () => {
    const state = createSwipeSession(makeCards(2));
    const { state: afterSwipe } = applySwipe(state, "right");
    const { state: afterUndo, effects } = undo(afterSwipe);

    expect(afterUndo).toEqual(state);
    expect(effects).toEqual([
      { type: "unmarkKept", ids: ["id-0"] },
      { type: "incrementKept", delta: -1 },
      { type: "incrementReviewed", delta: -1 },
    ]);
  });

  it("reverses a left swipe: pops pendingDelete, decrements reviewed only", () => {
    const state = createSwipeSession(makeCards(2));
    const { state: afterSwipe } = applySwipe(state, "left");
    const { state: afterUndo, effects } = undo(afterSwipe);

    expect(afterUndo).toEqual(state);
    expect(effects).toEqual([{ type: "incrementReviewed", delta: -1 }]);
  });

  it("is a no-op with empty history", () => {
    const state = createSwipeSession(makeCards(2));
    const { state: next, effects } = undo(state);

    expect(next).toEqual(state);
    expect(effects).toEqual([]);
  });
});

describe("skip", () => {
  it("returns the current card to the queue and advances index without touching history", () => {
    const state = createSwipeSession(makeCards(2));
    const { state: next, effects } = skip(state);

    expect(next.index).toBe(1);
    expect(next.history).toEqual([]);
    expect(effects).toEqual([{ type: "returnToQueue", ids: ["id-0"] }]);
  });

  it("skipping the last card emits sessionComplete", () => {
    const state = createSwipeSession(makeCards(1));
    const { effects } = skip(state);

    expect(effects).toEqual([
      { type: "returnToQueue", ids: ["id-0"] },
      { type: "sessionComplete", pendingDelete: [] },
    ]);
  });
});

describe("quit", () => {
  it("returns all unreviewed cards to the queue and completes with current pendingDelete", () => {
    const state = createSwipeSession(makeCards(3));
    const { state: afterSwipe } = applySwipe(state, "left");
    const { effects } = quit(afterSwipe);

    expect(effects).toEqual([
      { type: "returnToQueue", ids: ["id-1", "id-2"] },
      { type: "sessionComplete", pendingDelete: [afterSwipe.cards[0]] },
    ]);
  });
});
