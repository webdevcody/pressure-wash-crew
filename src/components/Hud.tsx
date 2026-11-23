import { formatTime, useGame } from '../game/store'

export function Hud() {
  const elapsed = useGame((s) => s.elapsed)
  const remaining = useGame((s) => s.remaining)
  const surfaces = useGame((s) => s.surfaces)
  const bestTime = useGame((s) => s.bestTime)
  const spraying = useGame((s) => s.spraying)
  const pct = Math.max(0, remaining * 100)

  return (
    <div className="hud">
      <div className={`crosshair ${spraying ? 'spraying' : ''}`} />

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

      <div className="hud-hint">Hold left mouse to spray · WASD to move · Shift to run · Esc to pause</div>
    </div>
  )
}
