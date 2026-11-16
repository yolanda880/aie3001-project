/** Same geometry for rendering, key fill and rhythm judgement. */
export function visualTiming(
  start: number, tail: number, minLength: number, fallSeconds: number, fallDistance: number,
): { start: number; tail: number; disappear: number } {
  return {
    start, tail,
    disappear: start + Math.max(tail - start, Math.max(0.01, minLength) * fallSeconds / fallDistance),
  }
}
