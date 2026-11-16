import type { Settings } from '../store'

// User's screenshot: distance 12, yaw/tilt 0, pivot (1.05, -1.45, -5.30).
// Do not change defaultSettings: note trajectory/parallax use those defaults
// as their reference geometry, independently of the actual viewing camera.
export const FIXED_CAMERA = {
  cameraPos: [1.05, -1.45, 6.7] as [number, number, number],
  cameraLookAt: [1.05, -1.45, -5.3] as [number, number, number],
}
export type View = Pick<Settings, 'cameraPos' | 'cameraLookAt' | 'cameraFov' | 'keyboardY'>
export const FIXED_FALL_SECONDS = 1.3

export function lockViewSettings(settings: Settings, view: View): Settings {
  const same = (value: Partial<Settings>) =>
    value.fallDurationSec === FIXED_FALL_SECONDS &&
    value.cameraFov === view.cameraFov && value.keyboardY === view.keyboardY &&
    value.cameraPos?.every((n, i) => n === view.cameraPos[i]) &&
    value.cameraLookAt?.every((n, i) => n === view.cameraLookAt[i])
  if (same(settings) && settings.settingsKeyframes.every(pin => same(pin.settings))) return settings
  const fixed = { ...view, fallDurationSec: FIXED_FALL_SECONDS }
  return { ...settings, ...fixed, settingsKeyframes: settings.settingsKeyframes.map(pin =>
    same(pin.settings) ? pin : { ...pin, settings: { ...pin.settings, ...fixed } }) }
}

