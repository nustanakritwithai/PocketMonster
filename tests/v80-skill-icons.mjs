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

assert.ok(js.includes('skillIconCache') || js.includes('getSkillIcon'), 'skill icon cache missing');
assert.ok(js.includes('function getSkillIcon'), 'getSkillIcon missing');
assert.ok(js.includes('toDataURL'), 'icon: toDataURL missing');
assert.ok(js.includes('function getActionIcon') || js.includes('getActionIcon'), 'getActionIcon missing');
assert.ok(js.includes('getSkillIcon') && js.includes('background-image'), 'icons not wired into render');
assert.ok(js.includes('getActionIcon'), 'action icons not called');
assert.match(js, /function skillIconKind/, 'skill icons are keyed by role, not element type');
assert.match(js, /function applyButtonIcon/, 'icons must be applied with important so CSS cannot hide them');

const iconFn = extractFn('getSkillIcon');
assert.doesNotMatch(iconFn, /typeFx\(/, 'skill glyphs are not drawn from elemental typeFx');
assert.doesNotMatch(iconFn, /case'flame'/, 'no fire-element flame glyph');
assert.doesNotMatch(iconFn, /case'drop'/, 'no water-element drop glyph');
assert.match(iconFn, /case'enemy'/, 'ranged / single-target glyph');
assert.match(iconFn, /case'area'/, 'wide-area glyph');
assert.match(iconFn, /case'heal'/, 'self-heal glyph');
assert.match(iconFn, /case'shield'/, 'self-shield glyph');
assert.match(iconFn, /case'buff'/, 'self-buff glyph');

const kindFn = extractFn('skillIconKind');
assert.match(kindFn, /targetType==='area'/, 'area skills map to the ring glyph');
assert.match(kindFn, /targetType==='self'/, 'self skills map to heal\/shield\/buff');
assert.match(kindFn, /effect==='heal'/, 'heal stays distinct from shield');
assert.match(kindFn, /effect==='shield'/, 'shield stays distinct from buff');

assert.match(extractFn('applyButtonIcon'), /setProperty\('background-image'/, 'background-image is set as a longhand');
assert.match(extractFn('applyButtonIcon'), /'important'/, 'icon longhands beat CSS background shorthand');
assert.match(extractFn('renderCombatPresentation'), /getSkillIcon\(skill\)/, 'each button uses that skill object, not its type');

assert.doesNotMatch(css, /\.skill1\{[^}]*background:#f59e0b!important/, 'skill1 must not use a background shorthand that wipes the icon');
assert.match(css, /\.skill1\{[^}]*background-color:#f59e0b!important/, 'skill1 keeps a color-only fill');

console.log('V8.2 skill role icons: PASS');
