import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../style-v900.css', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dockSource = fs.readFileSync(new URL('../unified-mmorpg-hud-v900.mjs', import.meta.url), 'utf8');

// ---------- Legacy markup survives the migration ----------
for (const id of ['hud', 'party', 'targetCard', 'message', 'stageObjective']) {
  assert.match(html, new RegExp(`id="${id}"`), `legacy #${id} markup must remain in the DOM during migration`);
}

// ---------- Visibility retirement under the capability class ----------
const retiredSelectors = [
  '#hud',
  '#stageObjective',
  '#stageObjectiveToggle',
  '#targetCard',
  '#party',
  '#message',
  '.game-chat',
  '.chat-toggle',
];
for (const selector of retiredSelectors) {
  const escaped = selector.replace(/#/g, '\\#').replace(/\./g, '\\.');
  const rule = new RegExp(`body\\.unified-hud-active ${escaped}\\{display:none!important;pointer-events:none!important\\}`);
  assert.match(css, rule, `${selector} is hidden and input-dead once the unified HUD is active`);
}

// ---------- Native Pocket NPC escape hatch ----------
assert.match(
  css,
  /body\.unified-hud-active\[data-combined-world="pocket-monster"\] #hud\{display:contents!important;visibility:visible!important;pointer-events:none!important\}/,
  'Pocket Monster restores the original NPC menu surface without restoring HUD input',
);
assert.match(
  css,
  /body\.unified-hud-active\[data-combined-world="pocket-monster"\] #hud>:not\(:is\(#npcBtn,#merchantShop,#trainerPanel,#evolutionPanel,#breedingPanel,#ranchServices,#ranchStoragePage,#monsterManager,#monsterPicker\)\)\{visibility:hidden!important;pointer-events:none!important\}/,
  'only original NPC route roots escape the retired Pocket HUD',
);
assert.match(
  css,
  /body\.unified-hud-active\[data-combined-world="pocket-monster"\] #hud>#npcBtn\.npc-btn:not\(\.hidden\)\{display:block!important;visibility:visible!important;pointer-events:auto!important;touch-action:manipulation;z-index:45!important\}/,
  'only the gameplay-owned visible NPC prompt escapes the retired HUD',
);
for (const root of [
  'merchantShop',
  'trainerPanel',
  'evolutionPanel',
  'breedingPanel',
  'ranchServices',
  'ranchStoragePage',
  'monsterManager',
  'monsterPicker',
]) {
  assert.ok(css.includes('#' + root), 'native NPC route root #' + root + ' remains in the explicit escape hatch');
}
assert.match(
  css,
  /body\[data-combined-world="pirate-fruit"\] #npcBtn,[\s\S]*body\[data-combined-world="living-world"\] #npcBtn,[\s\S]*display:none!important/,
  'the native parent NPC prompt remains retired in Pirate and Living worlds',
);

// ---------- Shared controls and overlays stay alive ----------
assert.doesNotMatch(css, /body\.unified-hud-active[^{]*\.tc-btn/, 'unified touch-control buttons cannot be retired by the legacy sweep');
assert.doesNotMatch(css, /body\.unified-hud-active[^{]*character-quick/, 'character overlay stays out of the legacy retirement scope');
assert.doesNotMatch(css, /body\.unified-hud-active[^{]*pirateUnifiedControls/, 'Pirate control layer stays out of the legacy retirement scope');
assert.ok(html.indexOf('id="pirateUnifiedControls"') < html.indexOf('<div id="hud">'), 'combat controls stay outside the retired #hud');

// ---------- Dock owns the capability flag ----------
assert.match(dockSource, /classList\.add\('unified-hud-active'\)/, 'mounting the Dock raises the capability flag');
assert.match(dockSource, /classList\.remove\('unified-hud-active'\)/, 'unmounting the Dock lowers the capability flag');
assert.doesNotMatch(dockSource, /addEventListener\('keydown'/, 'the Dock cannot collide with legacy keyboard bindings');

console.log('V9 legacy Pocket HUD retirement: PASS');
