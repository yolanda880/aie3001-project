import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const temp = mkdtempSync(join(tmpdir(), 'notefall-fill-test-'))
try {
  const outfile = join(temp, 'helpers.mjs')
  buildSync({
    stdin: { contents: `
      export * from './src/notes/keyFill';
      export * from './src/keyboard/layout';
      export * from './src/midi/speedMap';
      export * from './src/keyboard/keyFillShader';
      export { MeshStandardMaterial, ShaderLib } from 'three';
    `, resolveDir: root }, bundle: true, platform: 'node', format: 'esm', outfile,
  })
  const m = await import(pathToFileURL(outfile).href)
  const settings = { notesEnabled: true, fallDurationSec: 2, midiOffsetSec: 0,
    transpose: 0, midiTrimStartSec: 0, midiTrimEndSec: null }
  const fills = Array.from({ length: m.KEY_COUNT }, () => ({ progress: 0, track: undefined }))
  const note = { id: 1, midi: 60, time: 4, duration: 1, velocity: 1, track: 2 }
  const run = (time, notes = [note], changes = {}, map = m.EMPTY_SPEED_MAP) => {
    m.updateKeyFills(notes, time, { ...settings, ...changes }, map, fills)
    return fills[60 - m.MIDI_MIN].progress
  }
  assert.equal(run(1), 0)
  assert.equal(run(2), 0)
  assert.equal(run(3), 0.5)
  assert.ok(run(3.999) < 1)
  assert.equal(run(4), 1)
  assert.equal(fills[60 - m.MIDI_MIN].track, 2)
  assert.equal(run(4.9), 1)
  assert.equal(run(5), 0)
  assert.equal(run(3), 0.5, 'backward seek recomputes the fill')
  assert.equal(run(3), 0.5, 'paused time keeps the fill unchanged')
  assert.equal(run(5, [note], { midiOffsetSec: 1 }), 1)
  const speed = m.buildSpeedMap([{ time: 0, value: 2 }])
  assert.equal(run(2, [note], {}, speed), 1, 'fill ends at the speed-mapped onset')
  assert.equal(run(4, [note], { notesEnabled: false }), 0)
  assert.equal(run(4, [note], { midiTrimStartSec: 4.1 }), 0)
  assert.equal(run(4, [note], { midiTrimEndSec: 4 }), 0)
  assert.equal(run(4.5, [note], { midiTrimEndSec: 4.5 }), 0)
  assert.equal(run(4, [note], { transpose: 1 }), 0)
  assert.equal(fills[61 - m.MIDI_MIN].progress, 1, 'black keys fill too')
  assert.equal(run(4, [note], { transpose: 100 }), 0)
  assert.equal(run(4, [{ ...note, duration: 0 }]), 0)
  const repeated = [note, { ...note, id: 2, time: 6 }]
  assert.equal(run(4.5, repeated), 1)
  assert.equal(run(5, repeated), 0.5)
  assert.equal(run(6, repeated), 1)
  run(3, [note, { ...note, id: 2, midi: 64 }])
  assert.equal(fills[64 - m.MIDI_MIN].progress, 0.5, 'chords fill together')
  for (const key of m.KEYBOARD_LAYOUT.keys) {
    const distance = (y) => 0.5 - y / key.length
    assert.equal(distance(key.length / 2), 0)
    assert.equal(distance(-key.length / 2), 1)
  }
  const material = new m.MeshStandardMaterial()
  let priorPatchRan = false
  material.onBeforeCompile = () => { priorPatchRan = true }
  m.patchKeyFillMaterial(material, m.createKeyFillUniforms(1.475))
  const shader = { uniforms: {}, vertexShader: m.ShaderLib.standard.vertexShader,
    fragmentShader: m.ShaderLib.standard.fragmentShader }
  material.onBeforeCompile(shader, {})
  assert.ok(priorPatchRan, 'existing shadow patch is preserved')
  assert.ok(shader.vertexShader.includes('vKeyFillDistance ='))
  assert.ok(shader.fragmentShader.includes('vKeyFillDistance <= uKeyFill'))
  assert.ok(shader.uniforms.uKeyFill)
  material.dispose()
  console.log('PASS: fill timing, hold/release, pause/seek, speed, offset, trim, transpose, repeats, chords, key geometry and shader composition.')
} finally {
  rmSync(temp, { recursive: true, force: true })
}
