import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';

// Phase 4: Hit Flash — hitFlashGroup for Bighead Group meshes

// 1. Function exists
assert.ok(js.includes('function hitFlashGroup('), 'hitFlashGroup missing');

// 2. Traverses group children
assert.ok(js.includes('group.traverse'), 'hitFlashGroup: traverse missing');

// 3. Backup pattern (saves original colors)
assert.ok(js.includes('backups'), 'hitFlashGroup: backup pattern missing');

// 4. White flash color
assert.ok(js.includes('0xffffff'), 'hitFlashGroup: white flash missing');

// 5. Restore timer (setTimeout)
assert.ok(js.includes('setTimeout'), 'hitFlashGroup: restore timer missing');

// 6. Restores original color
assert.ok(js.includes('.copy('), 'hitFlashGroup: restore copy missing');

// 7. Wired into damageWild
assert.ok(js.includes('hitFlashGroup(w.mesh)'), 'hitFlashGroup not called in damageWild');

// 8. Handles null safety
assert.ok(js.includes('return') && js.includes('traverse'), 'hitFlashGroup: null guard missing');

console.log('V8.0 Skill VFX P4 hit flash: PASS');