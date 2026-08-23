import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MONSTER_CATALOG } from '../monster-catalog.mjs';
import { MONSTER_STAT_KEYS } from '../monster-stat-contract.mjs';
import { calculateMonsterStats } from '../monster-stat-formula.mjs';
import { normalizeInstance } from '../monster-instance.mjs';
import {
  CANONICAL_LIVE_STAT_VERSION,
  WILD_STAT_VARIANT_MULTIPLIERS,
  applyCanonicalOwnedStats,
  calculateCanonicalWildStats,
  computeCanonicalOwnedStats,
  refreshCanonicalOwnedStats,
} from '../live-progression.mjs';

const POTENTIAL = Object.freeze({ hp: 15, atk: 15, def: 15, spAtk: 15, spDef: 15, spd: 15 });
const TRAINING = Object.freeze({ hp: 0, atk: 0, def: 0, spAtk: 0, spDef: 0, spd: 0 });

assert.equal(CANONICAL_LIVE_STAT_VERSION, 'canonical-live-stats/v2');
assert.equal(Object.isFrozen(WILD_STAT_VARIANT_MULTIPLIERS), true);
for (const multipliers of Object.values(WILD_STAT_VARIANT_MULTIPLIERS)) assert.equal(Object.isFrozen(multipliers), true);

const owned = normalizeInstance({
  instanceId: 'live-flame', speciesId: 'flameling', formId: 'flameling', level: 15,
  potential: POTENTIAL, statTraining: TRAINING, _condition: 'normal',
}, { now: 1000 });
owned._condition = 'normal';
const ownedBefore = structuredClone(owned);
const computed = computeCanonicalOwnedStats(owned);
assert.equal(computed.ok, true);
assert.equal(computed.activation, 'runtime_live');
assert.equal(computed.version, 'canonical-live-stats/v2');
assert.equal(computed.formId, 'MON_002');
assert.deepEqual(computed.stats, { hp: 246, atk: 18, def: 17, spAtk: 23, spDef: 18, spd: 21 });
assert.deepEqual(owned, ownedBefore, 'owned computation is pure');

owned.maxHp = 100;
owned.hp = 25;
const refreshed = refreshCanonicalOwnedStats(owned);
assert.equal(refreshed.ok, true);
assert.equal(owned.maxHp, 246);
assert.equal(owned.hp, 62, 'non-heal refresh preserves HP ratio');
assert.equal(owned.spAtk, 23);
assert.equal(owned.spDef, 18);
refreshCanonicalOwnedStats(owned, null, { heal: true });
assert.equal(owned.hp, owned.maxHp, 'heal refresh restores canonical MaxHP');

const equipped = computeCanonicalOwnedStats(owned, { hp: 3, atk: 2, def: 1, spAtk: 4, spDef: 5, spd: 6 });
assert.deepEqual(equipped.stats, { hp: 264, atk: 20, def: 18, spAtk: 27, spDef: 23, spd: 27 });
const rejected = normalizeInstance({ instanceId: 'unknown-live', speciesId: 'unknown', level: 1 }, { now: 1000 });
const rejectedBefore = structuredClone(rejected);
assert.equal(refreshCanonicalOwnedStats(rejected).ok, false);
assert.deepEqual(rejected, rejectedBefore, 'rejected live instance is not partially mutated');
assert.equal(applyCanonicalOwnedStats(owned, { ok: false }), false);

let resolvedWildForms = 0;
for (const mapping of MONSTER_CATALOG) {
  for (const stage of [1, 2]) {
    for (const level of [1, 15, 60]) {
      const wild = calculateCanonicalWildStats({
        runtimeSpeciesId: mapping.runtimeSpeciesId, stage, level,
        potential: POTENTIAL, training: TRAINING, variant: 'Normal',
      });
      assert.equal(wild.ok, true);
      const expectedFormId = stage === 1 ? mapping.workbookBaseMonsterId : mapping.workbookStage2MonsterId;
      assert.equal(wild.formId, expectedFormId);
      const formulaStats = calculateMonsterStats({ formId: expectedFormId, level, potential: POTENTIAL, training: TRAINING }).stats;
      assert.deepEqual(wild.stats, { ...formulaStats, hp: formulaStats.hp * 6 });
      assert.deepEqual(Object.keys(wild.stats), MONSTER_STAT_KEYS);
      resolvedWildForms += 1;
    }
  }
}
assert.equal(resolvedWildForms, 18 * 2 * 3);

const baseWild = calculateCanonicalWildStats({ runtimeSpeciesId: 'flameling', stage: 1, level: 15, potential: POTENTIAL, training: TRAINING });
const elite = calculateCanonicalWildStats({ runtimeSpeciesId: 'flameling', stage: 1, level: 15, potential: POTENTIAL, training: TRAINING, variant: 'Elite' });
const boss = calculateCanonicalWildStats({ runtimeSpeciesId: 'flameling', stage: 1, level: 15, potential: POTENTIAL, training: TRAINING, variant: 'Boss' });
assert.equal(elite.stats.hp, Math.round(baseWild.stats.hp * 1.3));
assert.equal(elite.stats.spAtk, Math.round(baseWild.stats.spAtk * 1.12));
assert.equal(boss.stats.hp, baseWild.stats.hp * 2);
assert.equal(boss.stats.spDef, Math.round(baseWild.stats.spDef * 1.3));
assert.equal(calculateCanonicalWildStats({ runtimeSpeciesId: 'missing', stage: 1, level: 1, potential: POTENTIAL, training: TRAINING }).reason, 'unknown_wild_form');
assert.equal(calculateCanonicalWildStats({ runtimeSpeciesId: 'flameling', stage: 1, level: 1, potential: POTENTIAL, training: TRAINING, variant: 'Mythic' }).reason, 'unknown_wild_variant');

const game = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
assert.match(game, /import \{[^}]*calculateCanonicalWildStats[^}]*refreshCanonicalOwnedStats[^}]*\} from '\.\/live-progression\.mjs'/s);
assert.match(game, /const computed=refreshCanonicalOwnedStats\(inst,getEquipmentFlat\(inst\),\{heal\}\)/);
assert.match(game, /const canonicalStats=calculateCanonicalWildStats\(\{runtimeSpeciesId:sp\.id,stage:evolutionPath\?2:1,level,potential/);
assert.match(game, /\{hp:maxHp,atk,def,spAtk,spDef,spd\}=canonicalStats\.stats/);
assert.match(game, /potential:w\.potential/, 'capture preserves the exact wild Potential');
assert.match(game, /potential:opts\.potential/, 'owned factory forwards captured Potential into instance migration');
assert.doesNotMatch(game.match(/function createWild\([\s\S]*?\n\}/)?.[0] ?? '', /statValue\(/, 'wild creation no longer uses legacy four-stat growth');

console.log('V8.3 owned/wild canonical six-stat live runtime: PASS');
