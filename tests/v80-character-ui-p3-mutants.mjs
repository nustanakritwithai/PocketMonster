import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeHtml as html, activeJs as js } from './active-assets.mjs';
import { ACTIVE_SUMMON_RECALL_REASON, createCharacterUIController } from '../character-ui-controller.mjs';

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
  const opened = controller.requestGlobalAccess({ source: 'global-button' });
  assert.equal(opened.ok, true);
  assert.equal(opened.openedManager, true);
  assert.equal(opened.panel, 'full');
  assert.equal(opened.characterTab, 'info');
  assert.equal(opened.readOnly, true);
  const skills = controller.requestOpenTab('skills');
  assert.equal(skills.ok, false, 'summoned skills must stay closed');
  assert.equal(skills.reasonText, module.ACTIVE_SUMMON_RECALL_REASON || ACTIVE_SUMMON_RECALL_REASON);
  assert.equal(state.ui.focusedMonsterId, 'beta');
  assert.equal(controller.requestOpenFull({ isNearNpc: false }).ok, false);
  const normal = module.createCharacterUIController({
    getState: () => state,
    getActiveSummonId: () => null,
    getZone: () => state.currentZone,
    syncLegacySelection(id) { state.equipSelectedId = id; },
  });
  state.ui.readOnly = false;
  const equip = normal.requestOpenTab('equipment', { monsterId: 'beta' });
  assert.equal(equip.ok, true);
  assert.equal(equip.openedManager, false);
  assert.equal(state.ui.focusedMonsterId, 'beta');
}

liveProbe(await import('../character-ui-controller.mjs'));

async function expectKilled(label, mutant) {
  const module = await importMutant(mutant, label);
  let killed = false;
  try { liveProbe(module); } catch { killed = true; }
  assert.equal(killed, true, `${label}: Character UI Phase 3 regression survived the mutant`);
}

await expectKilled(
  'summon-opens-skills',
  mutate(
    controllerSource,
    'if (QUICK_MUTATE_TABS.includes(tab) && !canMutate()) {',
    'if (false && QUICK_MUTATE_TABS.includes(tab) && !canMutate()) {',
    'summon-opens-skills',
  ),
);
await expectKilled(
  'tab-drops-focus',
  mutate(
    controllerSource,
    'openPanel(\'tab\', { ...details, tab, monsterId: focused });',
    'openPanel(\'tab\', { ...details, tab, monsterId: null });',
    'tab-drops-focus',
  ),
);
await expectKilled(
  'field-unlocks-manager',
  mutate(controllerSource, 'return Boolean(isNearNpc);', 'return true;', 'field-unlocks-manager'),
);
await expectKilled(
  'tab-opens-manager',
  mutate(
    controllerSource,
    `      openedManager: false,
    };
  }

  function requestGlobalAccess`,
    `      openedManager: true,
    };
  }

  function requestGlobalAccess`,
    'tab-opens-manager',
  ),
);

assert.doesNotMatch(extractFn('openCharacterQuickTab'), /switchPartySlot\(/, 'mutant: quick tabs must not switch party');
assert.doesNotMatch(extractFn('handleCharacterUiHardwareBack'), /switchPartySlot\(/, 'mutant: Android Back must not switch party');
assert.match(extractFn('renderCharacterAccess'), /getInst\(/, 'mutant: identity stays on getInst');
assert.match(html, /id="characterQuickTabBody"/, 'mutant: quick tab host stays in the live entry');
assert.equal(typeof createCharacterUIController, 'function');

console.log('V8.2 Character UI Phase 3 mutants: PASS');
