import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePngRgba } from '../asset-presentation/four-side/png-node.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIZE = 256;
const CELL = 8;
const GRID = SIZE / CELL;

const C = {
  skinP: '#FFC4A3',
  skinPShadow: '#E39B78',
  skinPDeep: '#D98968',
  skinK: '#F0C8A0',
  skinKShadow: '#D9A57C',
  hair: '#F97316',
  hairDark: '#C2410C',
  hairDeep: '#9A3412',
  hairLight: '#FB923C',
  eye: '#FFF7ED',
  pupil: '#1F2937',
  shine: '#FFFFFF',
  mouth: '#9A3412',
  blush: '#F5A38C',
  shirt: '#20324A',
  shirtLight: '#2C4668',
  shirtDark: '#152234',
  bag: '#7C3AED',
  bagDark: '#5B21B6',
  bagLight: '#8B5CF6',
  hat: '#FACC15',
  hatDark: '#CA8A04',
  hatLight: '#FDE047',
  keeperShirt: '#15803D',
  keeperShirtDark: '#166534',
  keeperShirtLight: '#22A34A',
  apron: '#F8FAFC',
  apronShadow: '#E2E8F0',
  apronStrap: '#CBD5E1',
  pants: '#0F172A',
  keeperPants: '#3F3F46',
};

function hexToRgb(hex) {
  const raw = hex.replace('#', '');
  return [
    parseInt(raw.slice(0, 2), 16),
    parseInt(raw.slice(2, 4), 16),
    parseInt(raw.slice(4, 6), 16),
  ];
}

function makeCanvas() {
  return { width: SIZE, height: SIZE, rgba: new Uint8Array(SIZE * SIZE * 4) };
}

function setPixel(canvas, x, y, hex) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const [r, g, b] = hexToRgb(hex);
  const i = (y * SIZE + x) * 4;
  canvas.rgba[i] = r;
  canvas.rgba[i + 1] = g;
  canvas.rgba[i + 2] = b;
  canvas.rgba[i + 3] = 255;
}

function fill(canvas, hex) {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) setPixel(canvas, x, y, hex);
  }
}

function cell(canvas, gx, gy, gw, gh, hex) {
  for (let y = 0; y < gh * CELL; y++) {
    for (let x = 0; x < gw * CELL; x++) {
      setPixel(canvas, gx * CELL + x, gy * CELL + y, hex);
    }
  }
}

function plot(canvas, cells, ox = 0, oy = 0) {
  for (const [gx, gy, gw, gh, hex] of cells) {
    cell(canvas, gx + ox, gy + oy, gw, gh, hex);
  }
}

function eyeBlock(canvas, gx, gy, { brow, wide = 7 } = {}) {
  cell(canvas, gx, gy, wide, 7, C.eye);
  cell(canvas, gx + 1, gy + 1, wide - 2, 5, C.pupil);
  cell(canvas, gx + wide - 2, gy + 1, 2, 2, C.shine);
  if (brow) cell(canvas, gx, gy - 2, wide, 2, brow);
}

function playerHeadFront() {
  const c = makeCanvas();
  fill(c, C.skinP);
  plot(c, [
    [0, 0, 32, 11, C.hair],
    [0, 0, 32, 3, C.hairDark],
    [2, 2, 6, 2, C.hairLight],
    [18, 1, 8, 2, C.hairLight],
    [8, 4, 3, 7, C.hairDark],
    [22, 5, 2, 5, C.hairDeep],
    [0, 10, 4, 3, C.hair],
    [4, 10, 10, 4, C.hair],
    [18, 10, 10, 4, C.hair],
    [28, 10, 4, 3, C.hair],
    [6, 13, 6, 2, C.hairDark],
    [20, 13, 5, 2, C.hair],
    [0, 28, 32, 4, C.skinPShadow],
    [12, 18, 8, 3, C.skinPShadow],
    [3, 22, 4, 3, C.blush],
    [25, 22, 4, 3, C.blush],
    [13, 20, 6, 3, C.skinPDeep],
    [11, 25, 10, 3, C.mouth],
    [13, 27, 6, 1, C.hairDeep],
  ]);
  eyeBlock(c, 4, 14, { brow: C.hairDark });
  eyeBlock(c, 21, 14, { brow: C.hairDark });
  return c;
}

function playerHeadRight() {
  const c = makeCanvas();
  fill(c, C.skinP);
  plot(c, [
    [0, 0, 32, 10, C.hair],
    [0, 0, 32, 3, C.hairDark],
    [18, 3, 14, 16, C.hair],
    [22, 6, 10, 18, C.hairDark],
    [26, 10, 6, 14, C.hairDeep],
    [0, 10, 7, 3, C.hair],
    [1, 12, 5, 2, C.hairDark],
    [14, 16, 5, 6, C.skinPShadow],
    [15, 17, 3, 4, C.skinPDeep],
    [16, 18, 2, 2, C.blush],
    [0, 28, 22, 4, C.skinPShadow],
    [3, 24, 7, 3, C.mouth],
  ]);
  eyeBlock(c, 2, 14, { brow: C.hair, wide: 6 });
  return c;
}

function playerHeadLeft() {
  const c = makeCanvas();
  fill(c, C.skinP);
  plot(c, [
    [0, 0, 32, 11, C.hair],
    [4, 1, 10, 3, C.hairLight],
    [20, 2, 4, 8, C.hairDark],
    [22, 8, 10, 15, C.hair],
    [25, 12, 7, 12, C.hairDark],
    [0, 11, 8, 2, C.hairLight],
    [12, 15, 4, 7, C.skinPShadow],
    [13, 17, 2, 4, C.skinPDeep],
    [0, 27, 24, 5, C.skinPShadow],
    [4, 25, 6, 2, C.mouth],
    [17, 21, 3, 3, C.blush],
  ]);
  eyeBlock(c, 3, 15, { brow: C.hairDeep, wide: 6 });
  return c;
}

function playerHeadBack() {
  const c = makeCanvas();
  fill(c, C.hair);
  plot(c, [
    [0, 0, 32, 6, C.hairDark],
    [4, 2, 8, 3, C.hairLight],
    [20, 3, 6, 2, C.hairLight],
    [6, 8, 5, 10, C.hairDark],
    [18, 10, 4, 8, C.hairDeep],
    [12, 6, 3, 4, C.hairLight],
    [24, 14, 6, 9, C.hairDark],
    [2, 18, 4, 6, C.hairDeep],
    [10, 20, 12, 4, C.hairDark],
    [0, 26, 32, 6, C.hairDeep],
  ]);
  return c;
}

function playerHeadTop() {
  const c = makeCanvas();
  fill(c, C.hair);
  plot(c, [
    [0, 0, 32, 8, C.hairDark],
    [14, 4, 4, 20, C.hairDeep],
    [6, 10, 6, 6, C.hairLight],
    [20, 12, 5, 5, C.hairLight],
    [0, 24, 32, 8, C.hairDark],
  ]);
  return c;
}

function playerHeadBottom() {
  const c = makeCanvas();
  fill(c, C.skinP);
  plot(c, [
    [8, 8, 16, 16, C.skinPShadow],
    [12, 12, 8, 8, C.skinPDeep],
  ]);
  return c;
}

function playerTorsoFront() {
  const c = makeCanvas();
  fill(c, C.shirt);
  plot(c, [
    [0, 0, 32, 6, C.shirtLight],
    [10, 0, 12, 8, C.shirtDark],
    [13, 2, 6, 5, C.skinP],
    [12, 6, 8, 2, C.shirtLight],
    [8, 12, 3, 3, C.shirtLight],
    [8, 18, 3, 3, C.shirtLight],
    [0, 26, 32, 6, C.shirtDark],
    [2, 4, 4, 20, C.shirtDark],
    [26, 4, 4, 20, C.shirtDark],
  ]);
  return c;
}

function playerTorsoRight() {
  const c = makeCanvas();
  fill(c, C.shirt);
  plot(c, [
    [0, 0, 32, 5, C.shirtLight],
    [20, 4, 8, 22, C.bag],
    [22, 6, 5, 18, C.bagDark],
    [0, 26, 32, 6, C.shirtDark],
    [4, 10, 3, 10, C.shirtLight],
  ]);
  return c;
}

function playerTorsoLeft() {
  const c = makeCanvas();
  fill(c, C.shirt);
  plot(c, [
    [0, 0, 32, 5, C.shirtLight],
    [22, 3, 6, 24, C.bagDark],
    [24, 6, 4, 18, C.bag],
    [6, 8, 4, 12, C.shirtDark],
    [0, 26, 32, 6, C.pants],
  ]);
  return c;
}

function playerTorsoBack() {
  const c = makeCanvas();
  fill(c, C.shirt);
  plot(c, [
    [0, 0, 32, 4, C.shirtDark],
    [6, 4, 20, 22, C.bag],
    [8, 6, 16, 18, C.bagLight],
    [10, 8, 12, 14, C.bagDark],
    [12, 10, 8, 4, C.bagLight],
    [4, 2, 4, 24, C.bagDark],
    [24, 2, 4, 24, C.bagDark],
    [0, 26, 32, 6, C.shirtDark],
  ]);
  return c;
}

function playerTorsoTop() {
  const c = makeCanvas();
  fill(c, C.shirt);
  plot(c, [[8, 10, 16, 12, C.shirtLight], [12, 14, 8, 6, C.skinPShadow]]);
  return c;
}

function playerTorsoBottom() {
  const c = makeCanvas();
  fill(c, C.pants);
  plot(c, [[10, 10, 12, 12, C.shirtDark]]);
  return c;
}

function keeperHeadFront() {
  const c = makeCanvas();
  fill(c, C.skinK);
  plot(c, [
    [0, 0, 32, 10, C.hat],
    [2, 1, 8, 3, C.hatLight],
    [20, 2, 6, 2, C.hatLight],
    [0, 9, 32, 3, C.hatDark],
    [2, 8, 28, 2, C.hat],
    [0, 27, 32, 5, C.skinKShadow],
    [13, 18, 6, 2, C.skinKShadow],
    [14, 19, 4, 2, C.skinK],
    [11, 24, 10, 3, C.mouth],
    [13, 26, 6, 1, C.hatDark],
    [3, 21, 4, 3, C.blush],
    [25, 21, 4, 3, C.blush],
  ]);
  eyeBlock(c, 4, 13, { brow: C.hatDark });
  eyeBlock(c, 21, 13, { brow: C.hatDark });
  return c;
}

function keeperHeadRight() {
  const c = makeCanvas();
  fill(c, C.skinK);
  plot(c, [
    [0, 0, 32, 11, C.hat],
    [0, 9, 32, 3, C.hatDark],
    [18, 2, 14, 14, C.hat],
    [22, 6, 10, 12, C.hatDark],
    [14, 16, 5, 6, C.skinKShadow],
    [0, 27, 24, 5, C.skinKShadow],
    [3, 24, 7, 3, C.mouth],
  ]);
  eyeBlock(c, 2, 14, { brow: C.hatDark, wide: 6 });
  return c;
}

function keeperHeadLeft() {
  const c = makeCanvas();
  fill(c, C.skinK);
  plot(c, [
    [0, 0, 32, 12, C.hat],
    [3, 2, 10, 3, C.hatLight],
    [20, 4, 12, 12, C.hat],
    [24, 8, 8, 10, C.hatDark],
    [0, 11, 32, 2, C.hatDark],
    [11, 16, 4, 6, C.skinKShadow],
    [0, 27, 26, 5, C.skinKShadow],
    [4, 24, 6, 2, C.mouth],
  ]);
  eyeBlock(c, 3, 14, { brow: C.hat, wide: 6 });
  return c;
}

function keeperHeadBack() {
  const c = makeCanvas();
  fill(c, C.hat);
  plot(c, [
    [0, 0, 32, 8, C.hatDark],
    [6, 3, 8, 4, C.hatLight],
    [18, 4, 6, 3, C.hatLight],
    [0, 14, 32, 4, C.hatDark],
    [8, 18, 16, 6, C.hatDark],
    [0, 24, 32, 8, C.hatDark],
  ]);
  return c;
}

function keeperHeadTop() {
  const c = makeCanvas();
  fill(c, C.hat);
  plot(c, [
    [4, 4, 24, 24, C.hatLight],
    [10, 10, 12, 12, C.hat],
    [14, 14, 4, 4, C.hatDark],
  ]);
  return c;
}

function keeperHeadBottom() {
  const c = makeCanvas();
  fill(c, C.skinK);
  plot(c, [[10, 10, 12, 12, C.skinKShadow]]);
  return c;
}

function keeperTorsoFront() {
  const c = makeCanvas();
  fill(c, C.keeperShirt);
  plot(c, [
    [0, 0, 32, 5, C.keeperShirtDark],
    [6, 4, 20, 24, C.apron],
    [8, 6, 16, 20, C.apronShadow],
    [10, 8, 12, 8, C.apron],
    [12, 18, 8, 5, C.apron],
    [4, 0, 4, 18, C.apronStrap],
    [24, 0, 4, 18, C.apronStrap],
    [0, 26, 32, 6, C.keeperShirtDark],
  ]);
  return c;
}

function keeperTorsoRight() {
  const c = makeCanvas();
  fill(c, C.keeperShirt);
  plot(c, [
    [0, 0, 8, 24, C.apron],
    [2, 2, 4, 18, C.apronStrap],
    [16, 6, 6, 14, C.keeperShirtLight],
    [0, 26, 32, 6, C.keeperPants],
  ]);
  return c;
}

function keeperTorsoLeft() {
  const c = makeCanvas();
  fill(c, C.keeperShirt);
  plot(c, [
    [0, 0, 7, 22, C.apronShadow],
    [18, 8, 5, 12, C.keeperShirtDark],
    [0, 26, 32, 6, C.keeperPants],
    [4, 4, 2, 16, C.apronStrap],
  ]);
  return c;
}

function keeperTorsoBack() {
  const c = makeCanvas();
  fill(c, C.keeperShirt);
  plot(c, [
    [0, 0, 32, 4, C.keeperShirtDark],
    [6, 6, 20, 16, C.keeperShirtLight],
    [10, 10, 12, 8, C.keeperShirtDark],
    [4, 0, 3, 20, C.apronStrap],
    [25, 0, 3, 20, C.apronStrap],
    [0, 26, 32, 6, C.keeperPants],
  ]);
  return c;
}

function keeperTorsoTop() {
  const c = makeCanvas();
  fill(c, C.keeperShirt);
  plot(c, [[10, 10, 12, 12, C.keeperShirtLight]]);
  return c;
}

function keeperTorsoBottom() {
  const c = makeCanvas();
  fill(c, C.keeperPants);
  return c;
}

const PACKS = {
  'player-orange': {
    'head.front': playerHeadFront,
    'head.right': playerHeadRight,
    'head.back': playerHeadBack,
    'head.left': playerHeadLeft,
    'head.top': playerHeadTop,
    'head.bottom': playerHeadBottom,
    'torso.front': playerTorsoFront,
    'torso.right': playerTorsoRight,
    'torso.back': playerTorsoBack,
    'torso.left': playerTorsoLeft,
    'torso.top': playerTorsoTop,
    'torso.bottom': playerTorsoBottom,
  },
  'keeper-green': {
    'head.front': keeperHeadFront,
    'head.right': keeperHeadRight,
    'head.back': keeperHeadBack,
    'head.left': keeperHeadLeft,
    'head.top': keeperHeadTop,
    'head.bottom': keeperHeadBottom,
    'torso.front': keeperTorsoFront,
    'torso.right': keeperTorsoRight,
    'torso.back': keeperTorsoBack,
    'torso.left': keeperTorsoLeft,
    'torso.top': keeperTorsoTop,
    'torso.bottom': keeperTorsoBottom,
  },
};

function writePack(name, faces) {
  const dir = path.join(ROOT, 'assets/appearances', name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [face, paint] of Object.entries(faces)) {
    const canvas = paint();
    if (canvas.width !== SIZE || canvas.height !== SIZE) {
      throw new Error(`${name}/${face} must be ${SIZE}x${SIZE}`);
    }
    const file = path.join(dir, `${face}.png`);
    fs.writeFileSync(file, encodePngRgba(canvas.width, canvas.height, canvas.rgba));
  }
}

writePack('player-orange', PACKS['player-orange']);
writePack('keeper-green', PACKS['keeper-green']);
console.log(`painted ${Object.keys(PACKS).length} packs, ${GRID}x${GRID} cells`);
