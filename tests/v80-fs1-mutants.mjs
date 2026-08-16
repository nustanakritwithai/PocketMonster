import assert from 'node:assert/strict';
import { atlasLayout, assertOrientation } from '../asset-presentation/four-side/uv.mjs';
import { compileAppearance } from '../asset-presentation/four-side/atlas.mjs';
import { resolveFaceSource } from '../asset-presentation/four-side/fallback.mjs';

const flipped = atlasLayout();
flipped.faces.front.sign = 1;
assert.ok(assertOrientation(flipped).some(e => e.includes('Front')), 'mutant 7: Front +Z must fail orientation');

const mirrored = resolveFaceSource({ right: 'r.png' }, 'left');
assert.equal(mirrored.mirrored, false, 'mutant 7: opposite-side fallback must not mirror');

const compiled = compileAppearance({ id: 'x', parts: { head: { front: 'a.png', right: 'b.png', back: 'c.png', left: 'd.png' } } });
assert.equal(compiled.materialCount, 1, 'mutant 6: compiled appearance uses one atlas material');

assert.throws(() => atlasLayout({ gutter: 2 }), /gutter/);

console.log('V8.0 FS1 mutants: PASS');
