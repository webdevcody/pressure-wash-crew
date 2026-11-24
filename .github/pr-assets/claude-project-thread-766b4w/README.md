## Screenshots

| View | Before | After |
| --- | --- | --- |
| `menu` | <img src="./before/menu.png" width="420"> | <img src="./after/menu.png" width="420"> |
| `spawn` | <img src="./before/spawn.png" width="420"> | <img src="./after/spawn.png" width="420"> |
| `spawn-spraying` | <img src="./before/spawn-spraying.png" width="420"> | <img src="./after/spawn-spraying.png" width="420"> |
| `yard-overview` | <img src="./before/yard-overview.png" width="420"> | <img src="./after/yard-overview.png" width="420"> |
| `house-closeup-spraying` | <img src="./before/house-closeup-spraying.png" width="420"> | <img src="./after/house-closeup-spraying.png" width="420"> |
| `driveway-spraying` | <img src="./before/driveway-spraying.png" width="420"> | <img src="./after/driveway-spraying.png" width="420"> |
| `fence-closeup` | <img src="./before/fence-closeup.png" width="420"> | <img src="./after/fence-closeup.png" width="420"> |
| `perimeter-wall` | <img src="./before/perimeter-wall.png" width="420"> | <img src="./after/perimeter-wall.png" width="420"> |
| `house-corner` | <img src="./before/house-corner.png" width="420"> | <img src="./after/house-corner.png" width="420"> |
| `house-door-spraying` | <img src="./before/house-door-spraying.png" width="420"> | <img src="./after/house-door-spraying.png" width="420"> |
| `house-stains` | <img src="./before/house-stains.png" width="420"> | <img src="./after/house-stains.png" width="420"> |
| `driveway-stains` | <img src="./before/driveway-stains.png" width="420"> | <img src="./after/driveway-stains.png" width="420"> |
| `city-street-front` | <img src="./before/city-street-front.png" width="420"> | <img src="./after/city-street-front.png" width="420"> |
| `city-neighbors-east` | <img src="./before/city-neighbors-east.png" width="420"> | <img src="./after/city-neighbors-east.png" width="420"> |
| `city-skyline` | <img src="./before/city-skyline.png" width="420"> | <img src="./after/city-skyline.png" width="420"> |
| `wall-celebration` | <img src="./before/wall-celebration.png" width="420"> | <img src="./after/wall-celebration.png" width="420"> |

## Video walkthrough

![walkthrough](./after/walkthrough.gif)
Full video (after): [walkthrough.mp4](./after/walkthrough.mp4)

## Metrics

Target: **120 FPS = 8.33 ms/frame**. Frame time is the interval between frames with vsync off (real throughput); CPU is time spent in requestAnimationFrame callbacks (game logic + three.js draw submission); draw calls and triangles cover every pass, including the shadow map.

- Renderer: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)` (headless), playwright chromium 158.0.8127.36, 1280×720, 4s × 1 sample(s) per view
- Before: `8e30b5a` · After: `bdbdc99`
- ⚠️ **Software GPU** (SwiftShader). Absolute FPS here is far below real hardware, so the 120 FPS column only checks CPU time per frame; judge by the before → after deltas, and re-run with `--headed` on a machine with a GPU for absolute numbers.

| View | Frame ms median (before → after) | Frame ms p95 | FPS | CPU ms median | Draw calls | Triangles | 120 FPS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `menu` | 208.40 → 268.20 (+28.7%) | 241.20 → 304.50 (+26.2%) | 4.8 → 3.7 (-21.6%) | 1.80 → 2.10 (+16.7%) | 30 → 38 (+26.7%) | 29,572 → 53,340 (+80.4%) | GPU n/a · CPU ✅ |
| `spawn` | 212.90 → 268.10 (+25.9%) | 236.80 → 317.20 (+34.0%) | 4.7 → 3.7 (-21.6%) | 1.80 → 2.10 (+16.7%) | 30 → 38 (+26.7%) | 29,572 → 53,340 (+80.4%) | GPU n/a · CPU ✅ |
| `spawn-spraying` | 199.00 → 256.90 (+29.1%) | 221.90 → 287.70 (+29.7%) | 5.0 → 3.9 (-22.2%) | 1.60 → 1.90 (+18.7%) | 30 → 38 (+26.7%) | 29,572 → 53,340 (+80.4%) | GPU n/a · CPU ✅ |
| `yard-overview` | 200.40 → 251.50 (+25.5%) | 221.20 → 270.30 (+22.2%) | 5.0 → 4.0 (-19.8%) | 1.50 → 1.70 (+13.3%) | 30 → 37 (+23.3%) | 29,572 → 51,840 (+75.3%) | GPU n/a · CPU ✅ |
| `house-closeup-spraying` | 258.80 → 322.40 (+24.6%) | 292.60 → 365.90 (+25.1%) | 3.8 → 3.1 (-19.1%) | 1.70 → 2.00 (+17.6%) | 27 → 35 (+29.6%) | 29,474 → 53,242 (+80.6%) | GPU n/a · CPU ✅ |
| `driveway-spraying` | 218.90 → 303.60 (+38.7%) | 244.90 → 376.10 (+53.6%) | 4.6 → 3.3 (-28.6%) | 1.60 → 2.00 (+25.0%) | 27 → 35 (+29.6%) | 29,474 → 53,242 (+80.6%) | GPU n/a · CPU ✅ |
| `fence-closeup` | 229.80 → 289.60 (+26.0%) | 257.90 → 354.80 (+37.6%) | 4.3 → 3.3 (-23.4%) | 1.40 → 1.60 (+14.3%) | 25 → 31 (+24.0%) | 29,520 → 50,308 (+70.4%) | GPU n/a · CPU ✅ |
| `perimeter-wall` | 140.50 → 217.70 (+54.9%) | 161.90 → 239.90 (+48.2%) | 7.0 → 4.6 (-34.1%) | 1.10 → 1.40 (+27.3%) | 23 → 30 (+30.4%) | 29,446 → 51,504 (+74.9%) | GPU n/a · CPU ✅ |
| `house-corner` | 214.40 → 259.50 (+21.0%) | 255.00 → 290.00 (+13.7%) | 4.6 → 3.9 (-15.3%) | 1.50 → 1.60 (+6.7%) | 30 → 37 (+23.3%) | 29,572 → 51,840 (+75.3%) | GPU n/a · CPU ✅ |
| `house-door-spraying` | 309.70 → 354.70 (+14.5%) | 396.00 → 393.80 (-0.6%) | 3.2 → 2.8 (-11.2%) | 1.60 → 1.90 (+18.7%) | 26 → 34 (+30.8%) | 29,472 → 53,240 (+80.6%) | GPU n/a · CPU ✅ |
| `house-stains` | 246.00 → 297.20 (+20.8%) | 295.40 → 362.70 (+22.8%) | 4.0 → 3.3 (-16.8%) | 1.70 → 1.40 (-17.6%) | 29 → 37 (+27.6%) | 29,548 → 53,316 (+80.4%) | GPU n/a · CPU ✅ |
| `driveway-stains` | 220.00 → 276.60 (+25.7%) | 248.50 → 323.70 (+30.3%) | 4.5 → 3.5 (-22.0%) | 1.40 → 1.50 (+7.1%) | 29 → 37 (+27.6%) | 29,548 → 53,316 (+80.4%) | GPU n/a · CPU ✅ |
| `city-street-front` | 97.80 → 188.30 (+92.5%) | 114.50 → 215.30 (+88.0%) | 10.2 → 5.3 (-48.2%) | 0.90 → 1.30 (+44.4%) | 17 → 24 (+41.2%) | 28,056 → 50,054 (+78.4%) | GPU n/a · CPU ✅ |
| `city-neighbors-east` | 192.10 → 238.60 (+24.2%) | 220.60 → 264.00 (+19.7%) | 5.1 → 4.2 (-18.5%) | 1.20 → 1.40 (+16.7%) | 30 → 38 (+26.7%) | 29,572 → 53,090 (+79.5%) | GPU n/a · CPU ✅ |
| `city-skyline` | 160.60 → 262.40 (+63.4%) | 187.20 → 293.60 (+56.8%) | 6.2 → 3.8 (-38.6%) | 1.30 → 1.60 (+23.1%) | 30 → 38 (+26.7%) | 29,572 → 53,340 (+80.4%) | GPU n/a · CPU ✅ |
| `wall-celebration` | 256.10 → 326.70 (+27.6%) | 299.70 → 410.60 (+37.0%) | 3.9 → 3.0 (-22.1%) | 1.70 → 1.80 (+5.9%) | 34 → 42 (+23.5%) | 31,578 → 53,848 (+70.5%) | GPU n/a · CPU ✅ |

<sub>Suggested-risk thresholds: triangles or draw calls +25% ⇒ High, +5% ⇒ Medium. Frame time (software GPU, ±10% noise is normal): +25% ⇒ High, +10% ⇒ Medium.</sub>

### Against the main baseline

- Baseline: `d879b16` recorded 2026-11-24 on MacBook Pro (Mac15,6), Apple M3 Pro: `ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)` (headed), chrome 158.0.8127.37, 1280×720, 3 runs × 3 samples, vsync off.
- This capture ran on `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)` (headless), playwright chromium 158.0.8127.36, 1280×720, not the baseline's setup, so only draw calls and triangles (which don't depend on the machine) are compared. For frame time against the baseline, run `pnpm pr:capture --headed --channel chrome` on the baseline machine.
- main has moved since the baseline (`d879b16` → `8e30b5a`). A regression that **Before** also shows came from main, not this PR, and only counts as main drift.

| View | FPS (baseline → after) | Frame ms mean | Frame ms p95 | CPU ms mean | Draw calls | Triangles | vs baseline |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `menu` | _n/a_ | _n/a_ | _n/a_ | _n/a_ | 29 → 38 (+31.0%) | 25,516 → 53,340 (+109.0%) | ❌ High: triangles +109.0%, draw calls +31.0% |
| `spawn` | _n/a_ | _n/a_ | _n/a_ | _n/a_ | 29 → 38 (+31.0%) | 25,516 → 53,340 (+109.0%) | ❌ High: triangles +109.0%, draw calls +31.0% |
| `spawn-spraying` | _n/a_ | _n/a_ | _n/a_ | _n/a_ | 29 → 38 (+31.0%) | 25,516 → 53,340 (+109.0%) | ❌ High: triangles +109.0%, draw calls +31.0% |
| `yard-overview` | _n/a_ | _n/a_ | _n/a_ | _n/a_ | 29 → 37 (+27.6%) | 25,516 → 51,840 (+103.2%) | ❌ High: triangles +103.2%, draw calls +27.6% |
| `house-closeup-spraying` | _n/a_ | _n/a_ | _n/a_ | _n/a_ | 25 → 35 (+40.0%) | 25,478 → 53,242 (+109.0%) | ❌ High: triangles +109.0%, draw calls +40.0% |
| `driveway-spraying` | _not in baseline_ | | | | | | 🆕 new view |
| `fence-closeup` | _not in baseline_ | | | | | | 🆕 new view |
| `perimeter-wall` | _not in baseline_ | | | | | | 🆕 new view |
| `house-corner` | _not in baseline_ | | | | | | 🆕 new view |
| `house-door-spraying` | _not in baseline_ | | | | | | 🆕 new view |
| `house-stains` | _not in baseline_ | | | | | | 🆕 new view |
| `driveway-stains` | _not in baseline_ | | | | | | 🆕 new view |
| `city-street-front` | _not in baseline_ | | | | | | 🆕 new view |
| `city-neighbors-east` | _not in baseline_ | | | | | | 🆕 new view |
| `city-skyline` | _not in baseline_ | | | | | | 🆕 new view |
| `wall-celebration` | _not in baseline_ | | | | | | 🆕 new view |

<sub>Regressions against the baseline use the same thresholds as above and count toward the suggested risk.</sub>

<!-- suggested-risk: High (`menu` frame time +58.04 ms (+27.6%); `menu` triangles +80.4%; `menu` draw calls +26.7%; `spawn` frame time +58.57 ms (+27.5%); `spawn` triangles +80.4%; `spawn` draw calls +26.7%; `spawn-spraying` frame time +56.69 ms (+28.6%); `spawn-spraying` triangles +80.4%; `spawn-spraying` draw calls +26.7%; `yard-overview` frame time +49.56 ms (+24.7%); `yard-overview` triangles +75.3%; `yard-overview` draw calls +23.3%; `house-closeup-spraying` frame time +61.69 ms (+23.7%); `house-closeup-spraying` triangles +80.6%; `house-closeup-spraying` draw calls +29.6%; `driveway-spraying` frame time +88.00 ms (+40.1%); `driveway-spraying` triangles +80.6%; `driveway-spraying` draw calls +29.6%; `fence-closeup` frame time +70.55 ms (+30.5%); `fence-closeup` triangles +70.4%; `fence-closeup` draw calls +24.0%; `perimeter-wall` frame time +74.11 ms (+51.8%); `perimeter-wall` triangles +74.9%; `perimeter-wall` draw calls +30.4%; `house-corner` frame time +39.62 ms (+18.1%); `house-corner` triangles +75.3%; `house-corner` draw calls +23.3%; `house-door-spraying` frame time +40.01 ms (+12.6%); `house-door-spraying` triangles +80.6%; `house-door-spraying` draw calls +30.8%; `house-stains` frame time +50.61 ms (+20.2%); `house-stains` triangles +80.4%; `house-stains` draw calls +27.6%; `driveway-stains` frame time +62.20 ms (+28.2%); `driveway-stains` triangles +80.4%; `driveway-stains` draw calls +27.6%; `city-street-front` frame time +90.96 ms (+93.2%); `city-street-front` triangles +78.4%; `city-street-front` draw calls +41.2%; `city-neighbors-east` frame time +44.37 ms (+22.8%); `city-neighbors-east` triangles +79.5%; `city-neighbors-east` draw calls +26.7%; `city-skyline` frame time +101.35 ms (+62.7%); `city-skyline` triangles +80.4%; `city-skyline` draw calls +26.7%; `wall-celebration` frame time +73.46 ms (+28.5%); `wall-celebration` triangles +70.5%; `wall-celebration` draw calls +23.5%; `menu` triangles +109.0% vs baseline; `menu` draw calls +31.0% vs baseline; `spawn` triangles +109.0% vs baseline; `spawn` draw calls +31.0% vs baseline; `spawn-spraying` triangles +109.0% vs baseline; `spawn-spraying` draw calls +31.0% vs baseline; `yard-overview` triangles +103.2% vs baseline; `yard-overview` draw calls +27.6% vs baseline; `house-closeup-spraying` triangles +109.0% vs baseline; `house-closeup-spraying` draw calls +40.0% vs baseline) -->
