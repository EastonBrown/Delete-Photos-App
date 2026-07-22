import AsyncStorage from "@react-native-async-storage/async-storage";
import { createPersistedJSON } from "./persistedJSON";
import { Hash } from "./similarityMatch";

export type ScanStatus = "unscanned" | "cleared" | "grouped";

interface ScanRecord {
  status: "cleared" | "grouped";
  hash: string; // Hash serialized as a decimal string — bigint isn't JSON-serializable.
}

const SCAN_RECORDS_KEY = "similarityScan:scanRecords";

const scanRecordsStore = createPersistedJSON<Record<string, ScanRecord>>(
  AsyncStorage,
  SCAN_RECORDS_KEY,
  {}
);

// Absence from the store means "unscanned" — every photo starts there implicitly,
// so only cleared/grouped photos (the ones that have been hashed) need an entry.
export async function getScanStatus(id: string): Promise<ScanStatus> {
  const records = await scanRecordsStore.get();
  return records[id]?.status ?? "unscanned";
}

export async function getHash(id: string): Promise<Hash | undefined> {
  const records = await scanRecordsStore.get();
  const hash = records[id]?.hash;
  return hash === undefined ? undefined : BigInt(hash);
}

async function setStatus(id: string, status: "cleared" | "grouped", hash: Hash): Promise<void> {
  const records = await scanRecordsStore.get();
  await scanRecordsStore.set({ ...records, [id]: { status, hash: hash.toString() } });
}

export function setCleared(id: string, hash: Hash): Promise<void> {
  return setStatus(id, "cleared", hash);
}

export function setGrouped(id: string, hash: Hash): Promise<void> {
  return setStatus(id, "grouped", hash);
}

// Given a candidate id list (the full corpus, or any subset), returns the ones
// that haven't been scanned yet — i.e. have no cached status.
export async function filterUnscanned(ids: string[]): Promise<string[]> {
  const records = await scanRecordsStore.get();
  return ids.filter((id) => records[id] === undefined);
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
