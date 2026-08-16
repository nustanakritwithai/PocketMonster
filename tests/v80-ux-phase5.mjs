// V8.0 UX Phase 5 — Evolution + Breeding display contract.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../style-v800.css', import.meta.url), 'utf8');

assert.match(js, /function evoHistoryHTML\(inst\)/, 'evolution history helper missing');
assert.match(js, /Identity Lock/, 'evolution identity lock copy missing');
assert.match(js, /Skill Carry: 70-100%/, 'skill carry copy missing');
assert.match(js, /gene-inherit-preview/, 'breeding gene preview missing');
assert.match(js, /close-relative-warn/, 'close-relative warning missing');
assert.match(js, /ลูกรุ่น Gen/, 'generation counter missing');
assert.match(js, /birth-history/, 'birth history missing');

for (const cls of ['.evo-history', '.evo-identity-lock', '.gene-inherit-preview', '.close-relative-warn', '.gen-counter']) {
  assert.ok(css.includes(cls), `phase 5 CSS missing ${cls}`);
}

console.log('V8.0 UX phase 5 evolution/breeding display: PASS');
