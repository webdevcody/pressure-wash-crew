import type { ComponentType } from 'react'

/**
 * Self-contained scene features (effects, audio, backdrops) mount here
 * instead of being imported into App.tsx: add src/scene/<nn>-<feature>.tsx
 * that default-exports a component. Mounted inside the Canvas, after the
 * level, player and washer, in file-name order.
 */
const files = import.meta.glob<{ default: ComponentType }>('./[0-9]*.tsx', { eager: true })
const features = Object.keys(files)
  .sort()
  .map((k) => ({ key: k, Feature: files[k].default }))

export function SceneFeatures() {
  return (
    <>
      {features.map(({ key, Feature }) => (
        <Feature key={key} />
      ))}
    </>
  )
}
