/**
 * Swappable pressure-washer tips, modeled on the real color-coded set:
 * the smaller the angle, the harder (and narrower) the hit.
 *
 * - `pressure` (0..1) is compared against a stain's hardness; a tip weaker
 *   than the stain barely scratches it (see `cleaningPower` in stains.ts).
 * - `rate` is how fast one texel loses dirt (dirt units/sec) inside the
 *   spray footprint at full pressure. Wide tips clean a lot of area at a
 *   time, so their per-texel rate can stay modest.
 * - `spread` is the angle that sets the footprint: the cone radius for
 *   `point`/`cone`, the half-length of the line for `fan` (as a tangent).
 */
export type SprayShape = 'point' | 'cone' | 'fan'

export interface NozzleDef {
  id: string
  /** Short label shown on the tip chip, e.g. "0°". */
  label: string
  name: string
  /** Real-world tip color. */
  color: string
  shape: SprayShape
  spread: number
  /** Brush radius in meters right at the nozzle... */
  brush: number
  /** ...plus this much per meter of distance. */
  brushGrow: number
  pressure: number
  rate: number
  /** Soap tips lay down detergent instead of blasting dirt. */
  soap?: boolean
  /** Max distance the spray reaches. */
  reach: number
  /** Full pressure up to this distance, then it fades toward `reach`. */
  falloffStart: number
  /** One-line HUD description. */
  blurb: string
}

export const NOZZLES: NozzleDef[] = [
  {
    id: 'pinpoint',
    label: '0°',
    name: 'Pinpoint',
    color: '#e53935',
    shape: 'point',
    spread: 0.004,
    brush: 0.05,
    brushGrow: 0.006,
    pressure: 1,
    rate: 10,
    reach: 12,
    falloffStart: 4,
    blurb: 'Blasts stuck-on spots, but only a tiny dot',
  },
  {
    id: 'line15',
    label: '15°',
    name: 'Line',
    color: '#fdd835',
    shape: 'fan',
    spread: 0.13,
    brush: 0.05,
    brushGrow: 0.01,
    pressure: 0.75,
    rate: 5,
    reach: 9,
    falloffStart: 3,
    blurb: 'Strips streaks in one pass. R turns the line',
  },
  {
    id: 'cone25',
    label: '25°',
    name: 'Cone',
    color: '#43a047',
    shape: 'cone',
    spread: 0.1,
    brush: 0.12,
    brushGrow: 0.02,
    pressure: 0.45,
    rate: 1.6,
    reach: 8,
    falloffStart: 2.5,
    blurb: 'All-rounder for everyday grime',
  },
  {
    id: 'wide40',
    label: '40°',
    name: 'Wide fan',
    color: '#f5f5f5',
    shape: 'fan',
    spread: 0.36,
    brush: 0.12,
    brushGrow: 0.02,
    pressure: 0.3,
    rate: 3.2,
    reach: 5,
    falloffStart: 1.5,
    blurb: 'Fastest on light grime and mildew, up close',
  },
  {
    id: 'soap',
    label: 'SOAP',
    name: 'Soap',
    color: '#212121',
    shape: 'cone',
    spread: 0.22,
    brush: 0.15,
    brushGrow: 0.03,
    pressure: 0,
    rate: 3,
    soap: true,
    reach: 5,
    falloffStart: 2,
    blurb: 'Loosens oil and mildew. Rinse with any tip after',
  },
]

export const DEFAULT_NOZZLE = NOZZLES.findIndex((n) => n.id === 'cone25')

/** Cleaning-pressure multiplier at a distance (1 up close, fades to 0.25 at max reach). */
export function pressureFalloff(n: NozzleDef, distance: number): number {
  if (distance <= n.falloffStart) return 1
  const t = (distance - n.falloffStart) / (n.reach - n.falloffStart)
  return Math.max(0.25, 1 - 0.75 * t)
}
