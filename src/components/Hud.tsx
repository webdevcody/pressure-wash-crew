import { formatTime, useGame } from '../game/store'
import { AimHint, Crosshair, NozzlePicker } from './NozzleHud'
import { HudHint } from './ControlsHelp'

export function Hud() {
  const elapsed = useGame((s) => s.elapsed)
  const remaining = useGame((s) => s.remaining)
  const surfaces = useGame((s) => s.surfaces)
  const bestTime = useGame((s) => s.bestTime)
  const pct = Math.max(0, remaining * 100)

  return (
    <div className="hud">
      <Crosshair />
      <AimHint />

      <div className="hud-top">
        <div className="hud-label">Dirt remaining</div>
        <div className="hud-remaining">{pct.toFixed(1)}%</div>
        <div className="bar">
          <div className="bar-fill" style={{ width: `${100 - pct}%` }} />
        </div>
      </div>

      <div className="hud-timer">
        <div className="hud-time">{formatTime(elapsed)}</div>
        {bestTime != null && <div className="hud-best">Best {formatTime(bestTime)}</div>}
      </div>

      <ul className="hud-surfaces">
        {surfaces.map((s) => {
          const done = 1 - s.cleanFraction <= 0.01
          return (
            <li key={s.id} className={done ? 'done' : ''}>
              <span>{done ? '✓' : '•'}</span> {s.name}
              <span className="surf-pct">{Math.round(s.cleanFraction * 100)}%</span>
            </li>
          )
        })}
      </ul>

      <NozzlePicker />

      <HudHint />
    </div>
  )
}
