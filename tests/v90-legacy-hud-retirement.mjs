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

// ---------- Shared controls and overlays stay alive ----------
assert.doesNotMatch(css, /body\.unified-hud-active[^{]*\.tc-btn/, 'unified touch-control buttons cannot be retired by the legacy sweep');
assert.doesNotMatch(css, /body\.unified-hud-active[^{]*character-quick/, 'character overlay stays out of the legacy retirement scope');
assert.doesNotMatch(css, /body\.unified-hud-active[^{]*pirateUnifiedControls/, 'Pirate control layer stays out of the legacy retirement scope');

// ---------- Dock owns the capability flag ----------
assert.match(dockSource, /classList\.add\('unified-hud-active'\)/, 'mounting the Dock raises the capability flag');
assert.match(dockSource, /classList\.remove\('unified-hud-active'\)/, 'unmounting the Dock lowers the capability flag');
assert.doesNotMatch(dockSource, /addEventListener\('keydown'/, 'the Dock cannot collide with legacy keyboard bindings');

console.log('V9 legacy Pocket HUD retirement: PASS');
