import assert from 'node:assert/strict';
import { tickCooldown } from '../runtime-policies.mjs';
import { activeJs } from './active-assets.mjs';

assert.equal(tickCooldown(1.2, 1 / 60), 1.2 - 1 / 60, 'cooldown must decrement every frame');
let cooldown = 1.2;
for (let frame = 0; frame < 120; frame++) cooldown = tickCooldown(cooldown, 1 / 60);
assert.equal(cooldown, 0, '1.2 second cooldown must reach zero within 120 frames');
assert.equal(tickCooldown(undefined, 0.1), 0, 'missing cooldown must normalize to zero');
assert.equal(tickCooldown(0.5, -1), 0.5, 'negative frame delta must not increase cooldown');
assert.ok(activeJs.includes('w.attackCd=tickCooldown(w.attackCd,cooldownElapsed)'), 'active runtime must use the tested cooldown policy with status-aware elapsed time');
console.log('P0 cooldown behavior regression: PASS');
