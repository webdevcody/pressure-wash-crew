import './SoundControl.css'
import { useAudioSettings } from '../audio/engine'

/** Sound volume slider + mute toggle, shown on the menu and pause screens. */
export function SoundControl() {
  const volume = useAudioSettings((s) => s.volume)
  const muted = useAudioSettings((s) => s.muted)
  const setVolume = useAudioSettings((s) => s.setVolume)
  const toggleMute = useAudioSettings((s) => s.toggleMute)
  const off = muted || volume === 0
  return (
    // Stop clicks here from reaching the pause screen's click-to-resume.
    <div className="sound-control" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="sound-toggle"
        aria-label={off ? 'Unmute' : 'Mute'}
        title="Mute (M)"
        onClick={toggleMute}
      >
        {off ? '🔇' : volume < 0.4 ? '🔈' : '🔊'}
      </button>
      <label>
        Sound
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
      </label>
    </div>
  )
}
