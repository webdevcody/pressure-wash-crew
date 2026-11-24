import type { ControlHelp } from '../game/controlsHelp'

export default {
  menu: [
    [{ keys: ['WASD'], action: 'move' }],
    [{ keys: ['Mouse'], action: 'look' }],
    [{ keys: ['Left click'], action: 'spray' }],
    [
      { keys: ['Shift'], action: 'run' },
      { keys: ['Space'], action: 'jump' },
    ],
  ],
  hud: ['Hold left mouse to spray', 'WASD to move', 'Shift to run', 'Esc to pause'],
} satisfies ControlHelp
