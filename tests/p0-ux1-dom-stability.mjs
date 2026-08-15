import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';

function functionSource(name) {
  const start = js.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const open = js.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < js.length; index += 1) {
    if (js[index] === '{') depth += 1;
    if (js[index] === '}') depth -= 1;
    if (depth === 0) return js.slice(start, index + 1);
  }
  assert.fail(`${name} must have a complete body`);
}

const renderHud = functionSource('renderHUD');
const updateTarget = functionSource('updateTarget');

assert.doesNotMatch(renderHud, /\.textContent\s*=/, 'stable topbar values must not be rewritten every HUD tick');
for (const id of ['playerHp', 'collectionCount', 'captureBallCount', 'playerExp', 'ranchCount', 'zoneLabel']) {
  assert.match(renderHud, new RegExp(`setTextIfChanged\\(el\\('${id}'\\)`), `${id} must use conditional text updates`);
}
assert.match(renderHud, /setTextIfChanged\(wildCount,/, 'wildCount must use conditional text updates');

for (const mutation of [
  /\.textContent\s*=/,
  /\.innerHTML\s*=/,
  /\.className\s*=/,
  /\.style\.width\s*=/,
  /\.setAttribute\(/,
]) assert.doesNotMatch(updateTarget, mutation, `stable target rendering must avoid direct mutation: ${mutation}`);

for (const contract of [
  /setTextIfChanged\(el\('targetName'\),/,
  /setTextIfChanged\(el\('targetLevel'\),/,
  /setTextIfChanged\(el\('targetHpText'\),/,
  /setStyleIfChanged\(hpBar,'width',/,
  /setAttributeIfChanged\(hpBar,'aria-valuenow',/,
  /renderTargetTypesIfChanged\(el\('targetTypes'\),species\.types\)/,
  /setTextIfChanged\(hint,/,
  /setClassNameIfChanged\(hint,/,
]) assert.match(updateTarget, contract, `target update guard missing: ${contract}`);

assert.match(js, /function renderTargetTypesIfChanged\(node,types\)/, 'target type badges need a keyed renderer');
assert.match(js, /function setClassTokenIfChanged\(node,name,enabled\)/, 'stable visibility needs a guarded class-token helper');
assert.match(updateTarget, /setClassTokenIfChanged\(card,'hidden',true\)/, 'hidden target state must not rewrite the class attribute');
assert.match(updateTarget, /setClassTokenIfChanged\(card,'hidden',false\)/, 'visible target state must not rewrite the class attribute');
assert.doesNotMatch(updateTarget, /card\.classList\.(?:add|remove)\(/, 'target visibility must not mutate an unchanged class attribute');
console.log('P0 UX1 idle DOM stability contracts: PASS');
