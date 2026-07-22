# Windowed, randomly-sampled similarity scanning instead of a full-corpus pass

Detecting Similar Groups requires hashing photos (a GL render + pixel readback per photo), so scanning the entire unreviewed corpus on every queue rebuild doesn't scale as a library grows into the thousands. Instead, the review queue's staged pool is topped up incrementally: when it drops to a low-water mark, a random sample of not-yet-scanned photos is hashed — bounded by a time budget or the high-water mark — rather than the whole backlog. Comparisons are made against cached hashes of a photo's nearest chronological neighbors (not just same-batch photos), so a Similar Group can still grow correctly across separate scan passes without a persisted scan cursor. This trades true global randomness (every unreviewed photo equally likely to appear in the next session) for bounded, predictable per-session cost — accepted because the difference is imperceptible in normal use.

## Considered Options

- **Full-corpus scan on every rebuild.** Simplest, but cost grows unbounded with library size; the first rebuild after adding this feature would need to hash the entire existing backlog.
- **Fixed forward-only cursor**, scanning sequential chronological chunks and advancing permanently. Rejected because a cursor that only moves toward older photos never revisits the newest position, so photos taken after the cursor has passed would never get scanned.
