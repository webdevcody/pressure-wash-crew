/**
 * Control help shown on the menu and in the HUD hint. Each feature owns a
 * file in src/controls/<nn>-<feature>.ts that default-exports a ControlHelp,
 * read in file-name order, so adding a key doesn't mean editing the menu.
 */
export interface KeyHelp {
  /** Keys shown as <kbd>, joined with "/" (e.g. ['Q', 'E']). */
  keys: string[]
  action: string
}

export interface ControlHelp {
  /** Menu lines; the entries on one line are joined with " · ". */
  menu?: KeyHelp[][]
  /** Short phrases for the in-game hint bar. */
  hud?: string[]
  /** A gameplay tip shown under the menu's key list. */
  tip?: string
}

const files = import.meta.glob<{ default: ControlHelp }>('../controls/*.ts', { eager: true })
const all = Object.keys(files)
  .sort()
  .map((k) => files[k].default)

export const menuLines: KeyHelp[][] = all.flatMap((c) => c.menu ?? [])
export const hudHint: string = all.flatMap((c) => c.hud ?? []).join(' · ')
export const menuTips: string[] = all.flatMap((c) => (c.tip ? [c.tip] : []))
