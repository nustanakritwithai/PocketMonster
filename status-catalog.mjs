import { CONTENT_PROVENANCE, assertContentProvenance } from './content-provenance.mjs';
import { CONTENT_ID_PATTERNS } from './content-validation.mjs';
import { SKILL_CATALOG, skillCatalogEntry } from './skill-catalog.mjs';

assertContentProvenance(CONTENT_PROVENANCE);

const RAW_STATUSES = [
  ["ST_BURN","เผาไหม้","Burn","Negative","DoT",5,1,1,"RefreshDuration","MaxHP",-1.5,"PctPerTick",false,"Cleanse","burn","เสีย HP ตาม MaxHP ทุก 1 วินาที; Fire immune"],
  ["ST_POISON","พิษ","Poison","Negative","DoT",8,1,3,"AddStackAndRefresh","MaxHP",-1,"PctPerTickPerStack",false,"Cleanse","poison","เพิ่มได้สูงสุด 3 stack; Poison/Steel immune"],
  ["ST_BLEED","เลือดไหล","Bleed","Negative","DoT",5,1,2,"AddStackAndRefresh","MaxHP",-1.2,"PctPerTickPerStack",false,"Cleanse","bleed","Steel immune; Rock มี resistance"],
  ["ST_SWARM","ฝูงกัดต่อเนื่อง","Swarm DoT","Negative","DoT",5,1,1,"RefreshDuration","MaxHP",-0.8,"PctPerTick",false,"Cleanse","swarm","DoT เฉพาะสกิลฝูงแมลง"],
  ["ST_SLOW","เชื่องช้า","Slow","Negative","Movement",4,0,1,"StrongestWinsRefresh","SPD",-25,"Pct",false,"Cleanse","slow","ลดความเร็วเคลื่อนที่; ไม่สะสมหลายชั้น"],
  ["ST_FREEZE","แช่แข็ง","Freeze","Negative","HardCC",1.5,0,1,"ReplaceByLonger","Action",0,"Locked",true,"Cleanse","freeze","หยุดเคลื่อนที่/โจมตี/สกิล; Ice immune"],
  ["ST_PARALYZE","อัมพาต","Paralyze","Negative","Control",2.5,0,1,"RefreshDuration","SPD",-40,"Pct",false,"Cleanse","paralyze","SPD -40% และ Cooldown recovery -20%"],
  ["ST_STUN","สตัน","Stun","Negative","HardCC",1,0,1,"ReplaceByLonger","Action",0,"Locked",true,"Cleanse","stun","หยุด Action ทั้งหมด; ใช้ระยะสั้น"],
  ["ST_ROOT","ตรึง","Root","Negative","MovementCC",2,0,1,"RefreshDuration","Movement",0,"Locked",false,"Cleanse","root","เดิน/Dash ไม่ได้ แต่ยังโจมตีและใช้สกิลได้"],
  ["ST_FEAR","หวาดกลัว","Fear","Negative","HardCC",2,0,1,"ReplaceByLonger","AIControl",0,"ForcedRetreat",true,"Cleanse","fear","บังคับถอย/ปิดสกิลโจมตีชั่วคราว; Ghost immune"],
  ["ST_CONFUSE","สับสน","Confuse","Negative","Control",3,0,1,"RefreshDuration","Accuracy",-35,"Pct",false,"Cleanse","confuse","ลดความแม่นและทำให้ทิศเป้าหมายคลาดเคลื่อน"],
  ["ST_BLIND","พร่ามัว","Blind","Negative","Debuff",5,0,1,"StrongestWinsRefresh","Accuracy",-20,"Pct",false,"Cleanse","blind","ลด Accuracy"],
  ["ST_WEAKEN","อ่อนแรง","Weaken","Negative","Debuff",5,0,1,"StrongestWinsRefresh","ATK",-15,"Pct",false,"Cleanse","weaken","ลด ATK"],
  ["ST_ARMOR_BREAK","เกราะแตก","Armor Break","Negative","Debuff",5,0,1,"StrongestWinsRefresh","DEF",-15,"Pct",false,"Cleanse","armor_break","ลด DEF; DEFDown/ArmorBreak map มาที่สถานะเดียว"],
  ["ST_VULNERABLE","เปิดจุดอ่อน","Vulnerable","Negative","Debuff",4,0,1,"StrongestWinsRefresh","DamageTaken",15,"Pct",false,"Cleanse","vulnerable","เพิ่ม Damage Taken"],
  ["ST_STAGGER","ชะงัก","Stagger","Negative","MicroCC",0.35,0,1,"Replace","Action",0,"InterruptOnly",false,"None","stagger","ขัดจังหวะสั้นมาก ไม่ควร chain lock ยาว"],
  ["ST_ATK_UP","พลังโจมตีเพิ่ม","ATK Up","Positive","Buff",8,0,1,"StrongestWinsRefresh","ATK",15,"Pct",false,"Dispel","atk_up","บัฟ ATK"],
  ["ST_DEF_UP","พลังป้องกันเพิ่ม","DEF Up","Positive","Buff",8,0,1,"StrongestWinsRefresh","DEF",15,"Pct",false,"Dispel","def_up","บัฟ DEF"],
  ["ST_SPATK_UP","พลังเวทเพิ่ม","SPATK Up","Positive","Buff",8,0,1,"StrongestWinsRefresh","SPATK",15,"Pct",false,"Dispel","spatk_up","บัฟ SPATK"],
  ["ST_SPD_UP","ความเร็วเพิ่ม","SPD Up","Positive","Buff",6,0,1,"StrongestWinsRefresh","SPD",15,"Pct",false,"Dispel","spd_up","บัฟ SPD"],
  ["ST_DAMAGE_REDUCE","ลดความเสียหาย","Damage Reduce","Positive","Buff",5,0,1,"StrongestWinsRefresh","DamageTaken",-25,"Pct",false,"Dispel","damage_reduce","ลด Damage Taken 25%"],
  ["ST_EVASION_UP","หลบหลีกเพิ่ม","Evasion Up","Positive","Buff",5,0,1,"StrongestWinsRefresh","Evasion",15,"Pct",false,"Dispel","evasion_up","เพิ่ม Evasion"],
  ["ST_CRIT_UP","คริติคอลเพิ่ม","Crit Up","Positive","Buff",6,0,1,"StrongestWinsRefresh","CritChance",15,"Pct",false,"Dispel","crit_up","เพิ่ม Critical Chance"],
  ["ST_ATKDEF_UP","พลังรุก/รับเพิ่ม","ATK+DEF Up","Positive","Buff",8,0,1,"StrongestWinsRefresh","ATK_DEF",12,"PctEach",false,"Dispel","atkdef_up","ATK +12% และ DEF +12%"],
  ["ST_FIRE_RESIST","ต้านไฟ","Fire Resist","Positive","Resistance",8,0,1,"StrongestWinsRefresh","FireDamageTaken",-25,"Pct",false,"Dispel","fire_resist","ลดดาเมจ Fire 25%"],
  ["ST_POISON_RESIST","ต้านพิษ","Poison Resist","Positive","Resistance",8,0,1,"StrongestWinsRefresh","PoisonApplyChance",-50,"Pct",false,"Dispel","poison_resist","ลดโอกาสโดน Poison 50% หลังคำนวณ chance"],
];

const RAW_LINKS = [
  ["SL_0001","SK_NORMAL_03","ATKUp","ST_ATK_UP","Positive","Self",100,1,100,1,0,"Active"],
  ["SL_0002","SK_NORMAL_04","Stagger","ST_STAGGER","Negative","Single",20,1,20,1,0,"Active"],
  ["SL_0003","SK_NORMAL_05","CritUp","ST_CRIT_UP","Positive","Self",100,1,100,1,0,"Active"],
  ["SL_0004","SK_FIRE_01","Burn","ST_BURN","Negative","Single",15,1,15,1,0,"Active"],
  ["SL_0005","SK_FIRE_02","Burn","ST_BURN","Negative","Single",100,1,100,1,0,"Active"],
  ["SL_0006","SK_FIRE_03","FireResist","ST_FIRE_RESIST","Positive","Self",100,1,100,1,0,"Active"],
  ["SL_0007","SK_FIRE_04","Burn","ST_BURN","Negative","Single",20,1,20,1,0,"Active"],
  ["SL_0008","SK_FIRE_05","BurnArea","ST_BURN","Negative","Area",35,1,35,1,0,"Active"],
  ["SL_0009","SK_FIRE_06","Burn","ST_BURN","Negative","Single",50,1,50,1,0,"Active"],
  ["SL_0010","SK_WATER_03","DamageReduce","ST_DAMAGE_REDUCE","Positive","Self",100,1,100,1,0,"Active"],
  ["SL_0011","SK_WATER_05","Slow","ST_SLOW","Negative","Single",35,1,35,1,0,"Active"],
  ["SL_0012","SK_GRASS_03","DEFUp","ST_DEF_UP","Positive","Self",100,1,100,1,0,"Active"],
  ["SL_0013","SK_GRASS_04","Root","ST_ROOT","Negative","SingleOrArea",20,1,20,1,0,"Active"],
  ["SL_0014","SK_GRASS_06","Root","ST_ROOT","Negative","SingleOrArea",50,1,50,1,0,"Active"],
  ["SL_0015","SK_ELECTRIC_01","Paralyze","ST_PARALYZE","Negative","Single",8,1,8,1,0,"Active"],
  ["SL_0016","SK_ELECTRIC_02","Paralyze","ST_PARALYZE","Negative","Single",100,1,100,1,0,"Active"],
  ["SL_0017","SK_ELECTRIC_03","SPATKUp","ST_SPATK_UP","Positive","Self",100,1,100,1,0,"Active"],
  ["SL_0018","SK_ELECTRIC_04","Paralyze","ST_PARALYZE","Negative","Single",20,1,20,1,0,"Active"],
  ["SL_0019","SK_ELECTRIC_05","ShockArea","ST_PARALYZE","Negative","Area",35,1,35,1,0,"Active"],
  ["SL_0020","SK_ELECTRIC_06","Paralyze","ST_PARALYZE","Negative","Single",50,1,50,1,0,"Active"],
  ["SL_0021","SK_ICE_01","Slow","ST_SLOW","Negative","Single",20,1,20,1,0,"Active"],
  ["SL_0022","SK_ICE_02","Slow","ST_SLOW","Negative","Single",100,1,100,1,0,"Active"],
  ["SL_0023","SK_ICE_03","DEFUp","ST_DEF_UP","Positive","Self",100,1,100,1,0,"Active"],
  ["SL_0024","SK_ICE_05","FreezeChance","ST_FREEZE","Negative","Single",35,1,35,1,0,"Active"],
  ["SL_0025","SK_ICE_06","Slow","ST_SLOW","Negative","Single",50,1,50,1,0,"Active"],
  ["SL_0026","SK_ROCK_02","Stagger","ST_STAGGER","Negative","Single",100,1,100,1,0,"Active"],
  ["SL_0027","SK_ROCK_03","DEFUp","ST_DEF_UP","Positive","Self",100,1,100,1,0,"Active"],
  ["SL_0028","SK_ROCK_04","Stun","ST_STUN","Negative","SingleOrArea",20,1,20,1,0,"Active"],
  ["SL_0029","SK_ROCK_06","Stun","ST_STUN","Negative","SingleOrArea",50,1,50,1,0,"Active"],
  ["SL_0030","SK_GROUND_01","Slow","ST_SLOW","Negative","Single",20,1,20,1,0,"Active"],
  ["SL_0031","SK_GROUND_03","DEFUp","ST_DEF_UP","Positive","Self",100,1,100,1,0,"Active"],
  ["SL_0032","SK_GROUND_04","ArmorBreak","ST_ARMOR_BREAK","Negative","Single",20,1,20,1,0,"Active"],
  ["SL_0033","SK_GROUND_05","SlowArea","ST_SLOW","Negative","Area",35,1,35,1,0,"Active"],
  ["SL_0034","SK_GROUND_06","Stagger","ST_STAGGER","Negative","Single",50,1,50,1,0,"Active"],
  ["SL_0035","SK_FLYING_03","SPDUp","ST_SPD_UP","Positive","Self",100,1,100,1,0,"Active"],
  ["SL_0036","SK_FLYING_05","Bleed","ST_BLEED","Negative","Single",35,1,35,1,0,"Active"],
  ["SL_0037","SK_POISON_01","Poison","ST_POISON","Negative","Single",20,1,20,1,0,"Active"],
  ["SL_0038","SK_POISON_02","Poison","ST_POISON","Negative","Single",100,1,100,1,0,"Active"],
  ["SL_0039","SK_POISON_03","PoisonResist","ST_POISON_RESIST","Positive","Self",100,1,100,1,0,"Active"],
  ["SL_0040","SK_POISON_04","PoisonArea","ST_POISON","Negative","Area",20,1,20,1,0,"Active"],
  ["SL_0041","SK_POISON_05","DEFDown","ST_ARMOR_BREAK","Negative","SingleOrArea",35,1,35,1,0,"Active"],
  ["SL_0042","SK_POISON_06","StrongPoison","ST_POISON","Negative","Single",50,1,50,2,0,"Active"],
  ["SL_0043","SK_DARK_01","CritUp","ST_CRIT_UP","Positive","Self",100,1,100,1,0,"Active"],
  ["SL_0044","SK_DARK_03","EvasionUp","ST_EVASION_UP","Positive","Self",100,1,100,1,0,"Active"],
  ["SL_0045","SK_DARK_04","Fear","ST_FEAR","Negative","Single",20,1,20,1,0,"Active"],
  ["SL_0046","SK_DARK_05","DamageAmp","ST_VULNERABLE","Negative","Single",35,1,35,1,0,"Active"],
  ["SL_0047","SK_LIGHT_03","DamageReduce","ST_DAMAGE_REDUCE","Positive","Self",100,1,100,1,0,"Active"],
  ["SL_0048","SK_LIGHT_05","ATKDEFUp","ST_ATKDEF_UP","Positive","Self",100,1,100,1,0,"Active"],
  ["SL_0049","SK_PSYCHIC_03","SPATKUp","ST_SPATK_UP","Positive","Self",100,1,100,1,0,"Active"],
  ["SL_0050","SK_PSYCHIC_04","AccuracyDown","ST_BLIND","Negative","Single",20,1,20,1,0,"Active"],
  ["SL_0051","SK_PSYCHIC_05","Root","ST_ROOT","Negative","SingleOrArea",35,1,35,1,0,"Active"],
  ["SL_0052","SK_PSYCHIC_06","Confuse","ST_CONFUSE","Negative","SingleOrArea",50,1,50,1,0,"Active"],
  ["SL_0053","SK_BUG_03","DEFUp","ST_DEF_UP","Positive","Self",100,1,100,1,0,"Active"],
  ["SL_0054","SK_BUG_04","Slow","ST_SLOW","Negative","Single",20,1,20,1,0,"Active"],
  ["SL_0055","SK_BUG_05","DoT","ST_SWARM","Negative","SingleOrArea",35,1,35,1,0,"Active"],
  ["SL_0056","SK_DRAGON_01","CritUp","ST_CRIT_UP","Positive","Self",100,1,100,1,0,"Active"],
  ["SL_0057","SK_DRAGON_03","DamageReduce","ST_DAMAGE_REDUCE","Positive","Self",100,1,100,1,0,"Active"],
  ["SL_0058","SK_DRAGON_04","BurnParalyze","ST_BURN","Negative","Single",20,1,20,1,0,"Active"],
  ["SL_0059","SK_DRAGON_04","BurnParalyze","ST_PARALYZE","Negative","Single",20,0.5,10,1,0,"Active"],
  ["SL_0060","SK_DRAGON_05","ATKDown","ST_WEAKEN","Negative","SingleOrArea",35,1,35,1,0,"Active"],
  ["SL_0061","SK_FIGHTING_03","DamageReduce","ST_DAMAGE_REDUCE","Positive","Self",100,1,100,1,0,"Active"],
  ["SL_0062","SK_FIGHTING_05","ATKUp","ST_ATK_UP","Positive","Self",100,1,100,1,0,"Active"],
  ["SL_0063","SK_STEEL_01","DEFUp","ST_DEF_UP","Positive","Self",100,1,100,1,0,"Active"],
  ["SL_0064","SK_STEEL_03","DamageReduce","ST_DAMAGE_REDUCE","Positive","Self",100,1,100,1,0,"Active"],
  ["SL_0065","SK_STEEL_05","SlowArea","ST_SLOW","Negative","Area",35,1,35,1,0,"Active"],
  ["SL_0066","SK_STEEL_06","DEFUp","ST_DEF_UP","Positive","Self",100,1,100,1,0,"Active"],
  ["SL_0067","SK_GHOST_03","EvasionUp","ST_EVASION_UP","Positive","Self",100,1,100,1,0,"Active"],
  ["SL_0068","SK_GHOST_04","Fear","ST_FEAR","Negative","Single",20,1,20,1,0,"Active"],
  ["SL_0069","SK_GHOST_06","FearArea","ST_FEAR","Negative","Area",50,1,50,1,0,"Active"],
];

export const STATUS_CATALOG = Object.freeze(RAW_STATUSES.map(([
  id, nameTH, nameEN, polarity, category, baseDurationSec, tickIntervalSec, maxStacks,
  stackRule, modifiedStat, magnitude, magnitudeUnit, hardCC, removalType, iconKey, designNotes,
]) => Object.freeze({
  id,
  nameTH,
  nameEN,
  polarity,
  category,
  baseDurationSec,
  tickIntervalSec,
  maxStacks,
  stackRule,
  modifiedStat,
  magnitude,
  magnitudeUnit,
  hardCC,
  removalType,
  iconKey,
  designNotes,
  activation: 'catalog_only',
  sourceWorkbookVersion: CONTENT_PROVENANCE.workbookVersion,
})));

export const SKILL_STATUS_LINKS = Object.freeze(RAW_LINKS.map(([
  id, skillId, rawEffect, statusId, polarity, applicationMode, skillBaseChancePct,
  chanceMultiplier, finalBaseChancePct, potencyStacks, durationOverrideSec, sourceStatus,
]) => Object.freeze({
  id,
  skillId,
  rawEffect,
  statusId,
  polarity,
  applicationMode,
  skillBaseChancePct,
  chanceMultiplier,
  finalBaseChancePct,
  potencyStacks,
  durationOverrideSec,
  sourceStatus,
  activation: 'catalog_only',
  sourceWorkbookVersion: CONTENT_PROVENANCE.workbookVersion,
})));

const STATUS_BY_ID = new Map(STATUS_CATALOG.map(status => [status.id, status]));
const STATUS_CATEGORIES = new Set(['DoT', 'Movement', 'HardCC', 'Control', 'MovementCC', 'Debuff', 'MicroCC', 'Buff', 'Resistance']);
const LINK_APPLICATION_MODES = new Set(['Self', 'Single', 'Area', 'SingleOrArea']);
const RUNTIME_FIELDS = new Set(['remainingDurationSec', 'currentStacks', 'appliedAt', 'sourceInstanceId', 'expiresAt']);

function statusIssue(code, catalog, index, field, detail = {}) {
  return Object.freeze({ code, catalog, index, field, ...detail });
}

export function validateStatusCatalog(statuses, links) {
  const issues = [];
  if (!Array.isArray(statuses) || !Array.isArray(links)) {
    return Object.freeze({ ok: false, issues: Object.freeze([statusIssue('invalid_catalog', 'root', -1, 'root')]) });
  }
  if (statuses.length !== 26) issues.push(statusIssue('status_count_mismatch', 'statuses', -1, 'length', { value: statuses.length }));
  if (links.length !== 69) issues.push(statusIssue('link_count_mismatch', 'links', -1, 'length', { value: links.length }));

  const statusIds = new Set();
  statuses.forEach((status, index) => {
    if (!status || typeof status !== 'object') {
      issues.push(statusIssue('invalid_status', 'statuses', index, 'root'));
      return;
    }
    if (!CONTENT_ID_PATTERNS.statuses.test(status.id)) issues.push(statusIssue('invalid_status_id', 'statuses', index, 'id', { id: status.id ?? null }));
    if (statusIds.has(status.id)) issues.push(statusIssue('duplicate_status_id', 'statuses', index, 'id', { id: status.id }));
    statusIds.add(status.id);
    if (!['Positive', 'Negative'].includes(status.polarity)) issues.push(statusIssue('invalid_polarity', 'statuses', index, 'polarity'));
    if (!STATUS_CATEGORIES.has(status.category)) issues.push(statusIssue('invalid_status_category', 'statuses', index, 'category'));
    if (!Number.isFinite(status.baseDurationSec) || status.baseDurationSec < 0) issues.push(statusIssue('invalid_duration', 'statuses', index, 'baseDurationSec'));
    if (!Number.isFinite(status.tickIntervalSec) || status.tickIntervalSec < 0) issues.push(statusIssue('invalid_tick_interval', 'statuses', index, 'tickIntervalSec'));
    if (!Number.isInteger(status.maxStacks) || status.maxStacks < 1) issues.push(statusIssue('invalid_max_stacks', 'statuses', index, 'maxStacks'));
    if (typeof status.hardCC !== 'boolean') issues.push(statusIssue('invalid_hard_cc_flag', 'statuses', index, 'hardCC'));
    for (const field of RUNTIME_FIELDS) {
      if (field in status) issues.push(statusIssue('runtime_field_in_status_master', 'statuses', index, field));
    }
  });

  const linkIds = new Set();
  const actualCounts = new Map();
  links.forEach((link, index) => {
    if (!link || typeof link !== 'object') {
      issues.push(statusIssue('invalid_link', 'links', index, 'root'));
      return;
    }
    if (!/^SL_\d{4}$/.test(link.id)) issues.push(statusIssue('invalid_link_id', 'links', index, 'id', { id: link.id ?? null }));
    if (linkIds.has(link.id)) issues.push(statusIssue('duplicate_link_id', 'links', index, 'id', { id: link.id }));
    linkIds.add(link.id);
    if (!skillCatalogEntry(link.skillId)) issues.push(statusIssue('unknown_skill_reference', 'links', index, 'skillId', { reference: link.skillId ?? null }));
    if (!statusIds.has(link.statusId)) issues.push(statusIssue('unknown_status_reference', 'links', index, 'statusId', { reference: link.statusId ?? null }));
    if (!LINK_APPLICATION_MODES.has(link.applicationMode)) issues.push(statusIssue('invalid_link_application_mode', 'links', index, 'applicationMode'));
    if (!Number.isFinite(link.finalBaseChancePct) || link.finalBaseChancePct < 0 || link.finalBaseChancePct > 100) issues.push(statusIssue('invalid_link_chance', 'links', index, 'finalBaseChancePct'));
    if (!Number.isInteger(link.potencyStacks) || link.potencyStacks < 1) issues.push(statusIssue('invalid_link_stacks', 'links', index, 'potencyStacks'));
    if (link.sourceStatus !== 'Active' || link.activation !== 'catalog_only') issues.push(statusIssue('invalid_link_activation', 'links', index, 'activation'));
    actualCounts.set(link.skillId, (actualCounts.get(link.skillId) ?? 0) + 1);
  });

  for (const skill of SKILL_CATALOG) {
    const actual = actualCounts.get(skill.id) ?? 0;
    if (actual !== skill.statusLinkCount) {
      issues.push(statusIssue('skill_status_link_count_mismatch', 'skills', -1, 'statusLinkCount', { skillId: skill.id, expected: skill.statusLinkCount, actual }));
    }
  }

  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });
}

export function statusCatalogEntry(statusId) {
  return STATUS_BY_ID.get(statusId) ?? null;
}
