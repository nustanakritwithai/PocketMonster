import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeHtml as html, activeJs as js } from './active-assets.mjs';
import { createCharacterUIController } from '../character-ui-controller.mjs';

const controllerSource = fs.readFileSync(new URL('../character-ui-controller.mjs', import.meta.url), 'utf8');
let serial = 0;

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

function mutate(source, needle, replacement, label) {
  assert.ok(source.includes(needle), `${label}: mutation target drifted`);
  return source.replace(needle, replacement);
}

async function importMutant(mutant, label) {
  const encoded = Buffer.from(`${mutant}\n//# sourceURL=${label}-${++serial}.mjs`).toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

function liveProbe(module) {
  const state = {
    collection: [{ instanceId: 'alpha', hp: 9 }],
    party: ['alpha', 'beta', null],
    selectedSlot: 1,
    currentZone: 'cave',
  };
  module.attachCharacterUi(state);
  const controller = module.createCharacterUIController({
    getState: () => state,
    getActiveSummonId: () => 'alpha',
    getZone: () => state.currentZone,
  });
  const opened = controller.requestGlobalAccess({ source: 'global-button' });
  assert.equal(opened.ok, true);
  assert.equal(opened.openedManager, false);
  assert.equal(opened.switched, false);
  assert.equal(opened.readOnly, true);
  assert.equal(controller.canMutate(), false);
  assert.equal(controller.requestSwitchParty(0).ok, false);
  assert.equal(state.selectedSlot, 1);
  assert.equal(controller.requestOpenFull({ isNearNpc: false }).ok, false);
  assert.equal(controller.peekPartySlot(0).switched, false);
}

liveProbe(await import('../character-ui-controller.mjs'));

async function expectKilled(label, mutant) {
  const module = await importMutant(mutant, label);
  let killed = false;
  try { liveProbe(module); } catch { killed = true; }
  assert.equal(killed, true, `${label}: Character UI Phase 2 regression survived the mutant`);
}

await expectKilled(
  'global-opens-manager',
  mutate(controllerSource, 'openedManager: false,\n      reason: null,\n      panel: \'quick\',', 'openedManager: true,\n      reason: null,\n      panel: \'quick\',', 'global-opens-manager'),
);
await expectKilled(
  'global-flags-switch',
  mutate(controllerSource, 'ok: true,\n      switched: false,\n      openedManager: false,', 'ok: true,\n      switched: true,\n      openedManager: false,', 'global-flags-switch'),
);
await expectKilled(
  'field-unlocks-manager',
  mutate(controllerSource, 'return Boolean(isNearNpc);', 'return true;', 'field-unlocks-manager'),
);
await expectKilled(
  'summon-can-mutate',
  mutate(controllerSource, 'function canMutate() {\n    return !isSummonActive();\n  }', 'function canMutate() {\n    return true;\n  }', 'summon-can-mutate'),
);

assert.doesNotMatch(extractFn('toggleCharacterAccess'), /openManager\(/, 'mutant 5: global button must not open the NPC manager');
assert.doesNotMatch(extractFn('toggleCharacterAccess'), /switchPartySlot\(/, 'mutant 6: global button must not switch party');
assert.match(html, /id="globalCharacterBtn"/, 'mutant 7: HUD button stays in the live entry');
assert.equal(typeof createCharacterUIController, 'function');

console.log('V8.2 Character UI Phase 2 mutants: PASS');
