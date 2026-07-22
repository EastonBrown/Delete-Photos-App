import AsyncStorage from "@react-native-async-storage/async-storage";
import { createPersistedJSON } from "./persistedJSON";

export interface Stats {
  reviewed: number;
  kept: number;
  deleted: number;
}

const STATS_KEY = "stats:counts";

const EMPTY_STATS: Stats = { reviewed: 0, kept: 0, deleted: 0 };

const statsStore = createPersistedJSON<Partial<Stats>>(AsyncStorage, STATS_KEY, EMPTY_STATS);

async function readStats(): Promise<Stats> {
  return { ...EMPTY_STATS, ...(await statsStore.get()) };
}

async function writeStats(stats: Stats): Promise<void> {
  await statsStore.set(stats);
}

export async function getStats(): Promise<Stats> {
  return readStats();
}

async function increment(key: keyof Stats, delta: number): Promise<void> {
  if (delta === 0) return;
  const stats = await readStats();
  stats[key] = Math.max(0, stats[key] + delta);
  await writeStats(stats);
}

export function incrementReviewed(delta: number): Promise<void> {
  return increment("reviewed", delta);
}

export function incrementKept(delta: number): Promise<void> {
  return increment("kept", delta);
}

export function incrementDeleted(delta: number): Promise<void> {
  return increment("deleted", delta);
}
