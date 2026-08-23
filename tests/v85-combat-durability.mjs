import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BALANCE_CONFIG } from '../balance-config.mjs';
import { MONSTER_CATALOG } from '../monster-catalog.mjs';
import { calculateMonsterStats } from '../monster-stat-formula.mjs';
import { SKILL_CATALOG } from '../skill-catalog.mjs';
import {
  CANONICAL_LIVE_STAT_VERSION,
  calculateCanonicalWildStats,
  liveClassedMoveDamage,
  refreshCanonicalOwnedStats,
} from '../live-progression.mjs';

const POTENTIAL = Object.freeze({ hp: 15, atk: 15, def: 15, spAtk: 15, spDef: 15, spd: 15 });
const TRAINING = Object.freeze({ hp: 0, atk: 0, def: 0, spAtk: 0, spDef: 0, spd: 0 });
const durability = BALANCE_CONFIG.combat;

assert.equal(Object.isFrozen(durability), true);
assert.equal(durability.liveHpMultiplier, 6);
assert.equal(durability.minimumEqualLevelNeutralBasicHits, 3);
assert.equal(CANONICAL_LIVE_STAT_VERSION, 'canonical-live-stats/v2');

let matchupCount = 0;
for (const mapping of MONSTER_CATALOG) {
  for (const stage of [1, 2]) {
    for (const level of [1, 15, 60]) {
      const formId = stage === 1 ? mapping.workbookBaseMonsterId : mapping.workbookStage2MonsterId;
      const formula = calculateMonsterStats({ formId, level, potential: POTENTIAL, training: TRAINING });
      const normal = calculateCanonicalWildStats({
        runtimeSpeciesId: mapping.runtimeSpeciesId,
        stage,
        level,
        potential: POTENTIAL,
        training: TRAINING,
        variant: 'Normal',
      });
      assert.equal(normal.ok, true);
      assert.equal(normal.stats.hp, formula.stats.hp * durability.liveHpMultiplier);
      assert.deepEqual(
        { atk: normal.stats.atk, def: normal.stats.def, spAtk: normal.stats.spAtk, spDef: normal.stats.spDef, spd: normal.stats.spd },
        { atk: formula.stats.atk, def: formula.stats.def, spAtk: formula.stats.spAtk, spDef: formula.stats.spDef, spd: formula.stats.spd },
        'durability tuning must not inflate non-HP stats',
      );
      const basic = liveClassedMoveDamage({
        category: 'Physical',
        movePower: 15,
        attackerStats: normal.stats,
        defenderStats: normal.stats,
        attackerLevel: level,
        defenderLevel: level,
        stab: 1.5,
        effectiveness: 1,
        critRate: 0,
        critRoll: 1,
      });
      assert.equal(basic.ok, true);
      assert.ok(normal.stats.hp - basic.damage > 0, `${mapping.runtimeSpeciesId} Stage ${stage} Lv.${level} must survive one neutral Basic Attack`);
      assert.ok(
        Math.ceil(normal.stats.hp / basic.damage) >= durability.minimumEqualLevelNeutralBasicHits,
        `${mapping.runtimeSpeciesId} Stage ${stage} Lv.${level} combat ends too quickly`,
      );
      matchupCount += 1;
    }
  }
}
assert.equal(matchupCount, 18 * 2 * 3);

const unlockLevelForSkill = skillId => {
  const slot = Number(skillId.slice(-2));
  return [0, 1, 5, 8, 10, 14, 15][slot];
};
let directSkillCount = 0;
for (const skill of SKILL_CATALOG.filter(entry => entry.directDamage)) {
  const owner = MONSTER_CATALOG.find(entry => entry.runtimeType === skill.runtimeType);
  assert.ok(owner, `${skill.id} must resolve an owner of the same runtime type`);
  const slot = Number(skill.id.slice(-2));
  const level = unlockLevelForSkill(skill.id);
  const stats = calculateCanonicalWildStats({
    runtimeSpeciesId: owner.runtimeSpeciesId,
    stage: slot === 6 ? 2 : 1,
    level,
    potential: POTENTIAL,
    training: TRAINING,
    variant: 'Normal',
  }).stats;
  const result = liveClassedMoveDamage({
    category: skill.category,
    movePower: skill.power,
    attackerStats: stats,
    defenderStats: stats,
    attackerLevel: level,
    defenderLevel: level,
    stab: 1.5,
    effectiveness: 1,
    critRate: 0,
    critRoll: 1,
  });
  assert.ok(stats.hp - result.damage > 0, `${skill.id} must not one-shot an equal-level neutral target from full HP`);
  directSkillCount += 1;
}
assert.equal(directSkillCount, 87);

const normal = calculateCanonicalWildStats({ runtimeSpeciesId: 'flameling', stage: 1, level: 15, potential: POTENTIAL, training: TRAINING, variant: 'Normal' });
const elite = calculateCanonicalWildStats({ runtimeSpeciesId: 'flameling', stage: 1, level: 15, potential: POTENTIAL, training: TRAINING, variant: 'Elite' });
const boss = calculateCanonicalWildStats({ runtimeSpeciesId: 'flameling', stage: 1, level: 15, potential: POTENTIAL, training: TRAINING, variant: 'Boss' });
assert.ok(elite.stats.hp > normal.stats.hp);
assert.equal(boss.stats.hp, normal.stats.hp * 2, 'Boss keeps the approved 2x variant durability above normal wild HP');

const migrated = {
  instanceId: 'old-save-monster', speciesId: 'flameling', canonicalFormId: 'MON_002', level: 15,
  potential: { ...POTENTIAL }, statTraining: { ...TRAINING }, training: {},
  _condition: 'normal', body: {}, mind: {}, nutrition: { allocations: {} },
  maxHp: 41, hp: 20, fainted: false,
};
const oldRatio = migrated.hp / migrated.maxHp;
const refreshed = refreshCanonicalOwnedStats(migrated);
assert.equal(refreshed.ok, true);
assert.equal(migrated.maxHp, 246);
assert.ok(Math.abs((migrated.hp / migrated.maxHp) - oldRatio) <= 1 / migrated.maxHp, 'old saves preserve current HP ratio');

const game = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
assert.match(game, /state\.collection=migrated\.collection\.map\(ensureInstanceShape\)/, 'every loaded monster is refreshed into current live stats');
assert.match(game, /function loadGame\(\)[\s\S]*?migrateLoadedState\(saved\.state\)/, 'local saves use the migration path');
assert.match(game, /async function syncCloudSave\(\)[\s\S]*?migrateLoadedState\(remote\.state\)/, 'Firebase saves use the same migration path');

console.log(`V8.5 combat durability: PASS (${matchupCount} Basic matchups + ${directSkillCount} direct skills; no equal-level neutral one-shots)`);
