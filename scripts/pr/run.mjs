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
// 4. writes .pr-capture/report.md (Screenshots / Video / Metrics sections),
//    comparing against perf/baseline.json too when it exists
//
// Any other flags (--seconds, --samples, --headed, --channel, --dpr,
// --scenario, --views, --no-video) are passed through to capture.mjs.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { baselineFile, buildRef, buildWorkingTree, captureDist, here, root, work } from './lib.mjs'

const argv = process.argv.slice(2)
const baseIdx = argv.indexOf('--base')
const baseRef = baseIdx >= 0 ? argv.splice(baseIdx, 2)[1] : 'origin/main'
const skipBefore = argv.includes('--after-only')
if (skipBefore) argv.splice(argv.indexOf('--after-only'), 1)
const passthrough = argv

fs.mkdirSync(work, { recursive: true })

// ---------- build ----------
let baseSrc = null
if (!skipBefore) baseSrc = buildRef(baseRef, path.join(work, 'dist-before'))
buildWorkingTree(path.join(work, 'dist-after'))

// ---------- capture ----------
if (!skipBefore) await captureDist(path.join(work, 'dist-before'), path.join(work, 'before'), baseSrc, passthrough)
await captureDist(path.join(work, 'dist-after'), path.join(work, 'after'), root, passthrough)

// ---------- report ----------
if (fs.existsSync(path.join(work, 'before', 'metrics.json'))) {
  const extra = fs.existsSync(baselineFile) ? ['--baseline', baselineFile] : []
  const report = execFileSync(process.execPath, [path.join(here, 'report.mjs'), '--before', path.join(work, 'before'), '--after', path.join(work, 'after'), ...extra], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] })
  fs.writeFileSync(path.join(work, 'report.md'), report)
  console.log(`\nwrote ${path.relative(root, path.join(work, 'report.md'))}`)
}
