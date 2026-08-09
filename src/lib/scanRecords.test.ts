import { describe, expect, it } from "vitest";
import { applyScanPass, ScanRecords } from "./scanRecords";

const EMPTY_PASS = { cleared: [], grouped: [] };

describe("applyScanPass", () => {
  it("writes every scanned photo of a pass, not just the last one", () => {
    const updated = applyScanPass(
      {},
      {
        cleared: [
          { id: "a", hash: 1n },
          { id: "b", hash: 2n },
        ],
        grouped: [{ id: "c", hash: 3n }],
      }
    );

    expect(updated).toEqual({
      a: { status: "cleared", hash: "1" },
      b: { status: "cleared", hash: "2" },
      c: { status: "grouped", hash: "3" },
    });
  });

  it("leaves records from earlier passes untouched", () => {
    const records: ScanRecords = { old: { status: "grouped", hash: "9" } };

    const updated = applyScanPass(records, { cleared: [{ id: "new", hash: 1n }], grouped: [] });

    expect(updated.old).toEqual({ status: "grouped", hash: "9" });
  });

  it("drops records for ids missing from the library", () => {
    const records: ScanRecords = {
      alive: { status: "cleared", hash: "1" },
      deleted: { status: "cleared", hash: "2" },
    };

    const updated = applyScanPass(records, {
      ...EMPTY_PASS,
      libraryIds: new Set(["alive"]),
    });

    expect(updated).toEqual({ alive: { status: "cleared", hash: "1" } });
  });

  it("keeps every record when no library snapshot is supplied", () => {
    const records: ScanRecords = { a: { status: "cleared", hash: "1" } };

    expect(applyScanPass(records, EMPTY_PASS)).toEqual(records);
  });

  it("flips resolved ids back to cleared while keeping their cached hash", () => {
    const records: ScanRecords = { a: { status: "grouped", hash: "7" } };

    const updated = applyScanPass(records, { ...EMPTY_PASS, resolved: ["a"] });

    expect(updated).toEqual({ a: { status: "cleared", hash: "7" } });
  });

  it("ignores resolved ids that have no scan record", () => {
    const updated = applyScanPass({}, { ...EMPTY_PASS, resolved: ["never-scanned"] });

    expect(updated).toEqual({});
  });

  // A photo can be grouped by this pass and be a survivor of a group the same pass
  // retired. The group it belongs to now is the live one, so grouped must not win.
  it("resolves an id back to cleared even when the same pass grouped it", () => {
    const updated = applyScanPass(
      {},
      { cleared: [], grouped: [{ id: "a", hash: 4n }], resolved: ["a"] }
    );

    expect(updated).toEqual({ a: { status: "cleared", hash: "4" } });
  });

  it("returns the original records object when the pass changes nothing", () => {
    const records: ScanRecords = { a: { status: "cleared", hash: "1" } };

    expect(applyScanPass(records, { ...EMPTY_PASS, libraryIds: new Set(["a"]) })).toBe(records);
  });

  it("reports a change when a rescan moves a photo between statuses", () => {
    const records: ScanRecords = { a: { status: "cleared", hash: "1" } };

    const updated = applyScanPass(records, { cleared: [], grouped: [{ id: "a", hash: 1n }] });

    expect(updated).not.toBe(records);
    expect(updated.a).toEqual({ status: "grouped", hash: "1" });
  });
});
