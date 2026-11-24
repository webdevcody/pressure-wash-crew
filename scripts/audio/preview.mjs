#!/usr/bin/env node
// Render every game sound to a listenable file without playing the game.
//
//   node scripts/audio/preview.mjs [out.wav]      (default .pr-capture/audio-preview.wav)
//
// Starts the Vite dev server, renders src/dev/audioPreview.ts in headless
// Chromium with an OfflineAudioContext, writes a 16-bit WAV, and an MP3/MP4
// next to it when ffmpeg is installed. Also prints peak/RMS per section.
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const out = path.resolve(process.argv[2] ?? '.pr-capture/audio-preview.wav')
fs.mkdirSync(path.dirname(out), { recursive: true })

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.error('[page error]', e.message))
  await page.goto('http://localhost:5199/')
  const { sampleRate, left, right } = await page.evaluate(async () => {
    const m = await import('/src/dev/audioPreview.ts')
    return m.renderAudioPreview()
  })

  const n = left.length
  const data = Buffer.alloc(44 + n * 4)
  data.write('RIFF', 0); data.writeUInt32LE(36 + n * 4, 4); data.write('WAVE', 8)
  data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22)
  data.writeUInt32LE(sampleRate, 24); data.writeUInt32LE(sampleRate * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34)
  data.write('data', 36); data.writeUInt32LE(n * 4, 40)
  const clamp = (x) => Math.max(-32768, Math.min(32767, Math.round(x * 32767)))
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(clamp(left[i]), 44 + i * 4)
    data.writeInt16LE(clamp(right[i]), 46 + i * 4)
  }
  fs.writeFileSync(out, data)
  console.log('wrote', out)

  const sections = [['walk', 0, 3], ['run', 3, 5], ['jumps', 5.3, 7.8], ['spray', 8.3, 13.5], ['ambience', 15, 30]]
  for (const [name, a, b] of sections) {
    let peak = 0, sum = 0
    for (let i = Math.floor(a * sampleRate); i < Math.floor(b * sampleRate); i++) {
      const x = Math.max(Math.abs(left[i]), Math.abs(right[i]))
      peak = Math.max(peak, x); sum += left[i] * left[i]
    }
    const rms = Math.sqrt(sum / ((b - a) * sampleRate))
    const db = (x) => (20 * Math.log10(x || 1e-9)).toFixed(1)
    console.log(`${name.padEnd(9)} peak ${db(peak)} dBFS  rms ${db(rms)} dBFS`)
  }

  try {
    const base = out.replace(/\.wav$/, '')
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', out, '-b:a', '128k', `${base}.mp3`])
    // An MP4 (still spectrogram + audio) plays inline on GitHub.
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', out, '-filter_complex',
      '[0:a]showspectrum=s=1280x360:mode=combined:color=intensity:scale=log:slide=scroll,format=yuv420p[v]',
      '-map', '[v]', '-map', '0:a', '-c:v', 'libx264', '-c:a', 'aac', '-b:a', '128k', `${base}.mp4`])
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', out, '-lavfi', 'showspectrumpic=s=1600x500:legend=1', `${base}.png`])
    console.log('wrote', `${base}.mp3`, `${base}.mp4`, `${base}.png`)
  } catch (e) {
    console.log('ffmpeg step skipped:', e.message.split('\n')[0])
  }
} finally {
  await browser.close()
  await server.close()
}
