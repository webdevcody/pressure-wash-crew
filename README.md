# Pressure Wash Crew

A single-player, first-person pressure washing game for the browser.

## Play it

Live build: https://webdevcody.github.io/pressure-wash-crew/ (deployed by `.github/workflows/deploy.yml` on every push to `main`).

## Run it locally

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # typecheck + production build
```

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Move |
| Mouse | Look (click Start to lock the pointer) |
| Left mouse (hold) | Spray |
| Q / E | Previous / next nozzle |
| 1-5 | Pick a nozzle directly |
| R | Turn fan nozzles (horizontal / vertical line) |
| Shift | Run |
| Space | Jump |
| Esc | Pause |

## How it works

- **Stack:** Vite + TypeScript, React Three Fiber v9 + drei, `@react-three/rapier` for physics, zustand for game state.
- **Washing:** every washable face is a `WashSurface` (`src/game/washSurface.ts`) with a CPU-side dirt mask (32 texels per meter) baked into a `DataTexture`. Each frame the washer casts a small cone of rays from the camera; hits on a washable plane stamp a soft brush at the hit UV. Closer = tighter and stronger. Because the mask lives on the CPU, the "% remaining" count is exact and needs no GPU readback.
- **Nozzles:** `src/game/nozzles.ts` defines five real-style tips: 0° pinpoint (red), 15° line (yellow), 25° cone (green, default), 40° wide fan (white) and soap (black). Each has a spray shape (point, cone or fan line), reach, pressure and cleaning rate. Wider tips clean more area per second but with less pressure.
- **Stains:** `src/game/stains.ts` scatters stains over each surface by kind (wall, ground, fence), re-randomized every run: base grime, mildew patches, rust drips / tire marks / water streaks, stuck-on paint, tar and gum, and oil. Each type has a hardness; a tip whose pressure is below it barely cleans it, so tough spots need the 0° tip, streaks the 15° line, and oil needs soap before any tip can rinse it. The HUD names the stain under the crosshair and suggests a better tip. `?seed=N` pins the layout (`?perf` pins seed 1 for PR captures).
- **Occlusion:** the spray raycasts against every level mesh, so you can't wash through walls.
- **Game loop:** menu → playing (timer + % dirt remaining + per-surface checklist) → score screen when ≤1% of the dirt is left. Fastest time is stored in `localStorage`.
- **Level:** `src/game/level1.ts` is pure data: gray-box blockers plus the washable surfaces placed on them. Add a surface by adding an entry there.
- **Textures:** yard textures (grass, concrete, block wall, wood, crate) are baked by `scripts/textures/gen_yard_textures.py` into `src/assets/textures/yard/` (procedural and seeded, no third-party assets). Washable surfaces can show a texture under the dirt via `createWashMaterial` (`src/game/washMaterial.ts`): the texture tiles at full resolution and the dirt mask is mixed over it by its alpha (stain coverage).

In dev builds (or any build opened with `?perf`), `window.__pwc.cleanAll()` instantly cleans everything (handy for testing the score screen). Add `?stats` to the URL for an on-screen FPS panel.

## Contributing

Agent and contributor guide: [AGENTS.md](AGENTS.md). Pull requests follow [the create-pull-request skill](.claude/skills/create-pull-request/SKILL.md): before/after screenshots, a video, perf metrics against 120 FPS, and a risk rating. `pnpm pr:capture` generates most of it.
