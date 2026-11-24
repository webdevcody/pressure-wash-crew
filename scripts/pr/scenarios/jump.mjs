// Jump + sprint walkthrough: hold Space (should hop once, not climb), tap jumps,
// try a mid-air double jump, then sprint with Shift.
// A caption in the corner shows the current action and the player's height.
export default async ({ page, sleep, startRun, pose }) => {
  await startRun()
  await page.evaluate(() => {
    const el = document.createElement('div')
    el.id = 'pr-caption'
    el.style.cssText =
      'position:fixed;left:16px;bottom:16px;z-index:99999;padding:8px 12px;border-radius:6px;' +
      'background:rgba(0,0,0,.7);color:#fff;font:600 18px/1.3 system-ui,sans-serif;pointer-events:none'
    document.body.appendChild(el)
    const tick = () => {
      const p = window.__pwc?.runtime.player?.translation()
      const feet = p ? (p.y - 0.85).toFixed(2) : '?'
      el.textContent = `${window.__prAction ?? ''} · feet height ${feet} m`
      requestAnimationFrame(tick)
    }
    tick()
  })
  const say = (t) => page.evaluate((t) => (window.__prAction = t), t)

  await pose({ pos: [6, 1, 9], lookAt: [0, 2.5, -6] })
  await sleep(800)

  await say('Holding Space for 4 s')
  await page.keyboard.down('Space')
  await sleep(4000)
  await page.keyboard.up('Space')
  await say('Released Space')
  await sleep(1500)

  await pose({ pos: [6, 1, 9], lookAt: [0, 2.5, -6] })
  await sleep(500)
  for (let i = 1; i <= 3; i++) {
    await say(`Tap Space (${i}/3)`)
    await page.keyboard.press('Space')
    await sleep(900)
  }

  await say('Double tap mid-air (no double jump)')
  await page.keyboard.press('Space')
  await sleep(200)
  await page.keyboard.press('Space')
  await sleep(1200)

  await say('Walk forward (W)')
  await pose({ pos: [6, 1, 12], lookAt: [6, 1.6, -6] })
  await page.keyboard.down('KeyW')
  await sleep(1500)
  await page.keyboard.up('KeyW')

  await say('Sprint forward (Shift + W)')
  await pose({ pos: [6, 1, 12], lookAt: [6, 1.6, -6] })
  await page.keyboard.down('ShiftLeft')
  await page.keyboard.down('KeyW')
  await sleep(1500)
  await page.keyboard.up('KeyW')
  await page.keyboard.up('ShiftLeft')
  await say('Done')
  await sleep(800)
}
