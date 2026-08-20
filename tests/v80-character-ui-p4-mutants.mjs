import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeJs as js } from './active-assets.mjs';
import { FULL_MANAGER_NPC_REASON, createCharacterUIController } from '../character-ui-controller.mjs';

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
    collection: [{ instanceId: 'alpha', hp: 9 }, { instanceId: 'beta', hp: 4 }],
    party: ['alpha', 'beta', null],
    storage: [],
    ranchActive: [],
    selectedSlot: 1,
    currentZone: 'cave',
    skillsSelectedId: null,
    equipSelectedId: null,
    trainingSelectedId: null,
  };
  module.attachCharacterUi(state);
  const controller = module.createCharacterUIController({
    getState: () => state,
    getActiveSummonId: () => 'alpha',
    getZone: () => state.currentZone,
    syncLegacySelection(id) {
      state.skillsSelectedId = id;
      state.equipSelectedId = id;
      state.trainingSelectedId = id;
    },
  });
  assert.equal(controller.requestOpenFull({ isNearNpc: false }).ok, false);
  assert.equal(controller.requestOpenFull({ isNearNpc: false }).reasonText, module.FULL_MANAGER_NPC_REASON || FULL_MANAGER_NPC_REASON);
  controller.requestGlobalAccess({ source: 'global-button' });
  assert.equal(state.ui.focusedMonsterId, 'beta');
  assert.equal(controller.requestOpenFromQuick({ tab: 'equipment' }).ok, false);
  const opened = controller.requestOpenFromQuick({ tab: 'collection' });
  assert.equal(opened.ok, true);
  assert.equal(opened.openedManager, true);
  assert.equal(opened.source, 'character');
  assert.equal(opened.returnTo, 'quick');
  assert.equal(state.ui.focusedMonsterId, 'beta');
  assert.equal(controller.canMutate(), false);
  const back = controller.back();
  assert.equal(back.resumePanel, 'quick');
  assert.equal(state.ui.characterPanel, 'quick');
}

liveProbe(await import('../character-ui-controller.mjs'));

async function expectKilled(label, mutant) {
  const module = await importMutant(mutant, label);
  let killed = false;
  try { liveProbe(module); } catch { killed = true; }
  assert.equal(killed, true, `${label}: Character UI Phase 4 regression survived the mutant`);
}

await expectKilled(
  'npc-unlocks-in-field',
  mutate(controllerSource, 'return Boolean(isNearNpc);', 'return true;', 'npc-unlocks-in-field'),
);
await expectKilled(
  'quick-drops-focus',
  mutate(
    controllerSource,
    'openPanel(\'full\', { source: from, monsterId: id, tab });',
    'openPanel(\'full\', { source: from, monsterId: null, tab });',
    'quick-drops-focus',
  ),
);
await expectKilled(
  'summon-mutates-through-manager',
  mutate(
    controllerSource,
    'if (QUICK_MUTATE_TABS.includes(tab) && !canMutate()) {',
    'if (false && QUICK_MUTATE_TABS.includes(tab) && !canMutate()) {',
    'summon-mutates-through-manager',
  ),
);
await expectKilled(
  'manager-skips-quick',
  mutate(
    controllerSource,
    'returnTo: returnFrame?.returnTo || (returnFrame?.resumePanel === \'quick\' ? \'quick\' : \'world\'),',
    'returnTo: \'world\',',
    'manager-skips-quick',
  ),
);

assert.match(extractFn('closeManager'), /characterUI\.back\(\)/, 'mutant: character manager must pop to Quick');
assert.match(extractFn('openManager'), /source==='character'/, 'mutant: character source stays distinct from NPC');
assert.match(extractFn('openCharacterQuickTab'), /requestOpenFromQuick/, 'mutant: Quick still uses the shared controller');
assert.doesNotMatch(extractFn('handleCharacterUiHardwareBack'), /switchPartySlot\(/, 'mutant: Android Back must not switch party');
assert.equal(typeof createCharacterUIController, 'function');

console.log('V8.2 Character UI Phase 4 mutants: PASS');
