import assert from 'node:assert/strict';
import {
  PIRATE_WORLD_VIEWBOX,
  PirateObservatoryInterestSession,
  buildMapRenderItems,
  entityBudgetForLod,
  lodForSemanticZoom,
  panViewBox,
  viewportRequestFromViewBox,
  zoomForViewBox,
  zoomViewBoxAt,
} from '../pirate-observatory/index.mjs';

assert.equal(zoomForViewBox(PIRATE_WORLD_VIEWBOX), 1);
assert.equal(lodForSemanticZoom(1), 0);
assert.equal(entityBudgetForLod(0), 80);

const zoomed = zoomViewBoxAt(PIRATE_WORLD_VIEWBOX, 2, 255, 220);
assert.ok(Math.abs(zoomed.width - 365) < 0.001);
assert.equal(lodForSemanticZoom(zoomForViewBox(zoomed)), 1);
const panned = panViewBox(zoomed, 9999, 9999);
assert.ok(panned.x + panned.width <= PIRATE_WORLD_VIEWBOX.x + PIRATE_WORLD_VIEWBOX.width + 0.001);
assert.ok(panned.y + panned.height <= PIRATE_WORLD_VIEWBOX.y + PIRATE_WORLD_VIEWBOX.height + 0.001);

const request = viewportRequestFromViewBox(PIRATE_WORLD_VIEWBOX, {
  selectedId: 'ship:selected',
  watchedIds: ['ship:watch', 'ship:watch'],
  includeTypes: ['ship'],
});
assert.equal(request.lod, 0);
assert.equal(request.maxEntities, 80);
assert.deepEqual(request.watchedIds, ['ship:watch']);
assert.deepEqual(request.includeTypes, ['ship']);
assert.equal(request.viewport.minX, -110);
assert.equal(request.viewport.maxX, 620);

const clustered = buildMapRenderItems([
  { id: 'ship:a', type: 'ship', x: 0, z: 0 },
  { id: 'ship:b', type: 'ship', x: 4, z: 5 },
  { id: 'monster:a', type: 'monster', x: 3, z: 4 },
], { lod: 0, viewBox: PIRATE_WORLD_VIEWBOX });
assert.equal(clustered.length, 2);
const shipCluster = clustered.find(item => item.type === 'ship');
assert.equal(shipCluster.kind, 'cluster');
assert.equal(shipCluster.count, 2);

const local = buildMapRenderItems([
  { id: 'ship:a', type: 'ship', x: 0, z: 0 },
  { id: 'ship:b', type: 'ship', x: 4, z: 5 },
], { lod: 2, viewBox: zoomed });
assert.equal(local.length, 2);
assert.equal(local.every(item => item.kind === 'entity'), true);

// Interest session applies only a response for the viewport that requested it.
let currentRequest = viewportRequestFromViewBox(PIRATE_WORLD_VIEWBOX);
let applied = null;
const session = new PirateObservatoryInterestSession({
  transport: {
    async getInterest(req) {
      return {
        schemaVersion: 1,
        partition: req.partition,
        tick: 22,
        sequence: 9,
        lod: req.lod,
        entities: [{ id: 'ship:1', type: 'ship', partition: req.partition, x: 1, y: 0, z: 2, hp: 10, hpMax: 10, stateVersion: 1, fingerprint: 'x'.repeat(64) }],
      };
    },
  },
  getRequest: () => currentRequest,
  onInterest: response => { applied = response; },
  setIntervalImpl: () => 1,
  clearIntervalImpl: () => {},
});
session.start({ immediate: false });
const result = await session.refresh();
assert.equal(result.ok, true);
assert.equal(applied.entities[0].id, 'ship:1');
session.stop();

console.log('v90 Pirate World Observatory map interest: PASS');
