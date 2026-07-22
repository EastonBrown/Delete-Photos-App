import AsyncStorage from "@react-native-async-storage/async-storage";
import { buildQueue, SortMode } from "./buildQueue";
import { createPersistedJSON } from "./persistedJSON";
import { fetchAllPhotoIds } from "./mediaLibrary";

export type { SortMode } from "./buildQueue";

const KEPT_IDS_KEY = "photoQueue:keptIds";
const QUEUE_KEY = "photoQueue:shuffledQueue";
const SORT_MODE_KEY = "photoQueue:sortMode";

const keptIdsStore = createPersistedJSON<string[]>(AsyncStorage, KEPT_IDS_KEY, []);
const queueStore = createPersistedJSON<string[]>(AsyncStorage, QUEUE_KEY, []);

async function readKeptIds(): Promise<Set<string>> {
  return new Set(await keptIdsStore.get());
}

async function writeKeptIds(ids: Set<string>): Promise<void> {
  await keptIdsStore.set([...ids]);
}

async function readQueue(): Promise<string[]> {
  return queueStore.get();
}

async function writeQueue(queue: string[]): Promise<void> {
  await queueStore.set(queue);
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
  const [newestFirstIds, keptIds] = await Promise.all([fetchAllPhotoIds(), readKeptIds()]);
  const queue = buildQueue(newestFirstIds, keptIds, sortMode);
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
