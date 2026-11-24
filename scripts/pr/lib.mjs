// Shared helpers for run.mjs (before/after capture) and baseline.mjs.
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const here = path.dirname(fileURLToPath(import.meta.url))
export const root = path.resolve(here, '../..')
export const work = path.join(root, '.pr-capture')
export const baselineFile = path.join(root, 'perf', 'baseline.json')

export const sh = (cmd, args, cwd = root) => {
  console.log(`$ ${cmd} ${args.join(' ')}${cwd !== root ? `   (in ${path.relative(root, cwd)})` : ''}`)
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed`)
}

// Check out `ref` in a reusable git worktree and build it into `outDir`.
// Returns the worktree path.
export function buildRef(ref, outDir) {
  const src = path.join(work, 'base-src')
  fs.mkdirSync(work, { recursive: true })
  try {
    execFileSync('git', ['fetch', 'origin', ref.replace(/^origin\//, '')], { cwd: root, stdio: 'ignore' })
  } catch {
    console.warn(`could not fetch ${ref}; using the local copy`)
  }
  if (fs.existsSync(src)) sh('git', ['checkout', '--detach', '--force', ref], src)
  else sh('git', ['worktree', 'add', '--detach', src, ref])
  sh('pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], src)
  sh('pnpm', ['exec', 'vite', 'build', '--outDir', outDir, '--emptyOutDir'], src)
  return src
}

export function buildWorkingTree(outDir) {
  sh('pnpm', ['exec', 'vite', 'build', '--outDir', outDir, '--emptyOutDir'])
}

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' }
export function serve(dir) {
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

// Serve `distDir` and run capture.mjs against it, writing to `outDir`.
export async function captureDist(distDir, outDir, gitCwd, passthrough) {
  const server = await serve(distDir)
  const url = `http://127.0.0.1:${server.address().port}/`
  fs.rmSync(outDir, { recursive: true, force: true })
  try {
    console.log(`\n== capturing ${path.relative(root, outDir)} (${url}) ==`)
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(here, 'capture.mjs'), '--url', url, '--out', outDir, '--cwd', gitCwd, ...passthrough], { stdio: 'inherit' })
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`capture ${outDir} failed`))))
    })
  } finally {
    server.close()
  }
}

// Which machine a capture ran on. The GPU comes from the WebGL renderer
// string (capture.mjs adds it); this covers the rest.
export function machineInfo() {
  const info = {
    os: `${os.type()} ${os.release()} (${os.platform()} ${os.arch()})`,
    cpu: os.cpus()[0]?.model ?? 'unknown',
    cores: os.cpus().length,
    memoryGb: Math.round(os.totalmem() / 2 ** 30),
  }
  if (os.platform() === 'darwin') {
    try {
      const hw = execFileSync('system_profiler', ['SPHardwareDataType'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString()
      const get = (k) => hw.match(new RegExp(`${k}: (.+)`))?.[1]?.trim()
      info.model = [get('Model Name'), get('Model Identifier') && `(${get('Model Identifier')})`].filter(Boolean).join(' ')
      info.os = `macOS ${execFileSync('sw_vers', ['-productVersion']).toString().trim()} (${os.arch()})`
    } catch {}
    try {
      const disp = execFileSync('system_profiler', ['SPDisplaysDataType'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString()
      info.displays = [...disp.matchAll(/^ {8}(\S.*):\n((?: {10}.*\n)+)/gm)].map(([, name, body]) => {
        const res = body.match(/UI Looks like: (.+)/)?.[1] ?? body.match(/Resolution: (.+)/)?.[1]
        return `${name}${res ? `: ${res.trim()}` : ''}`
      })
    } catch {}
  }
  return info
}

// Median of each numeric field across samples (same shape as one sample).
export function medianStats(runs) {
  if (runs.length === 1) return runs[0]
  const med = (xs) => {
    const s = [...xs].sort((a, b) => a - b)
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
  }
  const walk = (objs) =>
    typeof objs[0] === 'number' ? med(objs) : Object.fromEntries(Object.keys(objs[0]).map((k) => [k, walk(objs.map((o) => o[k]))]))
  return walk(runs)
}
