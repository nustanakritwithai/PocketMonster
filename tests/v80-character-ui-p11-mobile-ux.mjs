import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';
import { ACTIVE_SUMMON_READONLY_REASON } from '../character-ui-controller.mjs';

assert.match(ACTIVE_SUMMON_READONLY_REASON, /ต้องเรียกกลับก่อนจึงจะปรับแต่งได้/, 'mutable Character tabs must explain that Recall is required');
assert.match(js, /function closeManager\(\)/, 'Full manager must retain the Back entry point');
assert.match(js, /characterUI\.back\(\)/, 'Full manager Back must return through the existing Character stack');
assert.match(js, /characterUI\?\.focusMonster\(select\.value\)/, 'tab selection must synchronize focusedMonsterId through the controller');
assert.doesNotMatch(js, /focusMonster\([\s\S]{0,120}state\.selectedSlot\s*=/, 'focused tab selection must not switch the combat party slot');

console.log('V8.2 Character UI Phase 11 mobile UX navigation/read-only guard: PASS');
