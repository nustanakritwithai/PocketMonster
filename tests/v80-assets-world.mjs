// V8.0 assets — zone-specific world decorations.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');

assert.match(js, /function populateWorld\(zone/, 'world decorations must rebuild per zone');
assert.match(js, /function makeStalagmite/, 'cave needs stalagmites');
assert.match(js, /function makeGrassTuft/, 'meadow needs grass tufts');
assert.match(js, /function makeFencePost/, 'ranch needs a fence');
assert.match(js, /function makeFlower/, 'ranch/meadow need flowers');
assert.match(js, /populateWorld\(zone\)/, 'switchZone must swap decorations');
assert.match(js, /worldDecorations/, 'decoration group must be named for disposal');
assert.match(js, /else if\(zone==='cave'\)/, 'Echo Cave has its own prop set');
assert.match(js, /else if\(zone==='grassland'\)/, 'Green Meadow has its own prop set');

console.log('V8.0 assets world decorations: PASS');
