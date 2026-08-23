import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STATUS_CATALOG, statusCatalogEntry } from '../status-catalog.mjs';
import { applyEncounterStatus, createEncounterStatusState } from '../status-lifecycle.mjs';

const runtimeSource = fs.readFileSync(new URL('../combat-status-runtime.mjs', import.meta.url), 'utf8');
const gameSource = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');

async function loadRuntime(source, label) {
  const absolute = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(`../${relativePath.slice(2)}`, import.meta.url).href}'`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(`${absolute}\n//# sourceURL=${label}`).toString('base64')}`);
}

function withStatus(statusId) {
  const definition = statusCatalogEntry(statusId);
  return applyEncounterStatus(
    createEncounterStatusState({ encounterId: `mutant:${statusId}`, nowSec: 0 }),
    { statusId, stacks: 1, durationSec: definition.baseDurationSec },
    { nowSec: 0 },
  ).state;
}

function assertRuntime(module) {
  assert.equal(Object.keys(module.STATUS_RUNTIME_CHANNELS).length, STATUS_CATALOG.length);
  assert.equal(module.combatStatusDescriptors(withStatus('ST_BURN')).length, 1);
  assert.equal(module.resolveCombatStatusRuntime(withStatus('ST_FREEZE')).canAttack, false);
  assert.equal(module.resolveCombatStatusRuntime(withStatus('ST_STAGGER')).canUseSkill, false);
  assert.equal(module.resolveCombatStatusRuntime(withStatus('ST_ROOT')).canMove, false);
  assert.equal(module.resolveCombatStatusRuntime(withStatus('ST_ROOT')).canAttack, true);
  assert.equal(module.resolveCombatStatusRuntime(withStatus('ST_FEAR')).forcedRetreat, true);
  assert.equal(module.resolveCombatStatusRuntime(withStatus('ST_BLIND')).accuracyMultiplier, 0.8);
  assert.equal(module.resolveCombatStatusRuntime(withStatus('ST_PARALYZE')).cooldownRecoveryMultiplier, 0.8);
}

assertRuntime(await loadRuntime(runtimeSource, 'combat-status-current'));

const runtimeMutations = [
  ['hide active statuses', 'status.expiresAtSec > nowSec', 'status.expiresAtSec < nowSec'],
  ['unlock hard control', "const actionLocked = ids.some(id => ['ST_FREEZE', 'ST_STUN', 'ST_STAGGER'].includes(id));", 'const actionLocked = false;'],
  ['unlock root movement', "const movementLocked = actionLocked || ids.includes('ST_ROOT');", 'const movementLocked = actionLocked;'],
  ['disable fear retreat', "const forcedRetreat = ids.includes('ST_FEAR');", 'const forcedRetreat = false;'],
  ['ignore accuracy control', 'accuracyMultiplier: Math.max(0.05, Math.min(1, 1 + accuracyModifierPct / 100)),', 'accuracyMultiplier: 1,'],
  ['ignore paralyze recovery', "cooldownRecoveryMultiplier: ids.includes('ST_PARALYZE') ? 0.8 : 1,", 'cooldownRecoveryMultiplier: 1,'],
];

for (const [name, from, to] of runtimeMutations) {
  const mutant = runtimeSource.replace(from, to);
  assert.notEqual(mutant, runtimeSource, `${name} mutation must apply`);
  await assert.rejects(async () => assertRuntime(await loadRuntime(mutant, `combat-status-${name}`)), undefined, `${name} must be killed`);
}

function assertLive(source) {
  const useSkill = source.slice(source.indexOf('function useSkill('), source.indexOf('function createOwnedBasicAiScratch('));
  const owned = source.slice(source.indexOf('function updateOwned('), source.indexOf('const wildAggressorCandidates'));
  const wild = source.slice(source.indexOf('function updateWild('), source.indexOf('function updateProjectiles('));
  assert.match(useSkill, /if\(control\.ok&&!control\.canUseSkill\)/);
  assert.match(owned, /Math\.random\(\)>=control\.accuracyMultiplier/);
  assert.match(wild, /statusMissed=control\.ok&&Math\.random\(\)>=control\.accuracyMultiplier/);
  assert.match(source, /resolveActiveSelfStatusModifiers\(defender\?\.statusState,\{incomingType:move\.type\}\)/);
  assert.match(source, /damage:resolved\.damage>0\?Math\.max\(1,Math\.round\(resolved\.damage\*finalMultiplier\)\):0/);
  assert.match(source, /renderCombatStatusList\(el\('ownedStatusStrip'\),activeSummon\?\.statusState/);
  assert.match(source, /renderCombatStatusList\(el\('targetStatusStrip'\),target\.statusState/);
  assert.match(source, /skillStatusLocked=statusControl\?\.ok&&!statusControl\.canUseSkill/);
}

assertLive(gameSource);
const liveMutations = [
  ['bypass manual status gate', 'if(control.ok&&!control.canUseSkill){', 'if(false){'],
  ['owned attacks never miss', 'if(control.ok&&Math.random()>=control.accuracyMultiplier)', 'if(false)'],
  ['wild attacks never miss', 'const statusMissed=control.ok&&Math.random()>=control.accuracyMultiplier;', 'const statusMissed=false;'],
  ['Basic ignores defender status', 'const guard=resolveActiveSelfStatusModifiers(defender?.statusState,{incomingType:move.type});', 'const guard={ok:false};'],
  ['status layer breaks immunity', 'damage:resolved.damage>0?Math.max(1,Math.round(resolved.damage*finalMultiplier)):0', 'damage:Math.max(1,Math.round(resolved.damage*finalMultiplier))'],
  ['hide owned status HUD', "renderCombatStatusList(el('ownedStatusStrip'),activeSummon?.statusState,{limit:4});", "void el('ownedStatusStrip');"],
  ['hide target status HUD', "renderCombatStatusList(el('targetStatusStrip'),target.statusState,{limit:5});", "void el('targetStatusStrip');"],
  ['show locked skills as ready', 'const skillStatusLocked=statusControl?.ok&&!statusControl.canUseSkill;', 'const skillStatusLocked=false;'],
];
for (const [name, from, to] of liveMutations) {
  const mutant = gameSource.replace(from, to);
  assert.notEqual(mutant, gameSource, `${name} mutation must apply`);
  assert.throws(() => assertLive(mutant), undefined, `${name} must be killed`);
}

console.log(`V8.6 live combat status mutants: PASS (${runtimeMutations.length + liveMutations.length}/${runtimeMutations.length + liveMutations.length} killed)`);
