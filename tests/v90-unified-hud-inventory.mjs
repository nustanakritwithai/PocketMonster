import assert from 'node:assert/strict';
import fs from 'node:fs';

const parentHtml = fs.readFileSync(new URL('../v900.html', import.meta.url), 'utf8');
const pirateBoot = fs.readFileSync(new URL('../boot-pirate-fruit-v900.mjs', import.meta.url), 'utf8');
const pirateHud = fs.readFileSync(new URL('../pirate-fruit-control-hud-v900.mjs', import.meta.url), 'utf8');

function inventoryItem(item) {
  return Object.freeze({
    ...item,
    sources: Object.freeze([...item.sources]),
    states: Object.freeze({ ...item.states }),
  });
}

/** Baseline ownership, not the desired V9.1 design. visibleOwner is a compatibility alias for visibleAuthority; node ownership remains distinct. */
export const LEGACY_HUD_INVENTORY = Object.freeze([
  inventoryItem({
    key: 'chat', selector: '#gameChat', realm: 'parent', visibleOwner: 'persistent-parent-shell',
    sources: ['v900.html', 'chat-runtime.mjs'],
    states: { default: 'allowed-collapsed', open: 'required-visible' },
  }),
  inventoryItem({
    key: 'party', selector: '#party', realm: 'parent', visibleOwner: 'pocket-monster-parent',
    sources: ['v900.html', 'game-v800.js'],
    states: { capture: 'allowed-collapsed', pirateHuman: 'required-hidden' },
  }),
  inventoryItem({
    key: 'quest', selector: '#stageObjective', realm: 'parent', visibleOwner: 'pocket-monster-parent',
    sources: ['v900.html', 'game-v800.js'],
    states: { active: 'required-visible', collapsed: 'allowed-collapsed', pirateHuman: 'required-hidden' },
  }),
  inventoryItem({
    key: 'target', selector: '#targetCard', realm: 'parent', visibleOwner: 'pocket-monster-parent',
    sources: ['v900.html', 'game-v800.js'],
    states: { encounter: 'required-visible', noTarget: 'allowed-collapsed', pirateHuman: 'required-hidden' },
  }),
  inventoryItem({
    key: 'character', selector: '#globalCharacterBtn', realm: 'parent', visibleOwner: 'pocket-monster-parent',
    sources: ['v900.html', 'game-v800.js'],
    states: { capture: 'required-visible', pirateHuman: 'required-hidden' },
  }),
  inventoryItem({
    key: 'controls', selector: '#pirateUnifiedControls', realm: 'parent', visibleOwner: 'pirate-primary-parent',
    sources: ['v900.html', 'unified-mobile-controls-v900.mjs', 'style-v900.css'],
    states: { capture: 'required-visible', pirateHuman: 'required-visible' },
  }),
  inventoryItem({
    key: 'pirate-iframe-hud', selector: '.tc-root, .hud-help, .fullscreen-prompt-root', realm: 'opaque-pirate-child',
    visibleOwner: 'pirate-primary-parent',
    nodeOwner: 'pirate-child-runtime', visibleAuthority: 'pirate-primary-parent', suppressionOwner: 'pirate-primary-parent',
    sources: ['pirate-fruit-offline/index.html', 'pirate-fruit-control-hud-v900.mjs'],
    states: { pirateHuman: 'required-hidden' },
  }),
]);

export const PIRATE_IFRAME_BOUNDARY = Object.freeze({
  frameSelector: '#pirateFruitFrame',
  sandbox: 'allow-scripts allow-pointer-lock allow-fullscreen',
  opaqueOrigin: true,
  parentCanInspectChildDom: false,
  allowSameOrigin: false,
  communication: 'postMessage',
});

export function inventoryBySelector(selector) {
  return LEGACY_HUD_INVENTORY.find(item => item.selector === selector) || null;
}

const parentSelectors = LEGACY_HUD_INVENTORY.filter(item => item.realm === 'parent').map(item => item.selector);
assert.equal(LEGACY_HUD_INVENTORY.length, 7, 'Task 1 inventories all six parent surfaces and the Pirate child HUD');
assert.equal(new Set(LEGACY_HUD_INVENTORY.map(item => item.key)).size, LEGACY_HUD_INVENTORY.length, 'inventory keys are unique');
assert.deepEqual(parentSelectors, ['#gameChat', '#party', '#stageObjective', '#targetCard', '#globalCharacterBtn', '#pirateUnifiedControls']);
for (const selector of parentSelectors) {
  assert.match(parentHtml, new RegExp(`id=["']${selector.slice(1)}["']`), `${selector} source owner drifted out of v900.html`);
  assert.ok(inventoryBySelector(selector)?.visibleOwner, `${selector} must identify its visible owner`);
}
const sandbox = pirateBoot.match(/setAttribute\('sandbox',\s*'([^']+)'\)/)?.[1];
assert.equal(sandbox, PIRATE_IFRAME_BOUNDARY.sandbox, 'Pirate child sandbox baseline must stay exact');
assert.equal(sandbox.split(/\s+/).includes('allow-same-origin'), false, 'opaque child must not gain allow-same-origin');
assert.match(pirateHud, /visibility:\s*hidden\s*!important/);
assert.match(pirateHud, /pointer-events:\s*none\s*!important/);
assert.match(pirateHud, /postMessage\([\s\S]*, '\*'\)/, 'opaque child HUD ownership is synchronized through postMessage, not DOM inspection');
assert.equal(inventoryBySelector('.tc-root, .hud-help, .fullscreen-prompt-root')?.realm, 'opaque-pirate-child');
assert.equal(inventoryBySelector('.tc-root, .hud-help, .fullscreen-prompt-root')?.nodeOwner, 'pirate-child-runtime');
assert.equal(inventoryBySelector('.tc-root, .hud-help, .fullscreen-prompt-root')?.visibleAuthority, 'pirate-primary-parent');
assert.equal(inventoryBySelector('.tc-root, .hud-help, .fullscreen-prompt-root')?.suppressionOwner, 'pirate-primary-parent');
assert.equal(Object.isFrozen(LEGACY_HUD_INVENTORY), true);

console.log('V9 unified HUD legacy inventory baseline: PASS (7/7 owners)');
