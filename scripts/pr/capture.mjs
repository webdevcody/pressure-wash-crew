#!/usr/bin/env node
// Capture screenshots, perf metrics and a walkthrough video of one build.
//
//   node scripts/pr/capture.mjs --url http://localhost:4174/ --out .pr-capture/after
//
// Options:
//   --url <url>          page to load (required); ?perf is appended
//   --out <dir>          output dir (required)
//   --views <path>       a view file, or a folder of them (default scripts/pr/views/)
//   --seconds <n>        perf sample length per view (default 4)
//   --scenario <file>    custom walkthrough module for the video (see SKILL.md)
//   --no-video           skip the video
//   --headed             real window + GPU (more representative FPS)
//   --channel <name>     browser channel, e.g. chrome (installed Google Chrome)
//   --samples <n>        perf samples per view, reported as their median (default 1)
//   --dpr <n>            device pixel ratio (default 1)
//
// Writes <out>/metrics.json, <out>/<view>.png and <out>/walkthrough.{webm,mp4,gif}.
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { machineInfo, medianStats } from './lib.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = parseArgs(process.argv.slice(2))
if (!args.url || !args.out) {
  console.error('usage: capture.mjs --url <url> --out <dir> [--views f] [--seconds n] [--scenario f] [--no-video] [--headed]')
  process.exit(2)
}
const outDir = path.resolve(args.out)
const seconds = Number(args.seconds ?? 4)
const samples = Math.max(1, Number(args.samples ?? 1))
const dpr = Number(args.dpr ?? 1)
const views = loadViews(path.resolve(args.views ?? path.join(here, 'views')))
const probe = fs.readFileSync(path.join(here, 'perf-probe.js'), 'utf8')
const VIEWPORT = { width: 1280, height: 720 }

const url = new URL(args.url)
url.searchParams.set('perf', '')
const pageUrl = url.toString().replace('perf=', 'perf')

fs.mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({
  headless: !args.headed,
  // --channel chrome uses the installed Google Chrome instead of Playwright's
  // bundled Chromium (no browser download needed on a dev machine).
  ...(args.channel ? { channel: args.channel } : {}),
  args: [
    // Uncap rAF so frame times show real throughput instead of a 60 Hz vsync cap.
    '--disable-gpu-vsync',
    '--disable-frame-rate-limit',
    '--ignore-gpu-blocklist',
    '--enable-unsafe-swiftshader',
  ],
})

// Keep the pointer unlocked: under pointer lock Chromium reports mouse
// movement on click, which would spin the camera between before/after runs.
// Without lock, mouse look is off and the camera only moves via pose().
const noPointerLock = 'Element.prototype.requestPointerLock = function () { return Promise.resolve() }'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function openGame(context) {
  await context.addInitScript(noPointerLock)
  const page = await context.newPage()
  page.on('pageerror', (e) => console.error('[page error]', e.message))
  await page.goto(pageUrl, { waitUntil: 'load' })
  await page.waitForSelector('canvas')
  await page.waitForSelector('#start-button')
  await sleep(1500) // let physics/WASM and first frames settle
  return page
}

const hasDebug = (page) => page.evaluate(() => typeof window.__pwc?.pose === 'function')

async function startRun(page) {
  if (await page.$('#start-button')) {
    await page.click('#start-button')
    await sleep(800)
  }
  // Headless pointer lock may fail and pause the run; force it unpaused.
  await page.evaluate(() => window.__pwc?.game.getState().setPaused(false))
}

function lookAngles(pos, target) {
  const eye = [pos[0], pos[1] + 0.65, pos[2]]
  const d = target.map((v, i) => v - eye[i])
  return { yaw: Math.atan2(-d[0], -d[2]), pitch: Math.atan2(d[1], Math.hypot(d[0], d[2])) }
}

async function pose(page, p) {
  const { yaw, pitch } = p.lookAt ? lookAngles(p.pos, p.lookAt) : { yaw: p.yaw ?? 0, pitch: p.pitch ?? 0 }
  await page.evaluate(([x, y, z, yw, pt]) => window.__pwc.pose(x, y, z, yw, pt), [...p.pos, yaw, pitch])
}

async function spray(page, on) {
  if (on) await page.mouse.down()
  else await page.mouse.up()
}

// ---------- metrics + screenshots ----------
const metricsCtx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: dpr })
await metricsCtx.addInitScript(probe)
const page = await openGame(metricsCtx)
const debug = await hasDebug(page)
const renderer = await page.evaluate(() => window.__perfProbe.renderer())
console.log(`renderer: ${renderer}`)
console.log(`debug API: ${debug ? 'yes' : 'no (posed views skipped)'}`)

const results = []
for (const view of views) {
  if (view.pose && !debug) {
    results.push({ name: view.name, skipped: 'build has no debug API (pose)' })
    continue
  }
  if (view.phase === 'playing') await startRun(page)
  if (view.pose) await pose(page, view.pose)
  if (view.spray) await spray(page, true)
  // Optional JS run in the page before sampling (e.g. trigger an effect).
  // Builds that lack what it calls should no-op (use `?.`).
  if (view.eval) await page.evaluate(view.eval)
  await sleep(view.settleMs ?? 1000)

  // Each sample: at least `seconds`, and keep going (up to 5x) until 60
  // frames are in, so slow software-GPU runs still get a usable sample.
  const runs = []
  for (let i = 0; i < samples; i++) {
    await page.evaluate(() => window.__perfProbe.start())
    const t0 = Date.now()
    await sleep(seconds * 1000)
    while (Date.now() - t0 < seconds * 5000 && (await page.evaluate(() => window.__perfProbe.count())) < 60) await sleep(500)
    runs.push(await page.evaluate(() => window.__perfProbe.stop()))
  }
  const stats = medianStats(runs)
  const shot = `${view.name}.png`
  await page.screenshot({ path: path.join(outDir, shot) })
  if (view.spray) await spray(page, false)

  results.push({ name: view.name, screenshot: shot, stats, ...(samples > 1 ? { sampleFps: runs.map((r) => Number(r.fps.toFixed(1))) } : {}) })
  console.log(
    `${view.name.padEnd(24)} ${stats.fps.toFixed(1).padStart(6)} fps  ` +
      `median ${stats.frameMs.median.toFixed(2)} ms  p95 ${stats.frameMs.p95.toFixed(2)} ms  ` +
      `calls ${Math.round(stats.drawCalls.median)}  tris ${Math.round(stats.triangles.median)}`,
  )
}
await metricsCtx.close()

let gitSha = null
try {
  const cwd = args.cwd ?? process.cwd()
  gitSha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd }).toString().trim()
  if (execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd }).toString().trim()) gitSha += ' + uncommitted changes'
} catch {}

// With vsync off, frame intervals should be well under the display's refresh
// interval. If every view sits on a common refresh rate, the browser ignored
// the flags and the numbers are a cap, not throughput.
const refreshCap = (() => {
  const measured = results.filter((r) => r.stats)
  if (!measured.length) return null
  for (const hz of [60, 90, 120, 144, 165, 240]) {
    if (measured.every((r) => Math.abs(r.stats.fps - hz) / hz < 0.03)) return hz
  }
  return null
})()
if (refreshCap) console.warn(`⚠️ every view runs at ~${refreshCap} FPS: looks capped by vsync, not uncapped throughput`)

fs.writeFileSync(
  path.join(outDir, 'metrics.json'),
  JSON.stringify(
    {
      url: pageUrl,
      sha: gitSha,
      renderer,
      browser: `${args.channel ?? 'playwright chromium'} ${browser.version()}`,
      machine: machineInfo(),
      headed: !!args.headed,
      vsync: 'off (--disable-gpu-vsync --disable-frame-rate-limit)',
      refreshCap,
      viewport: VIEWPORT,
      dpr,
      seconds,
      samples,
      targetFps: 120,
      views: results,
      capturedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
)

// ---------- walkthrough video ----------
if (!args['no-video']) {
  const videoDir = path.join(outDir, '.video-tmp')
  const ctx = await browser.newContext({ viewport: VIEWPORT, recordVideo: { dir: videoDir, size: VIEWPORT } })
  const vpage = await openGame(ctx)
  const helpers = { page: vpage, sleep, pose: (p) => pose(vpage, p), spray: (on) => spray(vpage, on), startRun: () => startRun(vpage), debug: await hasDebug(vpage) }
  const scenario = args.scenario
    ? (await import(pathToFileURL(path.resolve(args.scenario)).href)).default
    : defaultWalkthrough
  await scenario(helpers)
  await sleep(500)
  const video = vpage.video()
  await ctx.close()
  const webm = path.join(outDir, 'walkthrough.webm')
  fs.renameSync(await video.path(), webm)
  fs.rmSync(videoDir, { recursive: true, force: true })
  convertVideo(webm)
}

await browser.close()
console.log(`wrote ${outDir}`)

// Default video: start, spray across the house, walk, finish the level.
async function defaultWalkthrough({ page, sleep, pose, spray, startRun, debug }) {
  await sleep(800) // show the menu
  await startRun()
  if (!debug) {
    await spray(true)
    await page.keyboard.down('KeyW')
    await sleep(3000)
    await page.keyboard.up('KeyW')
    await sleep(2000)
    await spray(false)
    return
  }
  await pose({ pos: [0, 1, 2], lookAt: [-3, 1.5, -3] })
  await spray(true)
  // Sweep the spray left -> right across the house front.
  for (let i = 0; i <= 40; i++) {
    const x = -3 + (6 * i) / 40
    await pose({ pos: [0, 1, 2], lookAt: [x, 1.2 + 0.4 * Math.sin(i / 4), -3] })
    await sleep(60)
  }
  await spray(false)
  await page.keyboard.down('KeyW')
  await sleep(1200)
  await page.keyboard.up('KeyW')
  await pose({ pos: [7, 1, 6], lookAt: [7, 0, 1] })
  await spray(true)
  await sleep(2000)
  await spray(false)
  // Finish the level to show the score screen.
  await page.evaluate(() => window.__pwc.cleanAll())
  await sleep(2000)
}

function convertVideo(webm) {
  const ffmpeg = findFfmpeg()
  if (!ffmpeg) {
    console.warn('ffmpeg not found: kept walkthrough.webm only (install ffmpeg for .mp4 and .gif)')
    return
  }
  const dir = path.dirname(webm)
  const run = (a) => execFileSync(ffmpeg, ['-y', '-loglevel', 'error', ...a])
  try {
    run(['-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-crf', '28', path.join(dir, 'walkthrough.mp4')])
  } catch (e) {
    console.warn('mp4 conversion failed:', e.message)
  }
  try {
    run([
      '-i', webm,
      '-vf', 'fps=8,scale=560:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer',
      path.join(dir, 'walkthrough.gif'),
    ])
  } catch (e) {
    console.warn('gif conversion failed:', e.message)
  }
}

function findFfmpeg() {
  for (const bin of ['ffmpeg']) {
    try {
      execFileSync(bin, ['-version'], { stdio: 'ignore' })
      return bin
    } catch {}
  }
  return null
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) out[key] = true
    else out[key] = argv[++i]
  }
  return out
}

// One JSON file per feature ({ "views": [...] }), read in file-name order, so
// a PR adds its views as a new file instead of editing a shared list.
function loadViews(p) {
  const files = fs.statSync(p).isDirectory()
    ? fs.readdirSync(p).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(p, f))
    : [p]
  const all = files.flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')).views)
  const seen = new Set()
  for (const v of all) {
    if (seen.has(v.name)) throw new Error(`duplicate view name "${v.name}" in ${p}`)
    seen.add(v.name)
  }
  return all
}
