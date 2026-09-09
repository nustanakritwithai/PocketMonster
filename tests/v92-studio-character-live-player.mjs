import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  STUDIO_CHARACTER_DEFAULT_ASSET,
  STUDIO_CHARACTER_QUERY_PARAM,
  bootStudioCharacterLivePlayer,
  resolveStudioCharacterBootRequest,
} from '../asset-presentation/studio-character-live-player.mjs';

assert.equal(STUDIO_CHARACTER_QUERY_PARAM, 'studioCharacter');
assert.equal(STUDIO_CHARACTER_DEFAULT_ASSET, 'character.human.pirate-fruit.v1');

const none = resolveStudioCharacterBootRequest({
  href: 'https://game.example/game-v900.html',
  origin: 'https://game.example',
  search: '',
});
assert.equal(none, null, 'no query must keep the existing player');

const sameOrigin = resolveStudioCharacterBootRequest({
  href: 'https://game.example/game-v900.html?studioCharacter=assets/runtime/custom.pocket-character.json',
  origin: 'https://game.example',
  search: '?studioCharacter=assets/runtime/custom.pocket-character.json',
});
assert.equal(sameOrigin.error, undefined);
assert.equal(sameOrigin.url, 'https://game.example/assets/runtime/custom.pocket-character.json');

const crossOrigin = resolveStudioCharacterBootRequest({
  href: 'https://game.example/game-v900.html?studioCharacter=https://evil.example/custom.pocket-character.json',
  origin: 'https://game.example',
  search: '?studioCharacter=https://evil.example/custom.pocket-character.json',
});
assert.match(crossOrigin.error, /same-origin/);

const wrongExtension = resolveStudioCharacterBootRequest({
  href: 'https://game.example/game-v900.html?studioCharacter=assets/runtime/custom.json',
  origin: 'https://game.example',
  search: '?studioCharacter=assets/runtime/custom.json',
});
assert.match(wrongExtension.error, /\.pocket-character\.json/);

const noRequestBoot = await bootStudioCharacterLivePlayer({
  assets: { registerProvider() { throw new Error('provider must not register without opt-in'); } },
  THREE: {},
  locationLike: {
    href: 'https://game.example/game-v900.html',
    origin: 'https://game.example',
    search: '',
  },
});
assert.equal(noRequestBoot.enabled, false);
assert.equal(noRequestBoot.characterId, STUDIO_CHARACTER_DEFAULT_ASSET);
assert.equal(noRequestBoot.reason, 'not-requested');

const invalidStatus = [];
const invalidRequestBoot = await bootStudioCharacterLivePlayer({
  assets: { registerProvider() { throw new Error('provider must not register for invalid request'); } },
  THREE: {},
  locationLike: {
    href: 'https://game.example/game-v900.html?studioCharacter=https://evil.example/custom.pocket-character.json',
    origin: 'https://game.example',
    search: '?studioCharacter=https://evil.example/custom.pocket-character.json',
  },
  onStatus: (...args) => invalidStatus.push(args),
});
assert.equal(invalidRequestBoot.enabled, false);
assert.equal(invalidRequestBoot.characterId, STUDIO_CHARACTER_DEFAULT_ASSET);
assert.equal(invalidRequestBoot.reason, 'invalid-request');
assert.ok(invalidStatus.length >= 1);

const game = fs.readFileSync(new URL('../game-v900.js', import.meta.url), 'utf8');
const helper = fs.readFileSync(new URL('../asset-presentation/studio-character-live-player.mjs', import.meta.url), 'utf8');

for (const token of [
  "import { bootStudioCharacterLivePlayer } from './asset-presentation/studio-character-live-player.mjs'",
  'const studioLivePlayer = await bootStudioCharacterLivePlayer({',
  'const playerCharacterId = studioLivePlayer.characterId;',
  'assets.spawn(playerCharacterId, {',
  "if (studioLivePlayer.enabled) playerVisual.play('idle', { restart: true });",
  "const next = moving ? 'walk' : 'idle';",
  'playerVisual.play(next, { restart: false });',
  'livePlayer: studioLivePlayer',
]) {
  assert.ok(game.includes(token), `game-v900 live Studio wiring missing: ${token}`);
}

assert.ok(
  game.indexOf('const studioLivePlayer = await bootStudioCharacterLivePlayer({')
    < game.indexOf('assets.spawn(playerCharacterId, {'),
  'Studio package must be installed before the selected player is spawned',
);
assert.ok(!game.includes("const playerVisual = assets.spawn('character.human.pirate-fruit.v1'"),
  'live player spawn must not remain hard-coded to Pirate Fruit');

for (const token of [
  "export const STUDIO_CHARACTER_QUERY_PARAM = 'studioCharacter'",
  "export const STUDIO_CHARACTER_DEFAULT_ASSET = 'character.human.pirate-fruit.v1'",
  "assets.registerProvider('studio-character'",
  'installStudioCharacterPackage(assets, request.url',
  'Studio character live-player boot failed; using Pirate Fruit fallback',
]) {
  assert.ok(helper.includes(token), `live-player helper contract missing: ${token}`);
}

console.log('V9.2 studio-character live player opt-in PASS');
