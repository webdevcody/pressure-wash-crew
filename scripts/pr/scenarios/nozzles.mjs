// Walkthrough for the nozzle + stain PR: switches tips with Q/E/R and the
// number keys and uses each one on the stain it's meant for.
// Run: pnpm pr:capture --scenario scripts/pr/scenarios/nozzles.mjs
//
// Player y = 0.85 is where the capsule actually rests (eye at 1.5), so the
// crosshair lands exactly on the stain we look at.
const Y = 0.85

export default async ({ page, sleep, startRun, pose, spray, debug }) => {
  await sleep(1200) // menu, with the new controls
  await startRun()
  if (!debug) return

  // Base builds (before this PR) have no findStain: those steps are skipped.
  const find = (surface, type) => page.evaluate(([s, t]) => window.__pwc.findStain?.(s, t) ?? null, [surface, type])
  const key = async (code) => {
    await page.keyboard.press(code)
    await sleep(500)
  }
  const sprayAt = async (from, target, ms) => {
    await pose({ pos: from, lookAt: target })
    await spray(true)
    await sleep(ms)
    await spray(false)
  }

  // 1. 40° wide fan sweeps light grime off the house front, top to bottom.
  await pose({ pos: [-1.5, Y, -0.9], lookAt: [-1.5, 1.4, -3] })
  await sleep(700)
  await key('KeyE') // 25° cone -> 40° wide fan
  await spray(true)
  for (let i = 0; i <= 24; i++) await pose({ pos: [-1.5, Y, -0.9], lookAt: [-1.5, 2.8 - (2.4 * i) / 24, -3] }), await sleep(70)
  await spray(false)

  // 2. Wide fan can't touch a rust streak; the 15° line, turned vertical, strips it.
  const streak = await find('house-front', 2)
  if (streak) {
    const from = [streak[0], Y, -0.8]
    await sprayAt(from, streak, 1200) // hint: too tough, try 15° Line
    await key('KeyQ') // -> 25°
    await key('KeyQ') // -> 15° line
    await key('KeyR') // vertical line
    await spray(true)
    for (let i = 0; i <= 12; i++) await pose({ pos: from, lookAt: [streak[0], streak[1] + 0.5 - i / 12, streak[2]] }), await sleep(90)
    await spray(false)
  }

  // 3. A stuck-on paint splatter needs the 0° pinpoint.
  const spot = await find('house-front', 3)
  if (spot) {
    const from = [spot[0], Y, -0.9]
    await key('KeyQ') // -> 0° pinpoint
    await pose({ pos: from, lookAt: spot })
    await spray(true)
    for (let i = 0; i <= 40; i++) {
      const a = i * 0.5
      const r = 0.03 + (0.25 * i) / 40
      await pose({ pos: from, lookAt: [spot[0] + Math.cos(a) * r, spot[1] + Math.sin(a) * r, spot[2]] })
      await sleep(60)
    }
    await spray(false)
  }

  // 4. Oil on the driveway: water does nothing, soap it, then rinse with the cone.
  const oil = await find('driveway', 4)
  if (oil) {
    const from = [oil[0] + 0.3, Y, oil[2] + 1.8]
    await key('Digit3') // 25° cone
    await sprayAt(from, oil, 1500) // hint: too greasy, soap it first
    await key('Digit5') // soap
    await spray(true)
    for (let i = 0; i <= 16; i++) await pose({ pos: from, lookAt: [oil[0] + 0.3 * Math.cos(i / 2.5), 0, oil[2] + 0.3 * Math.sin(i / 2.5)] }), await sleep(90)
    await spray(false)
    await sleep(400)
    await key('Digit3') // back to the cone to rinse
    await spray(true)
    for (let i = 0; i <= 20; i++) await pose({ pos: from, lookAt: [oil[0] + 0.3 * Math.cos(i / 3), 0, oil[2] + 0.3 * Math.sin(i / 3)] }), await sleep(90)
    await spray(false)
  }

  // Finish the level to show the score screen still works.
  await sleep(500)
  await page.evaluate(() => window.__pwc.cleanAll())
  await sleep(2000)
}
