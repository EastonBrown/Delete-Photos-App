import AsyncStorage from "@react-native-async-storage/async-storage";
import { createPersistedJSON } from "./persistedJSON";
import { applyScanPass, ScanPass, ScanRecords } from "./scanRecords";
import { Hash } from "./similarityMatch";

export type ScanStatus = "unscanned" | "cleared" | "grouped";

const SCAN_RECORDS_KEY = "similarityScan:scanRecords";

const scanRecordsStore = createPersistedJSON<ScanRecords>(AsyncStorage, SCAN_RECORDS_KEY, {});

// Absence means "unscanned" — see ScanRecords in scanRecords.ts.
export async function getScanStatus(id: string): Promise<ScanStatus> {
  const records = await scanRecordsStore.get();
  return records[id]?.status ?? "unscanned";
}

export async function getHash(id: string): Promise<Hash | undefined> {
  const records = await scanRecordsStore.get();
  const hash = records[id]?.hash;
  return hash === undefined ? undefined : BigInt(hash);
}

// The single writer for scan records. A whole Similarity Scan pass lands in one
// read-modify-write: per-photo writes issued concurrently would each read the
// same pre-pass snapshot and clobber one another, persisting roughly one record
// per pass and leaving the rest to be rehashed forever.
export function recordScanPass(pass: ScanPass): Promise<void> {
  return scanRecordsStore
    .update((records) => {
      const updated = applyScanPass(records, pass);
      return updated === records ? undefined : updated;
    })
    .then(() => undefined);
}

// Given a candidate id list (the full corpus, or any subset), returns the ones
// that haven't been scanned yet — i.e. have no cached status.
export async function filterUnscanned(ids: string[]): Promise<string[]> {
  const records = await scanRecordsStore.get();
  return ids.filter((id) => records[id] === undefined);
}

// A Similar Group ceases to exist once reviewed, so its members stop being
// "pending review" — the whole meaning of `grouped`. They drop back to `cleared`,
// which keeps the cached hash (a photo is never rehashed once known) while making
// them eligible for the normal per-photo queue again. Without this, a member that
// leaves a group without being kept or deleted — the sole survivor of a group whose
// other members vanished — would stay excluded from every flow permanently.
// Ids with no scan record are left untouched.
export function setResolved(ids: string[]): Promise<void> {
  return recordScanPass({ cleared: [], grouped: [], resolved: ids });
}

// Every id currently classified `grouped` — used by buildQueue to exclude
// photos pending Similar Group review from the normal per-photo queue.
export async function getGroupedIds(): Promise<Set<string>> {
  const records = await scanRecordsStore.get();
  return new Set(
    Object.entries(records)
      .filter(([, record]) => record.status === "grouped")
      .map(([id]) => id)
  );
}
