import assert from 'node:assert/strict';
import { buildHistoricalMapItems, historicalEntityTrail } from '../pirate-observatory/history-map-model.mjs';

const small = {
  entities: [
    { id: 'ship:a', type: 'ship', x: 0, z: 0 },
    { id: 'ship:b', type: 'ship', x: 20, z: 20 },
  ],
};
const detailed = buildHistoricalMapItems(small, { selectedId: 'ship:a' });
assert.equal(detailed.entityCount, 2);
assert.equal(detailed.selectedFound, true);
assert.equal(detailed.lod, 2);
assert.equal(detailed.items.filter(item => item.kind === 'entity').length, 2);
assert.equal(detailed.items.at(-1).selected, true);
assert.equal(detailed.items.at(-1).entity.id, 'ship:a');

const many = {
  entities: Array.from({ length: 240 }, (_, index) => ({
    id: `npc:${index}`,
    type: 'npc',
    x: (index % 20) * 8,
    z: Math.floor(index / 20) * 8,
  })),
};
const clustered = buildHistoricalMapItems(many, { selectedId: 'npc:239', maxDetailedEntities: 80 });
assert.equal(clustered.entityCount, 240);
assert.equal(clustered.selectedFound, true);
assert.equal(clustered.lod, 0);
assert.ok(clustered.items.some(item => item.kind === 'cluster' && item.count > 1));
assert.equal(clustered.items.at(-1).kind, 'entity');
assert.equal(clustered.items.at(-1).entity.id, 'npc:239');

const before = { entities: [{ id: 'ship:a', x: 1, z: 2 }] };
const after = { entities: [{ id: 'ship:a', x: 5, z: 8 }] };
assert.deepEqual(historicalEntityTrail(before, after, 'ship:a'), {
  entityId: 'ship:a',
  from: { x: 1, z: 2 },
  to: { x: 5, z: 8 },
});
assert.equal(historicalEntityTrail(before, { entities: [{ id: 'ship:a', x: 1, z: 2 }] }, 'ship:a'), null);
assert.equal(historicalEntityTrail(before, after, 'missing'), null);

console.log('v90 Pirate World Observatory historical map model: PASS');
