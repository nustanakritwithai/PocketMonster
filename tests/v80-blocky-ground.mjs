import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { pixelDiffRatio } from '../asset-presentation/four-side/apply.mjs';
import {
  GROUND_GRID,
  GROUND_REPEAT,
  GROUND_TILE,
  SKY_HEIGHT,
  SKY_WIDTH,
  hexToRgb,
  paintGroundGrid,
  paintSkyGradient,
  skyStopsFor,
} from '../asset-presentation/blocky-ground.mjs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const painterSrc = fs.readFileSync(new URL('../asset-presentation/blocky-ground.mjs', import.meta.url), 'utf8');

const check = spawnSync(process.execPath, ['--check', fileURLToPath(new URL('../asset-presentation/blocky-ground.mjs', import.meta.url))], { encoding: 'utf8' });
assert.equal(check.status, 0, check.stderr || 'blocky-ground syntax failed');

assert.equal(GROUND_TILE, 128);
assert.equal(SKY_WIDTH, 2);
assert.equal(SKY_HEIGHT, 128);
assert.equal(GROUND_REPEAT, 20);

assert.match(js, /function makeGroundTexture\(/, 'live runtime has makeGroundTexture');
assert.match(js, /function makeSkyTexture\(/, 'live runtime has makeSkyTexture');
assert.match(js, /function setZoneGround\(/, 'live runtime has setZoneGround');
assert.match(js, /setZoneGround\(zone\)/, 'switchZone swaps ground through setZoneGround');
assert.match(js, /tex\.repeat\.set\(20,\s*20\)/, 'ground tiles repeat 20x20 on the 90x90 plane');
assert.match(js, /RepeatWrapping/, 'ground wrap is RepeatWrapping');
assert.match(js, /color:0xffffff/, 'ground material is white so the map shows through');
assert.match(js, /paintGroundGrid\(/, 'game paints from the shared ground module');
assert.match(js, /paintSkyGradient\(/, 'game paints from the shared sky module');
assert.doesNotMatch(js, /scene\.background\.setHex/, 'background is a sky texture, not Color.setHex');
assert.doesNotMatch(painterSrc, /Math\.random\(/, 'grid noise is seeded, not Math.random');

function lumaAt(img, x, y) {
  const i = (y * img.width + x) * 4;
  return img.rgba[i] * 0.299 + img.rgba[i + 1] * 0.587 + img.rgba[i + 2] * 0.114;
}

function avgLuma(img) {
  let sum = 0;
  const n = img.width * img.height;
  for (let i = 0; i < img.rgba.length; i += 4) {
    sum += img.rgba[i] * 0.299 + img.rgba[i + 1] * 0.587 + img.rgba[i + 2] * 0.114;
  }
  return sum / n;
}

const hubGround = paintGroundGrid(0x62c96b, 'grass');
const meadowGround = paintGroundGrid(0x56d364, 'grass');
const caveGround = paintGroundGrid(0x57606f, 'cave');
const caveAsGrass = paintGroundGrid(0x57606f, 'grass');

assert.equal(hubGround.width, 128);
assert.equal(hubGround.height, 128);
assert.equal(hubGround.rgba.length, 128 * 128 * 4);

const cell = lumaAt(hubGround, 8, 8);
const fine = lumaAt(hubGround, GROUND_GRID, 8);
const coarse = lumaAt(hubGround, GROUND_GRID * 4, 8);
assert.ok(fine < cell - 4, '16px grid lines are darker than the tile fill');
assert.ok(coarse < fine - 2, '64px coarse lines are darker than the fine grid');

assert.ok(pixelDiffRatio(hubGround, meadowGround) > 0.5, 'hub and grassland grounds differ');
assert.ok(pixelDiffRatio(hubGround, caveGround) > 0.5, 'hub and cave grounds differ');
assert.ok(pixelDiffRatio(caveAsGrass, caveGround) > 0.002, 'cave speckles differ from grass marks at the same fill');

const sameA = paintGroundGrid(0x62c96b, 'grass');
assert.equal(pixelDiffRatio(hubGround, sameA), 0, 'seeded ground paint is deterministic');

const hubSky = paintSkyGradient(0x72c7ef);
const meadowSky = paintSkyGradient(0x68d2f5);
const caveSky = paintSkyGradient(0x334155);
assert.equal(hubSky.width, 2);
assert.equal(hubSky.height, 128);
assert.ok(Math.abs(lumaAt(hubSky, 0, 0) - lumaAt(hubSky, 0, 127)) > 8, 'sky top is not the same as sky bottom');
assert.ok(avgLuma(caveSky) < avgLuma(hubSky) - 40, 'cave sky is darker than ranch sky');
assert.ok(pixelDiffRatio(hubSky, meadowSky) > 0.5, 'hub and grassland skies differ');

const [tr, tg, tb] = hexToRgb(skyStopsFor(0x72c7ef).top);
assert.equal(hubSky.rgba[0], tr);
assert.equal(hubSky.rgba[1], tg);
assert.equal(hubSky.rgba[2], tb);
const [br, bg, bb] = hexToRgb(skyStopsFor(0x72c7ef).bottom);
const bi = (127 * 2) * 4;
assert.equal(hubSky.rgba[bi], br);
assert.equal(hubSky.rgba[bi + 1], bg);
assert.equal(hubSky.rgba[bi + 2], bb);

const [ctr] = hexToRgb(skyStopsFor(0x334155).top);
assert.equal(caveSky.rgba[0], ctr);

console.log('V8.0 blocky ground + sky: PASS');
