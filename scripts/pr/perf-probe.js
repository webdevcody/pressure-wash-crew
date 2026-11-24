// Injected into the page by capture.mjs (Playwright addInitScript) before any
// app code runs. It measures from the outside, so it works on any commit,
// including a base branch that predates the in-app debug hooks.
//
// Per frame (grouped by requestAnimationFrame timestamp) it records:
//   interval  ms since the previous frame started (=> FPS). The browser is
//             launched with vsync/frame-rate limits off, so this is real
//             throughput, not a 60 Hz cap.
//   cpu       ms spent inside rAF callbacks (game logic + three.js render
//             submission) on the main thread.
//   calls     WebGL draw calls (all passes, including the shadow map).
//   tris      triangles submitted by those draw calls.
;(() => {
  const TARGET_MS = 1000 / 120

  let recording = false
  let frames = []
  let frameTs = null
  let cpu = 0
  let calls = 0
  let tris = 0

  const triCount = (mode, count, instances) => {
    if (mode === 4) return Math.floor(count / 3) * instances // TRIANGLES
    if (mode === 5 || mode === 6) return Math.max(0, count - 2) * instances // STRIP / FAN
    return 0
  }

  const wrap = (proto) => {
    if (!proto) return
    const specs = [
      ['drawArrays', 2, -1],
      ['drawElements', 1, -1],
      ['drawArraysInstanced', 2, 3],
      ['drawElementsInstanced', 1, 4],
      ['drawRangeElements', 3, -1],
    ]
    for (const [name, countIdx, instIdx] of specs) {
      const orig = proto[name]
      if (typeof orig !== 'function') continue
      proto[name] = function (...a) {
        calls++
        tris += triCount(a[0], a[countIdx], instIdx >= 0 ? a[instIdx] : 1)
        return orig.apply(this, a)
      }
    }
  }
  wrap(globalThis.WebGL2RenderingContext && WebGL2RenderingContext.prototype)
  wrap(globalThis.WebGLRenderingContext && WebGLRenderingContext.prototype)

  const finishFrame = (nextTs) => {
    if (frameTs !== null && recording) {
      frames.push({ ts: frameTs, cpu, calls, tris })
    }
    frameTs = nextTs
    cpu = 0
    calls = 0
    tris = 0
  }

  const raf = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (cb) =>
    raf((ts) => {
      if (ts !== frameTs) finishFrame(ts)
      const t0 = performance.now()
      try {
        cb(ts)
      } finally {
        cpu += performance.now() - t0
      }
    })

  const pct = (sorted, p) =>
    sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0
  const summarize = (xs) => {
    const s = [...xs].sort((a, b) => a - b)
    const mean = s.reduce((a, b) => a + b, 0) / (s.length || 1)
    return { mean, median: pct(s, 50), p95: pct(s, 95), p99: pct(s, 99), max: s[s.length - 1] ?? 0 }
  }

  const rendererInfo = () => {
    try {
      const gl = document.createElement('canvas').getContext('webgl2')
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info')
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown'
    } catch {
      return 'unknown'
    }
  }

  window.__perfProbe = {
    targetMs: TARGET_MS,
    renderer: rendererInfo,
    start() {
      frames = []
      recording = true
    },
    count: () => frames.length,
    stop() {
      recording = false
      // Drop the first frame: its interval spans the start() call.
      const fs = frames.slice(1)
      const intervals = []
      for (let i = 1; i < fs.length; i++) intervals.push(fs[i].ts - fs[i - 1].ts)
      const interval = summarize(intervals)
      return {
        frames: fs.length,
        fps: interval.mean ? 1000 / interval.mean : 0,
        frameMs: interval,
        cpuMs: summarize(fs.map((f) => f.cpu)),
        drawCalls: summarize(fs.map((f) => f.calls)),
        triangles: summarize(fs.map((f) => f.tris)),
        slowFrames: intervals.filter((x) => x > TARGET_MS).length / (intervals.length || 1),
      }
    },
  }
})()
