#!/usr/bin/env node
// One command for the whole before/after capture:
//
//   pnpm pr:capture                 # base = origin/main
//   pnpm pr:capture --base <ref> --headed --scenario scripts/pr/scenarios/my-feature.mjs
//
// 1. builds the base ref in a git worktree (.pr-capture/base-src) and the
//    current working tree, both as production bundles
// 2. serves each on a local port
// 3. runs capture.mjs on both (screenshots, perf metrics, video)
// 4. writes .pr-capture/report.md (Screenshots / Video / Metrics sections)
//
// Any other flags (--seconds, --headed, --scenario, --views, --no-video) are
// passed through to capture.mjs.
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const work = path.join(root, '.pr-capture')
const argv = process.argv.slice(2)
const baseIdx = argv.indexOf('--base')
const baseRef = baseIdx >= 0 ? argv.splice(baseIdx, 2)[1] : 'origin/main'
const skipBefore = argv.includes('--after-only')
if (skipBefore) argv.splice(argv.indexOf('--after-only'), 1)
const passthrough = argv

const sh = (cmd, args, cwd = root) => {
  console.log(`$ ${cmd} ${args.join(' ')}${cwd !== root ? `   (in ${path.relative(root, cwd)})` : ''}`)
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed`)
}

fs.mkdirSync(work, { recursive: true })

// ---------- build ----------
const baseSrc = path.join(work, 'base-src')
if (!skipBefore) {
  try {
    execFileSync('git', ['fetch', 'origin', baseRef.replace(/^origin\//, '')], { cwd: root, stdio: 'ignore' })
  } catch {
    console.warn(`could not fetch ${baseRef}; using the local copy`)
  }
  if (fs.existsSync(baseSrc)) sh('git', ['checkout', '--detach', '--force', baseRef], baseSrc)
  else sh('git', ['worktree', 'add', '--detach', baseSrc, baseRef])
  sh('pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], baseSrc)
  sh('pnpm', ['exec', 'vite', 'build', '--outDir', path.join(work, 'dist-before'), '--emptyOutDir'], baseSrc)
}
sh('pnpm', ['exec', 'vite', 'build', '--outDir', path.join(work, 'dist-after'), '--emptyOutDir'])

// ---------- serve ----------
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' }
function serve(dir) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    let file = path.join(dir, rel)
    if (!file.startsWith(dir)) return res.writeHead(403).end()
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
    if (!fs.existsSync(file)) return res.writeHead(404).end()
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

const capture = async (label) => {
  const server = await serve(path.join(work, `dist-${label}`))
  const url = `http://127.0.0.1:${server.address().port}/`
  const outDir = path.join(work, label)
  fs.rmSync(outDir, { recursive: true, force: true })
  try {
    console.log(`\n== capturing ${label} (${url}) ==`)
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(here, 'capture.mjs'), '--url', url, '--out', outDir, '--cwd', label === 'before' ? baseSrc : root, ...passthrough], { stdio: 'inherit' })
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`capture ${label} failed`))))
    })
  } finally {
    server.close()
  }
}

if (!skipBefore) await capture('before')
await capture('after')

// ---------- report ----------
if (fs.existsSync(path.join(work, 'before', 'metrics.json'))) {
  const report = execFileSync(process.execPath, [path.join(here, 'report.mjs'), '--before', path.join(work, 'before'), '--after', path.join(work, 'after')], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] })
  fs.writeFileSync(path.join(work, 'report.md'), report)
  console.log(`\nwrote ${path.relative(root, path.join(work, 'report.md'))}`)
}
