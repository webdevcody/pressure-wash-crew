---
name: create-pull-request
description: Use whenever you open or prepare a pull request in this repo. Captures before/after screenshots, a video walkthrough, and frame time / FPS / triangle / draw-call metrics against the 120 FPS target, then writes the PR body with Metrics and Risk sections.
---

# Create a pull request

Every PR in this repo must let Cody judge the change without running it:
**before/after screenshots, a video walkthrough, a Metrics section, then a Risk section.**
The game targets **120 FPS (8.33 ms per frame)**. Anything that could push it below that must be visible in the PR before merge.

The tooling lives in `scripts/pr/`. All output goes to `.pr-capture/` (git-ignored).

## 1. Make the change visible to the capture

The capture runs the same scripted views and walkthrough on the base branch and on your branch.

- **Views** (`scripts/pr/views.json`): fixed camera poses; each gets a screenshot and a perf sample. If your feature isn't visible from the existing views, add one that frames it (`pose.pos` is the player's feet position, `pose.lookAt` a world point, `spray: true` holds the trigger). Commit view additions so later PRs keep measuring them.
- **Walkthrough video**: the default shows spraying the house, walking, and the score screen. For a feature it doesn't show, write `scripts/pr/scenarios/<feature>.mjs`:

  ```js
  // helpers: page (Playwright), sleep(ms), startRun(), pose({ pos, lookAt }), spray(on), debug (bool)
  export default async ({ page, sleep, startRun, pose, spray }) => {
    await startRun()
    await pose({ pos: [7, 1, 6], lookAt: [7, 0, 1] })
    await spray(true)
    await sleep(3000)
    await spray(false)
  }
  ```

  The page has `window.__pwc` (store, runtime, `pose`, `cleanAll`) in dev builds and in any build loaded with `?perf`; see `src/dev/debug.ts`. Pointer lock is disabled during capture, so move the camera with `pose()`, not the mouse.

## 2. Capture before and after

```bash
pnpm pr:capture                                  # base = origin/main
pnpm pr:capture --scenario scripts/pr/scenarios/<feature>.mjs
pnpm pr:capture --headed                         # real GPU: use for absolute FPS
```

This builds `origin/main` (in a worktree) and your working tree as production bundles, serves both, and for each one records:

- `<view>.png` screenshots and `metrics.json` (frame ms median/p95, FPS, CPU ms, draw calls, triangles per view)
- `walkthrough.webm`, plus `.mp4` and `.gif` when `ffmpeg` is installed

then writes `.pr-capture/report.md`. Other flags: `--base <ref>`, `--seconds <n>`, `--views <file>`, `--no-video`, `--after-only`.

Frame time is measured with vsync off, so it is real throughput, not a 60 Hz cap. In a cloud container the GPU is software (SwiftShader): absolute FPS there is far below real hardware and the report says so. Use the before → after deltas, and run `--headed` on a machine with a GPU when the absolute 120 FPS number matters.

**Look at the output before using it.** Open the after screenshots and a few frames of the GIF and confirm they show your feature. If a view shows the sky or a wall, fix its pose and re-run.

## 3. Publish the assets and build the body

```bash
url=$(scripts/pr/publish-assets.sh)          # commits assets, then commits their removal
node scripts/pr/report.mjs --before .pr-capture/before --after .pr-capture/after --assets-url "$url" > .pr-capture/report.md
git push -u origin HEAD
```

`publish-assets.sh` adds the PNGs, GIF, MP4, metrics and a rendered `README.md` under `.github/pr-assets/<branch>/` in one commit and removes them in the next, so they never land in `main`'s tree but stay reachable by SHA from the PR body. Push **after** running it.

After opening the PR, read its body back. Some tools that post PR bodies for agents rewrite image tags and asset links into inline code. If that happened, keep the sections, put the asset folder's page (`https://github.com/<owner>/<repo>/tree/<sha>/.github/pr-assets/<branch>`, printed by the script) at the top of Screenshots and Video so the reviewer can open it, and tell the person the PR body lost its inline images. Don't drop the sections.

## 4. Write the PR body

Use exactly these sections, in this order. Paste Screenshots, Video walkthrough and Metrics from `.pr-capture/report.md` unchanged.

```markdown
## Summary
What changed and why, in a few bullets.

## Screenshots
<from report.md>

## Video walkthrough
<from report.md>

## Metrics
<from report.md>

## Risk: Low | Medium | High
One line on why, naming the metric or code path that drives the rating.

## Test plan
- [x] pnpm build
- [x] what you checked by hand or in the video
```

## 5. Rate the risk

Take the **higher** of the report's suggested risk (`<!-- suggested-risk: … -->` at the end of `report.md`) and your own judgment:

- **High: could hurt game performance.** Any view drops below 120 FPS on a real GPU, frame time regresses past the report's High band, triangles or draw calls rise more than 25%, *or* the change touches a per-frame hot path even when the numbers look fine: `useFrame` loops, the Washer raycasts or particles, dirt mask uploads, lights and shadows, renderer or `Canvas` settings, texture or geometry sizes, physics settings, post-processing.
- **Medium:** gameplay logic or state changes, a small measurable perf change (the report's Medium band), or a new runtime dependency.
- **Low:** docs, tooling, HUD text or CSS, and no measurable change in the Metrics table.

Never rate lower than the suggestion without saying why in the Risk line.

## If something can't run

Never invent numbers or screenshots. If the browser can't launch or a capture fails, keep every section and write in it what failed and the command to reproduce, so the reviewer knows to run it locally.
