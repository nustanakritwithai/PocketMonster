import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeJs as js } from './active-assets.mjs';
import {
  createCharacterUIController,
  persistableState,
} from '../character-ui-controller.mjs';

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

function harness(module, summonId = null) {
  const state = {
    collection: [{ instanceId: 'alpha', hp: 9 }],
    party: ['alpha', 'beta', null],
    selectedSlot: 0,
    currentZone: 'grassland',
    ui: null,
  };
  module.attachCharacterUi(state);
  const controller = module.createCharacterUIController({
    getState: () => state,
    getActiveSummonId: () => summonId,
    getZone: () => state.currentZone,
  });
  return { state, controller };
}

function liveProbe(module) {
  const idle = harness(module, null);
  const peek = idle.controller.peekPartySlot(1);
  assert.equal(peek.switched, false);
  assert.equal(idle.state.selectedSlot, 0);
  const summoned = harness(module, 'alpha');
  assert.equal(summoned.controller.peekPartySlot(1).ok, true);
  assert.equal(summoned.controller.requestSwitchParty(1).ok, false);
  assert.equal(summoned.controller.canMutate(), false);
  const persisted = module.persistableState({ collection: [{ hp: 4 }], ui: { hp: 99, focusedMonsterId: 'alpha' } });
  assert.equal('ui' in persisted, false);
  assert.equal(persisted.collection[0].hp, 4);
}

liveProbe(await import('../character-ui-controller.mjs'));

async function expectKilled(label, mutant) {
  const module = await importMutant(mutant, label);
  let killed = false;
  try { liveProbe(module); } catch { killed = true; }
  assert.equal(killed, true, `${label}: Character UI Phase 1 regression survived the mutant`);
}

await expectKilled(
  'peek-flags-switch',
  mutate(controllerSource, 'ok: true,\n      switched: false,\n      reason: null,\n      monsterId,', 'ok: true,\n      switched: true,\n      reason: null,\n      monsterId,', 'peek-flags-switch'),
);
await expectKilled(
  'summon-can-switch',
  mutate(controllerSource, 'function canSwitchParty() {\n    return !isSummonActive();\n  }', 'function canSwitchParty() {\n    return true;\n  }', 'summon-can-switch'),
);
await expectKilled(
  'summon-can-mutate',
  mutate(controllerSource, 'function canMutate() {\n    return !isSummonActive();\n  }', 'function canMutate() {\n    return true;\n  }', 'summon-can-mutate'),
);
await expectKilled(
  'persist-keeps-ui',
  mutate(controllerSource, 'const { ui: _ui, ...rest } = state;\n  return rest;', 'return state;', 'persist-keeps-ui'),
);

assert.match(extractFn('renderParty'), /button\.addEventListener\('pointerdown',event=>\{[\s\S]*?switchPartySlot\(index\);/, 'mutant 5: party tap must switch the combat slot immediately');
assert.doesNotMatch(extractFn('renderParty'), /peekPartySlot\(index\)/, 'mutant 5: party tap must not open character peek');
assert.match(extractFn('switchPartySlot'), /if\(!gate\.ok\)/, 'mutant 6: switchPartySlot must honor the summon gate');
assert.doesNotMatch(extractFn('switchPartySlot'), /summonThrow\(|recall\(/, 'mutant 6: selecting a party slot must not throw or recall');
assert.match(extractFn('openManager'), /requestOpenFull/, 'mutant 7: manager stays behind the NPC gate helper');
assert.equal(typeof persistableState, 'function');
assert.equal(typeof createCharacterUIController, 'function');

console.log('V8.2 Character UI Phase 1 mutants: PASS');
