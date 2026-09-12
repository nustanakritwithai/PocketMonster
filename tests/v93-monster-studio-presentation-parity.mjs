import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PLAYER_PRESENTATION_FORWARD_YAW,
  PLAYER_PRESENTATION_PARITY_SCHEMA,
  computePlayerPresentationRetarget,
  resolvePlayerPresentationAction,
  shouldDeferPlayerPresentationParity,
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

assert.equal(shouldDeferPlayerPresentationParity({
  POCKETMONSTER_SCENE_PREWARM: true,
  POCKETMONSTER_COMBINED_BOOT: { worldId: 'pirate-fruit' },
}), true, 'Pocket runtime prewarm must defer parity instead of caching a null presentation');
assert.equal(shouldDeferPlayerPresentationParity({
  POCKETMONSTER_SCENE_PREWARM: false,
  POCKETMONSTER_COMBINED_BOOT: { worldId: 'pocket-monster' },
}), false, 'mounted Pocket world must be allowed to run parity after prewarm clears');

assert.equal(resolvePlayerPresentationAction({ requestedAction: 'idle', moving: true, now: 100 }), 'walk',
  'Monster moving=true must actively select the Studio walk clip');
assert.equal(resolvePlayerPresentationAction({ requestedAction: 'run', moving: true, now: 100 }), 'run',
  'explicit run locomotion remains run while moving');
assert.equal(resolvePlayerPresentationAction({ requestedAction: 'attack', requestedAt: 100, requestedOptions: { duration: .45 }, moving: true, now: 300 }), 'attack',
  'locomotion bridge must not cut a recent attack action short');
assert.equal(resolvePlayerPresentationAction({ requestedAction: 'attack', requestedAt: 100, requestedOptions: { duration: .45 }, moving: true, now: 700 }), 'walk',
  'after transient action duration, moving player must return to walk');
assert.equal(resolvePlayerPresentationAction({ requestedAction: 'dead', requestedAt: 0, moving: true, now: 999999 }), 'dead',
  'terminal death presentation must never be overwritten by locomotion');

const parity = fs.readFileSync(new URL('../asset-presentation/player-presentation-parity.mjs', import.meta.url), 'utf8');
const engine = fs.readFileSync(new URL('../asset-presentation/engine.mjs', import.meta.url), 'utf8');
const game = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');

assert.match(engine, /from '\.\/player-presentation-parity\.mjs'/,
  'Asset Engine must route local players through the parity layer');
assert.match(game, /playerVisual\.update\(dt,\{moving\}\)/,
  'Monster stage supplies movement state every frame for Studio locomotion parity');
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
assert.match(parity, /studio\.play\?\.\(replayAction, \{ \.\.\.requestedOptions, restart: true \}\)/,
  'latest action/locomotion state must be replayed after presentation handoff');
assert.match(parity, /function ensureLocomotionParity\(\)/,
  'cross-world wrapper must actively bridge moving state into Studio locomotion actions');
assert.match(parity, /session\.presentationSource !== 'studio-character'/,
  'locomotion bridge must only override the upgraded Studio visual');
const prewarmGuard = parity.indexOf('if (shouldDeferPlayerPresentationParity(windowRef)) return Promise.resolve(null);');
const cachedPromiseReuse = parity.indexOf('if (parityPromise) return parityPromise;');
assert.ok(prewarmGuard >= 0 && cachedPromiseReuse >= 0 && prewarmGuard < cachedPromiseReuse,
  'prewarm deferral must happen before parityPromise reuse so a null prewarm result cannot poison the mounted world');
assert.match(parity, /if \(!studio \|\| disposed\) \{[\s\S]{0,180}parityPromise = null;/,
  'transient null Studio readiness must clear the parity promise so the mounted world can retry');
assert.doesNotMatch(parity, /saveCharacterProfile|syncPlayerData|playerHp|damage|\bhp\b|\batk\b/,
  'visual parity layer must remain presentation-only');

console.log('V9.3 Monster Studio presentation parity gate passed');
