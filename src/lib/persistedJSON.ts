export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface PersistedJSON<T> {
  get(): Promise<T>;
  set(value: T): Promise<void>;
  // Read-modify-write as one indivisible step. Returning undefined from the
  // mutator leaves storage untouched, for callers whose change may be a no-op.
  update(mutate: (current: T) => T | undefined): Promise<T>;
}

export function createPersistedJSON<T>(
  storage: KeyValueStorage,
  key: string,
  defaultValue: T
): PersistedJSON<T> {
  async function read(): Promise<T> {
    const raw = await storage.getItem(key);
    return raw === null ? defaultValue : (JSON.parse(raw) as T);
  }

  // Mutations run one at a time. Storage round trips take several ticks, so
  // concurrent read-modify-writes against one key would otherwise all read the
  // same pre-write snapshot and overwrite each other — last write wins, and
  // every other caller's change is silently lost.
  let tail: Promise<unknown> = Promise.resolve();
  function enqueue<R>(operation: () => Promise<R>): Promise<R> {
    // Runs on both settle paths: one caller's failure must not cancel the next.
    const result = tail.then(operation, operation);
    tail = result.catch(() => undefined);
    return result;
  }

  return {
    get: read,

    set(value: T) {
      return enqueue(async () => {
        await storage.setItem(key, JSON.stringify(value));
      });
    },

    update(mutate: (current: T) => T | undefined) {
      return enqueue(async () => {
        const current = await read();
        const next = mutate(current);
        if (next === undefined) return current;
        await storage.setItem(key, JSON.stringify(next));
        return next;
      });
    },
  };
}
