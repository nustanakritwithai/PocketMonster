import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { paintGroundGrid } from '../asset-presentation/blocky-ground.mjs';
import {
  PIRATE_FRUIT_GROUND_COLOR,
  PIRATE_FRUIT_GROUND_TYPE,
  PIRATE_FRUIT_PORTALS,
  PIRATE_FRUIT_SCENE_CHARACTERS,
  PIRATE_FRUIT_SCENE_MONSTERS,
  PIRATE_FRUIT_ZONE,
  buildPirateFruitWorld,
  makePirateFruitGroundImage,
  makePirateFruitSkyImage,
} from '../asset-presentation/scenes/pirate-fruit-world.mjs';

const sceneSrc = fs.readFileSync(new URL('../asset-presentation/scenes/pirate-fruit-world.mjs', import.meta.url), 'utf8');
const boot = fs.readFileSync(new URL('../boot-pirate-fruit-v900.mjs', import.meta.url), 'utf8');
const source = JSON.parse(fs.readFileSync(new URL('../pirate-fruit-offline/SOURCE.json', import.meta.url), 'utf8'));

const check = spawnSync(process.execPath, ['--check', fileURLToPath(new URL('../asset-presentation/scenes/pirate-fruit-world.mjs', import.meta.url))], { encoding: 'utf8' });
assert.equal(check.status, 0, check.stderr || 'pirate-fruit scene syntax failed');

assert.equal(PIRATE_FRUIT_ZONE, 'pirate-fruit');
assert.doesNotMatch(sceneSrc, /from ['"]three['"]/, 'scene module must not import the three npm package');
assert.doesNotMatch(sceneSrc, /mergeGeometries|CapsuleGeometry|SphereGeometry|TorusGeometry/, 'scene stays on Pocket boxes');
assert.match(sceneSrc, /paintGroundGrid/, 'scene paints Pocket blocky ground');
assert.match(sceneSrc, /paintSkyGradient/, 'scene paints Pocket sky');
assert.equal(fs.existsSync(new URL('../world-pirate-fruit-v900.mjs', import.meta.url)), false, 'deleted island stage filename stays gone');
assert.doesNotMatch(boot, /ZONES|WARP_ROUTES/, 'scene boot does not add a hunt stage catalog');

assert.equal(PIRATE_FRUIT_PORTALS.pocketMonster.x, source.integrations.pocketMonsterPortal.position.x);
assert.equal(PIRATE_FRUIT_PORTALS.pocketMonster.z, source.integrations.pocketMonsterPortal.position.z);
assert.equal(PIRATE_FRUIT_PORTALS.livingWorld.x, source.integrations.livingWorldPortal.position.x);
assert.equal(PIRATE_FRUIT_PORTALS.livingWorld.z, source.integrations.livingWorldPortal.position.z);
assert.ok(PIRATE_FRUIT_SCENE_CHARACTERS.some(npc => npc.role === 'keeper' && npc.id === 'character.human.blocky-bighead.v1'));
assert.ok(PIRATE_FRUIT_SCENE_MONSTERS.every(monster => monster.id.includes('.bighead.v1')));

const ground = makePirateFruitGroundImage();
const rocky = paintGroundGrid(PIRATE_FRUIT_GROUND_COLOR, 'rocky');
assert.equal(ground.width, 128);
assert.ok(ground.rgba.some((value, i) => value !== rocky.rgba[i]), 'pirate ground profile is not the rocky fallback');
assert.equal(makePirateFruitSkyImage().height, 128);
assert.equal(PIRATE_FRUIT_GROUND_TYPE, 'pirate');

function vec() {
  return {
    x: 0, y: 0, z: 0,
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; },
  };
}
class Node {
  constructor() {
    this.children = [];
    this.position = vec();
    this.rotation = vec();
    this.userData = {};
    this.name = '';
  }
  add(child) { this.children.push(child); return this; }
}
const THREE = {
  Group: Node,
  Mesh: class extends Node {
    constructor(geo, mat) { super(); this.geometry = geo; this.material = mat; this.castShadow = false; this.receiveShadow = false; }
  },
  PlaneGeometry: class { constructor(w, h) { this.type = 'plane'; this.w = w; this.h = h; } },
  MeshStandardMaterial: class { constructor(opts) { Object.assign(this, opts); } },
};
const built = buildPirateFruitWorld({
  THREE,
  box: (w, h, d) => ({ type: 'box', w, h, d }),
  material: color => ({ color }),
});
assert.equal(built.root.userData.zone, 'pirate-fruit');
assert.equal(built.root.userData.presentationOnly, true);
assert.equal(built.root.userData.combatAuthority, false);
assert.equal(built.portals.length, 2);
assert.deepEqual(built.portals.map(portal => portal.userData.source).sort(), ['pirate-fruit-living-portal', 'pirate-fruit-portal']);

console.log('V9.0 pirate-fruit blocky scene: PASS');
