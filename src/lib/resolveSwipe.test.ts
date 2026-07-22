import { describe, expect, it } from "vitest";
import { resolveSwipe } from "./resolveSwipe";

describe("resolveSwipe", () => {
  it("returns null when neither threshold is crossed", () => {
    expect(resolveSwipe(10, 0.1, 100)).toBeNull();
  });

  it("returns right when dx crosses the threshold to the right", () => {
    expect(resolveSwipe(150, 0, 100)).toBe("right");
  });

  it("returns left when dx crosses the threshold to the left", () => {
    expect(resolveSwipe(-150, 0, 100)).toBe("left");
  });

  it("returns a direction from velocity alone when dx is small", () => {
    expect(resolveSwipe(10, 1.2, 100)).toBe("right");
    expect(resolveSwipe(-10, -1.2, 100)).toBe("left");
  });

  it("respects a custom velocity threshold", () => {
    expect(resolveSwipe(10, 0.5, 100, 0.4)).toBe("right");
    expect(resolveSwipe(10, 0.3, 100, 0.4)).toBeNull();
  });

  it("does not swipe exactly at the threshold", () => {
    expect(resolveSwipe(100, 0, 100)).toBeNull();
    expect(resolveSwipe(0, 0.8, 100)).toBeNull();
  });
});
