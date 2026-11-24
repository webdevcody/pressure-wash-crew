import { NOZZLES } from '../game/nozzles'
import { STAINS, STAIN_GRIME, STAIN_MILDEW, cleaningPower } from '../game/stains'
import { useGame } from '../game/store'

/** Crosshair shaped like the current nozzle's spray. */
export function Crosshair() {
  const spraying = useGame((s) => s.spraying)
  const nozzle = NOZZLES[useGame((s) => s.nozzle)]
  const vertical = useGame((s) => s.fanVertical)
  const shape = nozzle.soap ? 'soap' : nozzle.shape === 'fan' ? `fan ${vertical ? 'vertical' : ''}` : nozzle.shape
  return <div className={`crosshair ${shape} ${nozzle.id} ${spraying ? 'spraying' : ''}`} />
}

/** Row of tips at the bottom of the screen, with the active one lit. */
export function NozzlePicker() {
  const current = useGame((s) => s.nozzle)
  const vertical = useGame((s) => s.fanVertical)
  const n = NOZZLES[current]
  return (
    <div className="nozzle-picker">
      <div className="nozzle-row">
        <kbd>Q</kbd>
        {NOZZLES.map((t, i) => (
          <div key={t.id} className={`nozzle-chip ${i === current ? 'active' : ''}`}>
            <span className="tip" style={{ background: t.color }} />
            <span className="nozzle-label">{t.label}</span>
            <span className="nozzle-name">{t.name}</span>
          </div>
        ))}
        <kbd>E</kbd>
      </div>
      <div className="nozzle-blurb">
        {n.blurb}
        {n.shape === 'fan' && (
          <span className="fan-dir">
            {' '}
            · <kbd>R</kbd> line is {vertical ? 'vertical' : 'horizontal'}
          </span>
        )}
      </div>
    </div>
  )
}

/** Names the stain under the crosshair and says when the tip is wrong for it. */
export function AimHint() {
  const aim = useGame((s) => s.aim)
  const nozzleIndex = useGame((s) => s.nozzle)
  if (aim.stain < 0) return null
  const stain = STAINS[aim.stain]
  const n = NOZZLES[nozzleIndex]
  const soapHelps = stain.soapedHardness < stain.hardness
  const hardness = stain.hardness + (stain.soapedHardness - stain.hardness) * aim.soap

  let text: string = stain.name
  let tone = ''
  if (aim.outOfRange) {
    text = `${stain.name} · out of range for ${n.label}, move closer`
    tone = 'warn'
  } else if (n.soap) {
    if (!soapHelps) {
      text = `${stain.name} · soap won't loosen this`
      tone = 'warn'
    } else if (aim.soap >= 0.8) {
      text = `${stain.name} · soaped! Switch tips and rinse`
      tone = 'good'
    } else {
      text = `${stain.name} · soaping…`
    }
  } else if (cleaningPower(n.pressure, hardness) < 0.5) {
    tone = 'warn'
    if (soapHelps && aim.soap < 0.8 && cleaningPower(n.pressure, stain.soapedHardness) >= 0.5) {
      text = `${stain.name} · too greasy, soap it first`
    } else {
      // Gentlest tip that can still handle it.
      const fit = NOZZLES.filter((t) => !t.soap && t.pressure >= hardness).sort((a, b) => a.pressure - b.pressure)[0]
      text = fit
        ? `${stain.name} · too tough for ${n.label}, try ${fit.label} ${fit.name}`
        : `${stain.name} · too tough, soap it first`
    }
  } else if ((aim.stain === STAIN_GRIME || aim.stain === STAIN_MILDEW) && n.pressure >= 0.75) {
    text = `${stain.name} · a wider tip cleans this faster`
  } else {
    tone = 'good'
  }

  return <div className={`aim-hint ${tone}`}>{text}</div>
}
