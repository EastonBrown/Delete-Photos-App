import AsyncStorage from "@react-native-async-storage/async-storage";
import { SortMode } from "./buildQueue";

export type { SortMode } from "./buildQueue";

const SORT_MODE_KEY = "photoQueue:sortMode";

export async function getSortMode(): Promise<SortMode> {
  const raw = await AsyncStorage.getItem(SORT_MODE_KEY);
  return raw === "newestFirst" || raw === "oldestFirst" ? raw : "random";
}

export async function setSortMode(mode: SortMode): Promise<void> {
  await AsyncStorage.setItem(SORT_MODE_KEY, mode);
}
