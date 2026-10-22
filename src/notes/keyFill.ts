import type { NoteEvent } from '../midi/types'
import type { Settings } from '../store'
import { midiToTimeline, type SpeedMap } from '../midi/speedMap'
import { KEY_COUNT, MIDI_MIN } from '../keyboard/layout'

export type KeyFill = { progress: number; track: number | undefined }

type FillSettings = Pick<Settings,
  'notesEnabled' | 'fallDurationSec' | 'midiOffsetSec' | 'transpose' |
  'midiTrimStartSec' | 'midiTrimEndSec'>

/** Update a reusable per-key buffer from the same audio timeline as playback. */
export function updateKeyFills(
  notes: readonly NoteEvent[], time: number, settings: FillSettings,
  speedMap: SpeedMap, fills: KeyFill[],
): void {
  for (const fill of fills) { fill.progress = 0; fill.track = undefined }
  if (!settings.notesEnabled) return
  const lead = Math.max(0.001, settings.fallDurationSec)
  const trimEnd = settings.midiTrimEndSec ?? Infinity
  for (const note of notes) {
    if (note.time < settings.midiTrimStartSec || note.time >= trimEnd) continue
    const index = note.midi + settings.transpose - MIDI_MIN
    if (index < 0 || index >= KEY_COUNT) continue
    const fire = settings.midiOffsetSec + midiToTimeline(speedMap, note.time)
    if (fire - time >= lead) continue
    const end = settings.midiOffsetSec + midiToTimeline(
      speedMap, Math.min(note.time + note.duration, trimEnd),
    )
    if (time >= end || end <= fire) continue
    const fill = fills[index]
    // The earliest unfinished note owns the key; later repeats cannot fill it early.
    if (fill.progress > 0) continue
    fill.progress = Math.min(1, Math.max(0, 1 - (fire - time) / lead))
    fill.track = note.track
  }
}
