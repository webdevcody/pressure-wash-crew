import type { ControlHelp } from '../game/controlsHelp'

export default {
  menu: [[{ keys: ['Q', 'E'], action: 'switch nozzle' }], [{ keys: ['R'], action: 'turn fan nozzles' }]],
  hud: ['Q/E switch nozzle'],
  tip: 'Tough spots need the 0° tip, streaks the 15° line, oil needs soap first.',
} satisfies ControlHelp
