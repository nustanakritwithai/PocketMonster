import assert from 'node:assert/strict';
import fs from 'node:fs';

const game = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
assert.match(
  game,
  /const embeddedOnlineScene=window\.POCKETMONSTER_SCENE_EMBEDDED===true;/,
  'online scene detection must be explicit',
);
assert.match(
  game,
  /rotate\.classList\.toggle\('hidden',embeddedOnlineScene\|\|!portrait\);/,
  'embedded online scenes must keep the rotate enforcement overlay hidden',
);
assert.match(
  game,
  /gate\.classList\.add\('hidden'\); gate\.style\.display='none'; gate\.style\.pointerEvents='none';/,
  'immersive gate must remain non-blocking after a scene swap',
);
console.log('V9 warp overlay lifecycle: PASS');
