import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasLayout, boxFaceUvCorners } from '../asset-presentation/four-side/uv.mjs';
import { compileAppearance } from '../asset-presentation/four-side/atlas.mjs';
import {
  applyBoxAtlasUVs,
  compilePartAtlas,
  flipHorizontal,
  pixelDiffRatio,
} from '../asset-presentation/four-side/apply.mjs';
import { decodePngRgba } from '../asset-presentation/four-side/png-node.mjs';
import { loadCatalog, resetCatalog, getAppearance } from '../asset-presentation/catalog.mjs';
import { createAssetEngine } from '../asset-presentation/engine.mjs';
import { createBigheadProvider } from '../asset-presentation/providers/procedural-bighead.mjs';

const root = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
assert.doesNotMatch(js, /head\.front\.png/, 'gameplay source must not name appearance files');
assert.match(js, /playerVisual\.ready/, 'game waits for painted atlas before adding characters');

const FACES = ['front', 'right', 'back', 'left', 'top', 'bottom'];
const PARTS = ['head', 'torso'];
const PACKS = [
  { dir: 'player-orange', id: 'appearance.human.player-orange.v1' },
  { dir: 'keeper-green', id: 'appearance.human.keeper-green.v1' },
];

function readPng(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  return decodePngRgba(buf);
}

const images = {};
for (const pack of PACKS) {
  const packJson = JSON.parse(fs.readFileSync(path.join(root, 'assets/appearances', pack.dir, 'appearance.json'), 'utf8'));
  images[pack.id] = { pack: packJson, faces: {} };
  for (const part of PARTS) {
    images[pack.id].faces[part] = {};
    for (const face of FACES) {
      const rel = packJson.parts[part][face];
      assert.match(rel, /\.png$/, `${pack.dir} ${part}.${face} must be a PNG path`);
      assert.ok(fs.existsSync(path.join(root, rel)), `missing ${rel}`);
      const png = readPng(rel);
      assert.equal(png.width, 256);
      assert.equal(png.height, 256);
      images[pack.id].faces[part][face] = png;
    }
  }
}

const playerHead = images['appearance.human.player-orange.v1'].faces.head;
const keeperHead = images['appearance.human.keeper-green.v1'].faces.head;
assert.ok(pixelDiffRatio(playerHead.front, playerHead.back) > 0.35, 'player back is not a face copy');
assert.ok(pixelDiffRatio(keeperHead.front, keeperHead.back) > 0.35, 'keeper back is not a face copy');
assert.ok(pixelDiffRatio(playerHead.left, flipHorizontal(playerHead.right)) > 0.08, 'left is drawn, not a mirrored right');
assert.ok(pixelDiffRatio(keeperHead.left, flipHorizontal(keeperHead.right)) > 0.08, 'keeper left is not a mirrored right');
assert.ok(pixelDiffRatio(playerHead.front, keeperHead.front) > 0.2, 'player and keeper faces are distinct drawings');

function countHex(png, hex) {
  const raw = hex.replace('#', '');
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  let n = 0;
  for (let i = 0; i < png.rgba.length; i += 4) {
    if (png.rgba[i] === r && png.rgba[i + 1] === g && png.rgba[i + 2] === b) n += 1;
  }
  return n;
}
const eyeWhite = '#FFF7ED';
assert.ok(countHex(playerHead.front, eyeWhite) > 80, 'front face keeps painted eyes');
assert.equal(countHex(playerHead.right, eyeWhite), 0, 'player right profile has no eye white');
assert.equal(countHex(playerHead.left, eyeWhite), 0, 'player left profile has no eye white');
assert.equal(countHex(keeperHead.right, eyeWhite), 0, 'keeper right profile has no eye white');
assert.equal(countHex(keeperHead.left, eyeWhite), 0, 'keeper left profile has no eye white');

resetCatalog();
loadCatalog(JSON.parse(fs.readFileSync(new URL('../assets/catalog/humanoid-core.json', import.meta.url), 'utf8')));
const catalogPlayer = getAppearance('appearance.human.player-orange.v1');
assert.equal(catalogPlayer.parts.head.front, images['appearance.human.player-orange.v1'].pack.parts.head.front);

const layout = atlasLayout();
assert.equal(layout.atlas, 1024);
assert.ok(layout.faces.bottom.pixel.y + layout.tile <= layout.atlas);
assert.throws(() => atlasLayout({ atlas: 512 }), /too small/);

const compiled = compileAppearance(catalogPlayer);
assert.equal(compiled.materialCount, 1);
assert.equal(compileAppearance(catalogPlayer).contentHash, compiled.contentHash);

const atlas = await compilePartAtlas(catalogPlayer.parts.head, layout, source => readPng(source));
assert.equal(atlas.width, 1024);
const frontPx = playerHead.front.rgba;
const atlasFront = ((layout.faces.front.pixel.y + 32) * 1024 + (layout.faces.front.pixel.x + 32)) * 4;
assert.equal(atlas.rgba[atlasFront], frontPx[(32 * 256 + 32) * 4]);

const uv = { array: new Float32Array(48), needsUpdate: false };
applyBoxAtlasUVs({ attributes: { uv } }, layout);
const rightCorners = boxFaceUvCorners('right', layout);
assert.equal(uv.array[0], rightCorners[0][0]);
assert.equal(uv.array[40], boxFaceUvCorners('front', layout)[0][0]);

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
  box: (w, h, d) => ({ type: 'box', w, h, d, attributes: { uv: { array: new Float32Array(48), needsUpdate: false } } }),
  cylinder: () => ({ type: 'cylinder' }),
  material: color => ({ color }),
  loadFace: source => readPng(source),
}));
const player = engine.spawn('character.human.blocky-bighead.v1', { role: 'player', appearanceId: 'appearance.human.player-orange.v1' });
await player.ready;
assert.equal(player.appearance().materialCount, 1);
assert.equal(player.root.userData.appearanceId, 'appearance.human.player-orange.v1');

console.log('V8.0 PNG four-side drawings: PASS');
