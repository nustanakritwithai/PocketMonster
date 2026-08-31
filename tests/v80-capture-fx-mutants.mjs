import assert from 'node:assert/strict';
import fs from 'node:fs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../save-schema.mjs', import.meta.url), 'utf8');

function extractFn(name) {
  const start = js.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const headerEnd = js.indexOf('){', start) >= 0 ? js.indexOf('){', start) : js.indexOf(') {', start);
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

assert.doesNotMatch(js, /from ['"]three['"]/, 'mutant 1: do not import the three package');
assert.match(schema, /export const ASSET_REVISION = '813'/, 'mutant 2: capture FX does not bump ASSET_REVISION');
assert.match(extractFn('spawnCaptureResultEffect'), /0xef4444/, 'mutant 3: fail VFX must stay red');
assert.match(extractFn('finishCaptureFail'), /spawnCaptureResultEffect/, 'mutant 4: fail path must spawn result VFX');
assert.match(extractFn('startCaptureSequence'), /visible=false/, 'mutant 5: wild stays hidden in the ball');
assert.doesNotMatch(js, /shakeMesh\.position\.x\+=/, 'mutant 6: do not jitter the wild mesh');
assert.doesNotMatch(extractFn('updateCaptureSequence'), /w\.home\.x/, 'mutant 7: do not teleport to home after shake');
assert.match(extractFn('updateProjectiles'), /onHit\?\.\(mesh\)/, 'mutant 8: capture ball mesh survives impact');
assert.match(extractFn('updateWild'), /w\.capturing/, 'mutant 9: capturing wilds skip wander/chase');
assert.match(js, /updateCaptureSequence\(dt\)/, 'mutant 10: the game loop ticks the capture ball');
assert.match(extractFn('abortCaptureSequence'), /removeAndDispose\(scene,cs\.ballMesh\)/, 'mutant 11: abort disposes the ball');
assert.match(js, /playSFX\('sfx_capture_fail'\)/, 'mutant 12: fail SFX stays wired');
assert.match(extractFn('executeCaptureThrow'), /t\.capturing=true/, 'mutant 13: freeze the wild before the ball flies');
assert.match(extractFn('updateWorldStream'), /captureSequence\?\.wild===w/, 'mutant 15: streaming must not force a bagged wild visible');

console.log('V8.2 capture FX mutants: PASS');
