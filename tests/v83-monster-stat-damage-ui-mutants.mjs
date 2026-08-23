import assert from 'node:assert/strict';
import fs from 'node:fs';

const sources = Object.freeze({
  live: ['live-progression.mjs', fs.readFileSync(new URL('../live-progression.mjs', import.meta.url), 'utf8')],
  game: ['game-v800.js', fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8')],
});

async function loadLive(source, label) {
  const fileUrl = new URL('../live-progression.mjs', import.meta.url);
  const absolute = source.replaceAll(/from '(\.\/[^']+)'/g, (_, path) => `from '${new URL(path, fileUrl).href}'`);
  return import(`data:text/javascript;base64,${Buffer.from(`${absolute}\n//# sourceURL=${label}`).toString('base64')}`);
}

function assertLive(module) {
  assert.deepEqual(module.LIVE_DAMAGE_CLASS_POLICY.Physical, {
    attackStat: 'atk', defenseStat: 'def', workbookAttackStat: 'ATK', workbookDefenseStat: 'DEF',
  });
  assert.deepEqual(module.LIVE_DAMAGE_CLASS_POLICY.Special, {
    attackStat: 'spAtk', defenseStat: 'spDef', workbookAttackStat: 'SPATK', workbookDefenseStat: 'SPDEF',
  });
  const attackerStats = { atk: 80, spAtk: 20 };
  const defenderStats = { def: 10, spDef: 100 };
  const physical = module.resolveLiveDamageClass({ category: 'Physical', attackerStats, defenderStats });
  const special = module.resolveLiveDamageClass({ category: 'Special', attackerStats, defenderStats });
  const control = module.resolveLiveDamageClass({ category: 'Control', attackerStats, defenderStats });
  assert.deepEqual([physical.damageClass, physical.attackValue, physical.defenseValue], ['Physical', 80, 10]);
  assert.deepEqual([special.damageClass, special.attackValue, special.defenseValue], ['Special', 20, 100]);
  assert.deepEqual([control.damageClass, control.attackValue, control.defenseValue], ['Special', 20, 100]);
  assert.equal(module.resolveLiveDamageClass({ category: 'Physical', attackerStats: { ...attackerStats, atk: 0 }, defenderStats }).reason, 'invalid_attack_stat');
  assert.equal(module.resolveLiveDamageClass({ category: 'Special', attackerStats, defenderStats: { ...defenderStats, spDef: 0 } }).reason, 'invalid_defense_stat');
  const input = { movePower: 50, attackerStats, defenderStats, attackerLevel: 20, defenderLevel: 20 };
  const physicalDamage = module.liveClassedMoveDamage({ ...input, category: 'Physical' });
  const specialDamage = module.liveClassedMoveDamage({ ...input, category: 'Special' });
  assert.ok(physicalDamage.damage > specialDamage.damage);
  assert.deepEqual([physicalDamage.attackStat, physicalDamage.defenseStat], ['atk', 'def']);
  assert.deepEqual([specialDamage.attackStat, specialDamage.defenseStat], ['spAtk', 'spDef']);
}

function assertGame(source) {
  const adapter = source.match(/function canonicalCombatSkills\(inst\)\{[\s\S]*?\n\}/)?.[0] ?? '';
  const owned = source.match(/function monsterDamage\([\s\S]*?\n\}/)?.[0] ?? '';
  const wild = source.match(/function wildDamage\([\s\S]*?\n\}/)?.[0] ?? '';
  const evolutionPreview = source.match(/function renderFocusedEvolutionBuildPreview\(\)\{[\s\S]*?\n\}/)?.[0] ?? '';
  const managerBreakdown = source.match(/function breakdownHTML\(inst\)\{[\s\S]*?\n\}/)?.[0] ?? '';
  const fullBreakdown = source.match(/function renderFullCharacterStatBreakdown\(\)\{[\s\S]*?\n\}/)?.[0] ?? '';
  const fullStatus = source.match(/function renderFullCharacterStatus\(\)\{[\s\S]*?\n\}/)?.[0] ?? '';
  const crDebug = source.match(/function renderCrDebug\(\)\{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(adapter, /category:definition\.category/);
  assert.match(owned, /category:move\.category\|\|'Physical'/);
  assert.match(owned, /attackerStats:\{atk:[^}]*spAtk:/);
  assert.match(owned, /defenderStats:\{def:[^}]*spDef:/);
  assert.match(wild, /category:'Physical'/);
  assert.match(source, /name:'Basic Attack',type:sp\.types\[0\],category:'Physical'/);
  assert.match(source, /HP \$\{fmt\(inst\.hp\)\}\/\$\{inst\.maxHp\} • ATK \$\{inst\.atk\} • DEF \$\{inst\.def\} • SP\.ATK \$\{inst\.spAtk\} • SP\.DEF \$\{inst\.spDef\} • SPD \$\{inst\.spd\}/);
  assert.match(source, /ATK \$\{inst\.atk\} · DEF \$\{inst\.def\} · SP\.ATK \$\{inst\.spAtk\} · SP\.DEF \$\{inst\.spDef\} · SPD \$\{inst\.spd\}/);
  assert.match(evolutionPreview, /\['hp','atk','def','spAtk','spDef','spd'\]\.map\(stat=>/);
  assert.match(managerBreakdown, /const labels=\{hp:'HP',atk:'ATK',def:'DEF',spAtk:'SP\.ATK',spDef:'SP\.DEF',spd:'SPD'\}/);
  assert.match(managerBreakdown, /detail\.baseStat/);
  assert.doesNotMatch(source, /atk\.speciesBase|atk\.levelGrowth|atk\.geneRank/);
  assert.match(fullBreakdown, /\['hp','atk','def','spAtk','spDef','spd'\]/);
  assert.match(fullBreakdown, /detail\.baseStat/);
  assert.match(fullStatus, /character-status-spatk/);
  assert.match(fullStatus, /character-status-spdef/);
  assert.match(crDebug, /\['hp','atk','def','spAtk','spDef','spd'\]/);
  assert.match(crDebug, /Legacy CR/);
}

assertLive(await loadLive(sources.live[1], 'damage-ui-current'));
assertGame(sources.game[1]);

const mutations = [
  ['live', 'Physical reads SPATK', "attackStat: 'atk', defenseStat: 'def'", "attackStat: 'spAtk', defenseStat: 'def'", assertLive],
  ['live', 'Physical reads SPDEF', "attackStat: 'atk', defenseStat: 'def'", "attackStat: 'atk', defenseStat: 'spDef'", assertLive],
  ['live', 'Special reads ATK', "attackStat: 'spAtk', defenseStat: 'spDef'", "attackStat: 'atk', defenseStat: 'spDef'", assertLive],
  ['live', 'Special reads DEF', "attackStat: 'spAtk', defenseStat: 'spDef'", "attackStat: 'spAtk', defenseStat: 'def'", assertLive],
  ['live', 'non-Physical becomes Physical', "nonPhysicalDirectClass: 'Special'", "nonPhysicalDirectClass: 'Physical'", assertLive],
  ['live', 'zero attack accepted', 'attackValue < 1', 'attackValue < 0', assertLive],
  ['live', 'zero defense accepted', 'defenseValue < 1', 'defenseValue < 0', assertLive],
  ['live', 'swap routed attack and defense', 'atk: route.attackValue, def: route.defenseValue', 'atk: route.defenseValue, def: route.attackValue', assertLive],
  ['game', 'drop catalog category', 'category:definition.category,', '', assertGame],
  ['game', 'force owned Physical', "category:move.category||'Physical'", "category:'Physical'", assertGame],
  ['game', 'wild attack becomes Special', "move={type:sp.types[0],category:'Physical'", "move={type:sp.types[0],category:'Special'", assertGame],
  ['game', 'owned Basic loses Physical class', "name:'Basic Attack',type:sp.types[0],category:'Physical'", "name:'Basic Attack',type:sp.types[0]", assertGame],
  ['game', 'hide manager SPATK', ' • SP.ATK ${inst.spAtk}', '', assertGame],
  ['game', 'hide compact SPDEF', ' · SP.DEF ${inst.spDef}', '', assertGame],
  ['game', 'drop special evolution deltas', "['hp','atk','def','spAtk','spDef','spd'].map(stat=>", "['hp','atk','def','spd'].map(stat=>", assertGame],
  ['game', 'drop special breakdown labels', "spAtk:'SP.ATK',spDef:'SP.DEF',", '', assertGame],
  ['game', 'restore legacy breakdown field', 'detail.baseStat', 'detail.speciesBase', assertGame],
  ['game', 'hide full-status SPATK', 'class="character-status-spatk"', 'class="character-status-special"', assertGame],
  ['game', 'hide CR special-stat routing', "['hp','atk','def','spAtk','spDef','spd'].map(stat=>{const s=b[stat]", "['hp','atk','def','spd'].map(stat=>{const s=b[stat]", assertGame],
];

let killed = 0;
for (const [sourceKey, name, from, to, contract] of mutations) {
  const [filename, source] = sources[sourceKey];
  const mutant = source.replace(from, to);
  assert.notEqual(mutant, source, `${name} mutation must apply`);
  try {
    const target = sourceKey === 'live' ? await loadLive(mutant, `damage-ui-mutant-${name}`) : mutant;
    contract(target);
  } catch {
    killed += 1;
    continue;
  }
  assert.fail(`${name} mutant survived`);
}

assert.equal(killed, mutations.length);
console.log(`V8.3 damage/UI mutants: PASS (${killed}/${mutations.length} killed)`);
