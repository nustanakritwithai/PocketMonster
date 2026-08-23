import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const filename = 'skill-icon-descriptor.mjs';
const source = fs.readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8');

async function loadSource(candidate, tag) {
  const fileUrl = new URL(`../${filename}`, import.meta.url);
  const withAbsoluteImports = candidate.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(relativePath, fileUrl).href}'`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(`${withAbsoluteImports}\n//# sourceURL=${tag}`).toString('base64')}`);
}

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function cloneCatalog(module) {
  return module.SKILL_ICON_CATALOG.map(descriptor => ({ ...descriptor }));
}

function assertContract(module) {
  assert.equal(hash(module.SKILL_ICON_LAYER_LEGEND), 'b3809d5d9da66f4f336870fcac4805f89c1dfeaa4b7f5ced9ae4f188e9698120');
  assert.equal(hash(module.SKILL_TYPE_ICON_LEGEND), '9dd28cfc99e6c7714ce4a7b7fddfa83c14b7f3a8493f41e91338d6175c1a790f');
  assert.equal(hash(module.SKILL_CATEGORY_ICON_LEGEND), '7449ced70339696485a2054c733ee710a5490cda3ee510b26b79c1af8b25b5ac');
  assert.equal(hash(module.SKILL_EFFECT_ICON_LEGEND), '2d67403f70f737ec35858e2f7d4253433e492f6319f1cbd150aa4462cf281db2');
  assert.equal(hash(module.SKILL_BUTTON_STATE_CATALOG), '9edc9faa511aabeb9989b8e8ccd3bfb40577afb8f18ab38160de2ce4d1850835');
  assert.equal(hash(module.SKILL_ICON_CATALOG), 'f92d470d33dc39ab9dd57d222d7e6f323232ef2a560a8f1815bbe23c6617c504');
  assert.equal(module.SKILL_ICON_CATALOG.length, 108);
  const canonicalValidation = module.validateSkillIconCatalog(module.SKILL_ICON_CATALOG);
  assert.equal(canonicalValidation.ok, true);
  assert.equal(Object.isFrozen(canonicalValidation), true);
  assert.equal(Object.isFrozen(canonicalValidation.issues), true);
  assert.equal(Object.isFrozen(module.SKILL_ICON_CATALOG), true);
  assert.ok(module.SKILL_ICON_CATALOG.every(Object.isFrozen));
  assert.equal(Object.isFrozen(module.SKILL_ICON_POLICY), true);
  assert.equal(Object.isFrozen(module.SKILL_ICON_POLICY.authorityRanges), true);
  assert.equal(module.SKILL_ICON_POLICY.characterSkillsIntegration, 'deferred_A37');
  assert.equal(module.SKILL_ICON_POLICY.runtimeMutation, 'none_descriptor_only');
  assert.equal(module.SKILL_ICON_POLICY.auditColumnsAreSnapshot, true);
  assert.equal(module.SKILL_ICON_POLICY.lightRuntimeActivation, 'deferred_D2');
  assert.equal(module.SKILL_ICON_POLICY.sourceWorkbookSha256, 'fdda777b1cbb0eeaacb7e02ced3c1c9df1a3af2853bfdf8d1fe902370789e39c');
  assert.equal(module.SKILL_ICON_UI_AUDIT.liveRuntimeTruth, false);
  assert.equal(module.SKILL_ICON_UI_AUDIT.kpis.documentedCurrentMainIconKinds, 5);
  assert.equal(module.SKILL_ICON_UI_AUDIT.kpis.workbookEquippedSkillSlots, 4);

  const iceWall = module.skillIconDescriptor('SK_ICE_04');
  assert.deepEqual([
    iceWall.documentedIconKind,
    iceWall.documentedMainSymbol,
    iceWall.documentedRuntimeCoverage,
  ], ['groundpoint-fallback', '↗', 'CURRENT_GAP']);
  assert.deepEqual(module.SKILL_ICON_CATALOG.filter(entry => entry.sourceType === 'LIGHT').map(entry => [
    entry.runtimeType,
    entry.typeDecision,
    entry.typeSymbol,
    entry.accessibilityLabelTH.includes('ธาตุ แสง'),
  ]), Array.from({ length: 6 }, () => ['Fairy', 'D2_FAIRY_CANONICAL_LIGHT_DEFERRED', '✦', true]));
  assert.equal(module.SKILL_ICON_CATALOG.filter(entry => entry.category === 'Control' && entry.canCrit).length, 0);
  assert.equal(module.SKILL_ICON_CATALOG.filter(entry => entry.effect === 'None' && entry.effectOverlay === '').length, 8);
  assert.equal(module.skillIconDescriptor(' SK_NORMAL_01'), null);
  assert.equal(module.skillIconDescriptor('__proto__'), null);
  assert.equal(Object.isFrozen(module.skillIconDescriptor('SK_NORMAL_01')), true);
  assert.equal(module.skillButtonStateDescriptor('Active Buff').runtimeStatus, 'DESIGN');
  assert.equal(Object.isFrozen(module.skillButtonStateDescriptor('Active Buff')), true);
  assert.equal(module.skillButtonStateDescriptor(' Active Buff'), null);

  const changedCategory = cloneCatalog(module);
  changedCategory[0].category = 'Debug';
  assert.ok(module.validateSkillIconCatalog(changedCategory).issues.some(issue => issue.code === 'workbook_descriptor_mismatch'));
  const changedA11y = cloneCatalog(module);
  changedA11y[0].accessibilityLabelTH = 'debug';
  assert.ok(module.validateSkillIconCatalog(changedA11y).issues.some(issue => issue.code === 'workbook_descriptor_mismatch'));
  const changedRuntimeType = cloneCatalog(module);
  changedRuntimeType.find(entry => entry.sourceType === 'LIGHT').runtimeType = 'Light';
  assert.ok(module.validateSkillIconCatalog(changedRuntimeType).issues.some(issue => issue.code === 'light_runtime_type_forbidden'));
  const duplicate = cloneCatalog(module);
  duplicate[1].skillId = duplicate[0].skillId;
  assert.ok(module.validateSkillIconCatalog(duplicate).issues.some(issue => issue.code === 'duplicate_skill_id'));
  const swapped = cloneCatalog(module);
  [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  assert.ok(module.validateSkillIconCatalog(swapped).issues.some(issue => issue.code === 'skill_order_mismatch'));
  const runtimeLeak = cloneCatalog(module);
  runtimeLeak[0].currentUses = 10;
  assert.ok(module.validateSkillIconCatalog(runtimeLeak).issues.some(issue => issue.code === 'forbidden_runtime_field'));
  const unknownField = cloneCatalog(module);
  unknownField[0].debug = true;
  assert.ok(module.validateSkillIconCatalog(unknownField).issues.some(issue => issue.code === 'unexpected_descriptor_field'));

  const extraRoot = cloneCatalog(module);
  extraRoot.debug = true;
  assert.equal(module.validateSkillIconCatalog(extraRoot).ok, false);
  class DescriptorArray extends Array {}
  assert.equal(module.validateSkillIconCatalog(DescriptorArray.from(module.SKILL_ICON_CATALOG, entry => ({ ...entry }))).ok, false);
  const inheritedRecord = Object.create({ inherited: true });
  Object.assign(inheritedRecord, module.SKILL_ICON_CATALOG[0]);
  const inheritedCatalog = cloneCatalog(module);
  inheritedCatalog[0] = inheritedRecord;
  assert.equal(module.validateSkillIconCatalog(inheritedCatalog).ok, false);

  let rootAccessorReads = 0;
  const accessorArray = [];
  Object.defineProperty(accessorArray, '0', {
    enumerable: true,
    configurable: true,
    get() {
      rootAccessorReads += 1;
      return module.SKILL_ICON_CATALOG[0];
    },
  });
  assert.equal(module.validateSkillIconCatalog(accessorArray).ok, false);
  assert.equal(rootAccessorReads, 0);

  let recordAccessorReads = 0;
  const accessorRecord = { ...module.SKILL_ICON_CATALOG[0] };
  Object.defineProperty(accessorRecord, 'category', {
    enumerable: true,
    configurable: true,
    get() {
      recordAccessorReads += 1;
      return module.SKILL_ICON_CATALOG[0].category;
    },
  });
  const accessorCatalog = cloneCatalog(module);
  accessorCatalog[0] = accessorRecord;
  assert.equal(module.validateSkillIconCatalog(accessorCatalog).ok, false);
  assert.equal(recordAccessorReads, 0);

  const hostile = new Proxy({}, { ownKeys() { throw new Error('hostile record'); } });
  assert.doesNotThrow(() => module.validateSkillIconCatalog([hostile]));
  assert.equal(module.validateSkillIconCatalog([hostile]).ok, false);

  let arrayReads = 0;
  const masquerade = new Proxy([], {
    get(target, property, receiver) {
      if (property === 'length' || property === 'forEach') arrayReads += 1;
      return Reflect.get(target, property, receiver);
    },
  });
  assert.equal(module.validateSkillIconCatalog(masquerade).ok, false);
  assert.equal(arrayReads, 0);

  let recordReads = 0;
  const masked = new Proxy({ ...module.SKILL_ICON_CATALOG[0], category: 'Debug' }, {
    get(_target, property) {
      recordReads += 1;
      return module.SKILL_ICON_CATALOG[0][property];
    },
  });
  const maskedCatalog = cloneCatalog(module);
  maskedCatalog[0] = masked;
  assert.ok(module.validateSkillIconCatalog(maskedCatalog).issues.some(issue => issue.code === 'workbook_descriptor_mismatch'));
  assert.equal(recordReads, 0);
}

assertContract(await loadSource(source, 'skill-icon-current'));

function replaceOnce(before, after) {
  return candidate => {
    const mutant = candidate.replace(before, after);
    assert.notEqual(mutant, candidate, `mutation target missing: ${before}`);
    return mutant;
  };
}

const mutants = [
  ['change enemy legend symbol', replaceOnce("['Main target icon', 'enemy', '↗'", "['Main target icon', 'enemy', '→'")],
  ['change LIGHT symbol', replaceOnce("['LIGHT', '✦', 'ดาวเรืองแสงมีรัศมี'", "['LIGHT', '✨', 'ดาวเรืองแสงมีรัศมี'")],
  ['change Control marker', replaceOnce("['Control', '◎', 'เป้า/วงควบคุม'", "['Control', '○', 'เป้า/วงควบคุม'")],
  ['change Burn overlay', replaceOnce("['Burn', '🔥', 'มีโอกาสติด Burn']", "['Burn', '♨', 'มีโอกาสติด Burn']")],
  ['change Ready state', replaceOnce("'CURRENT + USES DESIGN'", "'CURRENT'")],
  ['activate Character UI early', replaceOnce("characterSkillsIntegration: 'deferred_A37'", "characterSkillsIntegration: 'active_A36'")],
  ['claim runtime mutation', replaceOnce("runtimeMutation: 'none_descriptor_only'", "runtimeMutation: 'game_ui_wiring'")],
  ['erase snapshot authority guard', replaceOnce('auditColumnsAreSnapshot: true', 'auditColumnsAreSnapshot: false')],
  ['activate LIGHT runtime', replaceOnce("lightRuntimeActivation: 'deferred_D2'", "lightRuntimeActivation: 'active'")],
  ['treat snapshot as live truth', replaceOnce('liveRuntimeTruth: false', 'liveRuntimeTruth: true')],
  ['change snapshot main kind KPI', replaceOnce('documentedCurrentMainIconKinds: 5', 'documentedCurrentMainIconKinds: 6')],
  ['map enemy to area kind', replaceOnce("documentedIconKind: 'enemy'", "documentedIconKind: 'area'")],
  ['invent GroundPoint area icon', replaceOnce("documentedIconKind: 'groundpoint-fallback'", "documentedIconKind: 'area'")],
  ['erase GroundPoint gap', replaceOnce("documentedRuntimeCoverage: 'CURRENT_GAP'", "documentedRuntimeCoverage: 'CURRENT'")],
  ['misclassify Self shields', replaceOnce("const SELF_SHIELD_EFFECTS = new Set(['FireResist', 'DamageReduce', 'DEFUp', 'PoisonResist']);", 'const SELF_SHIELD_EFFECTS = new Set([]);')],
  ['misclassify Self heals', replaceOnce("if (skill.effect === 'Heal') return TARGET_ICON_RULES.heal;", "if (false) return TARGET_ICON_RULES.heal;")],
  ['allow Control crit', replaceOnce("new Set(['Physical', 'Special', 'Ultimate'])", "new Set(['Physical', 'Special', 'Ultimate', 'Control'])")],
  ['derive CanCrit from DirectDamage', replaceOnce('const canCrit = CRIT_CATEGORIES.has(skill.category);', 'const canCrit = skill.directDamage;')],
  ['rename FLYING accessibility type', replaceOnce("FLYING: 'ลม'", "FLYING: 'บิน'")],
  ['rename PSYCHIC accessibility type', replaceOnce("PSYCHIC: 'พลังจิต'", "PSYCHIC: 'จิต'")],
  ['turn runtime type into source type', replaceOnce('runtimeType: skill.runtimeType,', 'runtimeType: skill.sourceType,')],
  ['drop D2 type decision', replaceOnce('typeDecision: skill.typeDecision,', "typeDecision: 'D2_DIRECT_TYPE_MAPPING',")],
  ['activate descriptor records', replaceOnce("activation: 'catalog_only'", "activation: 'runtime_active'")],
  ['leave descriptor records mutable', replaceOnce('return Object.freeze({\n    skillId: skill.id,', 'return ({\n    skillId: skill.id,')],
  ['skip exact category validation', replaceOnce('if (!Object.is(descriptor[field], expected[field])) {', "if (field !== 'category' && !Object.is(descriptor[field], expected[field])) {")],
  ['hide runtime injection', replaceOnce('} else if (FORBIDDEN_RUNTIME_FIELDS.has(key)) {', '} else if (false && FORBIDDEN_RUNTIME_FIELDS.has(key)) {')],
  ['accept generic field injection', replaceOnce('} else if (!DESCRIPTOR_FIELD_SET.has(key)) {', '} else if (false) {')],
  ['accept extra root fields', replaceOnce("if (keys.length !== length + 1 || !keys.includes('length')) return null;", "if (!keys.includes('length')) return null;")],
  ['accept array subclasses', replaceOnce('if (prototype !== Array.prototype && prototype !== null) return null;', 'if (false) return null;')],
  ['accept inherited record prototypes', replaceOnce('if (prototype !== Object.prototype && prototype !== null) return null;', 'if (false) return null;')],
  ['invoke root index accessors', replaceOnce(
    "    const descriptor = Object.getOwnPropertyDescriptor(value, field);\n    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;\n    snapshot[index] = descriptor.value;",
    "    const descriptor = Object.getOwnPropertyDescriptor(value, field);\n    if (!descriptor) return null;\n    snapshot[index] = Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : value[field];",
  )],
  ['invoke record accessors', replaceOnce(
    "    const descriptor = Object.getOwnPropertyDescriptor(value, key);\n    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;\n    values[key] = descriptor.value;",
    "    const descriptor = Object.getOwnPropertyDescriptor(value, key);\n    if (!descriptor) return null;\n    values[key] = Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : value[key];",
  )],
  ['skip order validation', replaceOnce('if (descriptor.skillId !== SKILL_CATALOG[index]?.id) {', 'if (false) {')],
  ['skip duplicate validation', replaceOnce('if (skillIds.has(descriptor.skillId)) {', 'if (false) {')],
  ['re-read masked record values', replaceOnce('const descriptor = inspected.values;', 'const descriptor = descriptors[index];')],
  ['trust caller array methods', replaceOnce('const descriptors = dataArraySnapshot(records);', 'const descriptors = [];\n  records.forEach((entry, index) => { descriptors[index] = entry; });')],
  ['throw on hostile input', replaceOnce("  } catch {\n    return Object.freeze({ ok: false, issues: Object.freeze([issue('invalid_catalog', -1, 'root')]) });\n  }", '  } catch (error) {\n    throw error;\n  }')],
  ['return mutable validation result', replaceOnce('return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });', 'return { ok: issues.length === 0, issues };')],
  ['return mutable skill lookup clone', replaceOnce("return typeof skillId === 'string' ? (EXPECTED_BY_SKILL_ID.get(skillId) ?? null) : null;", "const descriptor = typeof skillId === 'string' ? EXPECTED_BY_SKILL_ID.get(skillId) : null;\n  return descriptor ? { ...descriptor } : null;")],
  ['return mutable state lookup clone', replaceOnce("return typeof state === 'string' ? (STATE_BY_NAME.get(state) ?? null) : null;", "const descriptor = typeof state === 'string' ? STATE_BY_NAME.get(state) : null;\n  return descriptor ? { ...descriptor } : null;")],
  ['normalize padded lookups', replaceOnce('EXPECTED_BY_SKILL_ID.get(skillId)', 'EXPECTED_BY_SKILL_ID.get(skillId.trim())')],
  ['normalize padded state lookups', replaceOnce('STATE_BY_NAME.get(state)', 'STATE_BY_NAME.get(state.trim())')],
];

let killed = 0;
for (let index = 0; index < mutants.length; index += 1) {
  const [name, mutate] = mutants[index];
  const mutant = mutate(source);
  try {
    assertContract(await loadSource(mutant, `skill-icon-mutant-${index}`));
  } catch {
    killed += 1;
    continue;
  }
  assert.fail(`${name} mutant survived`);
}

assert.equal(killed, mutants.length);
console.log(`V8.1 A36 skill icon descriptor mutants: PASS (${killed}/${mutants.length} killed)`);
