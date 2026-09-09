import assert from 'node:assert/strict';
import fs from 'node:fs';

const game = fs.readFileSync(new URL('../game-v900.js', import.meta.url), 'utf8');
const helper = fs.readFileSync(new URL('../asset-presentation/studio-character-live-player.mjs', import.meta.url), 'utf8');

assert.doesNotMatch(
  game,
  /const\s+playerVisual\s*=\s*assets\.spawn\(['"]character\.human\.pirate-fruit\.v1['"]/, 
  'mutant: live spawn must not be hard-coded to Pirate Fruit',
);
assert.match(
  game,
  /const\s+playerCharacterId\s*=\s*studioLivePlayer\.characterId/,
  'mutant: selected character id must come from live-player boot result',
);
assert.match(
  helper,
  /url\.origin\s*!==\s*loc\.origin/,
  'mutant: cross-origin Studio package URLs must remain rejected',
);
assert.match(
  helper,
  /\.pocket-character\.json/,
  'mutant: package extension gate must remain present',
);
assert.match(
  helper,
  /character\.human\.pirate-fruit\.v1/,
  'mutant: fallback player identity must remain explicit',
);
assert.match(
  game,
  /const\s+next\s*=\s*moving\s*\?\s*['"]walk['"]\s*:\s*['"]idle['"]/,
  'mutant: Studio live player must preserve idle/walk state switching',
);

console.log('V9.2 studio-character live player mutants PASS');
