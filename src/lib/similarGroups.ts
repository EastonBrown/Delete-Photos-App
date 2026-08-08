import AsyncStorage from "@react-native-async-storage/async-storage";
import { createPersistedJSON } from "./persistedJSON";
import { findGroupContaining, mergeMatch } from "./similarityMatch";

const GROUPS_KEY = "similarityScan:pendingGroups";

const groupsStore = createPersistedJSON<string[][]>(AsyncStorage, GROUPS_KEY, []);

export async function getPendingGroups(): Promise<string[][]> {
  return groupsStore.get();
}

// Overwrites the full pending-groups list — used by pool top-up wiring, which
// computes the fully-merged result itself via mergeMatch (see poolTopUp.ts).
export function setPendingGroups(groups: string[][]): Promise<void> {
  return groupsStore.set(groups);
}

// How many Similar Groups are waiting to be reviewed. Counts stored groups as-is:
// a group whose members have since been deleted outside the app still counts here
// and is retired when the review screen resolves it (see resolveGroups).
export async function pendingGroupCount(): Promise<number> {
  return (await getPendingGroups()).length;
}

export async function getGroupFor(id: string): Promise<string[] | undefined> {
  return findGroupContaining(await getPendingGroups(), id);
}

// Grows Similar Groups transitively: idA and idB join an existing group, merge
// two existing groups, or form a new one — see similarityMatch.ts's mergeMatch.
export async function addMatch(idA: string, idB: string): Promise<void> {
  const groups = await getPendingGroups();
  await groupsStore.set(mergeMatch(groups, idA, idB));
}

// A group ceases to exist once reviewed — removes the group with exactly this
// member set (order-independent), leaving every other pending group untouched.
export async function removeGroup(memberIds: string[]): Promise<void> {
  const groups = await getPendingGroups();
  const target = new Set(memberIds);
  const remaining = groups.filter((group) => {
    if (group.length !== target.size) return true;
    return !group.every((id) => target.has(id));
  });
  await groupsStore.set(remaining);
}
