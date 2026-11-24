#!/usr/bin/env node
// Turn two capture dirs into the PR body's Screenshots / Video / Metrics /
// Risk sections (markdown on stdout).
//
//   node scripts/pr/report.mjs --before .pr-capture/before --after .pr-capture/after \
//     [--baseline perf/baseline.json] \
//     [--assets-url https://github.com/OWNER/REPO/raw/SHA/.github/pr-assets/SLUG]
//
// --assets-url is where the before/ and after/ folders will be reachable from
// the PR body (see publish-assets.sh). Without it, links are local paths.
// --baseline adds a comparison against main's recorded real-GPU baseline
// (defaults to perf/baseline.json when it exists; pass --baseline none to skip).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
)
if (!args.before || !args.after) {
  console.error('usage: report.mjs --before <dir> --after <dir> [--baseline <file>|none] [--assets-url <url>]')
  process.exit(2)
}

const TARGET_FPS = 120
const TARGET_MS = 1000 / TARGET_FPS

const load = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'metrics.json'), 'utf8'))
const before = load(args.before)
const after = load(args.after)
const defaultBaseline = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../perf/baseline.json')
const baselinePath = args.baseline === 'none' ? null : (args.baseline ?? (fs.existsSync(defaultBaseline) ? defaultBaseline : null))
const baseline = baselinePath ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : null
const base = (args['assets-url'] ?? '').replace(/\/$/, '')
// github.com/.../blob/<sha>/... links need ?raw=true to render inline.
const rawSuffix = /github\.com\/.+\/blob\//.test(base) ? '?raw=true' : ''
const asset = (side, file) => (base ? `${base}/${side}/${file}${rawSuffix}` : path.join(side === 'before' ? args.before : args.after, file))
const exists = (dir, f) => fs.existsSync(path.join(dir, f))

const isSoftware = (m) => /swiftshader|llvmpipe|software/i.test(m.renderer)
const software = isSoftware(after)
const out = []
const p = (s = '') => out.push(s)

// ---------- Screenshots ----------
p('## Screenshots')
p()
p('| View | Before | After |')
p('| --- | --- | --- |')
const names = [...new Set([...before.views, ...after.views].map((v) => v.name))]
for (const name of names) {
  const b = before.views.find((v) => v.name === name)
  const a = after.views.find((v) => v.name === name)
  const cell = (v, side) => (v?.screenshot ? `<img src="${asset(side, v.screenshot)}" width="420">` : `_${v?.skipped ?? 'not captured'}_`)
  p(`| \`${name}\` | ${cell(b, 'before')} | ${cell(a, 'after')} |`)
}
p()

// ---------- Video ----------
p('## Video walkthrough')
p()
if (exists(args.after, 'walkthrough.gif')) p(`![walkthrough](${asset('after', 'walkthrough.gif')})`)
// publish-assets.sh ships the .mp4, or the .webm when there is no .mp4.
const vid = ['mp4', 'webm'].find((e) => exists(args.after, `walkthrough.${e}`))
if (vid) p(`Full video (after): [walkthrough.${vid}](${asset('after', `walkthrough.${vid}`)})`)
else p('_No video captured._')
p()

// ---------- Metrics ----------
const pct = (a, b) => (b ? (a - b) / b : 0)
const fmtPct = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`
const fmtMs = (x) => `${x >= 0 ? '+' : ''}${x.toFixed(2)} ms`
const ms = (x) => (x == null ? '-' : `${x.toFixed(2)}`)
const n = (x) => (x == null ? '-' : Math.round(x).toLocaleString('en-US'))
// Mean frame interval (1000 / FPS). Medians and p95 come from rAF timestamps,
// which browsers round to 0.1 ms, so at several hundred FPS they move in
// coarse steps; the mean is continuous and is what regressions are judged on.
const frameMean = (s) => (s.fps ? 1000 / s.fps : s.frameMs.mean)

// Risk thresholds.
// - Triangles and draw calls are deterministic: +25% High, +5% Medium.
// - Frame and CPU time on a real GPU are judged by how much of the 8.33 ms
//   budget a change eats, since a relative change on a ~1.4 ms frame is
//   mostly 0.1 ms rounding: High at +0.83 ms (10% of the budget) or +50%,
//   Medium at +0.25 ms and +10%. Run-to-run noise on the baseline machine is
//   about ±0.07 ms / ±5%.
// - Frame time on a software GPU is noisy and not representative: relative
//   bands only, +25% High, +10% Medium.
const COUNT = { high: 0.25, medium: 0.05 }
const HW = { highMs: TARGET_MS * 0.1, highRel: 0.5, mediumMs: 0.25, mediumRel: 0.1 }
const SW = { high: 0.25, medium: 0.1 }
const timeLevel = (a, b, sw) => {
  const d = a - b
  const rel = pct(a, b)
  if (sw) return rel > SW.high ? 'High' : rel > SW.medium ? 'Medium' : 'Low'
  if (d >= HW.highMs || (d > 0.1 && rel >= HW.highRel)) return 'High'
  if (d >= HW.mediumMs && rel >= HW.mediumRel) return 'Medium'
  return 'Low'
}
const countLevel = (a, b) => {
  const rel = pct(a, b)
  return rel > COUNT.high ? 'High' : rel > COUNT.medium ? 'Medium' : 'Low'
}
const rank = { Low: 0, Medium: 1, High: 2 }

// Everything that regressed for one view, compared with a reference capture.
// `timing` is false when the two ran on different setups (only the
// deterministic counts are compared then).
function regressions(a, b, { sw, timing }) {
  const found = []
  if (timing) {
    if (!sw && b.frameMs.median <= TARGET_MS && a.frameMs.median > TARGET_MS) found.push(['High', 'drops below 120 FPS'])
    else if (!sw && b.frameMs.p95 <= TARGET_MS && a.frameMs.p95 > TARGET_MS) found.push(['High', 'p95 frame time goes over 8.33 ms'])
    const f = timeLevel(frameMean(a), frameMean(b), sw)
    if (f !== 'Low') found.push([f, `frame time ${fmtMs(frameMean(a) - frameMean(b))} (${fmtPct(pct(frameMean(a), frameMean(b)))})`])
    if (b.cpuMs.median <= TARGET_MS && a.cpuMs.median > TARGET_MS) found.push(['High', 'CPU time per frame exceeds 8.33 ms'])
    else if (!sw) {
      const c = timeLevel(a.cpuMs.mean, b.cpuMs.mean, false)
      if (c !== 'Low') found.push([c, `CPU time ${fmtMs(a.cpuMs.mean - b.cpuMs.mean)} (${fmtPct(pct(a.cpuMs.mean, b.cpuMs.mean))})`])
    }
  }
  const t = countLevel(a.triangles.median, b.triangles.median)
  if (t !== 'Low') found.push([t, `triangles ${fmtPct(pct(a.triangles.median, b.triangles.median))}`])
  const c = countLevel(a.drawCalls.median, b.drawCalls.median)
  if (c !== 'Low') found.push([c, `draw calls ${fmtPct(pct(a.drawCalls.median, b.drawCalls.median))}`])
  return found
}
const worstOf = (found) => found.reduce((w, [l]) => (rank[l] > rank[w] ? l : w), 'Low')

let worst = 'Low'
const reasons = []
const bump = (level, why) => {
  if (rank[level] > rank[worst]) worst = level
  if (level !== 'Low') reasons.push(why)
}

p('## Metrics')
p()
p(`Target: **${TARGET_FPS} FPS = ${TARGET_MS.toFixed(2)} ms/frame**. Frame time is the interval between frames with vsync off (real throughput); CPU is time spent in requestAnimationFrame callbacks (game logic + three.js draw submission); draw calls and triangles cover every pass, including the shadow map.`)
p()
const setup = (m) => `\`${m.renderer}\`${m.headed ? ' (headed)' : ' (headless)'}${m.browser ? `, ${m.browser}` : ''}, ${m.viewport.width}×${m.viewport.height}${m.dpr && m.dpr !== 1 ? ` @${m.dpr}x` : ''}`
p(`- Renderer: ${setup(after)}, ${after.seconds}s × ${after.samples ?? 1} sample(s) per view`)
p(`- Before: \`${before.sha ?? '?'}\` · After: \`${after.sha ?? '?'}\``)
if (software)
  p(`- ⚠️ **Software GPU** (SwiftShader). Absolute FPS here is far below real hardware, so the 120 FPS column only checks CPU time per frame; judge by the before → after deltas, and re-run with \`--headed\` on a machine with a GPU for absolute numbers.`)
if (after.refreshCap)
  p(`- ⚠️ Every view ran at ~${after.refreshCap} FPS, so the browser ignored the vsync flags and these numbers are the display cap, not throughput. Re-run with \`--channel chrome\` or another browser build that honors \`--disable-gpu-vsync --disable-frame-rate-limit\`.`)
p()
p('| View | Frame ms median (before → after) | Frame ms p95 | FPS | CPU ms median | Draw calls | Triangles | 120 FPS |')
p('| --- | --- | --- | --- | --- | --- | --- | --- |')

for (const name of names) {
  const b = before.views.find((v) => v.name === name)?.stats
  const a = after.views.find((v) => v.name === name)?.stats
  if (!a) {
    p(`| \`${name}\` | _not captured_ | | | | | | |`)
    continue
  }
  const d = (get) => (b ? ` (${fmtPct(pct(get(a), get(b)))})` : '')
  const pair = (get, f) => (b ? `${f(get(b))} → ${f(get(a))}${d(get)}` : `${f(get(a))} (new)`)
  const meets = a.frameMs.median <= TARGET_MS
  const p95ok = a.frameMs.p95 <= TARGET_MS
  // CPU time alone over budget means 120 FPS is out of reach on any GPU, so
  // it is the one absolute check that still means something on SwiftShader.
  const cpuOk = a.cpuMs.median <= TARGET_MS
  const flag = !cpuOk
    ? '❌ CPU over budget'
    : software
      ? 'GPU n/a · CPU ✅'
      : meets && p95ok
        ? '✅'
        : meets
          ? '⚠️ p95 over'
          : '❌ below'
  p(
    `| \`${name}\` | ${pair((s) => s.frameMs.median, ms)} | ${pair((s) => s.frameMs.p95, ms)} | ${pair((s) => s.fps, (x) => x.toFixed(1))} | ${pair((s) => s.cpuMs.median, ms)} | ${pair((s) => s.drawCalls.median, n)} | ${pair((s) => s.triangles.median, n)} | ${flag} |`,
  )

  if (!b) continue
  for (const [level, why] of regressions(a, b, { sw: software, timing: true })) bump(level, `\`${name}\` ${why}`)
}
p()
p(
  `<sub>Suggested-risk thresholds: triangles or draw calls +${COUNT.high * 100}% ⇒ High, +${COUNT.medium * 100}% ⇒ Medium. ` +
    (software
      ? `Frame time (software GPU, ±10% noise is normal): +${SW.high * 100}% ⇒ High, +${SW.medium * 100}% ⇒ Medium.`
      : `Frame and CPU time (mean, real GPU): +${HW.highMs.toFixed(2)} ms (10% of the budget) or +${HW.highRel * 100}% ⇒ High, +${HW.mediumMs} ms and +${HW.mediumRel * 100}% ⇒ Medium; dropping under 120 FPS ⇒ High.`) +
    '</sub>',
)
p()

// ---------- Against the main baseline ----------
if (baseline) {
  const sameSetup = (m) =>
    !isSoftware(m) && m.headed && m.renderer === baseline.renderer && (m.dpr ?? 1) === (baseline.dpr ?? 1) && m.viewport.width === baseline.viewport.width && m.viewport.height === baseline.viewport.height
  const timing = sameSetup(after)
  const where = [baseline.machine?.model, baseline.machine?.cpu].filter(Boolean).join(', ')
  p('### Against the main baseline')
  p()
  p(`- Baseline: \`${baseline.sha}\` recorded ${baseline.recordedAt.slice(0, 10)} on ${where || 'unknown machine'}: ${setup(baseline)}, ${baseline.runs} runs × ${baseline.samples} samples, vsync off.`)
  if (!timing)
    p(
      `- This capture ran on ${setup(after)}, not the baseline's setup, so only draw calls and triangles (which don't depend on the machine) are compared. For frame time against the baseline, run \`pnpm pr:capture --headed${baseline.browser?.startsWith('chrome') ? ' --channel chrome' : ''}\` on the baseline machine.`,
    )
  if (before.sha && baseline.sha && !before.sha.startsWith(baseline.sha))
    p(`- main has moved since the baseline (\`${baseline.sha}\` → \`${before.sha}\`). A regression that **Before** also shows came from main, not this PR, and only counts as main drift.`)
  p()
  p('| View | FPS (baseline → after) | Frame ms mean | Frame ms p95 | CPU ms mean | Draw calls | Triangles | vs baseline |')
  p('| --- | --- | --- | --- | --- | --- | --- | --- |')
  const drift = []
  for (const name of names) {
    const r = baseline.views.find((v) => v.name === name)?.stats
    const a = after.views.find((v) => v.name === name)?.stats
    const b = before.views.find((v) => v.name === name)?.stats
    if (!a) continue
    if (!r) {
      p(`| \`${name}\` | _not in baseline_ | | | | | | 🆕 new view |`)
      continue
    }
    const pair = (get, f, show = true) => (show ? `${f(get(r))} → ${f(get(a))} (${fmtPct(pct(get(a), get(r)))})` : '_n/a_')
    const found = regressions(a, r, { sw: false, timing })
    // Same check on Before: if main already regressed, it isn't this PR.
    const mainFound = b ? regressions(b, r, { sw: false, timing: timing && sameSetup(before) }) : []
    const level = worstOf(found)
    const mainLevel = worstOf(mainFound)
    let verdict = '✅ within noise'
    if (level !== 'Low' && rank[mainLevel] >= rank[level]) {
      verdict = `↔️ main drift: ${found.map(([, w]) => w).join(', ')}`
      drift.push(`\`${name}\``)
    } else if (level !== 'Low') {
      verdict = `${level === 'High' ? '❌' : '⚠️'} ${level}: ${found.map(([, w]) => w).join(', ')}`
      for (const [l, why] of found) bump(l, `\`${name}\` ${why} vs baseline`)
    }
    p(
      `| \`${name}\` | ${pair((s) => s.fps, (x) => x.toFixed(1), timing)} | ${pair(frameMean, ms, timing)} | ${pair((s) => s.frameMs.p95, ms, timing)} | ${pair((s) => s.cpuMs.mean, ms, timing)} | ${pair((s) => s.drawCalls.median, n)} | ${pair((s) => s.triangles.median, n)} | ${verdict} |`,
    )
  }
  p()
  if (drift.length)
    p(`<sub>↔️ ${drift.join(', ')}: main (Before) is already this far from the baseline, so it doesn't count against this PR. If main got slower on purpose, refresh the baseline with \`pnpm perf:baseline\`; if not, it needs a look.</sub>`)
  else p('<sub>Regressions against the baseline use the same thresholds as above and count toward the suggested risk.</sub>')
  p()
}

p(`<!-- suggested-risk: ${worst}${reasons.length ? ` (${reasons.join('; ')})` : ''} -->`)

console.log(out.join('\n'))
console.error(`suggested risk from metrics: ${worst}${reasons.length ? ` (${reasons.join('; ')})` : ''}`)
