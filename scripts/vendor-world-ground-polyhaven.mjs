#!/usr/bin/env node
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACK_PATH = path.join(ROOT, 'assets/world-ground/material-pack-v1.json');
const API = 'https://api.polyhaven.com/files';
const USER_AGENT = 'PocketMonster-WorldGroundVendor/1.0 (nustanakritwithai/PocketMonster)';
const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const resolutionArg = [...args].find(value => value.startsWith('--resolution='));
const requestedResolution = resolutionArg?.slice('--resolution='.length) || '1k';

function leaves(value, trail = [], output = []) {
  if (!value || typeof value !== 'object') return output;
  if (typeof value.url === 'string') {
    output.push({ trail, key: trail.join('/').toLowerCase(), file: value });
    return output;
  }
  for (const [key, nested] of Object.entries(value)) leaves(nested, [...trail, key], output);
  return output;
}

function scoreFile(candidate, slot, resolution) {
  const key = candidate.key;
  const url = candidate.file.url.toLowerCase();
  const isJpeg = /\.jpe?g(?:\?|$)/.test(url) || /(^|\/)jpe?g($|\/)/.test(key);
  if (!isJpeg) return -Infinity;

  const patterns = {
    albedo: [/diff/, /albedo/, /base.?color/, /color/],
    normal: [/nor_gl/, /normal.?gl/, /normal/],
    roughness: [/rough/],
    ao: [/(^|\/)ao($|\/)/, /ambient.?occlusion/, /occlusion/],
  }[slot];
  if (!patterns) return -Infinity;
  if (!patterns.some(pattern => pattern.test(key))) return -Infinity;
  if (slot === 'normal' && /(nor_dx|directx|normal.?dx)/.test(key)) return -Infinity;
  if (slot === 'albedo' && /(rough|normal|nor_|disp|height|ao|occlusion)/.test(key)) return -Infinity;

  let score = 10;
  if (key.includes(resolution.toLowerCase())) score += 30;
  if (url.includes(`_${resolution.toLowerCase()}`)) score += 10;
  if (/diff|albedo|base.?color/.test(key) && slot === 'albedo') score += 8;
  if (/nor_gl|normal.?gl/.test(key) && slot === 'normal') score += 12;
  if (/rough/.test(key) && slot === 'roughness') score += 8;
  if (/(^|\/)ao($|\/)|ambient.?occlusion/.test(key) && slot === 'ao') score += 8;
  return score;
}

function selectFile(files, slot, resolution) {
  const candidates = leaves(files)
    .map(candidate => ({ candidate, score: scoreFile(candidate, slot, resolution) }))
    .filter(entry => Number.isFinite(entry.score))
    .sort((a, b) => b.score - a.score);
  if (!candidates.length) throw new Error(`No ${resolution} JPEG ${slot} map found`);
  return candidates[0].candidate.file;
}

async function exists(file) {
  try { await stat(file); return true; } catch { return false; }
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

async function download(url, target) {
  if (!force && await exists(target)) return { reused: true };
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const data = new Uint8Array(await response.arrayBuffer());
  if (data.byteLength < 1024) throw new Error(`${url}: suspiciously small texture (${data.byteLength} bytes)`);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
  return { reused: false, bytes: data.byteLength };
}

const pack = JSON.parse(await readFile(PACK_PATH, 'utf8'));
if (pack.schema !== 'pocketmonster.world-ground-material-pack.v1') throw new Error('Unexpected material pack schema');

const uniqueAssets = [...new Set(Object.values(pack.materials).map(entry => entry.sourceAsset))];
const fileTrees = new Map();
for (const asset of uniqueAssets) {
  process.stdout.write(`Poly Haven ${asset}: metadata... `);
  fileTrees.set(asset, await fetchJson(`${API}/${encodeURIComponent(asset)}`));
  console.log('OK');
}

const selectedByAsset = new Map();
for (const asset of uniqueAssets) {
  const tree = fileTrees.get(asset);
  selectedByAsset.set(asset, Object.fromEntries(
    ['albedo', 'normal', 'roughness', 'ao'].map(slot => [slot, selectFile(tree, slot, requestedResolution)]),
  ));
}

let downloaded = 0;
let reused = 0;
for (const [materialId, material] of Object.entries(pack.materials)) {
  const selected = selectedByAsset.get(material.sourceAsset);
  for (const slot of ['albedo', 'normal', 'roughness', 'ao']) {
    const relative = material[slot];
    if (!relative) continue;
    const target = path.resolve(path.dirname(PACK_PATH), relative);
    const result = await download(selected[slot].url, target);
    if (result.reused) reused += 1;
    else downloaded += 1;
    console.log(`${materialId}.${slot}: ${result.reused ? 'reuse' : `${result.bytes} bytes`}`);
  }
}

pack.installed = true;
pack.resolution = requestedResolution;
pack.vendoredAt = new Date().toISOString();
pack.runtimeApiDependency = false;
pack.vendor = {
  name: 'Poly Haven',
  api: 'https://api.polyhaven.com',
  policy: 'development-time download only; game runtime uses vendored local files',
  userAgent: USER_AGENT,
};
await writeFile(PACK_PATH, `${JSON.stringify(pack, null, 2)}\n`, 'utf8');
console.log(`World ground material pack ready: ${downloaded} downloaded, ${reused} reused.`);
