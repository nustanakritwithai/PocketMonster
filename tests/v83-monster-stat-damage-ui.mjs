import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  LIVE_DAMAGE_CLASS_POLICY,
  liveClassedMoveDamage,
  resolveLiveDamageClass,
} from '../live-progression.mjs';
import { SKILL_DAMAGE_PROFILES } from '../skill-effect-runtime.mjs';

assert.equal(Object.isFrozen(LIVE_DAMAGE_CLASS_POLICY), true);
assert.equal(Object.isFrozen(LIVE_DAMAGE_CLASS_POLICY.Physical), true);
assert.equal(Object.isFrozen(LIVE_DAMAGE_CLASS_POLICY.Special), true);
assert.deepEqual(LIVE_DAMAGE_CLASS_POLICY.Physical, {
  attackStat: 'atk', defenseStat: 'def', workbookAttackStat: 'ATK', workbookDefenseStat: 'DEF',
});
assert.deepEqual(LIVE_DAMAGE_CLASS_POLICY.Special, {
  attackStat: 'spAtk', defenseStat: 'spDef', workbookAttackStat: 'SPATK', workbookDefenseStat: 'SPDEF',
});

const attackerStats = { atk: 80, def: 30, spAtk: 20, spDef: 50 };
const defenderStats = { atk: 30, def: 10, spAtk: 30, spDef: 100 };
const physicalRoute = resolveLiveDamageClass({ category: 'Physical', attackerStats, defenderStats });
assert.deepEqual(
  { damageClass: physicalRoute.damageClass, attackStat: physicalRoute.attackStat, defenseStat: physicalRoute.defenseStat, attackValue: physicalRoute.attackValue, defenseValue: physicalRoute.defenseValue },
  { damageClass: 'Physical', attackStat: 'atk', defenseStat: 'def', attackValue: 80, defenseValue: 10 },
);
for (const category of ['Special', 'Control', 'Ultimate']) {
  const route = resolveLiveDamageClass({ category, attackerStats, defenderStats });
  assert.deepEqual(
    { damageClass: route.damageClass, attackStat: route.attackStat, defenseStat: route.defenseStat, attackValue: route.attackValue, defenseValue: route.defenseValue },
    { damageClass: 'Special', attackStat: 'spAtk', defenseStat: 'spDef', attackValue: 20, defenseValue: 100 },
  );
}
assert.equal(resolveLiveDamageClass({ category: 'Physical', attackerStats: { ...attackerStats, atk: 0 }, defenderStats }).reason, 'invalid_attack_stat');
assert.equal(resolveLiveDamageClass({ category: 'Special', attackerStats, defenderStats: { ...defenderStats, spDef: 0 } }).reason, 'invalid_defense_stat');

const damageInput = {
  movePower: 50, attackerStats, defenderStats, attackerLevel: 20, defenderLevel: 20,
  critRate: 0, critRoll: 1,
};
const physicalDamage = liveClassedMoveDamage({ ...damageInput, category: 'Physical' });
const specialDamage = liveClassedMoveDamage({ ...damageInput, category: 'Special' });
assert.equal(physicalDamage.ok, true);
assert.equal(physicalDamage.damageClass, 'Physical');
assert.equal(specialDamage.damageClass, 'Special');
assert.ok(physicalDamage.damage > specialDamage.damage, 'Physical must use high ATK against low DEF; Special must use low SPATK against high SPDEF');
assert.equal(liveClassedMoveDamage({ ...damageInput, attackerStats: { ...attackerStats, atk: 0 }, category: 'Physical' }).damage, 0);

const directProfiles = SKILL_DAMAGE_PROFILES.filter(profile => profile.directDamage);
const physicalProfiles = directProfiles.filter(profile => profile.category === 'Physical');
const specialProfiles = directProfiles.filter(profile => profile.category !== 'Physical');
assert.equal(SKILL_DAMAGE_PROFILES.length, 108);
assert.equal(directProfiles.length, 87);
assert.equal(physicalProfiles.length, 36);
assert.equal(specialProfiles.length, 51);
for (const profile of physicalProfiles) {
  assert.equal(profile.scalingStat, 'ATK', `${profile.skillId} Physical scaling`);
  assert.equal(profile.defenseStat, 'DEF', `${profile.skillId} Physical defense`);
}
for (const profile of specialProfiles) {
  assert.equal(profile.scalingStat, 'SPATK', `${profile.skillId} non-Physical scaling`);
  assert.equal(profile.defenseStat, 'SPDEF', `${profile.skillId} non-Physical defense`);
}

const game = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const canonicalAdapter = game.match(/function canonicalCombatSkills\(inst\)\{[\s\S]*?\n\}/)?.[0] ?? '';
const ownedDamage = game.match(/function monsterDamage\([\s\S]*?\n\}/)?.[0] ?? '';
const wildDamage = game.match(/function wildDamage\([\s\S]*?\n\}/)?.[0] ?? '';
const evolutionPreview = game.match(/function renderFocusedEvolutionBuildPreview\(\)\{[\s\S]*?\n\}/)?.[0] ?? '';
const managerBreakdown = game.match(/function breakdownHTML\(inst\)\{[\s\S]*?\n\}/)?.[0] ?? '';
const fullBreakdown = game.match(/function renderFullCharacterStatBreakdown\(\)\{[\s\S]*?\n\}/)?.[0] ?? '';
const fullStatus = game.match(/function renderFullCharacterStatus\(\)\{[\s\S]*?\n\}/)?.[0] ?? '';
const crDebug = game.match(/function renderCrDebug\(\)\{[\s\S]*?\n\}/)?.[0] ?? '';
assert.match(game, /import \{[^}]*liveClassedMoveDamage[^}]*\} from '\.\/live-progression\.mjs'/s);
assert.match(canonicalAdapter, /category:definition\.category/);
assert.match(ownedDamage, /liveClassedMoveDamage\(\{/);
assert.match(ownedDamage, /category:move\.category\|\|'Physical'/);
assert.match(ownedDamage, /attackerStats:\{atk:[^}]*spAtk:/);
assert.match(ownedDamage, /defenderStats:\{def:[^}]*spDef:/);
assert.match(wildDamage, /category:'Physical'/);
assert.match(wildDamage, /liveClassedMoveDamage\(\{/);
assert.doesNotMatch(game, /\bliveMoveDamage\(/, 'live game must not bypass class routing');
assert.match(game, /name:'Basic Attack',type:sp\.types\[0\],category:'Physical'/);

assert.match(game, /HP \$\{fmt\(inst\.hp\)\}\/\$\{inst\.maxHp\} • ATK \$\{inst\.atk\} • DEF \$\{inst\.def\} • SP\.ATK \$\{inst\.spAtk\} • SP\.DEF \$\{inst\.spDef\} • SPD \$\{inst\.spd\}/);
assert.match(game, /ATK \$\{inst\.atk\} · DEF \$\{inst\.def\} · SP\.ATK \$\{inst\.spAtk\} · SP\.DEF \$\{inst\.spDef\} · SPD \$\{inst\.spd\}/);
assert.match(evolutionPreview, /\['hp','atk','def','spAtk','spDef','spd'\]\.map\(stat=>/);
assert.match(managerBreakdown, /const labels=\{hp:'HP',atk:'ATK',def:'DEF',spAtk:'SP\.ATK',spDef:'SP\.DEF',spd:'SPD'\}/);
assert.match(managerBreakdown, /detail\.baseStat/);
assert.match(managerBreakdown, /detail\.potential/);
assert.match(managerBreakdown, /detail\.training/);
assert.doesNotMatch(game, /atk\.speciesBase|atk\.levelGrowth|atk\.geneRank/, 'six-stat UI must not read removed legacy breakdown fields');
assert.match(fullBreakdown, /\['hp','atk','def','spAtk','spDef','spd'\]/);
assert.match(fullBreakdown, /detail\.baseStat/);
assert.match(fullBreakdown, /detail\.potential/);
assert.match(fullStatus, /character-status-spatk/);
assert.match(fullStatus, /character-status-spdef/);
assert.match(crDebug, /\['hp','atk','def','spAtk','spDef','spd'\]/);
assert.match(crDebug, /Legacy CR/);

console.log('V8.3 Physical/Special damage routing and canonical six-stat UI: PASS');
