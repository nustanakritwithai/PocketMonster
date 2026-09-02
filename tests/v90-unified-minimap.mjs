import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  UNIFIED_MINIMAP_KIND,
  projectMinimapFrame,
  createUnifiedMinimapStore,
  MINIMAP_MARKER_LIMIT,
} from '../unified-minimap-v900.mjs';
import {
  PERSISTENT_MINIMAP_OWNER_KIND,
  PIRATE_FRUIT_MINIMAP_BOUNDS,
  PIRATE_FRUIT_MINIMAP_LOCAL_SCALE,
  PIRATE_FRUIT_MINIMAP_NEAR_PADDING,
  PIRATE_FRUIT_MINIMAP_OCEAN_VIEW,
  PIRATE_FRUIT_MINIMAP_POIS,
  createPersistentMinimapOwner,
  pirateFruitMinimapFrame,
  pirateFruitMinimapView,
} from '../persistent-minimap-owner-v900.mjs';

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

// ---------- Legacy Pirate Fruit map image + near/far views ----------
{
  assert.equal(PERSISTENT_MINIMAP_OWNER_KIND, 'pocketmonster:persistent-minimap-owner-v2');
  assert.equal(PIRATE_FRUIT_MINIMAP_NEAR_PADDING, 18, 'legacy local-view padding stays 18 world units');
  assert.equal(PIRATE_FRUIT_MINIMAP_LOCAL_SCALE, 1.3, 'legacy local view keeps island radius × 1.3');
  assert.equal(PIRATE_FRUIT_MINIMAP_POIS.length, 35, 'legacy Pirate map POI catalog is restored');
  assert.ok(PIRATE_FRUIT_MINIMAP_BOUNDS.minX < 0 && PIRATE_FRUIT_MINIMAP_BOUNDS.maxX > 500, 'Pirate bounds cover the island chain');
  assert.ok(PIRATE_FRUIT_MINIMAP_BOUNDS.minZ < -150 && PIRATE_FRUIT_MINIMAP_BOUNDS.maxZ > 500, 'Pirate bounds cover north/south island extents');
  assert.equal(PIRATE_FRUIT_MINIMAP_OCEAN_VIEW.id, 'ocean-overview');
  assert.equal(PIRATE_FRUIT_MINIMAP_OCEAN_VIEW.scale, 'far');

  const localView = pirateFruitMinimapView({ x: 0, z: 0 }, 'auto');
  assert.equal(localView.id, 'starter-island', 'AUTO zoom uses the nearby island view');
  assert.equal(localView.scale, 'near');
  assert.equal(localView.radius, 60 * 1.3);

  const seaView = pirateFruitMinimapView({ x: 300, z: 200 }, 'auto');
  assert.equal(seaView.id, 'ocean-overview', 'AUTO zoom returns to ocean overview away from islands');
  assert.equal(seaView.scale, 'far');

  const forcedFar = pirateFruitMinimapView({ x: 0, z: 0 }, 'far');
  assert.equal(forcedFar.id, 'ocean-overview', 'manual far zoom can show the whole island chain from land');
  const forcedNear = pirateFruitMinimapView({ x: 300, z: 200 }, 'near');
  assert.equal(forcedNear.scale, 'near', 'manual near zoom selects the nearest island even while at sea');
}

{
  const frame = pirateFruitMinimapFrame({ x: 0, z: 0, dir: Math.PI / 2, zone: 'pirate-fruit' });
  assert.equal(frame.available, true, 'Pirate geography produces a real minimap frame');
  assert.equal(frame.mapView.id, 'starter-island');
  assert.equal(frame.mapView.scale, 'near');
  assert.equal(frame.markers.length, 5, 'local starter map exposes the five legacy starter POIs');
  assert.ok(frame.markers.some(marker => marker.id === 'poi-starter-village'));
  assert.ok(frame.markers.some(marker => marker.id === 'poi-hill-shrine'));
  assert.ok(frame.player, 'live player pose is projected');
  assert.equal(frame.player.heading, 90, 'Pirate radians are converted to minimap degrees');

  const far = pirateFruitMinimapFrame({ x: 300, z: 200, dir: 0, zone: 'pirate-fruit' });
  assert.equal(far.mapView.scale, 'far');
  assert.equal(far.markers.length, 18, 'ocean overview keeps village/harbor/boss anchor POIs like the old minimap');
}

{
  const listeners = new Map();
  let scheduled = null;
  let cleared = null;
  const links = [];
  const documentLike = {
    head: { append(node) { links.push(node); } },
    querySelector() { return null; },
    getElementById() { return null; },
    createElement(tag) { return { tagName: tag.toUpperCase(), dataset: {} }; },
  };
  const pose = { x: 170, z: -120, dir: Math.PI, zone: 'pirate-fruit' };
  const windowLike = {
    location: { href: 'https://example.test/index.html?world=pirate-fruit' },
    POCKETMONSTER_WORLD_STATE: () => pose,
    POCKETMONSTER_UNIFIED_HUD: { rebindCount: 0, rebind() { this.rebindCount += 1; } },
    setInterval(fn, ms) { scheduled = { fn, ms }; return 7; },
    clearInterval(id) { cleared = id; },
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); },
  };
  const owner = createPersistentMinimapOwner({ windowLike, documentLike, intervalMs: 125 });
  assert.equal(windowLike.POCKETMONSTER_MINIMAP_HUD, owner.api, 'owner exposes the parent minimap global');
  assert.equal(owner.api.snapshot().available, true, 'owner publishes Pirate geography immediately');
  assert.equal(owner.api.snapshot().markers.length, 6, 'Mist Jungle local view exposes its six POIs');
  assert.ok(owner.api.snapshot().player, 'owner publishes the live player pose');
  assert.equal(owner.api.diagnostics().zoomMode, 'auto');
  assert.equal(owner.api.diagnostics().mapView, 'mist-jungle');
  owner.api.zoomOut();
  assert.equal(owner.api.diagnostics().zoomMode, 'far');
  assert.equal(owner.api.diagnostics().mapView, 'ocean-overview');
  owner.api.zoomIn();
  assert.equal(owner.api.diagnostics().zoomMode, 'near');
  assert.equal(owner.api.diagnostics().mapView, 'mist-jungle');
  owner.api.autoZoom();
  assert.equal(owner.api.diagnostics().zoomMode, 'auto');
  assert.equal(links.length, 1, 'owner attaches one external mobile visibility stylesheet');
  assert.match(links[0].href, /unified-minimap-mobile-v900\.css\?v=2$/);
  assert.equal(scheduled.ms, 125, 'owner refreshes parent world state at a bounded cadence');
  windowLike.POCKETMONSTER_MINIMAP_HUD = null;
  listeners.get('pocketmonster:online-scene-ready')?.();
  assert.equal(windowLike.POCKETMONSTER_MINIMAP_HUD, owner.api, 'scene-ready restores the persistent parent owner');
  assert.ok(windowLike.POCKETMONSTER_UNIFIED_HUD.rebindCount >= 2, 'Dock rebinds after expose and scene restore');
  assert.equal(owner.stop(), true);
  assert.equal(cleared, 7, 'stop clears the refresh timer');
  assert.equal(listeners.has('pocketmonster:online-scene-ready'), false, 'stop removes scene listener');
  assert.equal(windowLike.POCKETMONSTER_MINIMAP_HUD, undefined, 'stop releases the global owner');
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

// ---------- Dock + runtime wiring ----------
const dockSource = fs.readFileSync(new URL('../unified-mmorpg-hud-v900.mjs', import.meta.url), 'utf8');
const ownerSource = fs.readFileSync(new URL('../persistent-minimap-owner-v900.mjs', import.meta.url), 'utf8');
const mobileCss = fs.readFileSync(new URL('../unified-minimap-mobile-v900.css', import.meta.url), 'utf8');
const entrySource = fs.readFileSync(new URL('../entry-preload-v900.mjs', import.meta.url), 'utf8');
assert.match(dockSource, /subscribeFeature\('minimap',\s*minimapAdapter\(\)\)/, 'Dock subscribes the minimap adapter when present');
assert.match(dockSource, /POCKETMONSTER_MINIMAP_HUD/, 'Dock discovers the minimap through the shared global');
assert.match(dockSource, /function renderMinimap/, 'Dock renders minimap projections');
assert.match(ownerSource, /POCKETMONSTER_WORLD_STATE/, 'persistent owner reads the authoritative parent pose');
assert.match(ownerSource, /PIRATE_FRUIT_ISLAND_CENTERS/, 'persistent owner uses real Pirate island geography');
assert.match(ownerSource, /createImageData\(MAP_RASTER_SIZE, MAP_RASTER_SIZE\)/, 'legacy 160px terrain raster is restored');
assert.match(ownerSource, /terrainHeightAt/, 'legacy height-based terrain coloring is restored');
assert.match(ownerSource, /PIRATE_FRUIT_MINIMAP_LOCAL_SCALE/, 'legacy local island scale is explicit');
assert.match(ownerSource, /PIRATE_FRUIT_MINIMAP_NEAR_PADDING/, 'legacy near/far switch padding is explicit');
assert.match(ownerSource, /pocketmonster:online-scene-ready/, 'persistent owner restores itself after scene HUD rebinding');
assert.match(mobileCss, /@media\s*\(max-height:420px\)/, 'short landscape screens have an explicit minimap override');
assert.match(mobileCss, /\.mmorpg-hud \.mmorpg-minimap\{display:block!important\}/, 'short landscape screens keep the rectangular minimap visible');
assert.match(mobileCss, /\.mmorpg-minimap-map-image/, 'map raster fills the new rectangular minimap');
assert.match(mobileCss, /\.mmorpg-minimap-marker\.static-poi\{display:none\}/, 'legacy raster POIs are not double-painted by DOM markers');
assert.match(entrySource, /installPersistentMinimapOwner/, 'V9 entry installs the persistent minimap owner');

console.log('V9 unified minimap projection: PASS');
