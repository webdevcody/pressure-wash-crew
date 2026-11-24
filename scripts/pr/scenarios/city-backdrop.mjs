// City backdrop walkthrough: a slow 360° look around from the yard, then a
// look over each wall at the street, the neighbors and the skyline.
export default async ({ sleep, startRun, pose, debug }) => {
  await startRun()
  if (!debug) return sleep(6000)
  const eyeY = 1.65
  // Pan a full circle from the middle of the yard.
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * Math.PI * 2
    await pose({ pos: [2, 1, 9], lookAt: [2 - Math.sin(a) * 50, eyeY + 6, 9 - Math.cos(a) * 50] })
    await sleep(80)
  }
  // Over the front wall at the street, then the side neighbors, then the skyline.
  const stops = [
    { pos: [3, 1, 13.5], lookAt: [-6, 2.2, 40] },
    { pos: [13, 1, 4], lookAt: [40, 3, -2] },
    { pos: [-12, 1, -10], lookAt: [40, 3, 6] },
    { pos: [11, 1, 12], lookAt: [-60, 30, -240] },
  ]
  for (const s of stops) {
    await pose(s)
    await sleep(1500)
  }
}
