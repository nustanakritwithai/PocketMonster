import assert from 'node:assert/strict';
import fs from 'node:fs';

const game = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const loopStart = game.indexOf('function loop(now){');
assert.ok(loopStart >= 0, 'game loop exists');
const pausedBranch = game.slice(loopStart, game.indexOf('  try{', loopStart));
assert.match(pausedBranch, /if\(!sceneRuntimeActive\)\{[\s\S]*if\(document\.body\?\.dataset\?\.combinedWorld==='pirate-fruit'\)updateFieldBagPreview\(Math\.min\(\.033/,
  'paused Pirate runtime keeps a bounded field-bag preview tick');
assert.match(pausedBranch, /updateFieldBagPreview\([^;]+\);[\s\S]*last=now;[\s\S]*requestAnimationFrame\(loop\);return;/,
  'paused preview updates last time before returning to the animation frame');
assert.doesNotMatch(pausedBranch, /updatePlayer\(|updateWorldStream\(|updateOwned\(/,
  'paused preview branch does not run world simulation');
assert.match(game, /if\(!pirateThrowWorld\)\{/, 'Pocket runtime keeps its existing overlay separation');
console.log('V90 Pirate paused monster-bag preview: PASS');
