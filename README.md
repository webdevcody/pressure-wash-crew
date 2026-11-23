# Pressure Wash Crew

A single-player, first-person pressure washing game for the browser.

## Run it

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
| Shift | Run |
| Space | Jump |
| Esc | Pause |

## How it works

- **Stack:** Vite + TypeScript, React Three Fiber v9 + drei, `@react-three/rapier` for physics, zustand for game state.
- **Washing:** every washable face is a `WashSurface` (`src/game/washSurface.ts`) with a CPU-side dirt mask (32 texels per meter) baked into a `DataTexture`. Each frame the washer casts a small cone of rays from the camera; hits on a washable plane stamp a soft brush at the hit UV. Closer = tighter and stronger. Because the mask lives on the CPU, the "% remaining" count is exact and needs no GPU readback.
- **Occlusion:** the spray raycasts against every level mesh, so you can't wash through walls.
- **Game loop:** menu → playing (timer + % dirt remaining + per-surface checklist) → score screen when ≤1% of the dirt is left. Fastest time is stored in `localStorage`.
- **Level:** `src/game/level1.ts` is pure data: gray-box blockers plus the washable surfaces placed on them. Add a surface by adding an entry there.

In dev builds, `window.__pwc.cleanAll()` instantly cleans everything (handy for testing the score screen).
