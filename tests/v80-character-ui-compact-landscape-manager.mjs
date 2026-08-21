import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css=readFileSync(new URL('../style-v800.css', import.meta.url), 'utf8');
const guard=css.match(/\/\* Character UI compact landscape manager guard \*\/([\s\S]*?)\/\* Character UI compact landscape control guard \*\//)?.[1]||'';
assert.ok(guard, 'compact landscape manager guard is required');
for (const rule of [
  '.manager-card{width:min(960px,94vw);height:min(86dvh,500px);max-height:86dvh;overflow:auto',
  '.character-manager-layout{grid-template-columns:minmax(116px,.78fr) minmax(176px,1.08fr) minmax(142px,.88fr);gap:6px;min-height:0}',
  '.character-roster,.character-information{overflow:auto}',
  '.character-preview-art{width:min(88px,14vw)',
  '.character-preview-name{font-size:14px}',
  '.character-info-body{min-height:0;font-size:10px',
]) assert.ok(guard.includes(rule), `compact manager guard must include ${rule}`);
console.log('V8.2 Character UI compact landscape manager: PASS');
