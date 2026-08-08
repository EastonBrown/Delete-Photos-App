# Delete_Photos

A personal Expo app for reviewing photos in the device's photo library and deleting the ones the user doesn't want to keep.

## Language

**Similar Group**:
A set of two or more photos the Similarity Scan has identified as visually near-duplicate, reviewed together so the user can choose which of them to keep and which to delete in one pass. Membership is transitive — if A is similar to B and B is similar to C, all three belong to the same Similar Group even if A and C aren't directly similar to each other.
_Avoid_: duplicate group, cluster, burst

**Similarity Scan**:
The process that grows Similar Groups by hashing a random sample of Unscanned photos and comparing each against its nearest chronological neighbors' cached hashes. Runs automatically when starting a review session, topping up a pool of cleared photos whenever it runs low — never a separate step the user triggers directly. See [ADR-0001](./docs/adr/0001-windowed-random-similarity-scan.md).
_Avoid_: duplicate scan, similarity index

**Collapsed Similar Group**:
A Similar Group with fewer than two surviving members, usually because photos were deleted outside the app. It offers no comparison and no choice, so it stops being pending and any lone survivor returns to the normal one-by-one review. A group only counts as collapsed when every non-surviving member is confirmed gone — a member the app merely failed to load is unavailable, not deleted, and its group waits instead. See [ADR-0002](./docs/adr/0002-unavailable-is-not-deleted.md).
_Avoid_: degenerate group, dead group, orphaned group

**Scan Status**:
Per-photo state tracked by the Similarity Scan: `unscanned` (not yet examined), `cleared` (examined, no match found), or `grouped` (examined, matched into a Similar Group pending review). Only `grouped` photos are excluded from the normal per-photo review queue — `unscanned` photos remain eligible, since running a Similarity Scan is never required to use the app.
