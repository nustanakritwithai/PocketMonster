import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';

assert.match(js,/grassMeadowNormal:\{battleExpBase:8,battleExpPerLevel:4,captureExp:8,respawnMs:12000,captureBonus:.05\}/,'Grass Meadow normal balance profile exists');
assert.match(js,/function playerExpReward\(source,w\)/,'Player EXP is source-aware');
assert.match(js,/playerExpReward\('battle',w\)/,'Battle uses the balance profile');
assert.match(js,/playerExpReward\('capture',w\)/,'Capture uses the balance profile');
assert.match(js,/function wildRespawnDelay\(w\)/,'Respawn delay is stage-aware');
assert.match(js,/Math\.min\(\.95,sp\.capture\+captureBonus\)/,'New-player capture bonus is capped');
console.log('V8.3 Grass Meadow normal balance: PASS');
