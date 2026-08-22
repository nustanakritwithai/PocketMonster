import { CONTENT_PROVENANCE, assertContentProvenance } from './content-provenance.mjs';
import { CONTENT_ID_PATTERNS } from './content-validation.mjs';

assertContentProvenance(CONTENT_PROVENANCE);

export const SKILL_CATEGORIES = Object.freeze(['Physical', 'Special', 'Support', 'Control', 'Ultimate', 'Heal', 'Defense']);
export const SKILL_TARGET_TYPES = Object.freeze(['NearestEnemy', 'Self', 'EnemyArea', 'GroundPoint']);
export const SKILL_EFFECT_CLASSES = Object.freeze(['DirectMechanic', 'AttackModifier', 'Status', 'Displacement', 'DamageShape', 'Heal', 'FieldMechanic', 'Movement', 'DamageModifier', 'Summon', 'MultiStatus', 'HealModifier']);
export const SKILL_APPLICATION_MODES = Object.freeze(['None', 'Direct', 'Self', 'Single', 'Area', 'SingleOrArea', 'GroundPoint', 'GroundArea', 'Line']);

const TYPE_MAP = Object.freeze({
  "NORMAL": "Normal",
  "FIRE": "Fire",
  "WATER": "Water",
  "GRASS": "Grass",
  "ELECTRIC": "Electric",
  "ICE": "Ice",
  "ROCK": "Rock",
  "GROUND": "Ground",
  "FLYING": "Flying",
  "POISON": "Poison",
  "DARK": "Dark",
  "LIGHT": "Fairy",
  "PSYCHIC": "Psychic",
  "BUG": "Bug",
  "DRAGON": "Dragon",
  "FIGHTING": "Fighting",
  "STEEL": "Steel",
  "GHOST": "Ghost",
});

const RAW_SKILLS = [
  ["SK_NORMAL_01","พุ่งชน","Tackle","NORMAL","Physical",38,100,28,1.8,"NearestEnemy","None",0,"Common","DirectMechanic",0,"None",true,"DMG_v1.0",0,"None"],
  ["SK_NORMAL_02","จู่โจมไว","Quick Strike","NORMAL","Physical",52,95,16,4,"NearestEnemy","QuickHit",100,"Uncommon","AttackModifier",0,"Direct",true,"DMG_v1.0",0,"None"],
  ["SK_NORMAL_03","เสียงคำราม","Battle Cry","NORMAL","Support",0,100,10,8,"Self","ATKUp",100,"Uncommon","Status",1,"Self",false,"DMG_v1.0",0,"None"],
  ["SK_NORMAL_04","ทุบหนัก","Heavy Slam","NORMAL","Special",72,92,10,5.5,"EnemyArea","Stagger",20,"Rare","Status",1,"Single",true,"DMG_v1.0",0,"None"],
  ["SK_NORMAL_05","โฟกัส","Focus","NORMAL","Control",42,90,8,7,"EnemyArea","CritUp",35,"Rare","Status",1,"Self",true,"DMG_v1.0",0,"None"],
  ["SK_NORMAL_06","แรงกระแทกสุดขีด","Final Impact","NORMAL","Ultimate",118,88,3,14,"EnemyArea","Knockback",50,"Epic","Displacement",0,"Direct",true,"DMG_v1.0",0,"None"],
  ["SK_FIRE_01","สะเก็ดไฟ","Ember","FIRE","Physical",38,100,28,1.8,"NearestEnemy","Burn",15,"Common","Status",1,"Single",true,"DMG_v1.0",0,"None"],
  ["SK_FIRE_02","พุ่งเพลิง","Flame Dash","FIRE","Physical",52,95,16,4,"NearestEnemy","Burn",100,"Uncommon","Status",1,"Single",true,"DMG_v1.0",0,"None"],
  ["SK_FIRE_03","เกราะความร้อน","Heat Guard","FIRE","Support",0,100,10,8,"Self","FireResist",100,"Uncommon","Status",1,"Self",false,"DMG_v1.0",0,"None"],
  ["SK_FIRE_04","ลูกไฟ","Fireball","FIRE","Special",77,92,10,5.5,"EnemyArea","Burn",20,"Rare","Status",1,"Single",true,"DMG_v1.0",0,"None"],
  ["SK_FIRE_05","หมอกเผาไหม้","Burn Mist","FIRE","Control",42,90,8,7,"EnemyArea","BurnArea",35,"Rare","Status",1,"Area",true,"DMG_v1.0",0,"None"],
  ["SK_FIRE_06","เพลิงนรก","Inferno","FIRE","Ultimate",118,88,3,14,"EnemyArea","Burn",50,"Epic","Status",1,"Single",true,"DMG_v1.0",0,"None"],
  ["SK_WATER_01","กระสุนน้ำ","Water Shot","WATER","Physical",38,100,28,1.8,"NearestEnemy","None",0,"Common","DirectMechanic",0,"None",true,"DMG_v1.0",0,"None"],
  ["SK_WATER_02","วารีพุ่ง","Aqua Rush","WATER","Physical",52,95,16,4,"NearestEnemy","Knockback",100,"Uncommon","Displacement",0,"Direct",true,"DMG_v1.0",0,"None"],
  ["SK_WATER_03","ม่านน้ำ","Water Veil","WATER","Support",0,100,10,8,"Self","DamageReduce",100,"Uncommon","Status",1,"Self",false,"DMG_v1.0",0,"None"],
  ["SK_WATER_04","ระเบิดวารี","Aqua Burst","WATER","Special",72,92,10,5.5,"EnemyArea","Splash",20,"Rare","DamageShape",0,"Area",true,"DMG_v1.0",0,"None"],
  ["SK_WATER_05","กับดักฟอง","Bubble Trap","WATER","Control",42,90,8,7,"EnemyArea","Slow",35,"Rare","Status",1,"Single",true,"DMG_v1.0",0,"None"],
  ["SK_WATER_06","คลื่นยักษ์","Tidal Wave","WATER","Ultimate",118,88,3,14,"EnemyArea","Knockback",50,"Epic","Displacement",0,"Direct",true,"DMG_v1.0",0,"None"],
  ["SK_GRASS_01","แส้เถาวัลย์","Vine Whip","GRASS","Physical",38,100,28,1.8,"NearestEnemy","None",0,"Common","DirectMechanic",0,"None",true,"DMG_v1.0",0,"None"],
  ["SK_GRASS_02","เมล็ดพุ่ง","Seed Shot","GRASS","Physical",52,95,16,4,"NearestEnemy","None",100,"Uncommon","DirectMechanic",0,"None",true,"DMG_v1.0",0,"None"],
  ["SK_GRASS_03","เกราะใบไม้","Leaf Guard","GRASS","Support",0,100,10,8,"Self","DEFUp",100,"Uncommon","Status",1,"Self",false,"DMG_v1.0",0,"None"],
  ["SK_GRASS_04","รากพันธนาการ","Root Bind","GRASS","Special",72,92,10,5.5,"EnemyArea","Root",20,"Rare","Status",1,"SingleOrArea",true,"DMG_v1.0",0,"None"],
  ["SK_GRASS_05","พลังธรรมชาติ","Nature Heal","GRASS","Heal",0,90,8,7,"Self","Heal",100,"Rare","Heal",0,"Direct",false,"DMG_v1.0",0,"None"],
  ["SK_GRASS_06","พายุพฤกษา","Verdant Storm","GRASS","Ultimate",118,88,3,14,"EnemyArea","Root",50,"Epic","Status",1,"SingleOrArea",true,"DMG_v1.0",0,"None"],
  ["SK_ELECTRIC_01","ประกายไฟ","Spark","ELECTRIC","Physical",38,100,28,1.8,"NearestEnemy","Paralyze",8,"Common","Status",1,"Single",true,"DMG_v1.0",0,"None"],
  ["SK_ELECTRIC_02","พุ่งสายฟ้า","Thunder Dash","ELECTRIC","Physical",52,95,16,4,"NearestEnemy","Paralyze",100,"Uncommon","Status",1,"Single",true,"DMG_v1.0",0,"None"],
  ["SK_ELECTRIC_03","ชาร์จพลัง","Charge","ELECTRIC","Support",0,100,10,8,"Self","SPATKUp",100,"Uncommon","Status",1,"Self",false,"DMG_v1.0",0,"None"],
  ["SK_ELECTRIC_04","สายฟ้าลูกโซ่","Chain Lightning","ELECTRIC","Special",77,92,10,5.5,"EnemyArea","Paralyze",20,"Rare","Status",1,"Single",true,"DMG_v1.0",0,"None"],
  ["SK_ELECTRIC_05","สนามช็อต","Static Field","ELECTRIC","Control",42,90,8,7,"EnemyArea","ShockArea",35,"Rare","Status",1,"Area",true,"DMG_v1.0",0,"None"],
  ["SK_ELECTRIC_06","พายุสายฟ้า","Thunderstorm","ELECTRIC","Ultimate",118,88,3,14,"EnemyArea","Paralyze",50,"Epic","Status",1,"Single",true,"DMG_v1.0",0,"None"],
  ["SK_ICE_01","เกล็ดน้ำแข็ง","Ice Shard","ICE","Physical",38,100,28,1.8,"NearestEnemy","Slow",20,"Common","Status",1,"Single",true,"DMG_v1.0",0,"None"],
  ["SK_ICE_02","เขี้ยวเยือกแข็ง","Frost Bite","ICE","Physical",52,95,16,4,"NearestEnemy","Slow",100,"Uncommon","Status",1,"Single",true,"DMG_v1.0",0,"None"],
  ["SK_ICE_03","เกราะน้ำแข็ง","Ice Armor","ICE","Support",0,100,10,8,"Self","DEFUp",100,"Uncommon","Status",1,"Self",false,"DMG_v1.0",0,"None"],
  ["SK_ICE_04","กำแพงน้ำแข็ง","Ice Wall","ICE","Defense",0,92,10,5.5,"GroundPoint","Wall",100,"Rare","FieldMechanic",0,"GroundPoint",false,"DMG_v1.0",0,"None"],
  ["SK_ICE_05","ลมหายใจเยือก","Frost Breath","ICE","Control",42,90,8,7,"EnemyArea","FreezeChance",35,"Rare","Status",1,"Single",true,"DMG_v1.0",0,"None"],
  ["SK_ICE_06","พายุหิมะ","Blizzard","ICE","Ultimate",118,88,3,14,"EnemyArea","Slow",50,"Epic","Status",1,"Single",true,"DMG_v1.0",0,"None"],
  ["SK_ROCK_01","ขว้างหิน","Rock Throw","ROCK","Physical",38,100,28,1.8,"NearestEnemy","None",0,"Common","DirectMechanic",0,"None",true,"DMG_v1.0",0,"None"],
  ["SK_ROCK_02","กระแทกศิลา","Stone Crash","ROCK","Physical",52,95,16,4,"NearestEnemy","Stagger",100,"Uncommon","Status",1,"Single",true,"DMG_v1.0",0,"None"],
  ["SK_ROCK_03","เกราะหิน","Stone Armor","ROCK","Support",0,100,10,8,"Self","DEFUp",100,"Uncommon","Status",1,"Self",false,"DMG_v1.0",0,"None"],
  ["SK_ROCK_04","หินถล่ม","Rock Slide","ROCK","Special",72,92,10,5.5,"EnemyArea","Stun",20,"Rare","Status",1,"SingleOrArea",true,"DMG_v1.0",0,"None"],
  ["SK_ROCK_05","หนามศิลา","Stone Spikes","ROCK","Control",42,90,8,7,"EnemyArea","AreaHazard",35,"Rare","FieldMechanic",0,"GroundArea",true,"DMG_v1.0",0,"None"],
  ["SK_ROCK_06","ภูผาถล่ม","Mountain Fall","ROCK","Ultimate",118,88,3,14,"EnemyArea","Stun",50,"Epic","Status",1,"SingleOrArea",true,"DMG_v1.0",0,"None"],
  ["SK_GROUND_01","โคลนพุ่ง","Mud Shot","GROUND","Physical",38,100,28,1.8,"NearestEnemy","Slow",20,"Common","Status",1,"Single",true,"DMG_v1.0",0,"None"],
  ["SK_GROUND_02","มุดจู่โจม","Dig Rush","GROUND","Physical",52,95,16,4,"NearestEnemy","Burrow",100,"Uncommon","Movement",0,"Direct",true,"DMG_v1.0",0,"None"],
  ["SK_GROUND_03","ผิวดินแข็ง","Terra Guard","GROUND","Support",0,100,10,8,"Self","DEFUp",100,"Uncommon","Status",1,"Self",false,"DMG_v1.0",0,"None"],
  ["SK_GROUND_04","รอยแยก","Fissure Strike","GROUND","Special",72,92,10,5.5,"EnemyArea","ArmorBreak",20,"Rare","Status",1,"Single",true,"DMG_v1.0",0,"None"],
  ["SK_GROUND_05","บ่อโคลน","Mud Field","GROUND","Control",42,90,8,7,"EnemyArea","SlowArea",35,"Rare","Status",1,"Area",true,"DMG_v1.0",0,"None"],
  ["SK_GROUND_06","แผ่นดินไหว","Earthquake","GROUND","Ultimate",118,88,3,14,"EnemyArea","Stagger",50,"Epic","Status",1,"Single",true,"DMG_v1.0",0,"None"],
  ["SK_FLYING_01","ลมกระแทก","Gust","FLYING","Physical",38,100,28,1.8,"NearestEnemy","Knockback",0,"Common","Displacement",0,"Direct",true,"DMG_v1.0",0,"None"],
  ["SK_FLYING_02","ฟันปีก","Wing Slash","FLYING","Physical",52,95,16,4,"NearestEnemy","None",100,"Uncommon","DirectMechanic",0,"None",true,"DMG_v1.0",0,"None"],
  ["SK_FLYING_03","วายุเร่ง","Tailwind","FLYING","Support",0,100,10,8,"Self","SPDUp",100,"Uncommon","Status",1,"Self",false,"DMG_v1.0",0,"None"],
  ["SK_FLYING_04","วาร์ปลม","Air Dash","FLYING","Special",72,92,10,5.5,"EnemyArea","Dash",20,"Rare","Movement",0,"Direct",true,"DMG_v1.0",0,"None"],
  ["SK_FLYING_05","คมลม","Air Cutter","FLYING","Control",42,90,8,7,"EnemyArea","Bleed",35,"Rare","Status",1,"Single",true,"DMG_v1.0",0,"None"],
  ["SK_FLYING_06","ทอร์นาโด","Tornado","FLYING","Ultimate",118,88,3,14,"EnemyArea","Pull",50,"Epic","Displacement",0,"Direct",true,"DMG_v1.0",0,"None"],
  ["SK_POISON_01","เหล็กในพิษ","Poison Sting","POISON","Physical",38,100,28,1.8,"NearestEnemy","Poison",20,"Common","Status",1,"Single",true,"DMG_v1.0",0,"None"],
  ["SK_POISON_02","เขี้ยวพิษ","Venom Bite","POISON","Physical",52,95,16,4,"NearestEnemy","Poison",100,"Uncommon","Status",1,"Single",true,"DMG_v1.0",0,"None"],
  ["SK_POISON_03","เกราะพิษ","Toxic Guard","POISON","Support",0,100,10,8,"Self","PoisonResist",100,"Uncommon","Status",1,"Self",false,"DMG_v1.0",0,"None"],
  ["SK_POISON_04","เมฆพิษ","Toxic Cloud","POISON","Special",72,92,10,5.5,"EnemyArea","PoisonArea",20,"Rare","Status",1,"Area",true,"DMG_v1.0",0,"None"],
  ["SK_POISON_05","กรดระเบิด","Acid Burst","POISON","Control",42,90,8,7,"EnemyArea","DEFDown",35,"Rare","Status",1,"SingleOrArea",true,"DMG_v1.0",0,"None"],
  ["SK_POISON_06","พิษมรณะ","Deadly Venom","POISON","Ultimate",118,88,3,14,"EnemyArea","StrongPoison",50,"Epic","Status",1,"Single",true,"DMG_v1.0",0,"None"],
  ["SK_DARK_01","กรงเล็บเงา","Shadow Claw","DARK","Physical",38,100,28,1.8,"NearestEnemy","CritUp",0,"Common","Status",1,"Self",true,"DMG_v1.0",0,"None"],
  ["SK_DARK_02","ก้าวรัตติกาล","Night Step","DARK","Physical",52,95,16,4,"NearestEnemy","Blink",100,"Uncommon","Movement",0,"Direct",true,"DMG_v1.0",0,"None"],
  ["SK_DARK_03","ม่านมืด","Dark Veil","DARK","Support",0,100,10,8,"Self","EvasionUp",100,"Uncommon","Status",1,"Self",false,"DMG_v1.0",0,"None"],
  ["SK_DARK_04","คลื่นทมิฬ","Dark Pulse","DARK","Special",77,92,10,5.5,"EnemyArea","Fear",20,"Rare","Status",1,"Single",true,"DMG_v1.0",0,"None"],
  ["SK_DARK_05","ตราเงา","Shadow Mark","DARK","Control",42,90,8,7,"EnemyArea","DamageAmp",35,"Rare","Status",1,"Single",true,"DMG_v1.0",0,"None"],
  ["SK_DARK_06","หลุมดำ","Black Hole","DARK","Ultimate",118,88,3,14,"EnemyArea","Pull",50,"Epic","Displacement",0,"Direct",true,"DMG_v1.0",0,"None"],
  ["SK_LIGHT_01","ลำแสง","Light Beam","LIGHT","Physical",38,100,28,1.8,"NearestEnemy","BonusVsDark",0,"Common","DamageModifier",0,"Direct",true,"DMG_v1.0",0,"Dark target +25% direct damage"],
  ["SK_LIGHT_02","ก้าวแสง","Light Step","LIGHT","Physical",52,95,16,4,"NearestEnemy","Dash",100,"Uncommon","Movement",0,"Direct",true,"DMG_v1.0",0,"None"],
  ["SK_LIGHT_03","โล่ศักดิ์สิทธิ์","Holy Shield","LIGHT","Support",0,100,10,8,"Self","DamageReduce",100,"Uncommon","Status",1,"Self",false,"DMG_v1.0",0,"None"],
  ["SK_LIGHT_04","แสงเยียวยา","Healing Light","LIGHT","Heal",0,92,10,5.5,"Self","Heal",100,"Rare","Heal",0,"Direct",false,"DMG_v1.0",0,"None"],
  ["SK_LIGHT_05","ตราพร","Blessing","LIGHT","Control",42,90,8,7,"EnemyArea","ATKDEFUp",35,"Rare","Status",1,"Self",true,"DMG_v1.0",0,"None"],
  ["SK_LIGHT_06","พิพากษา","Judgment","LIGHT","Ultimate",118,88,3,14,"EnemyArea","BonusVsDark",50,"Epic","DamageModifier",0,"Direct",true,"DMG_v1.0",0,"Dark target +25% direct damage"],
  ["SK_PSYCHIC_01","กระสุนจิต","Psychic Shot","PSYCHIC","Physical",38,100,28,1.8,"NearestEnemy","None",0,"Common","DirectMechanic",0,"None",true,"DMG_v1.0",0,"None"],
  ["SK_PSYCHIC_02","ผลักจิต","Mind Push","PSYCHIC","Physical",52,95,16,4,"NearestEnemy","Knockback",100,"Uncommon","Displacement",0,"Direct",true,"DMG_v1.0",0,"None"],
  ["SK_PSYCHIC_03","สมาธิ","Meditate","PSYCHIC","Support",0,100,10,8,"Self","SPATKUp",100,"Uncommon","Status",1,"Self",false,"DMG_v1.0",0,"None"],
  ["SK_PSYCHIC_04","สับสน","Confusion","PSYCHIC","Special",72,92,10,5.5,"EnemyArea","AccuracyDown",20,"Rare","Status",1,"Single",true,"DMG_v1.0",0,"None"],
  ["SK_PSYCHIC_05","พันธนาการจิต","Mind Bind","PSYCHIC","Control",42,90,8,7,"EnemyArea","Root",35,"Rare","Status",1,"SingleOrArea",true,"DMG_v1.0",0,"None"],
  ["SK_PSYCHIC_06","พายุพลังจิต","Psychic Storm","PSYCHIC","Ultimate",118,88,3,14,"EnemyArea","Confuse",50,"Epic","Status",1,"SingleOrArea",true,"DMG_v1.0",0,"None"],
  ["SK_BUG_01","กัดแมลง","Bug Bite","BUG","Physical",38,100,28,1.8,"NearestEnemy","None",0,"Common","DirectMechanic",0,"None",true,"DMG_v1.0",0,"None"],
  ["SK_BUG_02","พุ่งปีก","Wing Rush","BUG","Physical",52,95,16,4,"NearestEnemy","Dash",100,"Uncommon","Movement",0,"Direct",true,"DMG_v1.0",0,"None"],
  ["SK_BUG_03","รังไหม","Cocoon Guard","BUG","Support",0,100,10,8,"Self","DEFUp",100,"Uncommon","Status",1,"Self",false,"DMG_v1.0",0,"None"],
  ["SK_BUG_04","ใยดัก","Web Trap","BUG","Special",72,92,10,5.5,"EnemyArea","Slow",20,"Rare","Status",1,"Single",true,"DMG_v1.0",0,"None"],
  ["SK_BUG_05","ฝูงแมลง","Swarm","BUG","Control",42,90,8,7,"EnemyArea","DoT",35,"Rare","Status",1,"SingleOrArea",true,"DMG_v1.0",0,"None"],
  ["SK_BUG_06","ราชันฝูง","Hive Dominion","BUG","Ultimate",118,88,3,14,"EnemyArea","SummonSwarm",50,"Epic","Summon",0,"Direct",true,"DMG_v1.0",0,"None"],
  ["SK_DRAGON_01","กรงเล็บมังกร","Dragon Claw","DRAGON","Physical",38,100,28,1.8,"NearestEnemy","CritUp",0,"Common","Status",1,"Self",true,"DMG_v1.0",0,"None"],
  ["SK_DRAGON_02","พุ่งมังกร","Drake Rush","DRAGON","Physical",52,95,16,4,"NearestEnemy","Dash",100,"Uncommon","Movement",0,"Direct",true,"DMG_v1.0",0,"None"],
  ["SK_DRAGON_03","เกล็ดมังกร","Dragon Scale","DRAGON","Support",0,100,10,8,"Self","DamageReduce",100,"Uncommon","Status",1,"Self",false,"DMG_v1.0",0,"None"],
  ["SK_DRAGON_04","ลมหายใจมังกร","Dragon Breath","DRAGON","Special",72,92,10,5.5,"EnemyArea","BurnParalyze",20,"Rare","MultiStatus",2,"Single",true,"DMG_v1.0",0,"None"],
  ["SK_DRAGON_05","คำรามมังกร","Dragon Roar","DRAGON","Control",42,90,8,7,"EnemyArea","ATKDown",35,"Rare","Status",1,"SingleOrArea",true,"DMG_v1.0",0,"None"],
  ["SK_DRAGON_06","ดาวตกมังกร","Dragon Meteor","DRAGON","Ultimate",135,88,2,16,"EnemyArea","AreaBurst",50,"Epic","DamageShape",0,"Area",true,"DMG_v1.0",0,"None"],
  ["SK_FIGHTING_01","หมัดวิญญาณ","Spirit Punch","FIGHTING","Physical",38,100,28,1.8,"NearestEnemy","ArmorPierce",0,"Common","DamageModifier",0,"Direct",true,"DMG_v1.0",25,"None"],
  ["SK_FIGHTING_02","คอมโบพุ่ง","Combo Rush","FIGHTING","Physical",52,95,16,4,"NearestEnemy","MultiHit",100,"Uncommon","AttackModifier",0,"Direct",true,"DMG_v1.0",0,"None"],
  ["SK_FIGHTING_03","ตั้งการ์ด","Guard Stance","FIGHTING","Support",0,100,10,8,"Self","DamageReduce",100,"Uncommon","Status",1,"Self",false,"DMG_v1.0",0,"None"],
  ["SK_FIGHTING_04","หมัดทะลวง","Piercing Fist","FIGHTING","Special",72,92,10,5.5,"EnemyArea","ArmorPierce",20,"Rare","DamageModifier",0,"Direct",true,"DMG_v1.0",25,"None"],
  ["SK_FIGHTING_05","เสียงฮึดสู้","Battle Cry","FIGHTING","Control",42,90,8,7,"EnemyArea","ATKUp",35,"Rare","Status",1,"Self",true,"DMG_v1.0",0,"None"],
  ["SK_FIGHTING_06","แรงปะทะสุดท้าย","Final Impact","FIGHTING","Ultimate",118,88,3,14,"EnemyArea","Knockback",50,"Epic","Displacement",0,"Direct",true,"DMG_v1.0",0,"None"],
  ["SK_STEEL_01","กรงเล็บเหล็ก","Metal Claw","STEEL","Physical",38,100,28,1.8,"NearestEnemy","DEFUp",0,"Common","Status",1,"Self",true,"DMG_v1.0",0,"None"],
  ["SK_STEEL_02","พุ่งเหล็ก","Steel Rush","STEEL","Physical",52,95,16,4,"NearestEnemy","Dash",100,"Uncommon","Movement",0,"Direct",true,"DMG_v1.0",0,"None"],
  ["SK_STEEL_03","การ์ดเหล็ก","Iron Guard","STEEL","Support",0,100,10,8,"Self","DamageReduce",100,"Uncommon","Status",1,"Self",false,"DMG_v1.0",0,"None"],
  ["SK_STEEL_04","ปืนใหญ่เหล็ก","Steel Cannon","STEEL","Special",72,92,10,5.5,"EnemyArea","LineShot",20,"Rare","DamageShape",0,"Line",true,"DMG_v1.0",0,"None"],
  ["SK_STEEL_05","สนามแม่เหล็ก","Magnetic Field","STEEL","Control",42,90,8,7,"EnemyArea","SlowArea",35,"Rare","Status",1,"Area",true,"DMG_v1.0",0,"None"],
  ["SK_STEEL_06","ป้อมปราการเหล็ก","Iron Fortress","STEEL","Ultimate",118,88,3,14,"EnemyArea","DEFUp",50,"Epic","Status",1,"Self",true,"DMG_v1.0",0,"None"],
  ["SK_GHOST_01","ลูกวิญญาณ","Spirit Ball","GHOST","Physical",38,100,28,1.8,"NearestEnemy","Pierce",0,"Common","DamageShape",0,"Line",true,"DMG_v1.0",0,"None"],
  ["SK_GHOST_02","ก้าวภูต","Phantom Step","GHOST","Physical",52,95,16,4,"NearestEnemy","Blink",100,"Uncommon","Movement",0,"Direct",true,"DMG_v1.0",0,"None"],
  ["SK_GHOST_03","ม่านวิญญาณ","Spirit Veil","GHOST","Support",0,100,10,8,"Self","EvasionUp",100,"Uncommon","Status",1,"Self",false,"DMG_v1.0",0,"None"],
  ["SK_GHOST_04","หลอกหลอน","Haunt","GHOST","Special",72,92,10,5.5,"EnemyArea","Fear",20,"Rare","Status",1,"Single",true,"DMG_v1.0",0,"None"],
  ["SK_GHOST_05","ดูดวิญญาณ","Soul Drain","GHOST","Control",42,90,8,7,"EnemyArea","LifeSteal",35,"Rare","HealModifier",0,"Direct",true,"DMG_v1.0",0,"None"],
  ["SK_GHOST_06","ประตูปรโลก","Nether Gate","GHOST","Ultimate",118,88,3,14,"EnemyArea","FearArea",50,"Epic","Status",1,"Area",true,"DMG_v1.0",0,"None"],
];

export const SKILL_CATALOG = Object.freeze(RAW_SKILLS.map(([
  id, nameTH, nameEN, sourceType, category, power, accuracy, maxUses, cooldownSec,
  targetType, effect, effectChancePct, tier, effectClass, statusLinkCount,
  applicationMode, directDamage, damageFormulaVersion, armorPiercePct, conditionalDamageRule,
]) => Object.freeze({
  id,
  nameTH,
  nameEN,
  sourceType,
  runtimeType: TYPE_MAP[sourceType],
  category,
  power,
  accuracy,
  maxUses,
  cooldownSec,
  targetType,
  effect,
  effectChancePct,
  tier,
  effectClass,
  statusLinkCount,
  applicationMode,
  directDamage,
  damageFormulaVersion,
  armorPiercePct,
  conditionalDamageRule,
  activation: 'catalog_only',
  typeDecision: sourceType === 'LIGHT' ? 'D2_FAIRY_CANONICAL_LIGHT_DEFERRED' : 'D2_DIRECT_TYPE_MAPPING',
  sourceWorkbookVersion: CONTENT_PROVENANCE.workbookVersion,
})));

const SKILL_BY_ID = new Map(SKILL_CATALOG.map(skill => [skill.id, skill]));
const FORBIDDEN_RUNTIME_FIELDS = Object.freeze(['currentUses', 'cooldownRemaining', 'instanceId', 'masteryXp', 'equippedSlot']);

function skillIssue(code, index, field, detail = {}) {
  return Object.freeze({ code, index, field, ...detail });
}

export function validateSkillCatalog(records) {
  if (!Array.isArray(records)) {
    return Object.freeze({ ok: false, issues: Object.freeze([skillIssue('invalid_catalog', -1, 'root')]) });
  }
  const issues = [];
  if (records.length !== 108) issues.push(skillIssue('skill_count_mismatch', -1, 'length', { value: records.length }));
  const ids = new Set();
  records.forEach((skill, index) => {
    if (!skill || typeof skill !== 'object') {
      issues.push(skillIssue('invalid_skill', index, 'root'));
      return;
    }
    if (!CONTENT_ID_PATTERNS.skills.test(skill.id)) issues.push(skillIssue('invalid_skill_id', index, 'id', { id: skill.id ?? null }));
    if (ids.has(skill.id)) issues.push(skillIssue('duplicate_skill_id', index, 'id', { id: skill.id }));
    ids.add(skill.id);
    const expectedRuntimeType = TYPE_MAP[skill.sourceType];
    if (!expectedRuntimeType || skill.runtimeType !== expectedRuntimeType || skill.runtimeType === 'Light' || skill.runtimeType === 'LIGHT') {
      issues.push(skillIssue('invalid_runtime_type', index, 'runtimeType', { value: skill.runtimeType ?? null }));
    }
    if (!SKILL_CATEGORIES.includes(skill.category)) issues.push(skillIssue('invalid_category', index, 'category', { value: skill.category ?? null }));
    if (!SKILL_TARGET_TYPES.includes(skill.targetType)) issues.push(skillIssue('invalid_target_type', index, 'targetType', { value: skill.targetType ?? null }));
    if (!SKILL_EFFECT_CLASSES.includes(skill.effectClass) || typeof skill.effect !== 'string' || skill.effect.length === 0) {
      issues.push(skillIssue('invalid_effect_class', index, 'effectClass', { value: skill.effectClass ?? null }));
    }
    if (!SKILL_APPLICATION_MODES.includes(skill.applicationMode)) issues.push(skillIssue('invalid_application_mode', index, 'applicationMode', { value: skill.applicationMode ?? null }));
    if (!Number.isFinite(skill.power) || skill.power < 0) issues.push(skillIssue('invalid_power', index, 'power', { value: skill.power ?? null }));
    if (!Number.isFinite(skill.accuracy) || skill.accuracy < 0 || skill.accuracy > 100) issues.push(skillIssue('invalid_accuracy', index, 'accuracy', { value: skill.accuracy ?? null }));
    if (!Number.isInteger(skill.maxUses) || skill.maxUses <= 0) issues.push(skillIssue('invalid_max_uses', index, 'maxUses', { value: skill.maxUses ?? null }));
    if (!Number.isFinite(skill.cooldownSec) || skill.cooldownSec < 0) issues.push(skillIssue('invalid_cooldown', index, 'cooldownSec', { value: skill.cooldownSec ?? null }));
    if (!Number.isFinite(skill.effectChancePct) || skill.effectChancePct < 0 || skill.effectChancePct > 100) issues.push(skillIssue('invalid_effect_chance', index, 'effectChancePct', { value: skill.effectChancePct ?? null }));
    if (!Number.isInteger(skill.statusLinkCount) || skill.statusLinkCount < 0) issues.push(skillIssue('invalid_status_link_count', index, 'statusLinkCount', { value: skill.statusLinkCount ?? null }));
    if (typeof skill.directDamage !== 'boolean') issues.push(skillIssue('invalid_direct_damage_flag', index, 'directDamage'));
    if (skill.targetType === 'GroundPoint' && skill.activation !== 'catalog_only') issues.push(skillIssue('ground_point_activation_forbidden', index, 'activation'));
    if (skill.sourceType === 'LIGHT' && (skill.runtimeType !== 'Fairy' || skill.typeDecision !== 'D2_FAIRY_CANONICAL_LIGHT_DEFERRED')) {
      issues.push(skillIssue('fairy_light_decision_missing', index, 'typeDecision'));
    }
    for (const field of FORBIDDEN_RUNTIME_FIELDS) {
      if (field in skill) issues.push(skillIssue('runtime_field_in_skill_master', index, field));
    }
  });
  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });
}

export function skillCatalogEntry(skillId) {
  return SKILL_BY_ID.get(skillId) ?? null;
}
