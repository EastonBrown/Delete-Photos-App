import AsyncStorage from "@react-native-async-storage/async-storage";
import { createPersistedJSON } from "./persistedJSON";

const KEPT_IDS_KEY = "photoQueue:keptIds";

const keptIdsStore = createPersistedJSON<string[]>(AsyncStorage, KEPT_IDS_KEY, []);

export async function getKeptIds(): Promise<Set<string>> {
  return new Set(await keptIdsStore.get());
}

async function writeKeptIds(ids: Set<string>): Promise<void> {
  await keptIdsStore.set([...ids]);
}

export async function markKept(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const keptIds = await getKeptIds();
  for (const id of ids) keptIds.add(id);
  await writeKeptIds(keptIds);
}

export async function unmarkKept(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const keptIds = await getKeptIds();
  for (const id of ids) keptIds.delete(id);
  await writeKeptIds(keptIds);
}
