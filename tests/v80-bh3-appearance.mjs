import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileLabAppearance } from '../asset-lab/compiler.mjs';
import { loadCatalog, resetCatalog, upsertAppearance, getAppearance } from '../asset-presentation/catalog.mjs';
import { createAssetEngine } from '../asset-presentation/engine.mjs';
import { createBigheadProvider } from '../asset-presentation/providers/procedural-bighead.mjs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
assert.doesNotMatch(js, /head\.front\.png/, 'gameplay source must not name appearance files');

const playerPack = JSON.parse(fs.readFileSync(new URL('../assets/appearances/player-orange/appearance.json', import.meta.url), 'utf8'));
const keeperPack = JSON.parse(fs.readFileSync(new URL('../assets/appearances/keeper-green/appearance.json', import.meta.url), 'utf8'));
assert.equal(playerPack.style, 'four-side-block-v1');
assert.equal(keeperPack.parts.head.back, 'assets/appearances/keeper-green/head.back.png');

resetCatalog();
loadCatalog(JSON.parse(fs.readFileSync(new URL('../assets/catalog/humanoid-core.json', import.meta.url), 'utf8')));
upsertAppearance(playerPack);
assert.equal(getAppearance('appearance.human.player-orange.v1').parts.head.front, 'assets/appearances/player-orange/head.front.png');

function vec() {
  return { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
}
class Node {
  constructor() { this.children = []; this.position = vec(); this.rotation = vec(); this.userData = {}; this.parent = null; }
  add(child) { this.children.push(child); child.parent = this; }
}
const THREE = { Group: Node, Mesh: class extends Node { constructor(g, m) { super(); this.geometry = g; this.material = m; } } };
const engine = createAssetEngine({ THREE });
engine.registerProvider('procedural', createBigheadProvider({
  THREE,
  box: (w, h, d) => ({ type: 'box', w, h, d }),
  cylinder: () => ({ type: 'cylinder' }),
  material: color => ({ color }),
}));
const player = engine.spawn('character.human.blocky-bighead.v1', { role: 'player', appearanceId: 'appearance.human.player-orange.v1' });
const first = player.appearance().contentHash;
const alt = compileLabAppearance({ id: 'appearance.human.player-orange.v1', mode: 'four', front: '#FFFFFF', right: '#FFC4A3', back: '#F97316', left: '#FFC4A3' });
upsertAppearance({ ...playerPack, parts: { head: { ...playerPack.parts.head, front: '#FFFFFF' } } });
player.setAppearance('appearance.human.player-orange.v1');
assert.notEqual(player.appearance().contentHash, first);
assert.equal(player.appearance().materialCount, 1);
assert.notEqual(alt.contentHash, first);

console.log('V8.0 BH3 appearance pack: PASS');
