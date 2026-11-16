import { create } from 'zustand'
import type { Judgement } from './timingFeedback'

let sequence = 0
/** Ephemeral display state, never saved into projects. */
export const useJudgementFeedback = create<{
  event: { id: number; judgement: Judgement } | null
  show: (judgement: Judgement) => void
  clear: () => void
}>((set) => ({
  event: null,
  show: (judgement) => set({ event: { id: ++sequence, judgement } }),
  clear: () => set({ event: null }),
}))
