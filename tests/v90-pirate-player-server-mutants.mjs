import assert from 'node:assert/strict';
import fs from 'node:fs';

const liveJs = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const adapter = fs.readFileSync(new URL('../pirate-player-server.mjs', import.meta.url), 'utf8');
const runtime = fs.readFileSync(new URL('../runtime-config.mjs', import.meta.url), 'utf8');
const runtimeJson = fs.readFileSync(new URL('../runtime-config.json', import.meta.url), 'utf8');
const boot = fs.readFileSync(new URL('../boot-pirate-fruit-v900.mjs', import.meta.url), 'utf8');

assert.match(liveJs, /from '\.\/pirate-player-server\.mjs'/, 'mutant 1: live must import the pirate-hosted character server adapter');
assert.match(liveJs, /saveCharacter:character=>savePirateHostedCharacter/, 'mutant 2: ACCOUNT_ACTIONS.saveCharacter must target the pirate host');
assert.match(liveJs, /window\.POCKETMONSTER_PLAYER_CHARACTER=publishPlayerCharacterBinding/, 'mutant 3: pirate character binding must be published');
assert.match(adapter, /characterSystem: PLAYER_CHARACTER_SERVER\.host/, 'mutant 4: character payload host is pirate-fruit');
assert.doesNotMatch(adapter, /vitality|fruitPower|blade|mastery/, 'mutant 5: adapter must not copy Pirate Fruit combat stats');
assert.doesNotMatch(adapter, /vpsWrites|playerDataWrites/, 'mutant 6: adapter must not flip VPS write flags');
assert.match(runtime, /playerDataWrites: false/, 'mutant 7: runtime defaults keep player-data writes closed');
assert.match(runtimeJson, /"playerDataWrites": false/, 'mutant 8: checked-in manifest keeps player-data writes closed');
assert.doesNotMatch(boot, /vpsWrites|playerDataWrites/, 'mutant 9: pirate world boot still does not open write flags');
assert.match(liveJs, /function currentSaveEnvelope\(\)\{\s*return \{state:sanitizeStateForPersistence\(persistableState\(state\)\),playerHp:playerData\.hp,saveSchemaVersion:SAVE_SCHEMA_VERSION\};/, 'mutant 10: save envelope stays the Pocket playerHp contract');
assert.match(liveJs, /syncPlayerData\(runtimeConfig,authProfileBridge\.sessionToken,\{playerHp:String\(playerData\.hp\),playerExp:String\(state\.exp\?\?0\),actionLog:'CLIENT_BOOT_SYNC'\}\)/, 'mutant 11: Pocket playerHp/playerExp sync stays on the pirate-hosted player');

console.log('V9.0 pirate-hosted Pocket character server mutants: PASS');
