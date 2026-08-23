import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MONSTER_CATALOG } from '../monster-catalog.mjs';
import { SKILL_CATALOG } from '../skill-catalog.mjs';
import { STATUS_CATALOG, SKILL_STATUS_LINKS, statusCatalogEntry } from '../status-catalog.mjs';
import { applyEncounterStatus, advanceEncounterEffects, createEncounterStatusState } from '../status-lifecycle.mjs';
import {
  COMBAT_STATUS_RUNTIME_VERSION,
  STATUS_RUNTIME_CHANNELS,
  combatStatusDescriptors,
  resolveCombatStatusRuntime,
} from '../combat-status-runtime.mjs';
import { resolveWorkbookDirectDamage } from '../skill-effect-runtime.mjs';

function withStatus(statusId, { encounterId = `encounter:${statusId}`, stacks = 1, nowSec = 0 } = {}) {
  const definition = statusCatalogEntry(statusId);
  const applied = applyEncounterStatus(
    createEncounterStatusState({ encounterId, nowSec }),
    { statusId, stacks, durationSec: definition.baseDurationSec, sourceInstanceId: 'status-test' },
    { nowSec },
  );
  assert.equal(applied.ok, true, `${statusId} must enter the shared encounter runtime`);
  assert.equal(applied.applied, true, `${statusId} must be applied`);
  return applied.state;
}

assert.equal(COMBAT_STATUS_RUNTIME_VERSION, 'combat-status-runtime/v1');
assert.equal(STATUS_CATALOG.length, 26);
assert.equal(Object.keys(STATUS_RUNTIME_CHANNELS).length, 26);

for (const definition of STATUS_CATALOG) {
  const state = withStatus(definition.id);
  const descriptors = combatStatusDescriptors(state);
  assert.equal(descriptors.length, 1, `${definition.id} must have visible live combat feedback`);
  assert.equal(descriptors[0].statusId, definition.id);
  assert.equal(descriptors[0].nameTH, definition.nameTH);
  assert.ok(descriptors[0].glyph.length > 0);
  assert.ok(descriptors[0].channels.length > 0, `${definition.id} must route to runtime behavior`);
  assert.equal(resolveCombatStatusRuntime(state).activeStatusIds[0], definition.id);
}

for (const statusId of ['ST_FREEZE', 'ST_STUN', 'ST_STAGGER']) {
  const control = resolveCombatStatusRuntime(withStatus(statusId));
  assert.equal(control.canAttack, false, `${statusId} must stop attacks`);
  assert.equal(control.canUseSkill, false, `${statusId} must stop manual skills`);
}
const root = resolveCombatStatusRuntime(withStatus('ST_ROOT'));
assert.equal(root.canMove, false);
assert.equal(root.canAttack, true, 'Root locks movement but still permits an in-range attack');
assert.equal(root.canUseSkill, true, 'Root does not consume or block a valid manual skill');
const fear = resolveCombatStatusRuntime(withStatus('ST_FEAR'));
assert.equal(fear.forcedRetreat, true);
assert.equal(fear.canAttack, false);
assert.equal(fear.canUseSkill, false);
assert.equal(resolveCombatStatusRuntime(withStatus('ST_CONFUSE')).accuracyMultiplier, 0.65);
assert.equal(resolveCombatStatusRuntime(withStatus('ST_BLIND')).accuracyMultiplier, 0.8);
assert.equal(resolveCombatStatusRuntime(withStatus('ST_PARALYZE')).cooldownRecoveryMultiplier, 0.8);

const burnTick = advanceEncounterEffects(withStatus('ST_BURN'), { toSec: 1, targetHp: 100, targetMaxHp: 100 });
assert.equal(burnTick.ok, true);
assert.equal(burnTick.damage, 1.5, 'DoT remains authoritative, not display-only');
assert.equal(burnTick.targetHp, 98.5);

const blindedAttack = resolveWorkbookDirectDamage({
  skillId: 'SK_NORMAL_01',
  attacker: { id: 'blind-actor', level: 30, types: ['Normal'], stats: { ATK: 100, SPATK: 100 }, statusState: withStatus('ST_BLIND') },
  defender: { id: 'target', level: 30, types: ['Normal'], stats: { DEF: 100, SPDEF: 100 }, hp: 200, maxHp: 200 },
  nowSec: 0,
}, { rng: () => 0.9 });
assert.equal(blindedAttack.reason, 'attack_missed');
assert.equal(blindedAttack.accuracyPct, 80);
assert.equal(blindedAttack.damage, 0);

let speciesWithStatusSkills = 0;
for (const monster of MONSTER_CATALOG) {
  const skillIds = new Set(SKILL_CATALOG.filter(skill => skill.runtimeType === monster.runtimeType).map(skill => skill.id));
  const links = SKILL_STATUS_LINKS.filter(link => skillIds.has(link.skillId));
  assert.ok(links.length > 0, `${monster.runtimeSpeciesId} must own at least one canonical status skill`);
  assert.ok(links.every(link => STATUS_RUNTIME_CHANNELS[link.statusId]), `${monster.runtimeSpeciesId} status skills must all resolve live behavior`);
  speciesWithStatusSkills += 1;
}
assert.equal(speciesWithStatusSkills, 18);

const game = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const v800 = fs.readFileSync(new URL('../v800.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../style-v800.css', import.meta.url), 'utf8');
const useSkillSource = game.slice(game.indexOf('function useSkill('), game.indexOf('function createOwnedBasicAiScratch('));
const ownedSource = game.slice(game.indexOf('function updateOwned('), game.indexOf('const wildAggressorCandidates'));
const wildSource = game.slice(game.indexOf('function updateWild('), game.indexOf('function updateProjectiles('));

assert.match(game, /statusState:createEncounterStatusState\(\{encounterId:wildId,nowSec:0\}\)/, 'every wild and boss receives the same status runtime');
assert.match(game, /statusState:createEncounterStatusState\(\{encounterId:`owned:\$\{inst\.instanceId\}`,nowSec:0\}\)/, 'every summoned owned monster receives the same status runtime');
assert.ok(useSkillSource.indexOf('!control.canUseSkill') < useSkillSource.indexOf('executeEquippedSkillCommand'), 'control gate must run before Uses/Cooldown commit');
assert.match(ownedSource, /cooldownElapsed=dt\*\(control\.ok\?control\.cooldownRecoveryMultiplier:1\)/);
assert.match(ownedSource, /control\.forcedRetreat&&control\.canMove/);
assert.match(ownedSource, /Math\.random\(\)>=control\.accuracyMultiplier/);
assert.match(ownedSource, /spawnDamageNumber\(tickDamage,[\s\S]*?label:'STATUS'/, 'owned DoT ticks must have visible combat feedback');
assert.match(wildSource, /selfModifiers=resolveActiveSelfStatusModifiers\(w\.statusState\)/);
assert.match(wildSource, /statusMissed=control\.ok&&Math\.random\(\)>=control\.accuracyMultiplier/);
assert.match(game, /resolveActiveSelfStatusModifiers\(defender\?\.statusState,\{incomingType:move\.type\}\)/, 'Basic Attack must honor defender buffs and debuffs');
assert.match(game, /damage:resolved\.damage>0\?Math\.max\(1,Math\.round\(resolved\.damage\*finalMultiplier\)\):0/, 'status scaling must preserve type immunity at zero damage');
assert.match(game, /renderCombatStatusList\(el\('ownedStatusStrip'\),activeSummon\?\.statusState/);
assert.match(game, /renderCombatStatusList\(el\('targetStatusStrip'\),target\.statusState/);
assert.match(game, /skillStatusLocked=statusControl\?\.ok&&!statusControl\.canUseSkill/);
for (const html of [index, v800]) {
  assert.match(html, /id="targetStatusStrip"/);
  assert.match(html, /id="ownedStatusStrip"/);
}
assert.match(css, /\.combat-status-chip\.negative/);
assert.match(css, /\.combat-status-chip\.positive/);
assert.match(css, /\.damage-pop\.miss/);

console.log('V8.6 live combat status: PASS (26/26 statuses, 18/18 monsters, AI + Basic + Manual + HUD)');
