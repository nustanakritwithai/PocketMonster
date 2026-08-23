import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertSkillEffectClosure } from './v82-skill-effect-e5.mjs';
import { assertE5LiveWiring } from './v82-skill-effect-e5-live-wiring.mjs';

const runtimeSource = fs.readFileSync(new URL('../skill-effect-runtime.mjs', import.meta.url), 'utf8');
const gameSource = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const packageSource = fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8');

async function loadRuntime(source, label) {
  const absolute = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(`../${relativePath.slice(2)}`, import.meta.url).href}'`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(`${absolute}\n//# sourceURL=${label}`).toString('base64')}`);
}

const currentRuntime = await loadRuntime(runtimeSource, 'skill-effect-e5-current');
assertSkillEffectClosure(currentRuntime, { gameSource, packageJson: packageSource });
assertE5LiveWiring(gameSource);

const runtimeMutations = [
  ['drop E5 coverage', "['summon', 'heal_modifier'].includes(component.kind)", "['unknown'].includes(component.kind)"],
  ['change life-steal ratio', 'lifeStealDamageRatio: 0.3,', 'lifeStealDamageRatio: 1,'],
  ['change summon count', 'summonCount: 3,', 'summonCount: 1,'],
  ['change summon duration', 'summonDurationSec: 6,', 'summonDurationSec: 3,'],
  ['change summon cadence', 'summonTickIntervalSec: 1.5,', 'summonTickIntervalSec: 3,'],
  ['change summon damage ratio', 'summonTickDamageRatio: 0.15,', 'summonTickDamageRatio: 1,'],
  ['hide closure fallback provenance', "magnitudeSource: 'runtime_fallback_workbook_mechanic_without_heal_or_summon_magnitude',", "magnitudeSource: 'workbook_exact',"],
  ['heal from overkill damage', 'Math.min(result.damage, targets[index].hp)', 'result.damage'],
  ['remove max-HP heal cap', 'Math.min(attacker.maxHp - attacker.hp, requestedHealing)', 'requestedHealing'],
  ['invert closure chance boundary', 'draw.roll < effectChancePct / 100', 'draw.roll <= effectChancePct / 100'],
  ['roll closure chance on zero damage', 'if (damageBasis > 0) chance = resolveEffectChance', 'if (true) chance = resolveEffectChance'],
  ['skip E5 generic resolution', 'if (E5_READY_SKILLS.has(skillId)) {\n    e5 = resolveE5SkillEffects', 'if (false) {\n    e5 = resolveE5SkillEffects'],
  ['leave residual components deferred', "|| (E5_READY_SKILLS.has(skillId) && ['summon', 'heal_modifier'].includes(component.kind));", '|| false;'],
  ['drop heal-modifier receipt', 'healModifierResult: e5?.healModifierResult ?? null,', 'healModifierResult: null,'],
  ['drop summon receipt', 'summonResult: e5?.summonResult ?? null,', 'summonResult: null,'],
];

for (const [name, from, to] of runtimeMutations) {
  const mutant = runtimeSource.replace(from, to);
  assert.notEqual(mutant, runtimeSource, `${name} mutation must apply`);
  await assert.rejects(async () => assertSkillEffectClosure(
    await loadRuntime(mutant, `skill-effect-e5-mutant-${name}`),
    { gameSource, packageJson: packageSource },
  ), undefined, `${name} must be killed`);
}

const liveMutations = [
  ['drop closure application', 'applyPlannedClosureEffects(a,move,planned.healModifierResult,planned.summonResult)', '0'],
  ['duplicate cooldown', 'a.skillCds[index]=command.startCooldownSec;', 'a.skillCds[index]=command.startCooldownSec;\n  a.skillCds[index]=command.startCooldownSec;'],
  ['drop life-steal HP commit', 'a.inst.hp=healModifierResult.predictedHp;', 'void healModifierResult.predictedHp;'],
  ['drop summon activation', 'activateSkillSwarm(a,move,summonResult);', 'void summonResult;'],
  ['drop cast-time swarm attacker', 'nextTickSec:summonResult.tickIntervalSec,\n    attacker:canonicalSkillEffectAttacker(a,move),', 'nextTickSec:summonResult.tickIntervalSec,\n    attacker:null,'],
  ['clone wild array per swarm tick', 'for(let wildIndex=0;wildIndex<wilds.length;wildIndex++){\n        const candidate=wilds[wildIndex];', 'for(const candidate of [...wilds]){'],
  ['target outside summon radius', 'distance>swarm.radiusM||distance>nearestDistance', 'distance>nearestDistance'],
  ['remove deterministic target tie-break', 'if(distance===nearestDistance&&target&&candidate.id.localeCompare(target.id)>=0)continue;', 'if(false)continue;'],
  ['bypass canonical summon damage', 'const resolved=resolveWorkbookDirectDamage({skillId:swarm.skillId', 'const resolved=mutantDamage({skillId:swarm.skillId'],
  ['drop summon damage ratio', 'Math.round(resolved.damage*swarm.tickDamageRatio)', 'Math.round(resolved.damage)'],
  ['stop summon cadence', 'swarm.nextTickSec+=swarm.tickIntervalSec;', 'swarm.nextTickSec=Infinity;'],
  ['consume Uses on summon tick', 'const damage=Math.max(1,Math.round(resolved.damage*swarm.tickDamageRatio));', 'consumeSkillUse();const damage=Math.max(1,Math.round(resolved.damage*swarm.tickDamageRatio));'],
  ['keep swarm across zone change', 'clearSkillSwarms();\n  closeWarpPrompt();', 'void liveSkillSwarms;\n  closeWarpPrompt();'],
  ['keep swarm after recall', 'if(!activeSummon){removeSceneRole(\'activeSummon\');if(show)msg(\'ยังไม่มีมอนในสนาม\');return;}\n  clearSkillSwarms();', 'if(!activeSummon){removeSceneRole(\'activeSummon\');if(show)msg(\'ยังไม่มีมอนในสนาม\');return;}\n  void liveSkillSwarms;'],
  ['keep swarm after faint', 'return;}clearSkillSwarms();const inst=activeSummon.inst;', 'return;}void liveSkillSwarms;const inst=activeSummon.inst;'],
  ['stop live swarm loop', 'updateSkillSwarms(dt);', 'void dt;'],
];

for (const [name, from, to] of liveMutations) {
  const mutant = gameSource.replace(from, to);
  assert.notEqual(mutant, gameSource, `${name} live mutation must apply`);
  assert.throws(() => assertE5LiveWiring(mutant), undefined, `${name} live mutation must be killed`);
}

const packageMutations = [
  ['remove E5 script body', 'node tests/v82-skill-effect-e5.mjs', 'node tests/v82-skill-effect-e4.mjs'],
  ['remove E5 from Full CI', ' && npm run test:v82:skill-effects:e5', ''],
];
for (const [name, from, to] of packageMutations) {
  const mutant = packageSource.replace(from, to);
  assert.notEqual(mutant, packageSource, `${name} package mutation must apply`);
  assert.throws(() => assertSkillEffectClosure(currentRuntime, { gameSource, packageJson: mutant }), undefined, `${name} must be killed`);
}

console.log(`V8.2 E5 skill effect closure mutants: PASS (${runtimeMutations.length + liveMutations.length + packageMutations.length}/${runtimeMutations.length + liveMutations.length + packageMutations.length} killed)`);
