import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const start = source.indexOf('function renderCombatPresentation(){');
const end = source.indexOf('\nfunction renderHUD(){', start);
assert.ok(start >= 0 && end > start, 'extracts the production renderCombatPresentation function');
const body = source.slice(start, end);
const applyStart = source.indexOf('function applyActionPresentation(');
const applyEnd = source.indexOf('\nfunction skillButtonOverlay(', applyStart);
assert.ok(applyStart >= 0 && applyEnd > applyStart, 'extracts the production action presentation helper');
const applyActionPresentation = source.slice(applyStart, applyEnd);

function makeButton(className = '') {
  const classes = new Set(className ? [className] : []);
  return {
    disabled: false, dataset: {}, title: '',
    classList: { contains: name => classes.has(name), toggle(name, on) { on ? classes.add(name) : classes.delete(name); } },
    setAttribute(name, value) { this[name] = String(value); },
  };
}
const nodes = new Map(['captureBtn', 'summonBtn', 'recallBtn', 'actionReason', 'activeMonsterStatus'].map(id => [id, makeButton()]));
const documentLike = { body: { dataset: { combinedWorld: 'pirate-fruit' } } };
const dependencies = {
  document: documentLike,
  publishPocketActionsHud() { nodes.get('captureBtn').disabled = false; },
  combatHudPresentation: () => ({ skills: [], actions: { capture: { disabled: true, state: 'ready', statusText: 'offline', reason: 'offline' }, summon: { disabled: false, state: 'ready', statusText: '', reason: '' }, recall: { disabled: false, state: 'ready', statusText: '', reason: '' } }, actionReason: '', activeLabel: '' }),
  activeSummon: null, pendingSummon: null, hubCompanion: null, displayName: value => value?.name || '', selectedInstance: () => null, canonicalCombatSkills: () => [], resolveCombatStatusRuntime: () => null,
  MANUAL_SKILL_SLOTS: [], el: id => nodes.get(id) || makeButton(), getSkillIcon: () => '', getActionIcon: () => '', syncSkillButtonResourceUi() {}, skillButtonIconContract: () => null,
  setActionStyle() {}, applyButtonIcon() {}, setAttributeIfChanged(button, name, value) { button.setAttribute(name, value); }, setTextIfChanged() {}, visibleCombatReason: value => value,
};
function makeRender(renderSource) {
  return Function(...Object.keys(dependencies), `${applyActionPresentation}; ${renderSource}; return renderCombatPresentation;`)(...Object.values(dependencies));
}
const render = makeRender(body);
// A source-derived pre-patch fixture: without the guard, legacy applyActionPresentation
// overwrites the enabled Pirate throw button after publish.
const beforePatch = makeRender(body.replace("  if(document.body?.dataset?.combinedWorld==='pirate-fruit')return;\n", ''));
beforePatch();
assert.equal(nodes.get('captureBtn').disabled, true, 'pre-patch Pirate render disables the throw button');
nodes.get('captureBtn').disabled = false;
render();
assert.equal(nodes.get('captureBtn').disabled, false, 'current Pirate guard preserves mobile throw enabled state');
documentLike.body.dataset.combinedWorld = 'pocket-monster';
render();
assert.equal(nodes.get('captureBtn').disabled, true, 'Pocket path still applies legacy disabled state');
console.log('Pirate render combat presentation guard: PASS (Pirate protected, Pocket preserved)');
