import assert from 'node:assert/strict';
import {
  assertAssetHandle,
  disposeHandle,
  isShared,
  registerOwned,
  registerShared,
  resetOwnership,
  validateAssetDefinition,
  validateBundle,
} from '../asset-presentation/index.mjs';

const withHp = {
  id: 'character.human.blocky-bighead.v1',
  kind: 'character',
  provider: 'procedural',
  style: 'blocky-bighead-v1',
  surfaceStyle: 'four-side-block-v1',
  rig: 'humanoid-rig-v1',
  metrics: { height: 1.8, hp: 100 },
  roles: { player: { accessories: [] } },
};
assert.ok(validateAssetDefinition(withHp).some(e => e.includes('hp')), 'mutant 1: gameplay hp must be rejected');

const dup = {
  assets: [
    {
      id: 'same',
      kind: 'character',
      provider: 'procedural',
      style: 'blocky-bighead-v1',
      surfaceStyle: 'four-side-block-v1',
      rig: 'humanoid-rig-v1',
      metrics: { height: 1.8 },
      roles: { player: { accessories: [] } },
    },
    {
      id: 'same',
      kind: 'character',
      provider: 'procedural',
      style: 'blocky-bighead-v1',
      surfaceStyle: 'four-side-block-v1',
      rig: 'humanoid-rig-v1',
      metrics: { height: 1.8 },
      roles: { keeper: { accessories: [] } },
    },
  ],
  appearances: [],
};
assert.ok(validateBundle(dup).some(e => e.includes('duplicate id')), 'mutant 2: duplicate ids must be rejected');

assert.throws(() => assertAssetHandle({ root: {}, rig: {} }), /missing (play|anchor)/, 'mutant 3: handle without methods must fail');

resetOwnership();
const handle = {};
const shared = registerShared('tex', {
  dispose() { this.killed = true; },
});
registerOwned(handle, shared);
disposeHandle(handle);
assert.equal(shared.killed, undefined, 'mutant 8: instance dispose must not destroy shared resources');
assert.equal(isShared(shared), true);

console.log('V8.0 AE0 mutants: PASS');
