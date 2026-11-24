#!/usr/bin/env node
// Turn two capture dirs into the PR body's Screenshots / Video / Metrics /
// Risk sections (markdown on stdout).
//
//   node scripts/pr/report.mjs --before .pr-capture/before --after .pr-capture/after \
//     [--assets-url https://github.com/OWNER/REPO/raw/SHA/.github/pr-assets/SLUG]
//
// --assets-url is where the before/ and after/ folders will be reachable from
// the PR body (see publish-assets.sh). Without it, links are local paths.
import fs from 'node:fs'
import path from 'node:path'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
)
if (!args.before || !args.after) {
  console.error('usage: report.mjs --before <dir> --after <dir> [--assets-url <url>]')
  process.exit(2)
}

const TARGET_FPS = 120
const TARGET_MS = 1000 / TARGET_FPS
// Relative change thresholds for the suggested risk level. Frame time on a
// software GPU is noisy, so it gets wider bands there. Triangles and draw
// calls are deterministic.

const load = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'metrics.json'), 'utf8'))
const before = load(args.before)
const after = load(args.after)
const base = (args['assets-url'] ?? '').replace(/\/$/, '')
// github.com/.../blob/<sha>/... links need ?raw=true to render inline.
const rawSuffix = /github\.com\/.+\/blob\//.test(base) ? '?raw=true' : ''
const asset = (side, file) => (base ? `${base}/${side}/${file}${rawSuffix}` : path.join(side === 'before' ? args.before : args.after, file))
const exists = (dir, f) => fs.existsSync(path.join(dir, f))

const software = /swiftshader|llvmpipe|software/i.test(after.renderer)
const HIGH = { frameMs: software ? 0.25 : 0.1, tris: 0.25, calls: 0.25 }
const MEDIUM = { frameMs: software ? 0.1 : 0.03, tris: 0.05, calls: 0.05 }
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
const vids = ['mp4', 'webm'].filter((e) => exists(args.after, `walkthrough.${e}`))
if (vids.length) p(`Full video (after): ${vids.map((e) => `[walkthrough.${e}](${asset('after', `walkthrough.${e}`)})`).join(' · ')}`)
else p('_No video captured._')
p()

// ---------- Metrics ----------
const pct = (a, b) => (b ? (a - b) / b : 0)
const fmtPct = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`
const ms = (x) => (x == null ? '-' : `${x.toFixed(2)}`)
const n = (x) => (x == null ? '-' : Math.round(x).toLocaleString('en-US'))

p('## Metrics')
p()
p(`Target: **${TARGET_FPS} FPS = ${TARGET_MS.toFixed(2)} ms/frame**. Frame time is the interval between frames with vsync off (real throughput); CPU is time spent in requestAnimationFrame callbacks (game logic + three.js draw submission); draw calls and triangles cover every pass, including the shadow map.`)
p()
p(`- Renderer: \`${after.renderer}\`${after.headed ? ' (headed)' : ' (headless)'}, ${after.viewport.width}×${after.viewport.height}, ${after.seconds}s sample per view`)
p(`- Before: \`${before.sha ?? '?'}\` · After: \`${after.sha ?? '?'}\``)
if (software)
  p(`- ⚠️ **Software GPU** (SwiftShader). Absolute FPS here is far below real hardware, so the 120 FPS flags below are not meaningful on their own; judge by the before → after deltas, and re-run with \`--headed\` on a machine with a GPU for absolute numbers.`)
p()
p('| View | Frame ms median (before → after) | Frame ms p95 | FPS | CPU ms median | Draw calls | Triangles | 120 FPS |')
p('| --- | --- | --- | --- | --- | --- | --- | --- |')

let worst = 'Low'
const reasons = []
const bump = (level, why) => {
  const rank = { Low: 0, Medium: 1, High: 2 }
  if (rank[level] > rank[worst]) worst = level
  if (level !== 'Low') reasons.push(why)
}

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
  const flag = meets && p95ok ? '✅' : meets ? '⚠️ p95 over' : '❌ below'
  p(
    `| \`${name}\` | ${pair((s) => s.frameMs.median, ms)} | ${pair((s) => s.frameMs.p95, ms)} | ${pair((s) => s.fps, (x) => x.toFixed(1))} | ${pair((s) => s.cpuMs.median, ms)} | ${pair((s) => s.drawCalls.median, n)} | ${pair((s) => s.triangles.median, n)} | ${flag} |`,
  )

  if (!b) continue
  const dFrame = pct(a.frameMs.median, b.frameMs.median)
  const dTris = pct(a.triangles.median, b.triangles.median)
  const dCalls = pct(a.drawCalls.median, b.drawCalls.median)
  if (!software && b.frameMs.median <= TARGET_MS && !meets) bump('High', `\`${name}\` drops below 120 FPS`)
  if (dFrame > HIGH.frameMs) bump('High', `\`${name}\` frame time ${fmtPct(dFrame)}`)
  else if (dFrame > MEDIUM.frameMs) bump('Medium', `\`${name}\` frame time ${fmtPct(dFrame)}`)
  if (dTris > HIGH.tris) bump('High', `\`${name}\` triangles ${fmtPct(dTris)}`)
  else if (dTris > MEDIUM.tris) bump('Medium', `\`${name}\` triangles ${fmtPct(dTris)}`)
  if (dCalls > HIGH.calls) bump('High', `\`${name}\` draw calls ${fmtPct(dCalls)}`)
  else if (dCalls > MEDIUM.calls) bump('Medium', `\`${name}\` draw calls ${fmtPct(dCalls)}`)
}
p()
p(`<sub>Thresholds for the suggested risk: frame time +${HIGH.frameMs * 100}% / triangles or draw calls +${HIGH.tris * 100}% ⇒ High; +${MEDIUM.frameMs * 100}% / +${MEDIUM.tris * 100}% ⇒ Medium. Frame-time bands are wider on a software GPU (±10% run-to-run noise is normal there).</sub>`)
p()
p(`<!-- suggested-risk: ${worst}${reasons.length ? ` (${reasons.join('; ')})` : ''} -->`)

console.log(out.join('\n'))
console.error(`suggested risk from metrics: ${worst}${reasons.length ? ` (${reasons.join('; ')})` : ''}`)
