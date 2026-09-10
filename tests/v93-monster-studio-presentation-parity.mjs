import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PLAYER_PRESENTATION_FORWARD_YAW,
  PLAYER_PRESENTATION_PARITY_SCHEMA,
  computePlayerPresentationRetarget,
} from '../asset-presentation/player-presentation-parity.mjs';

assert.equal(PLAYER_PRESENTATION_PARITY_SCHEMA, 'pocket-player-presentation-parity-v1');
assert.equal(PLAYER_PRESENTATION_FORWARD_YAW, Math.PI);

const retarget = computePlayerPresentationRetarget({
  fallbackBounds: { minY: 0, maxY: 1.8 },
  studioBounds: { minY: 0, maxY: 3.35 },
  targetWorld: 'pocket-monster',
});
assert.ok(Math.abs(retarget.scale - (1.8 / 3.35)) < 1e-9, 'Studio visual must be normalized to Monster-stage player height');
assert.equal(retarget.yaw, Math.PI, 'Monster-stage Studio visual must flip its visual forward axis without rotating gameplay root');
assert.equal(computePlayerPresentationRetarget({
  fallbackBounds: { minY: 0, maxY: 1.8 },
  studioBounds: { minY: 0, maxY: 1.8 },
  targetWorld: 'pirate-fruit',
}).yaw, 0, 'Pirate world does not get the host-world forward-axis correction');

const parity = fs.readFileSync(new URL('../asset-presentation/player-presentation-parity.mjs', import.meta.url), 'utf8');
const engine = fs.readFileSync(new URL('../asset-presentation/engine.mjs', import.meta.url), 'utf8');

assert.match(engine, /from '\.\/player-presentation-parity\.mjs'/,
  'Asset Engine must route local players through the parity layer');
assert.match(parity, /applyStudioCharacterRenderProfile\(studio\.root, studio\.renderProfile/,
  'cross-world Studio visual must apply the same verified PBR render profile as Pirate bridge');
assert.match(parity, /maxTextureSize: textureSizeForQuality\(quality\)/,
  'render profile texture budget must respect runtime quality');
assert.match(parity, /setUniformScale\(studio\.root, retarget\.scale\)/,
  'Studio visual scale must be normalized against the stable gameplay avatar bounds');
assert.match(parity, /setForwardYaw\(studio\.root, retarget\.yaw\)/,
  'forward correction must be applied only to nested presentation root');
assert.match(parity, /alignStudioFeet\(\{ studio, gameplayRoot, fallbackBounds, THREE \}\)/,
  'scaled Studio feet must be realigned to the old player floor');
assert.match(parity, /studio\.root\.visible = false/,
  'unretargeted/untextured Studio visual must remain hidden during parity preparation');
assert.match(parity, /setVisible\(fallbackChildren, true\)/,
  'known-good fallback remains visible while verified surface textures load');
assert.match(parity, /studio\.play\?\.\(replayAction, \{ \.\.\.lastActionOptions, restart: true \}\)/,
  'latest action/locomotion state must be replayed after presentation handoff');
assert.doesNotMatch(parity, /saveCharacterProfile|syncPlayerData|playerHp|damage|\bhp\b|\batk\b/,
  'visual parity layer must remain presentation-only');

console.log('V9.3 Monster Studio presentation parity gate passed');
