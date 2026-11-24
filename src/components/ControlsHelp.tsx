import './ControlsHelp.css'
import { Fragment } from 'react'
import { hudHint, menuLines, menuTips } from '../game/controlsHelp'

/** The menu's key list and tips, built from src/controls/. */
export function MenuControls() {
  return (
    <>
      <div className="controls">
        {menuLines.map((line, i) => (
          <div key={i}>
            {line.map((k, j) => (
              <Fragment key={j}>
                {j > 0 && ' · '}
                {k.keys.map((key, n) => (
                  <Fragment key={key}>
                    {n > 0 && '/'}
                    <kbd>{key}</kbd>
                  </Fragment>
                ))}{' '}
                {k.action}
              </Fragment>
            ))}
          </div>
        ))}
      </div>
      {menuTips.map((t) => (
        <p key={t} className="tip-line">
          {t}
        </p>
      ))}
    </>
  )
}

export function HudHint() {
  return <div className="hud-hint">{hudHint}</div>
}
