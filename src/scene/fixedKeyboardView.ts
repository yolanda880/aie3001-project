import { useStore } from '../store'
import { resolveSettingsAt } from '../midi/settingsKeyframes'
import { audioEngine } from '../audio/engine'

import { FIXED_CAMERA, lockViewSettings, type View } from './fixedViewConfig'
const STORAGE_KEY = 'notefall.lockedKeyboardView.v1'

/** Keep the framing across project imports, reset, undo and animated settings. */
export function installKeyboardViewLock(): () => void {
  const base = useStore.getState().settings
  const current = resolveSettingsAt(base, base.settingsKeyframes, audioEngine.currentSongTime())
  let cameraFov = current.cameraFov
  let keyboardY = current.keyboardY
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (saved && Number.isFinite(saved.cameraFov) && saved.cameraFov > 0 && saved.cameraFov < 180 &&
        Number.isFinite(saved.keyboardY)) {
      cameraFov = saved.cameraFov
      keyboardY = saved.keyboardY
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ cameraFov, keyboardY }))
  } catch { /* Keep the active settings if storage is unavailable. */ }
  const view: View = { ...FIXED_CAMERA, cameraFov, keyboardY }
  const enforce = () => {
    const settings = useStore.getState().settings
    const locked = lockViewSettings(settings, view)
    if (locked !== settings) useStore.setState({ settings: locked })
  }
  enforce()
  return useStore.subscribe(enforce)
}
