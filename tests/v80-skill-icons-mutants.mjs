import assert from 'node:assert/strict';
import { activeJs as js, activeCss as css } from './active-assets.mjs';

function extractFn(name) {
  const start = js.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const headerEnd = js.indexOf('){', start) >= 0 ? js.indexOf('){', start) : js.indexOf(') {', start);
  const brace = js.indexOf('{', headerEnd);
  let depth = 0;
  for (let i = brace; i < js.length; i++) {
    if (js[i] === '{') depth += 1;
    else if (js[i] === '}') {
      depth -= 1;
      if (depth === 0) return js.slice(start, i + 1);
    }
  }
  assert.fail(`unclosed ${name}`);
}

assert.doesNotMatch(js, /from ['"]three['"]/, 'mutant 1: do not import the three package');
assert.doesNotMatch(extractFn('getSkillIcon'), /typeFx\(/, 'mutant 2: skill icons must not be elemental pictures');
assert.match(extractFn('skillIconKind'), /targetType==='area'/, 'mutant 3: area skills stay the wide ring');
assert.match(extractFn('getSkillIcon'), /case'enemy'/, 'mutant 4: ranged shot glyph stays');
assert.match(extractFn('applyButtonIcon'), /'important'/, 'mutant 5: icons must win over CSS background shorthand');
assert.doesNotMatch(css, /\.skill1\{[^}]*background:#f59e0b!important/, 'mutant 6: skill1 shorthand must not hide the image');
assert.match(extractFn('renderCombatPresentation'), /getSkillIcon\(skill\)/, 'mutant 7: wire the skill object, not skill.type');
assert.match(extractFn('getSkillIcon'), /case'area'/, 'mutant 8: wide-area glyph stays');

console.log('V8.2 skill role icon mutants: PASS');
