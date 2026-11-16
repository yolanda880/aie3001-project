import { useEffect } from 'react'
import sampleUrl from '../demos/notefall-20261116-171041.nfz?url'
import { unpack } from '../projects/io'
import { parseMidi } from './parse'
import { useStore } from '../store'
import { audioEngine } from '../audio/engine'
import { showAlert } from '../ui/confirm'

/** Load only the bundled MIDI; demo visual presets must not replace the user's view. */
export function useSampleSong() {
  useEffect(() => {
    if (useStore.getState().song) return
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch(sampleUrl, { signal: controller.signal })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const project = await unpack(await response.arrayBuffer())
        if (!project.songMidi) throw new Error('Sample 中没有 MIDI')
        const song = await parseMidi(project.songMidi, project.name)
        // A manual import during the fetch takes precedence.
        if (controller.signal.aborted || useStore.getState().song) return
        const state = useStore.getState()
        state.setSong(song, { resetTimeline: true })
        state.setProjectName(project.name)
        audioEngine.loadSong(song)
        state.setTransport('stopped')
        state.markClean()
      } catch (error) {
        if (!controller.signal.aborted) void showAlert({ title: 'Sample 加载失败', message: String(error), tone: 'error' })
      }
    })()
    return () => controller.abort()
  }, [])
}
