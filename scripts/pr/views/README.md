# Capture views

Fixed camera views that `pnpm pr:capture` screenshots and perf-samples on every PR. Each feature owns one file, `<nn>-<feature>.json`, shaped `{ "views": [...] }`. Files are read in name order, so a new feature adds a file instead of editing a shared list. View names must be unique across files.

- `phase`: `menu` or `playing`.
- `pose` needs the in-app debug API (`src/dev/debug.ts`); builds without it skip posed views. `pos` is the player's feet (y = 1 stands on the ground, eye at 1.65), `lookAt` a world point.
- `spray: true` holds the trigger.
- `eval` is JS run in the page after posing (e.g. to trigger an effect). Keep it a no-op on builds that lack it (`?.`).
- Views run in order on one page, so a view that leaves something running goes in a `9x-` file.
