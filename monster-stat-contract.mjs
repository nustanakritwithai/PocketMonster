import { CONTENT_PROVENANCE, assertContentProvenance } from './content-provenance.mjs';
import { MONSTER_CATALOG } from './monster-catalog.mjs';

assertContentProvenance(CONTENT_PROVENANCE);

export const MONSTER_STAT_CONTRACT_VERSION = 'monster-stat-coverage/v1';
export const MONSTER_STAT_KEYS = Object.freeze(['hp', 'atk', 'def', 'spAtk', 'spDef', 'spd']);
export const MONSTER_STAT_MILESTONE_LEVELS = Object.freeze([1, 5, 10, 15, 20, 30, 40, 50, 60]);
export const MONSTER_STAT_SOURCE_LIMITS = Object.freeze({
  level: Object.freeze({ min: 1, max: 60 }),
  potential: Object.freeze({ min: 0, max: 31, default: 15 }),
  training: Object.freeze({ perStatMax: 200, totalMax: 600, divisor: 4 }),
  rounding: 'floor',
});

const RAW_MONSTER_STAT_FORMS = [
  ['MON_001','normalooze','SP_NORMAL_SLIME','สไลม์ปกติ','Plain Slime',1,'NORMAL','Balanced',52,42,42,42,42,42,262,'MON_019',15,50,'Common','Medium',35,70,10],
  ['MON_019','normalooze','SP_NORMAL_BEAST','กระต่ายว่องไว','Swift Hare',2,'NORMAL','Balanced',96,76,76,76,76,76,476,null,null,null,'Uncommon','Medium',90,32,20],
  ['MON_002','flameling','SP_FIRE_SLIME','สไลม์ไฟ','Ember Slime',1,'FIRE','Burst',46,38,34,54,38,46,256,'MON_020',15,50,'Common','Medium',35,70,10],
  ['MON_020','flameling','SP_FIRE_BEAST','จิ้งจอกเพลิง','Blaze Fox',2,'FIRE','Burst',86,69,63,95,69,82,464,null,null,null,'Uncommon','Medium',90,32,20],
  ['MON_003','aquapuff','SP_WATER_SLIME','สไลม์น้ำ','Aqua Slime',1,'WATER','Sustain',54,38,44,44,46,36,262,'MON_021',15,50,'Common','Medium',35,66,10],
  ['MON_021','aquapuff','SP_WATER_BEAST','นากวารี','Aqua Otter',2,'WATER','Sustain',99,69,79,79,82,66,474,null,null,null,'Uncommon','Medium',90,28,20],
  ['MON_004','mossbun','SP_GRASS_SLIME','สไลม์พืช','Leaf Slime',1,'GRASS','Support',50,34,42,44,50,38,258,'MON_022',15,50,'Common','Medium',35,70,10],
  ['MON_022','mossbun','SP_GRASS_BEAST','กวางพฤกษา','Verdant Deer',2,'GRASS','Support',93,63,76,79,89,69,469,null,null,null,'Uncommon','Medium',90,32,20],
  ['MON_005','voltkit','SP_ELECTRIC_SLIME','สไลม์ไฟฟ้า','Volt Slime',1,'ELECTRIC','Speed',44,44,34,46,34,58,260,'MON_023',15,50,'Common','Medium',35,70,10],
  ['MON_023','voltkit','SP_ELECTRIC_BEAST','เสือสายฟ้า','Volt Tiger',2,'ELECTRIC','Speed',83,79,63,82,63,101,471,null,null,null,'Uncommon','Medium',90,32,20],
  ['MON_006','frostowl','SP_ICE_SLIME','สไลม์น้ำแข็ง','Frost Slime',1,'ICE','Control',48,36,40,46,46,42,258,'MON_024',15,50,'Common','Medium',35,70,10],
  ['MON_024','frostowl','SP_ICE_BEAST','หมาป่าน้ำแข็ง','Frost Wolf',2,'ICE','Control',89,66,72,82,82,76,467,null,null,null,'Uncommon','Medium',90,32,20],
  ['MON_007','rockhorn','SP_ROCK_SLIME','สไลม์หิน','Stone Slime',1,'ROCK','Tank',60,40,56,32,50,26,264,'MON_025',15,50,'Common','MediumSlow',35,66,10],
  ['MON_025','rockhorn','SP_ROCK_BEAST','แรดศิลา','Stone Rhino',2,'ROCK','Tank',109,72,98,59,89,50,477,null,null,null,'Uncommon','MediumSlow',90,28,20],
  ['MON_008','sandmole','SP_GROUND_SLIME','สไลม์ดิน','Mud Slime',1,'GROUND','Bruiser',56,48,48,34,40,32,258,'MON_026',15,50,'Common','Medium',35,70,10],
  ['MON_026','sandmole','SP_GROUND_BEAST','ตัวตุ่นปฐพี','Terra Mole',2,'GROUND','Bruiser',102,85,85,63,72,59,466,null,null,null,'Uncommon','Medium',90,32,20],
  ['MON_009','galebird','SP_FLYING_SLIME','สไลม์ลม','Gust Slime',1,'FLYING','Mobility',44,42,34,42,34,58,254,'MON_027',15,50,'Common','Medium',35,70,10],
  ['MON_027','galebird','SP_FLYING_BEAST','เหยี่ยววายุ','Gale Hawk',2,'FLYING','Mobility',83,76,63,76,63,101,462,null,null,null,'Uncommon','Medium',90,32,20],
  ['MON_010','toxitoad','SP_POISON_SLIME','สไลม์พิษ','Toxic Slime',1,'POISON','DoT',48,36,38,48,42,44,256,'MON_028',15,50,'Common','Medium',35,70,10],
  ['MON_028','toxitoad','SP_POISON_BEAST','งูพิษ','Venom Serpent',2,'POISON','DoT',89,66,69,85,76,79,464,null,null,null,'Uncommon','Medium',90,32,20],
  ['MON_011','voidhorn','SP_DARK_SLIME','สไลม์มืด','Shade Slime',1,'DARK','Assassin',42,52,32,44,34,58,262,'MON_029',15,50,'Common','Medium',35,70,10],
  ['MON_029','voidhorn','SP_DARK_BEAST','เสือดำเงา','Shadow Panther',2,'DARK','Assassin',80,92,59,79,63,101,474,null,null,null,'Rare','Medium',100,24,20],
  ['MON_012','fairimp','SP_LIGHT_SLIME','สไลม์แสง','Lumen Slime',1,'LIGHT','Healer',52,32,40,48,54,36,262,'MON_030',15,50,'Common','Medium',35,70,10],
  ['MON_030','fairimp','SP_LIGHT_BEAST','กวางศักดิ์สิทธิ์','Lumen Stag',2,'LIGHT','Healer',96,59,72,85,95,66,473,null,null,null,'Rare','Medium',100,24,20],
  ['MON_013','mindcoon','SP_PSYCHIC_SLIME','สไลม์พลังจิต','Mind Slime',1,'PSYCHIC','Control',48,36,40,46,46,42,258,'MON_031',15,50,'Common','Medium',35,70,10],
  ['MON_031','mindcoon','SP_PSYCHIC_BEAST','แมวจิต','Mystic Lynx',2,'PSYCHIC','Control',89,66,72,82,82,76,467,null,null,null,'Uncommon','Medium',90,32,20],
  ['MON_014','buglet','SP_BUG_SLIME','สไลม์แมลง','Hive Slime',1,'BUG','Utility',50,40,48,40,46,34,258,'MON_032',15,50,'Common','Medium',35,70,10],
  ['MON_032','buglet','SP_BUG_BEAST','ด้วงเกราะ','Aegis Beetle',2,'BUG','Utility',93,72,85,72,82,63,467,null,null,null,'Uncommon','Medium',90,32,20],
  ['MON_015','emberdrake','SP_DRAGON_SLIME','สไลม์มังกร','Drake Slime',1,'DRAGON','Scaler',50,44,40,50,40,38,262,'MON_033',15,50,'Common','Slow',35,70,10],
  ['MON_033','emberdrake','SP_DRAGON_BEAST','มังกรน้อย','Drake Whelp',2,'DRAGON','Scaler',93,79,72,89,72,69,474,null,null,null,'Rare','Slow',100,24,20],
  ['MON_016','punchcub','SP_FIGHTING_SLIME','สไลม์ต่อสู้','Brawl Slime',1,'FIGHTING','Combo',50,52,40,32,36,48,258,'MON_034',15,50,'Common','Medium',35,70,10],
  ['MON_034','punchcub','SP_FIGHTING_BEAST','ลิงนักสู้','Brawler Ape',2,'FIGHTING','Combo',93,92,72,59,66,85,467,null,null,null,'Uncommon','Medium',90,32,20],
  ['MON_017','ironbug','SP_STEEL_SLIME','สไลม์เหล็ก','Iron Slime',1,'STEEL','Tank',60,40,56,32,50,26,264,'MON_035',15,50,'Common','MediumSlow',35,66,10],
  ['MON_035','ironbug','SP_STEEL_BEAST','หมาป่าเหล็ก','Iron Wolf',2,'STEEL','Tank',109,72,98,59,89,50,477,null,null,null,'Uncommon','MediumSlow',90,28,20],
  ['MON_018','ghostpurr','SP_GHOST_SLIME','สไลม์วิญญาณ','Wisp Slime',1,'GHOST','Trickster',46,38,36,50,42,50,262,'MON_036',15,50,'Common','Medium',35,70,10],
  ['MON_036','ghostpurr','SP_GHOST_BEAST','จิ้งจอกวิญญาณ','Spirit Fox',2,'GHOST','Trickster',86,69,66,89,76,89,475,null,null,null,'Rare','Medium',100,24,20],
];

function contractRow(raw) {
  const [
    workbookMonsterId, runtimeSpeciesId, workbookSpeciesId, nameTH, nameEN, stage,
    workbookType, role, hp, atk, def, spAtk, spDef, spd, bst, evolutionTo,
    evolutionLevel, requiredBond, rarity, growthCurve, baseExpYield, captureRatePct, baseBond,
  ] = raw;
  return Object.freeze({
    schemaVersion: MONSTER_STAT_CONTRACT_VERSION,
    workbookMonsterId,
    runtimeSpeciesId,
    workbookSpeciesId,
    nameTH,
    nameEN,
    stage,
    workbookType,
    role,
    baseStats: Object.freeze({ hp, atk, def, spAtk, spDef, spd }),
    bst,
    evolutionTo,
    evolutionLevel,
    requiredBond,
    rarity,
    growthCurve,
    baseExpYield,
    captureRatePct,
    baseBond,
    activation: 'contract_only',
    sourceWorkbookVersion: CONTENT_PROVENANCE.workbookVersion,
    sourceWorkbookSha256: CONTENT_PROVENANCE.sha256,
  });
}

export const MONSTER_STAT_COVERAGE_CONTRACT = Object.freeze(RAW_MONSTER_STAT_FORMS.map(contractRow));

const FORM_BY_ID = new Map(MONSTER_STAT_COVERAGE_CONTRACT.map(row => [row.workbookMonsterId, row]));
const FORMS_BY_RUNTIME_SPECIES = new Map();
for (const row of MONSTER_STAT_COVERAGE_CONTRACT) {
  const forms = FORMS_BY_RUNTIME_SPECIES.get(row.runtimeSpeciesId) ?? [];
  forms.push(row);
  FORMS_BY_RUNTIME_SPECIES.set(row.runtimeSpeciesId, forms);
}

function issue(code, index, field, detail = {}) {
  return Object.freeze({ code, index, field, ...detail });
}

export function validateMonsterStatCoverageContract(records, mappings = MONSTER_CATALOG) {
  if (!Array.isArray(records) || !Array.isArray(mappings)) {
    return Object.freeze({ ok: false, issues: Object.freeze([issue('invalid_contract', -1, 'root')]) });
  }
  const issues = [];
  if (records.length !== 36) issues.push(issue('coverage_count_mismatch', -1, 'length', { value: records.length }));
  if (mappings.length !== 18) issues.push(issue('mapping_count_mismatch', -1, 'mappings', { value: mappings.length }));

  const byId = new Map();
  const runtimeIds = new Set();
  const formsByRuntimeId = new Map();
  records.forEach((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      issues.push(issue('invalid_contract_row', index, 'root'));
      return;
    }
    if (byId.has(row.workbookMonsterId)) issues.push(issue('duplicate_monster_id', index, 'workbookMonsterId', { value: row.workbookMonsterId }));
    byId.set(row.workbookMonsterId, row);
    runtimeIds.add(row.runtimeSpeciesId);
    const family = formsByRuntimeId.get(row.runtimeSpeciesId) ?? [];
    family.push(row);
    formsByRuntimeId.set(row.runtimeSpeciesId, family);
    if (!/^MON_\d{3}$/.test(row.workbookMonsterId ?? '')) issues.push(issue('invalid_monster_id', index, 'workbookMonsterId'));
    if (!/^SP_[A-Z0-9_]+$/.test(row.workbookSpeciesId ?? '')) issues.push(issue('invalid_species_id', index, 'workbookSpeciesId'));
    if (![1, 2].includes(row.stage)) issues.push(issue('invalid_stage', index, 'stage', { value: row.stage }));
    if (row.activation !== 'contract_only') issues.push(issue('runtime_activation_forbidden', index, 'activation'));
    if (row.sourceWorkbookVersion !== CONTENT_PROVENANCE.workbookVersion || row.sourceWorkbookSha256 !== CONTENT_PROVENANCE.sha256) {
      issues.push(issue('source_provenance_mismatch', index, 'sourceWorkbookSha256'));
    }
    if (!row.baseStats || MONSTER_STAT_KEYS.some(stat => !Number.isInteger(row.baseStats[stat]) || row.baseStats[stat] <= 0)) {
      issues.push(issue('invalid_base_stats', index, 'baseStats'));
    } else {
      const sum = MONSTER_STAT_KEYS.reduce((total, stat) => total + row.baseStats[stat], 0);
      if (sum !== row.bst) issues.push(issue('bst_mismatch', index, 'bst', { expected: sum, value: row.bst }));
    }
    if (!['Fast', 'Medium', 'MediumSlow', 'Slow'].includes(row.growthCurve)) issues.push(issue('invalid_growth_curve', index, 'growthCurve'));
    if (!['Common', 'Uncommon', 'Rare'].includes(row.rarity)) issues.push(issue('invalid_rarity', index, 'rarity'));
    if (!Number.isInteger(row.baseExpYield) || row.baseExpYield <= 0) issues.push(issue('invalid_base_exp_yield', index, 'baseExpYield'));
    if (!Number.isInteger(row.captureRatePct) || row.captureRatePct <= 0 || row.captureRatePct > 100) issues.push(issue('invalid_capture_rate', index, 'captureRatePct'));
    if (row.baseBond !== (row.stage === 1 ? 10 : 20)) issues.push(issue('base_bond_mismatch', index, 'baseBond'));
    if (row.stage === 1) {
      if (!/^MON_\d{3}$/.test(row.evolutionTo ?? '')) issues.push(issue('missing_evolution_target', index, 'evolutionTo'));
      if (row.evolutionLevel !== 15) issues.push(issue('evolution_level_mismatch', index, 'evolutionLevel'));
      if (row.requiredBond !== 50) issues.push(issue('evolution_bond_mismatch', index, 'requiredBond'));
    } else if (row.evolutionTo !== null || row.evolutionLevel !== null || row.requiredBond !== null) {
      issues.push(issue('stage2_evolution_data_forbidden', index, 'evolutionTo'));
    }
  });

  if (runtimeIds.size !== 18) issues.push(issue('runtime_species_count_mismatch', -1, 'runtimeSpeciesId', { value: runtimeIds.size }));
  for (const [runtimeSpeciesId, forms] of formsByRuntimeId) {
    const stages = forms.map(row => row.stage).sort();
    if (forms.length !== 2 || stages[0] !== 1 || stages[1] !== 2) {
      issues.push(issue('runtime_family_form_mismatch', -1, 'runtimeSpeciesId', { runtimeSpeciesId }));
    }
  }
  for (const row of records) {
    if (!row || row.stage !== 1 || !row.evolutionTo) continue;
    const target = byId.get(row.evolutionTo);
    if (!target || target.stage !== 2 || target.runtimeSpeciesId !== row.runtimeSpeciesId || target.workbookType !== row.workbookType) {
      issues.push(issue('invalid_evolution_pair', records.indexOf(row), 'evolutionTo', { value: row.evolutionTo }));
    }
  }
  for (const mapping of mappings) {
    const base = byId.get(mapping.workbookBaseMonsterId);
    const stage2 = byId.get(mapping.workbookStage2MonsterId);
    if (!base || base.runtimeSpeciesId !== mapping.runtimeSpeciesId || base.stage !== 1) {
      issues.push(issue('base_mapping_mismatch', -1, 'workbookBaseMonsterId', { runtimeSpeciesId: mapping.runtimeSpeciesId }));
    }
    if (!stage2 || stage2.runtimeSpeciesId !== mapping.runtimeSpeciesId || stage2.stage !== 2) {
      issues.push(issue('stage2_mapping_mismatch', -1, 'workbookStage2MonsterId', { runtimeSpeciesId: mapping.runtimeSpeciesId }));
    }
  }
  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });
}

export function monsterStatContractEntry(workbookMonsterId) {
  return FORM_BY_ID.get(workbookMonsterId) ?? null;
}

export function monsterStatFormsForRuntimeSpecies(runtimeSpeciesId) {
  return Object.freeze([...(FORMS_BY_RUNTIME_SPECIES.get(runtimeSpeciesId) ?? [])]);
}
