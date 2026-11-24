import { formatTime, useGame } from '../game/store'
import { MenuControls } from './ControlsHelp'
import { SoundControl } from './SoundControl'

function lockPointer() {
  const canvas = document.querySelector('canvas')
  // requestPointerLock can reject (e.g. headless or user gesture rules); the
  // game still runs, mouse look just won't work until the player clicks.
  try {
    const r = canvas?.requestPointerLock() as unknown
    if (r instanceof Promise) r.catch(() => {})
  } catch {
    /* ignore */
  }
}

export function MenuScreen() {
  const bestTime = useGame((s) => s.bestTime)
  const startRun = useGame((s) => s.startRun)
  return (
    <div className="screen">
      <div className="panel">
        <h1>Pressure Wash Crew</h1>
        <p className="sub">Level 1 · The Backyard</p>
        <p>Blast every dirty surface clean as fast as you can.</p>
        <MenuControls />
        <SoundControl />
        {bestTime != null && <p className="best">Fastest time: {formatTime(bestTime)}</p>}
        <button
          id="start-button"
          onClick={() => {
            startRun()
            lockPointer()
          }}
        >
          Start washing
        </button>
      </div>
    </div>
  )
}

export function PauseScreen() {
  return (
    <div className="screen clickable" onClick={lockPointer}>
      <div className="panel">
        <h2>Paused</h2>
        <p>Click to keep washing</p>
        <SoundControl />
      </div>
    </div>
  )
}

export function ScoreScreen() {
  const lastTime = useGame((s) => s.lastTime)
  const bestTime = useGame((s) => s.bestTime)
  const newRecord = useGame((s) => s.newRecord)
  const startRun = useGame((s) => s.startRun)
  const backToMenu = useGame((s) => s.backToMenu)
  return (
    <div className="screen">
      <div className="panel">
        <h2>Squeaky clean!</h2>
        {newRecord && <div className="record">New fastest time!</div>}
        <div className="score-row">
          <span>Your time</span>
          <strong>{lastTime != null ? formatTime(lastTime) : '-'}</strong>
        </div>
        <div className="score-row">
          <span>Fastest time</span>
          <strong>{bestTime != null ? formatTime(bestTime) : '-'}</strong>
        </div>
        <div className="buttons">
          <button
            onClick={() => {
              startRun()
              lockPointer()
            }}
          >
            Play again
          </button>
          <button className="secondary" onClick={backToMenu}>
            Menu
          </button>
        </div>
      </div>
    </div>
  )
}
