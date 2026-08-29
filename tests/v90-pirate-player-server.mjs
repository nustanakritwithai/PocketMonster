import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { PIRATE_FRUIT_PLAYER_ID, PIRATE_PRESENTATION_FORBIDDEN } from '../asset-presentation/providers/pirate-fruit-player.mjs';
import {
  PLAYER_CHARACTER_SERVER,
  POCKET_CHARACTER_SERVER_FUNCTIONS,
  characterFromPlayerState,
  piratePlayerCharacterPayload,
  publishPlayerCharacterBinding,
  savePirateHostedCharacter,
} from '../pirate-player-server.mjs';

const liveJs = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const runtime = fs.readFileSync(new URL('../runtime-config.mjs', import.meta.url), 'utf8');
const check = spawnSync(process.execPath, ['--check', fileURLToPath(new URL('../pirate-player-server.mjs', import.meta.url))], { encoding: 'utf8' });
assert.equal(check.status, 0, check.stderr || 'pirate-player-server syntax failed');

assert.equal(PLAYER_CHARACTER_SERVER.host, 'pirate-fruit');
assert.equal(PLAYER_CHARACTER_SERVER.assetId, PIRATE_FRUIT_PLAYER_ID);
assert.deepEqual(POCKET_CHARACTER_SERVER_FUNCTIONS, [
  'readPlayerState',
  'saveCharacterProfile',
  'syncPlayerData',
  'loadServerSave',
  'saveServerSave',
]);
assert.match(liveJs, /from '\.\/pirate-player-server\.mjs'/, 'live loop hosts Pocket character server APIs on the pirate player');
assert.match(liveJs, /savePirateHostedCharacter/, 'saveCharacter is rebound onto the pirate host');
assert.match(liveJs, /POCKETMONSTER_PLAYER_CHARACTER/, 'runtime publishes the pirate-hosted character binding');
assert.match(liveJs, /publishPlayerCharacterBinding\(\{writeArmed:serverPlayerDataActive/, 'binding records whether player-data writes are armed');
assert.doesNotMatch(runtime, /playerDataWrites: true/, 'checked-in runtime still does not open player-data writes');
assert.match(runtime, /playerDataWrites: false/, 'write flags stay closed');

const payload = piratePlayerCharacterPayload({
  name: '  Hero  ',
  vitality: 99,
  fruitPower: 12,
  atk: 40,
  hp: 88,
});
assert.equal(payload.name, 'Hero');
assert.equal(payload.characterId, PIRATE_FRUIT_PLAYER_ID);
assert.equal(payload.characterSystem, 'pirate-fruit');
assert.equal(payload.appearanceId, 'appearance.human.player-orange.v1');
assert.equal(payload.visualContract, 'presentation-only');
for (const field of PIRATE_PRESENTATION_FORBIDDEN) {
  assert.equal(payload[field], undefined, `character payload must not copy Pirate combat field ${field}`);
}

const fromState = characterFromPlayerState({
  profile: {
    displayName: 'Tester',
    character: { name: 'Old Pocket Hero', vitality: 7, blade: 3, hp: 50 },
  },
});
assert.equal(fromState.name, 'Old Pocket Hero');
assert.equal(fromState.characterId, PIRATE_FRUIT_PLAYER_ID);
assert.equal(fromState.vitality, undefined);
assert.equal(fromState.hp, undefined);

const skipped = await savePirateHostedCharacter({
  writesEnabled: false,
  character: { name: 'Guest' },
  saveCharacterProfile: async () => { throw new Error('must not POST when writes are off'); },
});
assert.equal(skipped.skipped, true);
assert.equal(skipped.reason, 'player-data-writes-disabled');
assert.equal(skipped.character.characterId, PIRATE_FRUIT_PLAYER_ID);

const calls = [];
const written = await savePirateHostedCharacter({
  saveCharacterProfile: async (config, token, body) => {
    calls.push({ config, token, body });
    return { success: true };
  },
  config: { apiBaseUrl: 'https://server.example/' },
  sessionToken: 'session',
  writesEnabled: true,
  live: () => ({ name: 'FromProfile' }),
});
assert.equal(written.success, true);
assert.equal(written.character.characterId, PIRATE_FRUIT_PLAYER_ID);
assert.equal(calls[0].token, 'session');
assert.equal(calls[0].body.characterId, PIRATE_FRUIT_PLAYER_ID);
assert.equal(calls[0].body.name, 'FromProfile');
assert.equal(calls[0].body.fruitPower, undefined);

const bound = publishPlayerCharacterBinding({ writeArmed: false, name: 'Bound' });
assert.equal(bound.host, 'pirate-fruit');
assert.equal(bound.writeArmed, false);
assert.equal(bound.payload.characterId, PIRATE_FRUIT_PLAYER_ID);

console.log('V9.0 pirate-hosted Pocket character server: PASS');
