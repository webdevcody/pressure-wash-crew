# Pressure Wash Crew

Single-player, first-person pressure washing game for the browser. Not multiplayer. Live at https://webdevcody.github.io/pressure-wash-crew/.

## Stack

Vite + TypeScript (pnpm), React Three Fiber v9 + drei, `@react-three/rapier` physics, zustand state. See `README.md` for how washing works.

## Commands

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm build        # typecheck + production build; must pass before a PR
pnpm pr:capture   # before/after screenshots, video and perf metrics for a PR
pnpm perf:baseline --channel chrome   # re-record main's real-GPU baseline (perf/baseline.json)
```

## Layout

- `src/game/`: pure game logic and data (`store.ts` zustand, `runtime.ts` per-frame mutable state, `level1.ts` level data, `washSurface.ts` dirt masks)
- `src/components/`: R3F scene and HUD/screens; `src/components/washer/`: the spray, one component per job
- `src/controls/`: per-feature control help for the menu and HUD
- `src/dev/debug.ts`: `window.__pwc` debug API (dev builds, or any build with `?perf`); `?stats` shows an FPS panel
- `scripts/pr/`: PR capture tooling; `perf/baseline.json`: main's real-GPU perf baseline

## Rules

- Performance budget: **120 FPS (8.33 ms/frame)**. `perf/baseline.json` is main's measured real-GPU numbers (M3 Pro MacBook Pro, Chrome, vsync off); PR reports compare against it. Keep per-frame work in `useFrame` allocation-free and out of React state; read/write `runtime` instead.
- `.github/workflows/` can't be changed by the agent GitHub token; give Cody the file contents to commit by hand.
- **Pull requests:** always follow [`.claude/skills/create-pull-request/SKILL.md`](.claude/skills/create-pull-request/SKILL.md). Every PR needs before/after screenshots, a video walkthrough, a Metrics section and a Risk section.
- **Auto-merge:** if a PR's risk is Low, or it's a simple bug fix that doesn't need human review, fix any merge conflicts (merge `main` in, never force-push), confirm `pnpm build` passes, and squash-merge it yourself. Medium and High risk PRs wait for Cody. Details in the skill, step 6.
- **Conflicts and merging:** always follow [`.claude/skills/merge-pull-request/SKILL.md`](.claude/skills/merge-pull-request/SKILL.md). A conflict marks a coupling hotspot: decouple it so features plug in through their own files, then resolve, rebuild, re-measure and merge.

## Extension points

Add a feature through its own files, not by editing a shared list. Merges that decouple a hotspot add it here.

- Reacting to a surface getting cleaned: subscribe with `onSurfaceCleaned` in `src/game/surfaceEvents.ts` instead of editing the washer.
- PR capture views: add `scripts/pr/views/<nn>-<feature>.json` (see its README), don't edit another feature's file.
- Menu keys, HUD hint and menu tips: add `src/controls/<nn>-<feature>.ts`.
- Washer: one component per job in `src/components/washer/` (input, nozzle keys, aim probe, spray, particles), mounted by `Washer.tsx`. New droplet effects call `emitParticle` (`src/game/sprayParticles.ts`); new raycasts use `castSprayRay` (`src/game/sprayRay.ts`).
- Dirt masks: per-feature logic goes in its own module that `WashSurface` calls (`surfaceHoles.ts`, `stains.ts`, `noise.ts`), not in its constructor.
- Component styles: a `.css` file next to the component, imported by it, instead of `src/styles.css`.
