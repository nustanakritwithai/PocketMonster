import assert from 'node:assert/strict';
import fs from 'node:fs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../save-schema.mjs', import.meta.url), 'utf8');

function extractFn(name) {
  const start = js.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const headerEnd = js.indexOf('){', start) >= 0 ? js.indexOf('){', start) : js.indexOf(') {', start);
  assert.ok(headerEnd > start, `${name} header`);
  const brace = js.indexOf('{', headerEnd);
  let depth = 0;
  for (let i = brace; i < js.length; i++) {
    if (js[i] === '{') depth += 1;
    else if (js[i] === '}') {
      depth -= 1;
      if (depth === 0) return js.slice(start, i + 1);
    }
  }
  assert.fail(`unclosed ${name}`);
}

assert.match(js, /function spawnCaptureResultEffect/, 'capture result helper exists');
assert.match(extractFn('spawnCaptureResultEffect'), /0x22c55e/, 'success sparks stay green');
assert.match(extractFn('spawnCaptureResultEffect'), /0xef4444/, 'fail sparks are red');
assert.match(extractFn('spawnCaptureResultEffect'), /count:16/, 'success uses the 16-spark burst');
assert.match(extractFn('spawnCaptureResultEffect'), /count:8/, 'fail uses the 8-spark burst');

assert.match(js, /function startCaptureSequence/, 'capture keeps a ball sequence after impact');
assert.match(extractFn('startCaptureSequence'), /w\.mesh\.visible=false/, 'wild hides while the ball shakes');
assert.match(extractFn('startCaptureSequence'), /w\.capturing=true/, 'wild is frozen during tension');
assert.match(extractFn('startCaptureSequence'), /ballMesh\.scale\.setScalar\(3\.6\)/, 'the impact ball scales up so the shake is readable');

assert.match(extractFn('updateCaptureSequence'), /ballMesh\.position\.x=cs\.pos\.x/, 'shake is centered on the impact point');
assert.doesNotMatch(extractFn('updateCaptureSequence'), /home\.x/, 'tension does not snap the wild back to spawn home');
assert.doesNotMatch(js, /setInterval/, 'capture no longer jitters the wild on a wall-clock interval');

assert.match(extractFn('finishCaptureFail'), /spawnCaptureResultEffect\(cs\.pos,false\)/, 'fail plays the red result');
assert.match(extractFn('finishCaptureFail'), /mesh\.visible=true/, 'fail reveals the wild again');
assert.match(extractFn('finishCaptureSuccess'), /spawnCaptureResultEffect\(cs\.pos,true\)/, 'success plays the green result');
assert.match(extractFn('finishCaptureSuccess'), /playSFX\('sfx_capture_success'\)/, 'success SFX stays');
assert.match(extractFn('finishCaptureFail'), /playSFX\('sfx_capture_fail'\)/, 'fail SFX stays');

assert.match(extractFn('updateWorldStream'), /captureSequence\?\.wild===w/, 'world streaming must not unhide a wild that is inside the ball');
assert.match(extractFn('executeCaptureThrow'), /t\.capturing=true/, 'wild freezes at throw so the ball does not land on a stale point');
assert.match(extractFn('capturePrerequisite'), /w\.capturing/, 'a second throw cannot start while a wild is inside a ball');
assert.match(extractFn('capturePrerequisite'), /p\.type==='capture'/, 'a second throw cannot start while a capture ball is in flight');
assert.match(extractFn('updateWild'), /w\.capturing/, 'AI skips a wild that is inside the ball');
assert.match(extractFn('switchZone'), /abortCaptureSequence/, 'changing zone disposes the capture ball');
assert.match(extractFn('clearWilds'), /abortCaptureSequence/, 'despawning wilds aborts an open capture');

assert.match(schema, /ASSET_REVISION = '813'/, 'capture FX fix does not bump the reviewed live asset revision');
assert.match(extractFn('throwProjectile'), /boxGeometry\(\.14,\.14,\.14\)/, 'P2 throw cube stays');

console.log('V8.2 capture FX sequence: PASS');
