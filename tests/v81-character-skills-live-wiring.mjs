import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCharacterSkillsViewModel } from '../character-skills-view-model.mjs';

const root = new URL('../', import.meta.url);
const gameSource = fs.readFileSync(new URL('game-v800.js', root), 'utf8');
const cssSource = fs.readFileSync(new URL('style-v800.css', root), 'utf8');

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const parameters = source.indexOf('(', start);
  let parameterDepth = 0;
  let open = -1;
  for (let index = parameters; index < source.length; index += 1) {
    if (source[index] === '(') parameterDepth += 1;
    else if (source[index] === ')') parameterDepth -= 1;
    if (parameterDepth === 0) {
      open = source.indexOf('{', index);
      break;
    }
  }
  assert.ok(open >= 0, `${name} must have a body`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} must have a balanced body`);
}

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.className = '';
    this.dataset = Object.create(null);
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this.hidden = false;
    this.scrollTop = 0;
    this.tabIndex = 0;
    this._textContent = '';
  }

  set textContent(value) {
    this._textContent = String(value ?? '');
    for (const child of this.children) child.parentNode = null;
    this.children = [];
  }

  get textContent() {
    return this._textContent + this.children.map(child => child.textContent).join('');
  }

  append(...nodes) {
    for (const node of nodes) {
      if (node.parentNode) {
        node.parentNode.children = node.parentNode.children.filter(child => child !== node);
      }
      node.parentNode = this;
      this.children.push(node);
    }
  }

  replaceChildren(...nodes) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this._textContent = '';
    this.append(...nodes);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
}

class FakeDocument {
  constructor() {
    this.created = [];
    this.activeElement = null;
  }

  createElement(tagName) {
    const node = new FakeElement(tagName);
    this.created.push(node);
    return node;
  }
}

function rendererFromSource(source, documentRef) {
  const names = [
    'characterSkillsDataSnapshot',
    'characterSkillsElement',
    'createCharacterSkillsManualCard',
    'createCharacterSkillsSystemCard',
    'ensureCharacterSkillsRightTabTree',
    'setCharacterSkillsText',
    'updateCharacterSkillsManualCard',
    'updateCharacterSkillsSystemCard',
    'renderFocusedSkillLoadoutV2',
  ];
  const functions = names.map(name => functionSource(source, name)).join('\n');
  return Function(
    'createCharacterSkillsViewModel',
    'getEvolutionPath',
    'passiveCatalogEntry',
    'document',
    `'use strict';const characterSkillsRightTabTrees=new WeakMap();${functions};return Object.freeze({renderFocusedSkillLoadoutV2,ensureCharacterSkillsRightTabTree});`,
  )(
    createCharacterSkillsViewModel,
    instance => {
      if (instance?.speciesId != null) String(instance.speciesId);
      return null;
    },
    passiveId => passiveId ? Object.freeze({ id: passiveId, nameTH: '<passive>', nameEN: 'Passive' }) : null,
    documentRef,
  );
}

export function assertCharacterSkillsLiveWiring(source = gameSource, css = cssSource) {
  assert.match(source, /import \{ createCharacterSkillsViewModel \} from '\.\/character-skills-view-model\.mjs'/);
  const renderSkills = functionSource(source, 'renderSkills');
  const rightMode = renderSkills.match(/if\(targetPanel===el\('characterInfoBody'\)\)\{([\s\S]*?)\n\s*\}/)?.[1] ?? '';
  assert.match(rightMode, /focusedCharacterPresentation\(\)/, 'right tab reads the focused monster');
  assert.match(rightMode, /renderFocusedSkillLoadoutV2\(panel,inst,presentation\)/);
  assert.match(rightMode, /return;/, 'right tab exits before legacy management content');
  assert.doesNotMatch(rightMode, /state\.skillsSelectedId|monsterSelectHTML|bindMonsterSelect|getMonsterSkills/,
    'right tab cannot mix a stale selector or legacy move source');
  assert.ok(renderSkills.indexOf("targetPanel===el('characterInfoBody')") < renderSkills.indexOf('state.skillsSelectedId'),
    'focused right-tab branch must precede every legacy state write');

  const focused = functionSource(source, 'renderFocusedSkillLoadoutV2');
  assert.match(focused, /createCharacterSkillsViewModel\(inst/);
  assert.match(focused, /model\.manualSlots/);
  assert.match(focused, /model\.systemRows/);
  assert.doesNotMatch(focused, /innerHTML|getMonsterSkills|activeSummon|skillCds|cooldownRemaining/);
  assert.doesNotMatch(focused, /learnSkill|equipSkill|consumeSkill|executeEquippedSkillCommand|useSkill\(/);
  for (const functionName of ['characterSkillsElement','createCharacterSkillsManualCard','createCharacterSkillsSystemCard','ensureCharacterSkillsRightTabTree','setCharacterSkillsText','updateCharacterSkillsManualCard','updateCharacterSkillsSystemCard']) {
    assert.ok(source.includes(`function ${functionName}(`), `${functionName} is required for keyed inert DOM updates`);
  }
  assert.match(source, /setCharacterSkillsText\(card\.name/);
  assert.match(source, /setAttribute\('aria-label',row\.accessibilityLabelTH\)/);
  assert.match(source, /const characterSkillsRightTabTrees=new WeakMap\(\)/);

  const a11y = functionSource(source, 'syncFullCharacterInfoTabA11y');
  for (const token of ["setAttribute('role','tab')", "setAttribute('aria-selected'", "setAttribute('aria-controls','characterInfoBody')", "setAttribute('role','tabpanel')", "setAttribute('aria-labelledby'"]) {
    assert.ok(a11y.includes(token), `tab a11y must include ${token}`);
  }
  assert.match(a11y, /btn\.tabIndex=selected\?0:-1/, 'right tabs use a roving tab stop');

  const directBinding = source.match(/document\.querySelectorAll\('\.character-info-tab'\)\.forEach\(btn=>\{([\s\S]*?)\n\}\);/)?.[1] ?? '';
  assert.match(directBinding, /btn\.onclick=/, 'keyboard/native click path remains direct');
  assert.match(directBinding, /shouldActivateFullCharacterInfoTab/);
  assert.match(directBinding, /setFullCharacterInfoTab\(btn\.dataset\.characterTab\)/);
  assert.match(directBinding, /btn\.onkeydown=/, 'roving tabs need direct keyboard navigation');
  assert.match(directBinding, /resolveFullCharacterInfoTabKey/);
  assert.match(directBinding, /next\.focus\(\)/);
  assert.match(directBinding, /setFullCharacterInfoTab\(next\.dataset\.characterTab\)/);
  const pointerBinding = source.match(/el\('monsterManager'\)\?\.addEventListener\('pointerup',event=>\{([\s\S]*?)\n\},\{capture:true,passive:false\}\);/)?.[1] ?? '';
  assert.match(pointerBinding, /shouldActivateFullCharacterInfoTab/);
  assert.match(pointerBinding, /finishFullCharacterInfoTabPointer/, 'pointerup fallback requires a matching primary/left pointer origin');
  assert.match(pointerBinding, /setFullCharacterInfoTab\(tab\.dataset\.characterTab\)/);

  const guardSource = functionSource(source, 'shouldActivateFullCharacterInfoTab');
  const shouldActivate = Function(
    `'use strict';const characterInfoTabActivationGuard=new WeakMap();const characterInfoTabSuppressedClicks=new WeakMap();${functionSource(source, 'suppressFullCharacterInfoTabClick')}${guardSource};return shouldActivateFullCharacterInfoTab;`,
  )();
  const buttonA = {};
  const buttonB = {};
  assert.equal(shouldActivate(buttonA, 'pointerup', 100, true), true);
  assert.equal(shouldActivate(buttonA, 'click', 101, true), false, 'pointerup followed by its click dispatches once');
  assert.equal(shouldActivate(buttonA, 'click', 102, false), true, 'keyboard/native synthetic click remains available');
  assert.equal(shouldActivate(buttonA, 'pointerup', 200, true), true);
  assert.equal(shouldActivate(buttonA, 'click', 1000, true), true, 'an unrelated later click is not swallowed');
  assert.equal(shouldActivate(buttonA, 'pointerup', 1050, true), true);
  assert.equal(shouldActivate(buttonB, 'click', 1051, true), true, 'a pointerup on A cannot swallow a click on B');
  assert.equal(shouldActivate(buttonA, 'click', 1052, true), false);
  assert.equal(shouldActivate(buttonA, 'pointerup', 1100, true), true);
  assert.equal(shouldActivate(buttonB, 'pointerup', 1101, true), true);
  assert.equal(shouldActivate(buttonA, 'click', 1102, true), false, 'interleaved A click remains paired to A pointerup');
  assert.equal(shouldActivate(buttonB, 'click', 1103, true), false, 'interleaved B click remains paired to B pointerup');
  assert.equal(shouldActivate(buttonA, 'pointerup', 1200, true), true);
  assert.equal(shouldActivate(buttonA, 'pointerup', 1201, true), true);
  assert.equal(shouldActivate(buttonA, 'click', 1202, true), false);
  assert.equal(shouldActivate(buttonA, 'click', 1203, true), false, 'multiple pending pointer activations suppress both compatibility clicks');
  assert.equal(shouldActivate(buttonA, 'click', 1204, true), true);

  const pointerLifecycle = Function(
    `'use strict';const characterInfoTabActivationGuard=new WeakMap();const characterInfoTabSuppressedClicks=new WeakMap();const characterInfoTabPointerStarts=new Map();${functionSource(source, 'suppressFullCharacterInfoTabClick')}${guardSource}${[
      'beginFullCharacterInfoTabPointer',
      'moveFullCharacterInfoTabPointer',
      'cancelFullCharacterInfoTabPointer',
      'finishFullCharacterInfoTabPointer',
    ].map(name => functionSource(source, name)).join('\n')};return Object.freeze({beginFullCharacterInfoTabPointer,moveFullCharacterInfoTabPointer,cancelFullCharacterInfoTabPointer,finishFullCharacterInfoTabPointer,shouldActivateFullCharacterInfoTab});`,
  )();
  const tabA = {};
  const tabB = {};
  const pointer = (overrides = {}) => ({ pointerId: 1, isPrimary: true, button: 0, clientX: 10, clientY: 10, timeStamp: 100, ...overrides });
  assert.equal(pointerLifecycle.beginFullCharacterInfoTabPointer(pointer(), tabA), true);
  assert.equal(pointerLifecycle.finishFullCharacterInfoTabPointer(pointer({ clientX: 14, clientY: 13 }), tabA), true);
  assert.equal(pointerLifecycle.beginFullCharacterInfoTabPointer(pointer({ pointerId: 2, button: 2 }), tabA), false, 'right click cannot activate the pointerup fallback');
  assert.equal(pointerLifecycle.beginFullCharacterInfoTabPointer(pointer({ pointerId: 3, isPrimary: false }), tabA), false, 'secondary touch cannot activate the fallback');
  assert.equal(pointerLifecycle.beginFullCharacterInfoTabPointer(pointer({ pointerId: 4 }), tabA), true);
  assert.equal(pointerLifecycle.finishFullCharacterInfoTabPointer(pointer({ pointerId: 4 }), tabB), false, 'pointer must end on its origin tab');
  assert.equal(pointerLifecycle.beginFullCharacterInfoTabPointer(pointer({ pointerId: 5 }), tabA), true);
  assert.equal(pointerLifecycle.moveFullCharacterInfoTabPointer(pointer({ pointerId: 5, clientX: 40 }), 12), false);
  assert.equal(pointerLifecycle.finishFullCharacterInfoTabPointer(pointer({ pointerId: 5, clientX: 40, timeStamp: 130 }), tabA), false, 'dragged pointers cannot activate a tab');
  assert.equal(pointerLifecycle.shouldActivateFullCharacterInfoTab(tabA, 'click', 131, true), false, 'drag compatibility click is suppressed end-to-end');
  assert.equal(pointerLifecycle.shouldActivateFullCharacterInfoTab(tabA, 'click', 132, true), true, 'suppression consumes only the dragged click');
  assert.equal(pointerLifecycle.beginFullCharacterInfoTabPointer(pointer({ pointerId: 6 }), tabA), true);
  pointerLifecycle.cancelFullCharacterInfoTabPointer(pointer({ pointerId: 6 }));
  assert.equal(pointerLifecycle.finishFullCharacterInfoTabPointer(pointer({ pointerId: 6 }), tabA), false, 'canceled pointers cannot activate a tab');

  const keyResolverSource = functionSource(source, 'resolveFullCharacterInfoTabKey');
  const resolveKey = Function(`'use strict';${keyResolverSource};return resolveFullCharacterInfoTabKey;`)();
  const tabs = [{ key: 'info' }, { key: 'skills' }, { key: 'equipment' }, { key: 'training' }, { key: 'evolution' }];
  assert.strictEqual(resolveKey(tabs[0], 'ArrowRight', tabs), tabs[1]);
  assert.strictEqual(resolveKey(tabs[0], 'ArrowDown', tabs), tabs[1]);
  assert.strictEqual(resolveKey(tabs[0], 'ArrowLeft', tabs), tabs[4]);
  assert.strictEqual(resolveKey(tabs[4], 'ArrowRight', tabs), tabs[0]);
  assert.strictEqual(resolveKey(tabs[2], 'Home', tabs), tabs[0]);
  assert.strictEqual(resolveKey(tabs[2], 'End', tabs), tabs[4]);
  assert.equal(resolveKey(tabs[2], 'Enter', tabs), null);

  for (const cssToken of [
    '.character-info-body .character-skills-a37{min-width:0',
    'grid-template-columns:repeat(auto-fit',
    '.character-info-body .character-skill-slot-card.is-no-uses',
    '.character-info-body .character-skill-slot-card.is-invalid',
    'overflow-wrap:anywhere',
  ]) assert.ok(css.includes(cssToken), `responsive A37 CSS requires ${cssToken}`);
  assert.doesNotMatch(css.match(/\/\* V8\.1 A37[\s\S]*?\/\* V8\.0 UX Phase 4/)?.[0] ?? '', /(?:^|[;{])(?:height|width):\s*\d+px/m,
    'A37 cards must not add fixed geometry or a nested fixed-height scroller');

  const probeDocument = new FakeDocument();
  const probeRenderer = rendererFromSource(source, probeDocument);
  const probePanel = new FakeElement('div');
  const probeInstance = {
    instanceId: 'probe',
    skills: [
      { skillId: 'SK_FIRE_01', slot: 's1', currentUses: 0, masteryExp: 100, mutationId: '<spark>' },
      { skillId: 'SK_ICE_04', slot: 's3', currentUses: 10 },
      { skillId: 'SK_LIGHT_04', slot: 's4', currentUses: 7 },
    ],
  };
  const probeBefore = structuredClone(probeInstance);
  probeRenderer.renderFocusedSkillLoadoutV2(probePanel, probeInstance, { id: 'probe', name: '<img>' }, probeDocument);
  const firstTree = probeRenderer.ensureCharacterSkillsRightTabTree(probePanel, probeDocument);
  const firstRoot = firstTree.root;
  const firstSlot = firstTree.manual.get('s1').root;
  assert.deepEqual(probeInstance, probeBefore);
  assert.equal(firstTree.manual.size, 4);
  assert.equal(firstTree.system.size, 3);
  assert.equal(firstTree.manual.get('s1').mainIcon.textContent, '↗');
  assert.equal(firstTree.manual.get('s1').typeIcon.textContent, '🔥');
  assert.equal(firstTree.manual.get('s1').categoryIcon.textContent, '╱');
  assert.equal(firstTree.manual.get('s1').effectIcon.textContent, '🔥');
  assert.equal(firstTree.manual.get('s1').state.textContent, 'No Uses');
  assert.equal(firstTree.manual.get('s1').meta.textContent, 'FIRE / runtime Fire • Physical • NearestEnemy');
  assert.equal(firstTree.manual.get('s3').meta.textContent, 'ICE / runtime Ice • Defense • GroundPoint • documented fallback / CURRENT_GAP');
  assert.equal(firstTree.manual.get('s1').resources.textContent, 'Uses 0/28 • CD 1.8s');
  assert.equal(firstTree.manual.get('s1').mastery.textContent, 'Mastery familiar • EXP 100 • Mutation <spark>');
  assert.equal(
    firstTree.manual.get('s1').root.getAttribute('aria-label'),
    'S1, สะเก็ดไฟ, ธาตุ ไฟ, Physical, เป้าหมาย NearestEnemy, ใช้ได้สูงสุด 28 ครั้ง, คูลดาวน์ 1.8 วินาที, เอฟเฟกต์ Burn, คริติคอลได้, Uses เหลือ 0/28, สถานะ No Uses',
  );
  assert.match(firstTree.manual.get('s4').meta.textContent, /LIGHT \/ runtime Fairy/);
  assert.equal(firstTree.system.get('basicAI').detail.textContent, 'Power 15 • CD 0.9s • ไม่ใช้ Uses');
  assert.equal(probeDocument.created.some(node => node.tagName === 'IMG'), false);
  probeRenderer.renderFocusedSkillLoadoutV2(probePanel, probeInstance, { id: 'probe', name: '<img>' }, probeDocument);
  const secondTree = probeRenderer.ensureCharacterSkillsRightTabTree(probePanel, probeDocument);
  assert.strictEqual(secondTree.root, firstRoot);
  assert.strictEqual(secondTree.manual.get('s1').root, firstSlot);

  let probeCoercions = 0;
  const hostileSpeciesId = {
    [Symbol.toPrimitive]() {
      probeCoercions += 1;
      throw new Error('hostile species coercion');
    },
  };
  assert.doesNotThrow(() => probeRenderer.renderFocusedSkillLoadoutV2(probePanel, {
    instanceId: 'hostile-species-probe',
    speciesId: hostileSpeciesId,
    formId: hostileSpeciesId,
    evolutionPath: hostileSpeciesId,
    skills: [],
  }, { id: 'hostile-species-probe', name: 'Hostile Species' }, probeDocument));
  assert.equal(probeCoercions, 0, 'evolution identifiers are type-checked before resolver lookup');
}

assertCharacterSkillsLiveWiring();

const documentRef = new FakeDocument();
const renderer = rendererFromSource(gameSource, documentRef);
const panel = new FakeElement('div');
panel.scrollTop = 37;
const payload = '\"><img src=x onerror=globalThis.A37_PWNED=1>';
const instanceA = {
  instanceId: payload,
  passiveId: payload,
  testPath: { trait: payload },
  skills: [
    { skillId: 'basic_attack', slot: 'basicAI' },
    { skillId: 'SK_FIRE_01', slot: 's1', currentUses: 0, masteryExp: 100, mutationId: payload },
    { skillId: 'SK_ICE_04', slot: 's3', currentUses: 10 },
    { skillId: 'SK_LIGHT_04', slot: 's4', currentUses: 7 },
  ],
};
const presentationA = { id: payload, name: payload };
const beforeA = structuredClone(instanceA);
const modelA = renderer.renderFocusedSkillLoadoutV2(panel, instanceA, presentationA, documentRef);
assert.deepEqual(instanceA, beforeA, 'live right-tab render is read-only');
assert.deepEqual(modelA.manualSlots.map(row => row.slot), ['s1','s2','s3','s4']);
const treeA = renderer.ensureCharacterSkillsRightTabTree(panel, documentRef);
const rootNode = treeA.root;
const s1Node = treeA.manual.get('s1').root;
documentRef.activeElement = s1Node;
assert.match(treeA.title.textContent, /<img/, 'stored markup is retained only as inert text');
assert.equal(documentRef.created.some(node => node.tagName === 'IMG'), false, 'stored markup cannot create elements');
assert.equal(treeA.manual.get('s4').name.textContent, 'แสงเยียวยา (Healing Light)');
assert.match(treeA.manual.get('s4').meta.textContent, /LIGHT \/ runtime Fairy/);
assert.match(treeA.manual.get('s3').meta.textContent, /documented fallback \/ CURRENT_GAP/);
assert.equal(treeA.manual.get('s1').resources.textContent, 'Uses 0/28 • CD 1.8s');

renderer.renderFocusedSkillLoadoutV2(panel, instanceA, presentationA, documentRef);
const treeAgain = renderer.ensureCharacterSkillsRightTabTree(panel, documentRef);
assert.strictEqual(treeAgain.root, rootNode, 'identical refresh preserves the right-tab root');
assert.strictEqual(treeAgain.manual.get('s1').root, s1Node, 'identical refresh preserves keyed slot nodes');
assert.equal(panel.scrollTop, 37, 'refresh preserves parent scroll position');
assert.strictEqual(documentRef.activeElement, s1Node, 'refresh preserves focus identity');

const instanceB = {
  instanceId: 'focus-b',
  skills: [{ skillId: 'SK_WATER_01', slot: 's1', currentUses: 28 }],
};
renderer.renderFocusedSkillLoadoutV2(panel, instanceB, { id: 'focus-b', name: 'Aquaffin' }, documentRef);
const treeB = renderer.ensureCharacterSkillsRightTabTree(panel, documentRef);
assert.strictEqual(treeB.root, rootNode, 'focus change updates the stable tree');
assert.strictEqual(treeB.manual.get('s1').root, s1Node, 'focus change keeps keyed rows');
assert.match(treeB.title.textContent, /Aquaffin/);
assert.doesNotMatch(treeB.root.textContent, /Flameling|<spark>/, 'focus change leaves no prior-monster residue');

const unknownPayload = '<img src=x onerror=globalThis.UNKNOWN_PWNED=1>';
renderer.renderFocusedSkillLoadoutV2(panel, {
  instanceId: 'unknown',
  skills: [{ skillId: unknownPayload, slot: 's1', currentUses: 1 }],
}, { id: 'unknown', name: 'Unknown' }, documentRef);
assert.match(treeB.manual.get('s1').name.textContent, /<img/);
assert.equal(documentRef.created.some(node => node.tagName === 'IMG'), false);
assert.equal(treeB.manual.get('s1').root.dataset.skillState, 'invalid');

let rawGetterReads = 0;
const accessorInstance = { instanceId: 'accessor-live', skills: [] };
Object.defineProperty(accessorInstance, 'passiveId', {
  enumerable: true,
  get() {
    rawGetterReads += 1;
    return 'PASS_FIRE_01';
  },
});
const accessorPresentation = {};
Object.defineProperty(accessorPresentation, 'name', {
  enumerable: true,
  get() {
    rawGetterReads += 1;
    return 'Getter Monster';
  },
});
assert.doesNotThrow(() => renderer.renderFocusedSkillLoadoutV2(panel, accessorInstance, accessorPresentation, documentRef));
assert.equal(rawGetterReads, 0, 'live renderer rejects raw instance/presentation accessors without invoking them');

let rawCoercions = 0;
const hostileSpeciesId = {
  [Symbol.toPrimitive]() {
    rawCoercions += 1;
    throw new Error('hostile species coercion');
  },
};
assert.doesNotThrow(() => renderer.renderFocusedSkillLoadoutV2(panel, {
  instanceId: 'hostile-species',
  speciesId: hostileSpeciesId,
  formId: hostileSpeciesId,
  evolutionPath: hostileSpeciesId,
  skills: [],
}, { id: 'hostile-species', name: 'Hostile Species' }, documentRef));
assert.equal(rawCoercions, 0, 'live renderer type-checks evolution identifiers before resolver lookup');

renderer.renderFocusedSkillLoadoutV2(panel, null, { id: null, name: '' }, documentRef);
const emptyTree = renderer.ensureCharacterSkillsRightTabTree(panel, documentRef);
assert.strictEqual(emptyTree.root, rootNode);
assert.equal(emptyTree.empty.hidden, false);
assert.equal(emptyTree.manualGrid.hidden, true);
assert.doesNotMatch(emptyTree.title.textContent, /Aquaffin|Unknown/);

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('V8.1 A37 Character Skills live wiring: PASS (focused-only, stable inert DOM, a11y, deduped activation)');
}
