import * as MediaLibrary from "expo-media-library";
import { PhotoAsset } from "../types";

export type AccessLevel = "all" | "limited" | "none";

export async function requestAccess(): Promise<AccessLevel> {
  const current = await MediaLibrary.getPermissionsAsync(false);
  const response = current.granted
    ? current
    : await MediaLibrary.requestPermissionsAsync(false);

  if (!response.granted) return "none";
  return response.accessPrivileges === "limited" ? "limited" : "all";
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

export async function getAssetInfo(id: string): Promise<PhotoAsset | null> {
  const info = await MediaLibrary.getAssetInfoAsync(id);
  if (!info) return null;
  return {
    id: info.id,
    uri: info.uri,
    width: info.width,
    height: info.height,
  };
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
