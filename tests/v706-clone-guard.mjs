import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';
assert.ok(js.includes('function safeVec3('),'safe vector guard missing');
assert.ok(js.includes('w.dir=ensureDirection(w.dir||w.wanderDir)'),'wild direction init guard missing');
assert.ok(js.includes("if(!p?.mesh||!p.start||!p.end)"),'projectile vector guard missing');
assert.match(js,/if\(!pos\)return;\r?\n  const cfg=typeFx\(type\),base=safeVec3\(pos\)/,'elemental FX position guard missing');
console.log('Active clone guard regression: PASS');
