export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface PersistedJSON<T> {
  get(): Promise<T>;
  set(value: T): Promise<void>;
}

export function createPersistedJSON<T>(
  storage: KeyValueStorage,
  key: string,
  defaultValue: T
): PersistedJSON<T> {
  return {
    async get() {
      const raw = await storage.getItem(key);
      return raw === null ? defaultValue : (JSON.parse(raw) as T);
    },
    async set(value: T) {
      await storage.setItem(key, JSON.stringify(value));
    },
  };
}
