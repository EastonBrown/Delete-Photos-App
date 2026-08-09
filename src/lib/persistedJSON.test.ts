import { describe, expect, it } from "vitest";
import { createPersistedJSON, KeyValueStorage } from "./persistedJSON";

function createInMemoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    async getItem(key) {
      return map.has(key) ? map.get(key)! : null;
    },
    async setItem(key, value) {
      map.set(key, value);
    },
  };
}

// Real AsyncStorage takes several ticks to answer, so concurrent read-modify-write
// callers all get their read in before any write lands. createInMemoryStorage
// resolves too eagerly to reproduce that; this one doesn't.
function createSlowStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  return {
    async getItem(key) {
      await tick();
      return map.has(key) ? map.get(key)! : null;
    },
    async setItem(key, value) {
      await tick();
      map.set(key, value);
    },
  };
}

describe("createPersistedJSON", () => {
  it("returns the default value when the key is missing", async () => {
    const store = createPersistedJSON(createInMemoryStorage(), "some:key", ["default"]);
    expect(await store.get()).toEqual(["default"]);
  });

  it("round-trips a value through set/get", async () => {
    const store = createPersistedJSON(createInMemoryStorage(), "some:key", { count: 0 });
    await store.set({ count: 5 });
    expect(await store.get()).toEqual({ count: 5 });
  });

  it("keeps independent keys on the same storage isolated", async () => {
    const storage = createInMemoryStorage();
    const a = createPersistedJSON(storage, "a", 0);
    const b = createPersistedJSON(storage, "b", 0);
    await a.set(1);
    expect(await a.get()).toBe(1);
    expect(await b.get()).toBe(0);
  });

  it("throws on corrupt JSON rather than silently falling back to default", async () => {
    const storage = createInMemoryStorage();
    await storage.setItem("bad:key", "{not valid json");
    const store = createPersistedJSON(storage, "bad:key", {});
    await expect(store.get()).rejects.toThrow();
  });
});

describe("createPersistedJSON update", () => {
  it("reads the current value and persists what the mutator returns", async () => {
    const store = createPersistedJSON(createInMemoryStorage(), "some:key", { count: 1 });
    const updated = await store.update((current) => ({ count: current.count + 1 }));
    expect(updated).toEqual({ count: 2 });
    expect(await store.get()).toEqual({ count: 2 });
  });

  it("keeps concurrent updates from clobbering each other", async () => {
    const store = createPersistedJSON<Record<string, number>>(createSlowStorage(), "k", {});

    await Promise.all(
      ["a", "b", "c"].map((id, index) => store.update((records) => ({ ...records, [id]: index })))
    );

    expect(await store.get()).toEqual({ a: 0, b: 1, c: 2 });
  });

  it("orders a set against concurrent updates rather than racing it", async () => {
    const store = createPersistedJSON<Record<string, number>>(createSlowStorage(), "k", {});

    await Promise.all([
      store.update((records) => ({ ...records, a: 1 })),
      store.set({ b: 2 }),
      store.update((records) => ({ ...records, c: 3 })),
    ]);

    // The set wipes whatever preceded it, but every mutation after it survives.
    expect(await store.get()).toEqual({ b: 2, c: 3 });
  });

  it("skips the write when the mutator returns undefined", async () => {
    const storage = createInMemoryStorage();
    let writes = 0;
    const counted: KeyValueStorage = {
      getItem: (key) => storage.getItem(key),
      setItem: (key, value) => {
        writes++;
        return storage.setItem(key, value);
      },
    };
    const store = createPersistedJSON(counted, "some:key", { count: 1 });

    const result = await store.update(() => undefined);

    expect(result).toEqual({ count: 1 });
    expect(writes).toBe(0);
  });

  it("lets later mutations through after one of them fails", async () => {
    const store = createPersistedJSON<Record<string, number>>(createSlowStorage(), "k", {});

    const failing = store.update(() => {
      throw new Error("mutator blew up");
    });
    const following = store.update((records) => ({ ...records, a: 1 }));

    await expect(failing).rejects.toThrow("mutator blew up");
    await following;
    expect(await store.get()).toEqual({ a: 1 });
  });
});
