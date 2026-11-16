const { test } = require('node:test')
const assert = require('node:assert/strict')
const { buildSync } = require('esbuild')
const Module = require('node:module')
const path = require('node:path')
function loadTS(entry) {
  const output = buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', write: false })
  const filename = path.resolve(entry + '.cjs')
  const mod = new Module(filename, module)
  mod.paths = module.paths
  mod._compile(output.outputFiles[0].text, filename)
  return mod.exports
}
const { classifyTiming, RhythmJudge, elapsedPlaybackSeconds, TIMING_FEEDBACK } = loadTS('src/midi/timingFeedback.ts')
const { visualTiming } = loadTS('src/notes/visualTiming.ts')
const { FIXED_CAMERA, lockViewSettings } = loadTS('src/scene/fixedViewConfig.ts')

test('symmetric inclusive 32/80/200 ms thresholds, no ignored early presses', () => {
  for (const sign of [-1, 1]) {
    for (const [delta, expected] of [[0,'perfect'],[.032,'perfect'],[.032001,'great'],
      [.08,'great'],[.080001,'good'],[.2,'good'],[.200001,'miss'],[10,'miss']]) {
      assert.equal(classifyTiming(sign*delta), expected)
    }
  }
  assert.deepEqual(TIMING_FEEDBACK.colors, {perfect:'#30d26b',great:'#2989ff',good:'#ffd43b',miss:'#ff4949'})
})
test('judgement no longer depends on note duration or visual disappearance', () => {
  const short = visualTiming(2, 2.01, .01, 1.3, 3)
  assert.ok(short.disappear < 2.032)
  const note = {id:1,midi:60,start:2}
  assert.equal(new RhythmJudge().judge(60, 2.032, [note]), 'perfect')
  assert.equal(new RhythmJudge().judge(60, 2.2, [note]), 'good')
  assert.equal(new RhythmJudge().judge(60, 2.201, [note]), 'miss')
})
test('far early and wrong-pitch misses preserve future target; duplicate presses cannot score twice', () => {
  const judge = new RhythmJudge()
  const notes = [{id:1,midi:60,start:2}]
  assert.equal(judge.judge(60,1,notes),'miss')
  assert.equal(judge.judge(61,2,notes),'miss')
  assert.equal(judge.judge(60,2.02,notes),'perfect')
  assert.equal(judge.judge(60,2.025,notes),'miss')
})
test('match nearest repeat, retire old notes, reset on replay', () => {
  const judge = new RhythmJudge()
  const notes = [{id:1,midi:60,start:1},{id:2,midi:60,start:3}]
  assert.equal(judge.judge(60,3.02,notes),'perfect')
  assert.equal(judge.judge(60,3.03,notes),'miss')
  judge.reset()
  assert.equal(judge.judge(60,1.3,notes),'miss')
  assert.equal(judge.judge(60,2.9,notes),'good')
})
test('chords are independent and simultaneous duplicate tracks count once', () => {
  const judge = new RhythmJudge()
  const notes = [{id:1,midi:60,start:2},{id:2,midi:64,start:2},{id:3,midi:60,start:2}]
  assert.equal(judge.judge(60,2.02,notes),'perfect')
  assert.equal(judge.judge(64,2.06,notes),'great')
  assert.equal(judge.judge(60,2.07,notes),'miss')
})
test('thresholds remain wall seconds at 0.5x / 2x and across speed changes', () => {
  const notes = [{id:1,midi:60,start:1}]
  for (const rate of [.5,2]) {
    const elapsed = (from,to) => elapsedPlaybackSeconds(from,to,[{at:-Infinity,rate}])
    for(const [delta,result] of [[.032,'perfect'],[.08,'great'],[.2,'good'],[.201,'miss']]) {
      for(const sign of [-1,1]) assert.equal(new RhythmJudge().judge(60,1+sign*delta*rate,notes,elapsed),result)
    }
  }
  const rates = [{at:-Infinity,rate:1},{at:1.02,rate:2}]
  assert.ok(Math.abs(elapsedPlaybackSeconds(1,1.044,rates)-.032)<1e-9)
})
test('view and 1.3 s fall time survive reset/import/animated pins', () => {
  const view = {...FIXED_CAMERA,cameraFov:32,keyboardY:-2}
  assert.equal(Math.hypot(...view.cameraPos.map((n,i)=>n-view.cameraLookAt[i])),12)
  const settings = {cameraPos:[0,0,12],cameraLookAt:[0,0,0],cameraFov:50,keyboardY:1,
    fallDurationSec:2.5,noteMinLength:.15,settingsKeyframes:[{time:2,settings:{cameraPos:[5,5,20],noteColor:'#fff',fallDurationSec:8}}]}
  const locked = lockViewSettings(settings,view)
  assert.deepEqual(locked.cameraPos,[1.05,-1.45,6.7])
  assert.deepEqual(locked.settingsKeyframes[0].settings.cameraLookAt,[1.05,-1.45,-5.3])
  assert.equal(locked.settingsKeyframes[0].settings.noteColor,'#fff')
  assert.equal(locked.fallDurationSec,1.3)
  assert.equal(locked.settingsKeyframes[0].settings.fallDurationSec,1.3)
  assert.equal(locked.noteMinLength,settings.noteMinLength)
  assert.equal(lockViewSettings(locked,view),locked)
  assert.equal(settings.cameraFov,50)
})

test('unplayed notes miss strictly after 200ms, once; hits never expire', () => {
  const judge = new RhythmJudge()
  const notes = [{id:1,midi:60,start:2},{id:2,midi:64,start:2}]
  assert.equal(judge.judge(60,2.02,notes),'perfect')
  assert.deepEqual(judge.expire(2.2,notes),[])
  assert.deepEqual(judge.expire(2.20001,notes).map(n=>n.id),[2])
  assert.deepEqual(judge.expire(5,notes),[])
})

test('duplicate tracks count once, chords and skipped repeats each expire', () => {
  const judge = new RhythmJudge()
  const notes = [{id:1,midi:60,start:2},{id:2,midi:64,start:2},
    {id:3,midi:60,start:2},{id:4,midi:60,start:2.1}]
  assert.equal(judge.judge(60,2.1,notes),'perfect')
  assert.deepEqual(judge.expire(2.21,notes).map(n=>n.id),[1,2])
  assert.deepEqual(judge.expire(3,notes),[])
})

test('seeking skips past targets, restart makes them eligible again', () => {
  const judge = new RhythmJudge()
  const notes = [{id:1,midi:60,start:1},{id:2,midi:60,start:3}]
  judge.reset(2)
  assert.deepEqual(judge.expire(2.5,notes),[])
  assert.deepEqual(judge.expire(3.21,notes).map(n=>n.id),[2])
  judge.reset(0)
  assert.deepEqual(judge.expire(1.21,notes).map(n=>n.id),[1])
})

test('automatic expiry uses real playback time at different rates', () => {
  const notes = [{id:1,midi:60,start:1}]
  for(const rate of [.5,2]) {
    const judge = new RhythmJudge()
    const elapsed=(from,to)=>elapsedPlaybackSeconds(from,to,[{at:-Infinity,rate}])
    assert.deepEqual(judge.expire(1+.2*rate,notes,elapsed),[])
    assert.equal(judge.expire(1+.201*rate,notes,elapsed).length,1)
  }
})
