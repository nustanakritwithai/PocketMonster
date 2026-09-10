import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PLAYER_PRESENTATION_FALLBACK_ID,
  PLAYER_PRESENTATION_SESSION_SCHEMA,
  shouldUsePlayerPresentationSession,
} from '../asset-presentation/player-presentation-session.mjs';

const combinedPocket = { POCKETMONSTER_COMBINED_BOOT: { worldId: 'pocket-monster' } };
const combinedPirate = { POCKETMONSTER_COMBINED_BOOT: { worldId: 'pirate-fruit' } };
const standalone = {};
const playerDef = { id: PLAYER_PRESENTATION_FALLBACK_ID };

assert.equal(PLAYER_PRESENTATION_SESSION_SCHEMA, 'pocket-player-presentation-session-v1');
assert.equal(shouldUsePlayerPresentationSession({ def: playerDef, request: { role: 'player' }, windowRef: combinedPocket }), true,
  'Pocket Monster player fallback identity must be presentation-upgradable');
assert.equal(shouldUsePlayerPresentationSession({ def: playerDef, request: { role: 'player' }, windowRef: combinedPirate }), true,
  'Pirate world parent player fallback identity must share the same presentation session');
assert.equal(shouldUsePlayerPresentationSession({ def: playerDef, request: { role: 'keeper' }, windowRef: combinedPocket }), false,
  'NPCs must not inherit the local player Studio presentation');
assert.equal(shouldUsePlayerPresentationSession({ def: { id: 'monster.slime.a' }, request: { role: 'player' }, windowRef: combinedPocket }), false,
  'non-player assets must not be remapped');
assert.equal(shouldUsePlayerPresentationSession({ def: playerDef, request: { role: 'player' }, windowRef: standalone }), false,
  'standalone V8 behavior remains unchanged');

const engine = fs.readFileSync(new URL('../asset-presentation/engine.mjs', import.meta.url), 'utf8');
const session = fs.readFileSync(new URL('../asset-presentation/player-presentation-session.mjs', import.meta.url), 'utf8');
const game = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const pirateBoot = fs.readFileSync(new URL('../boot-pirate-fruit-v900.mjs', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../pirate-player-server.mjs', import.meta.url), 'utf8');

assert.match(game,
  /const playerVisual=assets\.spawn\('character\.human\.pirate-fruit\.v1',\{role:'player'/,
  'Monster stage still uses the stable gameplay/player identity; presentation override belongs in Asset Engine');
assert.match(engine, /maybeWrapPlayerPresentationHandle/,
  'Asset Engine must pass local player handles through the presentation session');
assert.match(session, /loadStudioCharacterFromEngine\(\)/,
  'shared presentation session loads the current Character Studio package');
assert.match(session, /registerStudioCharacterPackage\(pkg\)/,
  'shared presentation session registers the exact Studio package before constructing the visual');
assert.match(session, /createStudioCharacterProvider\(\{ THREE \}\)/,
  'shared presentation session reconstructs the Studio character with the canonical provider');
assert.match(session, /hideFallbackChildren\(root, fallbackChildren\)/,
  'old Pirate fallback is hidden only after the Studio visual is ready');
assert.match(session, /root\.add\?\.\(studio\.root\)/,
  'Studio visual is mounted beneath the stable gameplay root');
assert.match(session, /lastMoving \? 'walk'/,
  'locomotion state is restored when the Studio visual becomes active');
assert.match(session, /PIRATE_STUDIO_CHARACTER_READY/,
  'session listens for Pirate iframe presentation readiness');
assert.match(session, /matchingPirateFrame\(message, event\.source, documentRef\)/,
  'replay is capability/source scoped to the actual Pirate iframe');
assert.match(session, /event\?\.detail\?\.world !== 'pirate-fruit'/,
  'return warp to Pirate triggers cached presentation replay');
assert.match(session, /\[0, 80, 240, 700\]/,
  'return relay tolerates iframe detach/re-attach timing');
assert.match(pirateBoot, /if \(!pirateRuntimeActive\) return;/,
  'test documents the lifecycle edge that previously dropped a package while Pirate was unmounted');
assert.match(server, /host: 'pirate-fruit'/,
  'gameplay/server authority remains Pirate Fruit');
assert.match(server, /assetId: PIRATE_FRUIT_PLAYER_ID/,
  'server identity is deliberately not rewritten to a presentation model ID');
assert.doesNotMatch(session, /saveCharacterProfile|syncPlayerData|playerHp|damage|\bhp\b|\batk\b/,
  'presentation continuity layer must not gain gameplay/save authority');

console.log('V9.2 world-warp Studio character continuity gate passed');
