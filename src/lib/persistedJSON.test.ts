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
