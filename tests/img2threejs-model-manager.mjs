import assert from 'node:assert/strict';
import {
  getImg2ThreeJsModel,
  listImg2ThreeJsModels,
  prewarmImg2ThreeJsModel,
  registerImg2ThreeJsModule,
  resetImg2ThreeJsRegistry,
} from '../asset-presentation/img2threejs-registry.mjs';
import { createImg2ThreeJsProvider } from '../asset-presentation/providers/img2threejs.mjs';

class Group {
  constructor() { this.children = []; this.userData = {}; this.position = { x: 0, y: 0, z: 0 }; this.parent = null; this.animations = []; }
  add(child) { child.parent = this; this.children.push(child); }
  remove(child) { this.children = this.children.filter(item => item !== child); child.parent = null; }
  traverse(fn) { fn(this); for (const child of this.children) child.traverse ? child.traverse(fn) : fn(child); }
  getObjectByName(name) { let found = null; this.traverse(node => { if (!found && node.name === name) found = node; }); return found; }
}
class Box3 {
  constructor() { this.min = { y: 0 }; this.max = { y: 1.8 }; }
  setFromObject() { return this; }
}
const THREE = { Group, Box3 };

resetImg2ThreeJsRegistry();
let warmed = 0;
let played = null;
let ticks = 0;
const actions = [
  { id: 'idle-gesture', label: 'Idle', loop: true },
  { id: 'walk-forward', label: 'Walk', loop: false },
  { id: 'strike-short', label: 'Strike', loop: false },
];
const module = {
  createTestModel() {
    const root = new Group();
    root.animations = actions.map(action => ({ name: action.id }));
    root.userData.sculptRuntime = {
      animationController: {
        actions,
        play(name) { played = name; },
        stop() { played = 'stop'; },
        advance() { ticks += 100; },
      },
      sockets: {},
      strikeVfx: { setElement(value) { root.userData.vfx = value; } },
    };
    root.userData.tick = () => { ticks += 1; };
    return root;
  },
  async prewarmTest() { warmed += 1; },
};

const record = registerImg2ThreeJsModule('character.test', module, {
  buildExport: 'createTestModel',
  prewarmExport: 'prewarmTest',
  animationMap: { skill: 'strike-short' },
});
assert.equal(record.prewarmState, 'cold');
await Promise.all([prewarmImg2ThreeJsModel('character.test'), prewarmImg2ThreeJsModel('character.test')]);
assert.equal(warmed, 1, 'prewarm must dedupe concurrent calls');
assert.equal(getImg2ThreeJsModel('character.test').prewarmState, 'ready');
assert.equal(listImg2ThreeJsModels().length, 1);

const provider = createImg2ThreeJsProvider({ THREE });
const handle = provider({
  request: { quality: 'medium' },
  def: {
    id: 'character.preview',
    modelId: 'character.test',
    animationMap: { run: 'walk-forward' },
    metrics: { height: 1.8 },
  },
});
assert.equal(handle.modelId, 'character.test');
handle.play('walk');
assert.equal(played, 'walk-forward');
handle.play('skill');
assert.equal(played, 'strike-short');
handle.play('run');
assert.equal(played, 'walk-forward');
handle.update(1 / 60);
assert.equal(ticks, 1, 'root tick should be preferred over controller.advance');
handle.setAppearance({ vfxElement: 'fire' });
assert.equal(handle.root.userData.vfx, 'fire');
assert.deepEqual(handle.bounds(), { minY: 0, maxY: 1.8 });
handle.dispose();
assert.equal(handle.disposed, true);

console.log('img2threejs model manager adapter tests: ok');
