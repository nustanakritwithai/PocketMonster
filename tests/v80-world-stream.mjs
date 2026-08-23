import assert from 'node:assert/strict';
import fs from 'node:fs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const open = source.indexOf('{', start);
  assert.ok(open >= 0, `${name} must have a body`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`${name} must have a balanced body`);
}

assert.match(js, /const WORLD_STREAM=Object\.freeze\(\{/, 'world stream radii must be named');
assert.match(js, /loadRadius:22/, 'nearby props attach inside 22m');
assert.match(js, /unloadRadius:32/, 'far props detach past 32m hysteresis');
assert.match(js, /zoneAttachBudget:12/, 'zone entry attaches a small nearby budget instead of the whole neighborhood at once');
assert.match(functionSource(js, 'populateWorld'), /decoStreaming=true/, 'zone rebuild queues far decorations');
assert.match(functionSource(js, 'populateWorld'), /decoStreaming=false/, 'zone rebuild must stop queuing after props are built');
assert.match(functionSource(js, 'addDeco'), /decoStreaming&&!isKeepAliveDeco\(mesh\)/, 'only streamable props wait in the attach queue');
assert.match(functionSource(js, 'addDeco'), /decoAttachQueue\.push\(mesh\)/, 'far decorations stay off the live scene graph');
assert.match(functionSource(js, 'isKeepAliveDeco'), /warpRouteId/, 'warp beacons stay attached');
assert.match(functionSource(js, 'isKeepAliveDeco'), /stageMarker/, 'stage markers stay attached');
assert.match(functionSource(js, 'clearDecorations'), /disposeObject3D\(decoAttachQueue/, 'zone clear must dispose queued props, not leak GPU objects');
assert.match(functionSource(js, 'switchZone'), /player\.position\.set\(\.\.\.start\);\s*flushNearbyDecos\(player\.position,WORLD_STREAM\.zoneAttachBudget\)/, 'zone entry attaches the neighborhood after the player lands');
assert.match(functionSource(js, 'loop'), /updateWorldStream\(\)/, 'the live loop streams the neighborhood each frame');
assert.match(functionSource(js, 'loop'), /STREAM_HITCH\.armed/, 'the live loop records hitch samples');
assert.match(functionSource(js, 'switchZone'), /lastSwitchZoneMs=performance\.now\(\)-switchStarted/, 'zone switches record main-thread hitch time');
assert.match(functionSource(js, 'flushNearbyDecos'), /bestD=loadR2/, 'zone flush attaches the nearest queued props first');
assert.match(js, /window\.MLRPG_WORLD_STREAM=/, 'live diagnostics expose attached vs queued decoration counts');
assert.match(js, /worldStream\.resetHitch=resetStreamHitch/, 'live hitch samples can be reset between test phases');
assert.match(functionSource(js, 'spawnZone'), /spawnRecords\(cfg\.spawn\)/, 'wild spawn stays immediate on zone load');
assert.doesNotMatch(functionSource(js, 'updateWorldStream'), /disposeObject3D|removeAndDispose/, 'detach must keep shared geometries for reuse');

function fakeMesh(x, z, extra = {}) {
  return {
    position: { x, y: 0, z },
    userData: { ...extra },
    parent: null,
    visible: true,
    isMesh: true,
    traverse(visitor) { visitor(this); },
  };
}

function createHarness() {
  const decorations = {
    children: [],
    add(mesh) {
      if (this.children.includes(mesh)) return;
      mesh.parent = this;
      this.children.push(mesh);
    },
    remove(mesh) {
      const index = this.children.indexOf(mesh);
      if (index >= 0) this.children.splice(index, 1);
      mesh.parent = null;
    },
  };
  const decoAttachQueue = [];
  const player = { position: { x: 0, y: 0, z: 0 } };
  const wilds = [];
  const disposed = [];
  const WORLD_STREAM = Object.freeze({
    loadRadius: 22,
    unloadRadius: 32,
    attachPerFrame: 5,
    zoneAttachBudget: 48,
    wildHideRadius: 36,
    wildShowRadius: 26,
  });
  const api = Function(
    'WORLD_STREAM',
    'decorations',
    'decoAttachQueue',
    'player',
    'wilds',
    'disposeObject3D',
    'removeAndDispose',
    `'use strict';
     let decoStreaming=false;
     ${functionSource(js, 'isKeepAliveDeco')}
     ${functionSource(js, 'decoDistanceSq')}
     ${functionSource(js, 'addDeco')}
     ${functionSource(js, 'flushNearbyDecos')}
     ${functionSource(js, 'clearDecorations')}
     ${functionSource(js, 'updateWorldStream')}
     return {
       addDeco,
       flushNearbyDecos,
       clearDecorations,
       updateWorldStream,
       setStreaming(value){ decoStreaming=value; },
     };`,
  )(
    WORLD_STREAM,
    decorations,
    decoAttachQueue,
    player,
    wilds,
    object => { disposed.push(object); },
    (group, object) => {
      group.remove(object);
      disposed.push(object);
    },
  );
  return { decorations, decoAttachQueue, player, wilds, disposed, ...api };
}

const harness = createHarness();
harness.setStreaming(true);
const nearby = fakeMesh(4, 2);
const far = fakeMesh(40, 0);
const warp = fakeMesh(50, 0, { warpRouteId: 'grass-to-hub' });
const marker = fakeMesh(-40, 8, { stageMarker: true });
harness.addDeco(nearby);
harness.addDeco(far);
harness.addDeco(warp);
harness.addDeco(marker);
assert.deepEqual(harness.decorations.children.map(mesh => mesh.userData.warpRouteId || mesh.userData.stageMarker || 'prop'), ['grass-to-hub', true], 'warp and stage markers attach during populate');
assert.equal(harness.decoAttachQueue.includes(nearby), true, 'nearby props wait until the player origin is known');
assert.equal(harness.decoAttachQueue.includes(far), true, 'far props stay queued instead of joining the live scene');
assert.equal(harness.flushNearbyDecos(harness.player.position, 48), 1, 'zone flush attaches only the neighborhood');
assert.equal(harness.decorations.children.includes(nearby), true);
assert.equal(harness.decoAttachQueue.includes(far), true);
assert.equal(harness.disposed.length, 0, 'streaming must not dispose reused decoration resources');

harness.player.position.x = 50;
harness.updateWorldStream();
assert.equal(harness.decorations.children.includes(nearby), false, 'props beyond unload radius leave the live scene');
assert.equal(harness.decoAttachQueue.includes(nearby), true, 'detached props are reused from the queue');
assert.equal(harness.disposed.length, 0, 'walking away must not dispose shared decoration geometry');
assert.equal(harness.decorations.children.includes(warp), true, 'warp beacons stay visible across the map');
assert.equal(harness.decorations.children.includes(marker), true, 'stage markers stay visible across the map');

harness.player.position.x = 0;
for (let step = 0; step < 8 && harness.decoAttachQueue.includes(nearby); step += 1) harness.updateWorldStream();
assert.equal(harness.decorations.children.includes(nearby), true, 'walking back reattaches the neighborhood');
assert.equal(harness.decoAttachQueue.includes(far), true, 'still-far props remain off the live scene');

const budget = createHarness();
budget.setStreaming(true);
const clustered = Array.from({ length: 6 }, (_, index) => fakeMesh(index, 0));
for (const mesh of clustered) budget.addDeco(mesh);
assert.equal(budget.flushNearbyDecos(budget.player.position, 5), 5, 'per-frame attach stays budgeted');
assert.equal(budget.decoAttachQueue.length, 1, 'overflow props wait for a later frame');

const nearestFirst = createHarness();
nearestFirst.setStreaming(true);
const closer = fakeMesh(2, 0);
const fartherInRange = fakeMesh(18, 0);
nearestFirst.addDeco(fartherInRange);
nearestFirst.addDeco(closer);
assert.equal(nearestFirst.flushNearbyDecos(nearestFirst.player.position, 1), 1);
assert.equal(nearestFirst.decorations.children[0], closer, 'the closest queued prop attaches first');
assert.equal(nearestFirst.decoAttachQueue.includes(fartherInRange), true, 'farther in-range props wait for leftover budget');

const farWild = { mesh: fakeMesh(50, 0), engaged: false, capturing: false };
const nearWild = { mesh: fakeMesh(4, 0), engaged: false, capturing: false };
const fightingWild = { mesh: fakeMesh(50, 0), engaged: true, capturing: false };
harness.wilds.push(farWild, nearWild, fightingWild);
harness.updateWorldStream();
assert.equal(farWild.mesh.visible, false, 'far wild meshes skip the GPU until the player walks closer');
assert.equal(nearWild.mesh.visible, true, 'nearby wilds stay visible');
assert.equal(fightingWild.mesh.visible, true, 'engaged wilds stay visible even when far');

harness.clearDecorations();
assert.equal(harness.decorations.children.length, 0);
assert.equal(harness.decoAttachQueue.length, 0);
assert.ok(harness.disposed.length >= 3, 'zone clear disposes both attached and queued decorations');

console.log('V8.0 world stream nearby decorations: PASS');
