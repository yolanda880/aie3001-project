import { audioEngine } from '../audio/engine'
import { useStore } from '../store'
import { getResolvedSettings } from '../scene/automatedSettings'
import { RhythmJudge, type Judgement, type NoteWindow } from './timingFeedback'
import { useJudgementFeedback } from './judgementFeedback'

/** Shared by MIDI, mouse/touch and PC keyboard through triggerKey(). */
export function installLiveJudgement(): () => void {
  const judge = new RhythmJudge()
  let revision = -1
  let songReference: unknown
  let configuration = ''
  let speedMapReference: unknown
  let windows: NoteWindow[] = []
  const elapsed = (from: number, to: number) => audioEngine.elapsedPlaybackSeconds(from, to)
  // Share the same targets / consumed set between live input and automatic misses.
  const synchronize = (): boolean => {
    const state = useStore.getState()
    const settings = getResolvedSettings()
    const nextConfiguration = [settings.transpose, settings.midiOffsetSec,
      settings.midiTrimStartSec, settings.midiTrimEndSec].join(':')
    const nextRevision = audioEngine.getJudgementRevision()
    const map = audioEngine.getSpeedMap()
    if (revision !== nextRevision || songReference !== state.song ||
        configuration !== nextConfiguration || speedMapReference !== map) {
      const start = revision !== nextRevision
        ? audioEngine.getJudgementStartTime() : audioEngine.currentSongTime()
      judge.reset(start)
      useJudgementFeedback.getState().clear()
      revision = nextRevision
      songReference = state.song
      configuration = nextConfiguration
      speedMapReference = map
      windows = []
      if (state.song) {
        const trimEnd = settings.midiTrimEndSec ?? state.song.duration
        for (const note of state.song.notes) {
          if (note.time < settings.midiTrimStartSec || note.time >= trimEnd) continue
          windows.push({ id: note.id, midi: note.midi + settings.transpose,
            start: audioEngine.midiTimeToTimeline(note.time) })
        }
      }
    }
    return !!state.song && audioEngine.isPlaying() && settings.notesEnabled && settings.fallDirection === 'down'
  }
  const expire = () => {
    const missed = judge.expire(audioEngine.currentSongTime(), windows, elapsed)
    for (const _note of missed) useJudgementFeedback.getState().show('miss')
  }
  const evaluate = (midi: number): Judgement | undefined => {
    if (!synchronize()) return undefined
    expire()
    const result = judge.judge(midi, audioEngine.currentSongTime(), windows, elapsed)
    useJudgementFeedback.getState().show(result)
    return result
  }
  audioEngine.setLiveJudge(evaluate)
  let frame = 0
  const tick = () => {
    if (synchronize()) expire()
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
  return () => {
    cancelAnimationFrame(frame)
    audioEngine.setLiveJudge(null)
  }
}
