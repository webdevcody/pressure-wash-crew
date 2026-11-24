#!/usr/bin/env node
// Record perf/baseline.json: main's frame time, FPS, CPU time, draw calls and
// triangles per view on a real GPU, so every PR can be compared against it.
//
//   pnpm perf:baseline --channel chrome          # macOS with Google Chrome
//   pnpm perf:baseline --ref origin/main --runs 3 --samples 3
//
// Always headed (real window + GPU) with vsync off, so 120+ FPS is visible.
// It builds --ref (default origin/main) in .pr-capture/base-src, then runs
// the capture --runs times (fresh page load each) with --samples per view,
// and stores the median of the runs. Refuses to write a software-GPU or
// vsync-capped result. Other flags (--channel, --dpr, --seconds, --views)
// are passed to capture.mjs; use the same ones for PR captures.
import fs from 'node:fs'
import path from 'node:path'
import { baselineFile, buildRef, captureDist, medianStats, root, work } from './lib.mjs'

const argv = process.argv.slice(2)
const take = (flag, fallback) => {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv.splice(i, 2)[1] : fallback
}
const ref = take('--ref', 'origin/main')
const runs = Math.max(1, Number(take('--runs', 3)))
const samples = take('--samples', '3')
const out = path.resolve(take('--out', baselineFile))
const passthrough = argv.filter((a) => a !== '--headed' && a !== '--no-video')

const dist = path.join(work, 'dist-baseline')
const src = buildRef(ref, dist)

const captures = []
for (let i = 1; i <= runs; i++) {
  const dir = path.join(work, `baseline-run-${i}`)
  await captureDist(dist, dir, src, ['--headed', '--no-video', '--samples', samples, ...passthrough])
  captures.push(JSON.parse(fs.readFileSync(path.join(dir, 'metrics.json'), 'utf8')))
}

const first = captures[0]
if (/swiftshader|llvmpipe|software/i.test(first.renderer)) {
  console.error(`refusing to write a baseline from a software GPU (${first.renderer}); run on a machine with a real GPU`)
  process.exit(1)
}
if (captures.some((c) => c.refreshCap)) {
  console.error(`frame rate looks capped at the display refresh (${captures.find((c) => c.refreshCap).refreshCap} Hz); the browser ignored the vsync flags, so this would not be uncapped throughput`)
  process.exit(1)
}

const views = first.views.map((v) => {
  const all = captures.map((c) => c.views.find((x) => x.name === v.name)).filter((x) => x?.stats)
  if (!all.length) return { name: v.name, skipped: v.skipped ?? 'not captured' }
  const fps = all.map((x) => x.stats.fps)
  return {
    name: v.name,
    stats: medianStats(all.map((x) => x.stats)),
    fpsRange: [Math.min(...fps), Math.max(...fps)].map((x) => Number(x.toFixed(1))),
  }
})

const baseline = {
  $comment:
    'Real-GPU perf baseline for main, compared against by pnpm pr:capture (report.mjs). Refresh with `pnpm perf:baseline` after a merge that changes performance, on the same machine. Frame ms is the interval between frames with vsync off (uncapped throughput); stats are the median of `runs` page loads x `samples` samples per view.',
  ref,
  sha: first.sha,
  recordedAt: new Date().toISOString(),
  machine: first.machine,
  renderer: first.renderer,
  browser: first.browser,
  headed: true,
  vsync: first.vsync,
  viewport: first.viewport,
  dpr: first.dpr,
  seconds: first.seconds,
  samples: first.samples,
  runs,
  targetFps: 120,
  targetMs: Number((1000 / 120).toFixed(2)),
  views,
}
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify(baseline, null, 2) + '\n')

console.log(`\nbaseline (${first.renderer}, ${first.browser}, ${runs} runs × ${samples} samples):`)
for (const v of views) {
  if (!v.stats) continue
  const s = v.stats
  console.log(
    `${v.name.padEnd(24)} ${s.fps.toFixed(1).padStart(7)} fps (${v.fpsRange.join('–')})  ` +
      `frame mean ${(1000 / s.fps).toFixed(2)} ms  p95 ${s.frameMs.p95.toFixed(2)} ms  cpu ${s.cpuMs.mean.toFixed(2)} ms  ` +
      `calls ${Math.round(s.drawCalls.median)}  tris ${Math.round(s.triangles.median)}`,
  )
}
console.log(`wrote ${path.relative(root, out)}`)
