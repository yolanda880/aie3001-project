/** All thresholds are real playback seconds (pauses excluded). */
export const TIMING_FEEDBACK = {
  perfectSeconds: 0.032,
  greatSeconds: 0.08,
  goodSeconds: 0.2,
  colors: { perfect: '#30d26b', great: '#2989ff', good: '#ffd43b', miss: '#ff4949' },
} as const

export type Judgement = keyof typeof TIMING_FEEDBACK.colors
export type NoteWindow = { id: number; midi: number; start: number }
const EPSILON = 1e-7

export function classifyTiming(deltaSeconds: number): Judgement {
  const delta = Math.abs(deltaSeconds)
  if (delta <= TIMING_FEEDBACK.perfectSeconds + EPSILON) return 'perfect'
  if (delta <= TIMING_FEEDBACK.greatSeconds + EPSILON) return 'great'
  if (delta <= TIMING_FEEDBACK.goodSeconds + EPSILON) return 'good'
  return 'miss'
}

/** One press consumes one occurrence, never all future repeats of that pitch. */
export class RhythmJudge {
  private consumed = new Set<number>()
  private ignoreBefore = -Infinity

  reset(startTime = -Infinity) {
    this.consumed.clear()
    this.ignoreBefore = startTime
  }

  /** Finalize each unplayed target once, strictly after the inclusive Good window. */
  expire(
    time: number, windows: readonly NoteWindow[],
    elapsed: (from: number, to: number) => number = (from, to) => to - from,
  ): NoteWindow[] {
    const missed: NoteWindow[] = []
    const groups = new Set<string>()
    for (const note of windows) {
      if (note.start < this.ignoreBefore - EPSILON || this.consumed.has(note.id) || time < note.start) continue
      if (elapsed(note.start, time) <= TIMING_FEEDBACK.goodSeconds + EPSILON) continue
      this.consumed.add(note.id)
      // Duplicate tracks playing the same pitch together are one target.
      const key = `${note.midi}:${note.start}`
      if (!groups.has(key)) { groups.add(key); missed.push(note) }
    }
    return missed
  }

  judge(
    midi: number, time: number, windows: readonly NoteWindow[],
    elapsed: (from: number, to: number) => number = (from, to) => to - from,
  ): Judgement {
    let selected: { note: NoteWindow; delta: number } | undefined
    for (const note of windows) {
      if (note.start < this.ignoreBefore - EPSILON || note.midi !== midi || this.consumed.has(note.id)) continue
      const delta = time >= note.start ? elapsed(note.start, time) : -elapsed(time, note.start)
      if (!selected || Math.abs(delta) < Math.abs(selected.delta) ||
          (Math.abs(delta) === Math.abs(selected.delta) && note.start < selected.note.start)) {
        selected = { note, delta }
      }
    }
    // Wrong pitch / repeated presses are misses too. Far-early presses must
    // not consume a future target: the player can still hit it on time.
    if (!selected) return 'miss'
    const result = classifyTiming(selected.delta)
    if (result !== 'miss' || selected.delta >= 0) {
      for (const note of windows) {
        // Consume simultaneous duplicates, but leave older unplayed repeats
        // for expire() to count as misses when their own window closes.
        if (note.midi === midi && note.start === selected.note.start) this.consumed.add(note.id)
      }
    }
    return result
  }
}

/** Integrate timeline intervals across changes of the transport speed. */
export function elapsedPlaybackSeconds(
  from: number, to: number, rates: readonly { at: number; rate: number }[],
): number {
  if (to <= from) return 0
  let seconds = 0
  for (let i = 0; i < rates.length; i++) {
    const start = Math.max(from, rates[i].at)
    const end = Math.min(to, rates[i + 1]?.at ?? Infinity)
    if (end > start) seconds += (end - start) / rates[i].rate
  }
  return seconds
}
