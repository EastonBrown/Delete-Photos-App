# A photo that can't be resolved right now is never treated as deleted

Persisted photo ids — review queue entries, Similar Group members — are resolved against the media library via `getAssetInfoAsync`, which can fail for two unrelated reasons: the photo really was deleted outside the app, or the lookup itself failed. Because `getAssetInfoAsync` defaults to `shouldDownloadFromNetwork: true`, the second case is routine rather than exotic: an iCloud-offloaded photo on poor connectivity fails, and "Optimize iPhone Storage" makes offloading the norm on a full device.

Collapsing both into a single "couldn't get it" answer is unsafe, because the app's response to a deleted photo is to *forget it*: drop it from the queue, or retire its Similar Group. Applied to a photo that merely failed to load, that silently and permanently removes a photo the user still owns from every review flow. `getAssetInfo` therefore returns three states — `found`, `missing` (the library answered, and it's gone), `unavailable` (the lookup failed, which says nothing) — and only `missing` may cause anything to be forgotten. An id nobody looked up counts as `unavailable`, so a lookup that never happened can't retire anything either.

The platforms disagree on how "gone" arrives — iOS rejects, while the Android path returns an empty array that `expo-media-library` indexes into, yielding `undefined` — so the rule is drawn at *who answered*: a resolved-but-empty result is the library speaking and counts as `missing`; only a thrown error is `unavailable`.

Downloading is kept on, rather than passing `shouldDownloadFromNetwork: false` to make lookups local-only. Local-only reads would make the distinction mostly moot, but the photos most worth de-duplicating are exactly the old bursts iCloud has offloaded, and they would become permanently unreviewable. The cost of keeping downloads — a burst of network calls on mount — is handled by capping concurrent lookups instead.

## Consequences

- Collapsed Similar Groups and stale queue entries no longer self-clean in every case: a group whose members are all offloaded stays pending, and is re-attempted on the next visit rather than retired. This is deliberate — the pending count is briefly wrong, which is recoverable; forgetting a photo is not.
- A group with two or more surviving members is still reviewable even if another member is unavailable. Two survivors make a real comparison, and retiring the group returns the unavailable member to the normal per-photo queue rather than deleting it.
- Callers cannot silently ignore the distinction: the three states are a discriminated union, so a call site that forgets `unavailable` fails to typecheck rather than defaulting to the dangerous reading.

## Considered Options

- **Keep the two-state `PhotoAsset | null` and treat `null` as gone.** What the code did. Simplest, and wrong in exactly the direction that loses photos.
- **Local-only lookups (`shouldDownloadFromNetwork: false`).** Removes the thundering-herd problem and makes most failures impossible, but permanently excludes offloaded photos from the feature — solving a performance problem by quietly shrinking the corpus.
- **Confirm deletion against a fresh `fetchAllPhotoIds()` before retiring anything.** Authoritative, but pays a full library enumeration to answer a question the per-photo lookup already answers when it succeeds.
