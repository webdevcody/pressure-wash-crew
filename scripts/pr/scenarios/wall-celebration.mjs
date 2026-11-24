// Walkthrough for the "wall finished" celebration: spray the house front,
// finish it (via the debug API, since spraying a whole wall takes minutes),
// then finish the fence and the driveway from where you'd stand to wash them.
export default async ({ page, sleep, startRun, pose, spray }) => {
  const finish = (id) => page.evaluate((x) => window.__pwc.cleanSurface?.(x), id)
  await startRun()
  await pose({ pos: [1.5, 1, 4], lookAt: [0, 1.5, -3] })
  await spray(true)
  for (let i = 0; i <= 12; i++) {
    await pose({ pos: [1.5, 1, 4], lookAt: [-2 + i * 0.35, 1.3, -3] })
    await sleep(150)
  }
  await spray(false)
  await finish('house-front')
  await sleep(4000)
  await pose({ pos: [-4, 1, 6], lookAt: [-6.9, 0.6, 2] })
  await sleep(800)
  await finish('fence')
  await sleep(4000)
  await pose({ pos: [7, 1, 8], lookAt: [7, 0, 1] })
  await sleep(800)
  await finish('driveway')
  await sleep(4000)
}
