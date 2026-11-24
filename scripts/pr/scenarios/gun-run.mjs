// Walk, sprint, turn and spray on the move, to show the held gun staying
// locked to the view (no jitter) with its walk bob, look sway and spray kick.
export default async ({ page, sleep, startRun, pose, spray, debug }) => {
  await startRun()
  if (debug) await pose({ pos: [9, 1, 9], lookAt: [0, 1.4, -3] })
  await sleep(1200) // idle: gun at rest
  // Walk toward the house.
  await page.keyboard.down('KeyW')
  await sleep(2200)
  // Sprint (Shift): gun lowers and tucks in.
  await page.keyboard.down('ShiftLeft')
  await sleep(1600)
  await page.keyboard.up('ShiftLeft')
  await page.keyboard.up('KeyW')
  await sleep(700)
  // Turn left then right (pointer lock is off in capture, so drive the look directly): gun sways.
  for (let i = 0; i < 24; i++) {
    await page.evaluate((d) => { window.__pwc.runtime.look.yaw += d }, i < 12 ? 0.06 : -0.06)
    await sleep(50)
  }
  await sleep(500)
  // Strafe while spraying.
  await spray(true)
  await page.keyboard.down('KeyD')
  await sleep(2000)
  await page.keyboard.up('KeyD')
  await sleep(800)
  await spray(false)
  await sleep(600)
}
