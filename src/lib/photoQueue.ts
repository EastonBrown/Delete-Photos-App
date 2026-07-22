import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchAllPhotoIds } from "./mediaLibrary";

export type SortMode = "random" | "newestFirst" | "oldestFirst";

const KEPT_IDS_KEY = "photoQueue:keptIds";
const QUEUE_KEY = "photoQueue:shuffledQueue";
const SORT_MODE_KEY = "photoQueue:sortMode";

async function readKeptIds(): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(KEPT_IDS_KEY);
  return new Set(raw ? (JSON.parse(raw) as string[]) : []);
}

async function writeKeptIds(ids: Set<string>): Promise<void> {
  await AsyncStorage.setItem(KEPT_IDS_KEY, JSON.stringify([...ids]));
}

async function readQueue(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? (JSON.parse(raw) as string[]) : [];
}

async function writeQueue(queue: string[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export async function getSortMode(): Promise<SortMode> {
  const raw = await AsyncStorage.getItem(SORT_MODE_KEY);
  return raw === "newestFirst" || raw === "oldestFirst" ? raw : "random";
}

export async function setSortMode(mode: SortMode): Promise<void> {
  await AsyncStorage.setItem(SORT_MODE_KEY, mode);
}

export async function rebuildQueue(mode?: SortMode): Promise<number> {
  const sortMode = mode ?? (await getSortMode());
  const [allIds, keptIds] = await Promise.all([fetchAllPhotoIds(), readKeptIds()]);
  // fetchAllPhotoIds() returns newest-first (creationTime descending).
  const unreviewed = allIds.filter((id) => !keptIds.has(id));
  const queue =
    sortMode === "random"
      ? shuffle(unreviewed)
      : sortMode === "oldestFirst"
        ? [...unreviewed].reverse()
        : unreviewed;
  await writeQueue(queue);
  return queue.length;
}

export async function ensureQueue(): Promise<number> {
  const queue = await readQueue();
  if (queue.length > 0) return queue.length;
  return rebuildQueue();
}

export async function remainingCount(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

export async function takeNextBatch(n = 30): Promise<string[]> {
  const queue = await readQueue();
  const batch = queue.slice(0, n);
  await writeQueue(queue.slice(n));
  return batch;
}

export async function returnToQueue(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const queue = await readQueue();
  await writeQueue([...ids, ...queue]);
}

export async function markKept(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const keptIds = await readKeptIds();
  for (const id of ids) keptIds.add(id);
  await writeKeptIds(keptIds);
}

export async function unmarkKept(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const keptIds = await readKeptIds();
  for (const id of ids) keptIds.delete(id);
  await writeKeptIds(keptIds);
}
