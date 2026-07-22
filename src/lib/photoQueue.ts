import AsyncStorage from "@react-native-async-storage/async-storage";
import { buildQueue, SortMode } from "./buildQueue";
import { createPersistedJSON } from "./persistedJSON";
import { getKeptIds } from "./keptRegistry";
import { fetchAllPhotoIds } from "./mediaLibrary";
import { getSortMode } from "./sortPreference";

const QUEUE_KEY = "photoQueue:shuffledQueue";

const queueStore = createPersistedJSON<string[]>(AsyncStorage, QUEUE_KEY, []);

async function readQueue(): Promise<string[]> {
  return queueStore.get();
}

async function writeQueue(queue: string[]): Promise<void> {
  await queueStore.set(queue);
}

export async function rebuildQueue(mode?: SortMode): Promise<number> {
  const sortMode = mode ?? (await getSortMode());
  const [newestFirstIds, keptIds] = await Promise.all([fetchAllPhotoIds(), getKeptIds()]);
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
