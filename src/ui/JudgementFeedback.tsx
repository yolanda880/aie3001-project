import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'
import { useJudgementFeedback } from '../midi/judgementFeedback'
import { TIMING_FEEDBACK } from '../midi/timingFeedback'
import { getR3FState } from '../scene/exportBridge'
import { getResolvedSettings } from '../scene/automatedSettings'
import { noteHitYWorld } from '../keyboard/layout'
import { NOTE_PLANE_Z } from '../notes/positions'
import { useStore } from '../store'

const LABELS = { perfect: 'Perfect', great: 'Great', good: 'Good', miss: 'Miss' }

/** Center the feedback just above the projected keyboard edge, including fullscreen. */
export function JudgementFeedback() {
  const event = useJudgementFeedback(s => s.event)
  const song = useStore(s => s.song)
  const transport = useStore(s => s.transport)
  const anchor = useRef<HTMLDivElement>(null)

  useEffect(() => { useJudgementFeedback.getState().clear() }, [song, transport])
  useEffect(() => {
    if (!event) return
    let frame = 0
    const point = new Vector3()
    const position = () => {
      const state = getR3FState()
      if (state && anchor.current) {
        const s = getResolvedSettings()
        point.set(s.cameraLookAt[0], noteHitYWorld(s.keyboardY), NOTE_PLANE_Z).project(state.camera)
        const edgeY = (1 - point.y) * state.size.height / 2
        anchor.current.style.top = `${Math.max(48, edgeY - 14)}px`
      }
      frame = requestAnimationFrame(position)
    }
    position()
    const timer = window.setTimeout(() => {
      if (useJudgementFeedback.getState().event?.id === event.id) useJudgementFeedback.getState().clear()
    }, 850)
    return () => { cancelAnimationFrame(frame); window.clearTimeout(timer) }
  }, [event])

  return (
    <div ref={anchor} className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 -translate-y-full"
      style={{ top: '20%' }} role="status" aria-live="polite" aria-atomic="true" data-testid="judgement-feedback">
      {event && <div key={event.id} className="rhythm-judgement" style={{ color: TIMING_FEEDBACK.colors[event.judgement] }}>
        {LABELS[event.judgement]}
      </div>}
    </div>
  )
}
