import { Hash } from "./similarityMatch";

export interface ScanRecord {
  status: "cleared" | "grouped";
  hash: string; // Hash serialized as a decimal string — bigint isn't JSON-serializable.
}

// Absence from the map means "unscanned" — every photo starts there implicitly,
// so only cleared/grouped photos (the ones that have been hashed) need an entry.
export type ScanRecords = Record<string, ScanRecord>;

export interface ScannedPhoto {
  id: string;
  hash: Hash;
}

export interface ScanPass {
  cleared: ScannedPhoto[];
  grouped: ScannedPhoto[];
  // Ids dropping back to `cleared` because the Similar Group they belonged to
  // has been retired. Ids with no record are left alone.
  resolved?: string[];
  // A complete snapshot of the library. When given, records for ids outside it
  // are dropped: the photo is gone, so its record is a tombstone that would
  // otherwise be read and rewritten on every pass forever. Omit it whenever the
  // snapshot might be partial — an id absent from an incomplete view is not
  // confirmed gone, and forgetting a photo the user still owns is not
  // recoverable (see docs/adr/0002-unavailable-is-not-deleted.md).
  libraryIds?: ReadonlySet<string>;
}

// Applies a whole Similarity Scan pass to the scan records in one step, so a pass
// that hashed hundreds of photos persists all of them rather than racing itself.
// Returns the original records object unchanged when the pass is a no-op, letting
// callers skip a pointless write.
export function applyScanPass(records: ScanRecords, pass: ScanPass): ScanRecords {
  const updated: ScanRecords = {};
  let changed = false;

  for (const [id, record] of Object.entries(records)) {
    if (pass.libraryIds !== undefined && !pass.libraryIds.has(id)) {
      changed = true;
      continue;
    }
    updated[id] = record;
  }

  const write = (id: string, next: ScanRecord) => {
    const current = updated[id];
    if (current?.status === next.status && current.hash === next.hash) return;
    updated[id] = next;
    changed = true;
  };

  for (const { id, hash } of pass.cleared) write(id, { status: "cleared", hash: hash.toString() });
  for (const { id, hash } of pass.grouped) write(id, { status: "grouped", hash: hash.toString() });

  // Last, so `cleared` wins if an id is somehow both grouped and resolved: the
  // group that would justify `grouped` is the thing being retired, and a photo
  // left `grouped` with no group holding it is unreachable from every flow.
  // Callers keep the two apart anyway — see the write ordering in photoQueue.
  for (const id of pass.resolved ?? []) {
    const record = updated[id];
    if (record !== undefined) write(id, { ...record, status: "cleared" });
  }

  return changed ? updated : records;
}
