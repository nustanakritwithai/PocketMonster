import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  UNIFIED_MINIMAP_KIND,
  projectMinimapFrame,
  createUnifiedMinimapStore,
  MINIMAP_MARKER_LIMIT,
} from '../unified-minimap-v900.mjs';

// ---------- Projection geometry ----------
{
  const frame = projectMinimapFrame({
    bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    player: { x: 0, z: 0, heading: 90 },
    markers: [
      { id: 'warp-north', kind: 'warp', x: 0, z: 100 },
      { id: 'party-2', kind: 'party', x: 50, z: -50 },
    ],
  });
  assert.equal(frame.available, true);
  assert.equal(frame.kind, UNIFIED_MINIMAP_KIND);
  assert.equal(frame.player.x, 0, 'world center maps to the frame center');
  assert.equal(frame.player.z, 0);
  assert.equal(frame.player.heading, 90);
  const warp = frame.markers.find(marker => marker.id === 'warp-north');
  assert.equal(warp.z, 1, 'bounds edges map to the frame edge');
  const party = frame.markers.find(marker => marker.id === 'party-2');
  assert.equal(party.x, 0.5);
  assert.equal(party.z, -0.5);
}

{
  const frame = projectMinimapFrame({
    bounds: { minX: -200, maxX: 200, minZ: -100, maxZ: 100 },
    player: { x: 200, z: 0 },
    markers: [{ id: 'east-edge', kind: 'poi', x: 999, z: 0 }],
  });
  assert.equal(frame.player.x, 1, 'the player clamps to the frame edge');
  assert.equal(frame.markers[0].x, 1, 'markers outside bounds clamp instead of inventing positions');
  const aspect = frame.aspect;
  assert.ok(Math.abs(aspect - 2) < 1e-9, 'wide worlds keep their aspect ratio in the frame');
}

{
  const missing = projectMinimapFrame({ bounds: null, player: { x: 1, z: 1 } });
  assert.equal(missing.available, false, 'unknown world geometry fails closed');
  const degenerate = projectMinimapFrame({ bounds: { minX: 5, maxX: 5, minZ: 0, maxZ: 0 } });
  assert.equal(degenerate.available, false, 'zero-area bounds cannot project');
  const nonFinite = projectMinimapFrame({ bounds: { minX: NaN, maxX: 10, minZ: 0, maxZ: 10 } });
  assert.equal(nonFinite.available, false, 'non-finite bounds fail closed');
}

{
  const markers = [];
  for (let index = 0; index < MINIMAP_MARKER_LIMIT + 25; index += 1) {
    markers.push({ id: `poi-${index}`, kind: 'poi', x: index % 10, z: index % 7 });
  }
  markers.push({ id: '<<bad>>', kind: 'poi', x: 0, z: 0 });
  const frame = projectMinimapFrame({
    bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 },
    markers,
  });
  assert.equal(frame.markers.length, MINIMAP_MARKER_LIMIT, 'marker count is bounded');
  assert.ok(!frame.markers.some(marker => marker.id === '<<bad>>'), 'unsafe marker ids are dropped');
}

// ---------- Store semantics ----------
{
  const store = createUnifiedMinimapStore();
  const seen = [];
  const unsubscribe = store.subscribe(snapshot => seen.push(snapshot));
  assert.equal(seen[0].available, false, 'minimap starts unavailable');
  const first = store.publish(projectMinimapFrame({
    bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    player: { x: 10, z: -10, heading: 0 },
    markers: [{ id: 'warp-1', kind: 'warp', x: 0, z: 0 }],
  }));
  assert.equal(first.available, true);
  assert.equal(first.revision, 1);
  const repeat = store.publish(projectMinimapFrame({
    bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    player: { x: 10, z: -10, heading: 0 },
    markers: [{ id: 'warp-1', kind: 'warp', x: 0, z: 0 }],
  }));
  assert.equal(repeat.revision, first.revision, 'identical geometry cannot bump the revision');
  assert.equal(seen.length, 2);
  const reset = store.reset();
  assert.equal(reset.available, false, 'reset hides the minimap');
  assert.ok(reset.revision > first.revision);
  unsubscribe();
  assert.equal(store.diagnostics().subscribers, 0);
}

// ---------- Dock wiring ----------
const dockSource = fs.readFileSync(new URL('../unified-mmorpg-hud-v900.mjs', import.meta.url), 'utf8');
assert.match(dockSource, /subscribeFeature\('minimap',\s*minimapAdapter\(\)\)/, 'Dock subscribes the minimap adapter when present');
assert.match(dockSource, /POCKETMONSTER_MINIMAP_HUD/, 'Dock discovers the minimap through the shared global');
assert.match(dockSource, /function renderMinimap/, 'Dock renders minimap projections');

console.log('V9 unified minimap projection: PASS');
