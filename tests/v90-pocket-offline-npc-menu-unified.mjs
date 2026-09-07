import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = relative => fs.readFileSync(new URL('../' + relative, import.meta.url), 'utf8');
const offlineTemplate = read('index.html');
const activeTemplate = read('v900.html');
const sceneHtml = read('scene-v900.html');
const game = read('game-v800.js');
const bridge = read('pocket-offline-npc-menu-bridge-v900.mjs');
const shell = read('online-world-shell-v900.mjs');
const style = read('style-v900.css');

const MENU_MESSAGE = 'pocketmonster:legacy-npc-menu-v1';
const ROOTS = Object.freeze([
  'merchantShop',
  'trainerPanel',
  'evolutionPanel',
  'breedingPanel',
  'ranchServices',
  'ranchStoragePage',
  'monsterManager',
  'skillItemConfirm',
  'monsterPicker',
]);

function stylesheetRevision(html, entry) {
  const match = html.match(/<link rel="stylesheet" href="\.\/style-v900\.css\?v=([^"']+)"\s*\/>/);
  assert.ok(match, `${entry} loads the active unified stylesheet`);
  return match[1];
}

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}() in the original PocketMonster runtime`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  assert.notEqual(bodyStart, -1, `${name}() has no opening body brace`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}' && --depth === 0) {
      return source.slice(start, index + 1);
    }
  }
  assert.fail(`${name}() has no balanced body`);
}

// The offline source is the reference.  The hosted scene must preserve the
// exact same native menu DOM rather than substitute a Pirate-native prompt.
assert.equal(activeTemplate, offlineTemplate, 'v900.html remains the exact original offline PocketMonster template');
assert.match(
  offlineTemplate,
  /<div id="hud">[\s\S]*?<button id="npcBtn" class="npc-btn hidden">คุย<\/button>/,
  'the original offline #npcBtn remains a direct child of #hud',
);
for (const id of ROOTS) {
  assert.match(
    offlineTemplate,
    new RegExp(`id="${id}"[^>]*\\bhidden\\b`),
    `offline menu root #${id} starts closed`,
  );
}
for (const service of ['storage', 'breeding', 'heal']) {
  assert.match(
    offlineTemplate,
    new RegExp(`data-ranch-service="${service}"`),
    `offline caretaker menu keeps its ${service} action`,
  );
}

// The post-#509 CSS is a changed release artifact.  Reusing the old URL lets
// a cached pre-fix stylesheet retain `#hud { display:none }`, so the native
// click path can run while its menu remains unpainted.  Every active entry
// must use one freshly versioned CSS resource.
const revisions = new Map([
  ['index.html', stylesheetRevision(offlineTemplate, 'index.html')],
  ['v900.html', stylesheetRevision(activeTemplate, 'v900.html')],
  ['scene-v900.html', stylesheetRevision(sceneHtml, 'scene-v900.html')],
]);
assert.equal(new Set(revisions.values()).size, 1, 'parent and hosted iframe use one identical CSS revision');
assert.notEqual(
  revisions.get('scene-v900.html'),
  '966',
  'the active CSS URL moves off stale v966 after the native NPC visibility rules changed',
);

// Keep the original game-owned dispatcher and every offline menu route.  The
// iframe bridge below is presentation-only: it must never replace this logic.
assert.match(
  game,
  /el\('npcBtn'\)\.onclick=\(\)=>\{playSFX\('sfx_ui_click'\);if\(isNearMerchant\(\)\)openMerchant\(\);else if\(isNearTrainer\(\)\)openTrainer\(\);else if\(isNearEvolution\(\)\)openEvolutionGuide\(\);else if\(isNearBreeding\(\)\)openBreedingCaretaker\(\);else showRanchServices\(\);\};/,
  'native #npcBtn still dispatches merchant/trainer/evolution/breeding/caretaker paths',
);
for (const [fn, root, openPattern] of [
  ['openMerchant', 'merchantShop', /el\('merchantShop'\)\.classList\.remove\('hidden'\)/],
  ['openTrainer', 'trainerPanel', /el\('trainerPanel'\)\.classList\.remove\('hidden'\)/],
  ['openEvolutionGuide', 'evolutionPanel', /el\('evolutionPanel'\)\.classList\.remove\('hidden'\)/],
  ['openBreedingCaretaker', 'breedingPanel', /el\('breedingPanel'\)\.classList\.remove\('hidden'\)/],
  ['showRanchServices', 'ranchServices', /el\('ranchServices'\)\.classList\.remove\('hidden'\)/],
  ['showRanchStorageShell', 'ranchStoragePage', /el\('ranchStoragePage'\)\.classList\.remove\('hidden'\)/],
  ['openManager', 'monsterManager', /revealMonsterManager\(tab\)/],
  ['showSkillItemConfirmation', 'skillItemConfirm', /el\('skillItemConfirm'\)\?\.classList\.remove\('hidden'\)/],
  ['openMonsterPicker', 'monsterPicker', /el\('monsterPicker'\)\.classList\.remove\('hidden'\)/],
]) {
  const body = functionBody(game, fn);
  assert.match(
    body,
    openPattern,
    `${fn} opens the original #${root} surface`,
  );
}

// A menu in the hosted child iframe cannot raise its own z-index above the
// persistent parent HUD.  The real menu state therefore has to be mirrored to
// the parent.  The bridge observes only original roots/classes and carries no
// alternative button or menu implementation.
assert.match(bridge, new RegExp(`POCKET_OFFLINE_NPC_MENU_MESSAGE\\s*=\\s*['\"]${MENU_MESSAGE}['\"]`),
  'presentation bridge defines a dedicated parent-stack message');
assert.match(bridge, /postMessage\?\.\(\{[\s\S]*type:\s*POCKET_OFFLINE_NPC_MENU_MESSAGE,[\s\S]*open:/,
  'presentation bridge mirrors original menu open/close state to its parent');
assert.match(bridge, /new MutationObserverLike\(sync\)[\s\S]*attributeFilter:\s*\['class', 'data-combined-world'\]/,
  'presentation bridge tracks class-based open state rather than owning click behavior');
for (const id of ROOTS) {
  assert.match(bridge, new RegExp(`['\"]${id}['\"]`), `bridge includes original #${id} in its open-state set`);
}

assert.match(
  shell,
  new RegExp(`['\"]${MENU_MESSAGE}['\"]`),
  'parent shell accepts the dedicated Pocket menu message only after validating the iframe source',
);
assert.match(
  shell, /document\.body\.dataset\.pocketNpcMenu\s*=\s*['"]open['"]/, 'parent records the original menu opening');
assert.match(shell, /delete document\.body\.dataset\.pocketNpcMenu/, 'parent clears the original menu state when it closes or the scene changes');

// Parent hiding is the required cross-iframe stack protocol: child z-indexes
// (110/190) cannot escape a fixed iframe's parent stacking context.
assert.match(
  style,
  /body\[data-pocket-npc-menu="open"\] #pirateUnifiedControls\{visibility:hidden!important;pointer-events:none!important\}/,
  'open Pocket menu disables the parent touch controls above the iframe',
);
assert.match(
  style,
  /body\[data-pocket-npc-menu="open"\] \.mmorpg-hud\{visibility:hidden!important;pointer-events:none!important\}/,
  'open Pocket menu hides the parent unified HUD that otherwise occludes the iframe menu',
);

console.log('V9 hosted original PocketMonster offline NPC menu bridge: PASS');
