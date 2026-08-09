import * as MediaLibrary from "expo-media-library";
import { AssetLookup } from "../types";

export type AccessLevel = "all" | "limited" | "none";

// "all" has to be stated, not assumed: accessPrivileges is optional in the type,
// and the caller that acts on "all" prunes persisted state on the strength of a
// library enumeration being complete. Guessing wrong toward "limited" costs a
// stray banner; guessing wrong toward "all" reads a partial library as deletions.
function toAccessLevel(response: MediaLibrary.PermissionResponse): AccessLevel {
  if (!response.granted) return "none";
  return response.accessPrivileges === "all" ? "all" : "limited";
}

export async function requestAccess(): Promise<AccessLevel> {
  const current = await MediaLibrary.getPermissionsAsync(false);
  const response = current.granted
    ? current
    : await MediaLibrary.requestPermissionsAsync(false);

  return toAccessLevel(response);
}

// Reads the access level without ever prompting — for background work that needs
// to know how much of the library it can see, not to ask for more.
export async function getAccessLevel(): Promise<AccessLevel> {
  return toAccessLevel(await MediaLibrary.getPermissionsAsync(false));
}

export async function presentLimitedAccessPicker(): Promise<void> {
  await MediaLibrary.presentPermissionsPickerAsync();
}

const PAGE_SIZE = 200;

export async function fetchAllPhotoIds(): Promise<string[]> {
  const ids: string[] = [];
  let after: string | undefined;
  let hasNextPage = true;

  while (hasNextPage) {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: "photo",
      first: PAGE_SIZE,
      after,
      sortBy: "creationTime",
    });
    for (const asset of page.assets) ids.push(asset.id);
    hasNextPage = page.hasNextPage;
    after = page.endCursor;
  }

  return ids;
}

// Resolves a persisted id (a queue entry, a pending Similar Group member) against
// the library. The two failure states are deliberately not merged:
//
//   missing     — the library answered, and this photo is gone. Forget it.
//   unavailable — the lookup itself failed. Says nothing about whether the photo
//                 exists, so callers must never treat it as a deletion.
//
// The platforms disagree on how "gone" arrives: iOS rejects, while the Android
// path returns an empty array that expo-media-library indexes into, yielding
// undefined. A resolved-but-empty answer is the library speaking, so it counts as
// missing; only a thrown error is unavailable. See ADR-0002.
export async function getAssetInfo(id: string): Promise<AssetLookup> {
  try {
    const info = await MediaLibrary.getAssetInfoAsync(id);
    if (!info) return { status: "missing" };
    return {
      status: "found",
      asset: {
        id: info.id,
        uri: info.uri,
        width: info.width,
        height: info.height,
      },
    };
  } catch {
    return { status: "unavailable" };
  }
}

// Resolves ids with a cap on in-flight lookups. getAssetInfoAsync defaults to
// shouldDownloadFromNetwork: true, so an unbounded Promise.all over a large id list
// can kick off hundreds of simultaneous iCloud downloads.
const MAX_CONCURRENT_LOOKUPS = 8;

export async function getAssetInfos(ids: string[]): Promise<Map<string, AssetLookup>> {
  const results = new Map<string, AssetLookup>();
  for (let i = 0; i < ids.length; i += MAX_CONCURRENT_LOOKUPS) {
    const window = ids.slice(i, i + MAX_CONCURRENT_LOOKUPS);
    const resolved = await Promise.all(window.map(getAssetInfo));
    window.forEach((id, index) => results.set(id, resolved[index]));
  }
  return results;
}

// localUri is a file:// path, distinct from (and not always equal to) uri —
// needed by consumers that read raw pixel/file data, e.g. dHash.ts.
export async function getLocalUri(id: string): Promise<string> {
  const info = await MediaLibrary.getAssetInfoAsync(id);
  return info.localUri ?? info.uri;
}

export async function deleteAssets(ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  return MediaLibrary.deleteAssetsAsync(ids);
}
