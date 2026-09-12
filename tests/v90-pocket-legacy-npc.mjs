import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = relative => fs.readFileSync(new URL('../' + relative, import.meta.url), 'utf8');
const template = read('v900.html');
const game = read('game-v800.js');
const legacyStyle = read('style-v800.css');
const unifiedStyle = read('style-v900.css');
const scene = read('scene-v900.html');

// PocketMonster owns this node. It remains in the V9 template's HUD so the
// real game-v800.js handler and its modal nodes live in one document.
assert.match(
  template,
  /<div id="hud">[\s\S]*?<button id="npcBtn" class="npc-btn hidden">คุย<\/button>/,
  'V9 Pocket template keeps the original #hud > #npcBtn action node',
);
for (const id of ['merchantShop', 'trainerPanel', 'evolutionPanel', 'breedingPanel', 'ranchServices']) {
  assert.match(
    template,
    new RegExp('id="' + id + '"[^>]*\\bhidden\\b'),
    'Pocket template keeps the original hidden state for #' + id,
  );
}

// Do not mount an outer module that reparents, styles, or otherwise takes
// ownership of the PocketMonster interaction node.
assert.doesNotMatch(
  scene,
  /npc-overhead-action-v900\.mjs/,
  'scene must not import an outer NPC action adapter',
);
assert.equal(
  fs.existsSync(new URL('../npc-overhead-action-v900.mjs', import.meta.url)),
  false,
  'retired outer NPC action adapter is absent',
);
assert.equal(
  fs.existsSync(new URL('../tests/v90-pocket-npc-overhead-action.mjs', import.meta.url)),
  false,
  'obsolete outer-adapter test is absent',
);

// The original game keeps all Ranch NPC proximity gates at its established
// range, then selects one target in priority order.
for (const [name, target] of [
  ['isNearNpc', 'npc'],
  ['isNearMerchant', 'merchantNpc'],
  ['isNearTrainer', 'trainerNpc'],
  ['isNearEvolution', 'evolutionNpc'],
  ['isNearBreeding', 'breedingNpc'],
]) {
  assert.match(
    game,
    new RegExp(
      'function ' + name + "\\(\\)\\{return state\\.currentZone==='hub'&&distXZ\\(player\\.position,"
        + target + '\\.position\\)<3\\.4;\\}',
    ),
    name + ' preserves the original Ranch proximity range',
  );
}

const updateNpcUi = game.match(/function updateNpcUI\(\)\{[\s\S]*?\n\}/)?.[0] || '';
assert.ok(updateNpcUi, 'Pocket game exposes updateNpcUI');
assert.match(
  updateNpcUi,
  /const target=isNearMerchant\(\)\?merchantNpc:isNearTrainer\(\)\?trainerNpc:isNearEvolution\(\)\?evolutionNpc:isNearBreeding\(\)\?breedingNpc:isNearNpc\(\)\?npc:null;/,
  'original NPC target priority is merchant, trainer, evolution, breeding, then Ranch caretaker',
);
assert.match(
  updateNpcUi,
  /b\.textContent=target===merchantNpc\?'ร้านค้า':target===trainerNpc\?'ฝึก':target===evolutionNpc\?'วิวัฒนาการ':target===breedingNpc\?'ผสมพันธุ์':'คุย';/,
  'original NPC action labels remain game-owned',
);
assert.match(
  updateNpcUi,
  /if\(p\.visible\)\{b\.classList\.remove\('hidden'\);[\s\S]*?b\.style\.left=.+?;b\.style\.top=.+?;return;\}/,
  'visible nearby NPC projects the original button and clears hidden state',
);
assert.match(
  updateNpcUi,
  /if\(!el\('monsterManager'\)\.classList\.contains\('hidden'\)\|\|!el\('merchantShop'\)\.classList\.contains\('hidden'\)\|\|!el\('trainerPanel'\)\.classList\.contains\('hidden'\)\|\|!el\('evolutionPanel'\)\.classList\.contains\('hidden'\)\|\|!el\('breedingPanel'\)\.classList\.contains\('hidden'\)\)\{b\.classList\.add\('hidden'\);return;\}/,
  'Pocket NPC button hides while an original NPC modal is open',
);
assert.match(updateNpcUi, /b\.classList\.add\('hidden'\);/, 'Pocket NPC button hides when no valid target is visible');

// This is the real PocketMonster click dispatch, not Pirate's iframe-native
// interaction prompt. Each original outcome must remain reachable.
assert.match(
  game,
  /el\('npcBtn'\)\.onclick=\(\)=>\{playSFX\('sfx_ui_click'\);if\(isNearMerchant\(\)\)openMerchant\(\);else if\(isNearTrainer\(\)\)openTrainer\(\);else if\(isNearEvolution\(\)\)openEvolutionGuide\(\);else if\(isNearBreeding\(\)\)openBreedingCaretaker\(\);else showRanchServices\(\);\};/,
  '#npcBtn retains the original merchant/trainer/evolution/breeding/Ranch service routes',
);

// The native Pocket button remains touchable and positioned by updateNpcUI.
assert.match(
  legacyStyle,
  /\.npc-btn\{[^}]*position:absolute[^}]*pointer-events:auto[^}]*z-index:9[^}]*\}/,
  'style-v800 keeps the native Pocket NPC button interactive',
);

// The general V9 retirement remains for all worlds. PocketMonster alone keeps
// the full original offline menu surface while hiding every non-NPC sibling.
assert.match(
  unifiedStyle,
  /body\.unified-hud-active #hud\{display:none!important;pointer-events:none!important\}/,
  'unified HUD still retires the parent HUD by default',
);
assert.match(
  unifiedStyle,
  /body\.unified-hud-active\[data-combined-world="pocket-monster"\] #hud\{display:contents!important;visibility:visible!important;pointer-events:none!important\}/,
  'PocketMonster restores the original menu surface without re-enabling legacy HUD input',
);
assert.match(
  unifiedStyle,
  /body\.unified-hud-active\[data-combined-world="pocket-monster"\] #hud>:not\(:is\(#npcBtn,#merchantShop,#trainerPanel,#evolutionPanel,#breedingPanel,#ranchServices,#ranchStoragePage,#monsterFieldBag,#monsterManager,#skillItemConfirm,#monsterPicker\)\)\{visibility:hidden!important;pointer-events:none!important\}/,
  'every unrelated legacy HUD sibling remains invisible and input-dead',
);
assert.match(
  unifiedStyle,
  /body\.unified-hud-active\[data-combined-world="pocket-monster"\] #hud>#npcBtn\.npc-btn:not\(\.hidden\)\{display:block!important;visibility:visible!important;pointer-events:auto!important;touch-action:manipulation;z-index:(?:[2-9]\d|[1-9]\d{2,})!important\}/,
  'a visible Pocket NPC button escapes above the unified controls and receives touch input',
);
assert.match(
  unifiedStyle,
  /body\.unified-hud-active\[data-combined-world="pocket-monster"\] #hud>:is\(#merchantShop,#trainerPanel,#evolutionPanel,#breedingPanel,#ranchServices,#ranchStoragePage,#monsterFieldBag,#monsterManager,#skillItemConfirm,#monsterPicker\):not\(\.hidden\)\{visibility:visible!important;pointer-events:auto!important\}/,
  'original Pocket NPC service roots are visible and interactive only while open',
);
assert.match(
  legacyStyle,
  /\.hidden\{display:none!important\}/,
  'the native hidden class remains authoritative',
);
assert.doesNotMatch(
  unifiedStyle,
  /#npcBtn\.npc-btn\.hidden[^}]*display:block!important/,
  'the scoped escape hatch must never reveal a hidden NPC button',
);
for (const world of ['pirate-fruit', 'living-world']) {
  assert.doesNotMatch(
    unifiedStyle,
    new RegExp('unified-hud-active\\\\[data-combined-world="' + world + '"\\\\] #hud\\\\{display:block!important'),
    world + ' keeps the legacy parent HUD retired',
  );
}

assert.doesNotMatch(
  unifiedStyle,
  /#npcBtn\.npc-btn:not\(\.hidden\)\{[^}]*z-index:(?:0|1\d)!important/,
  'visible Pocket NPC button must not remain below the unified control surface',
);

console.log('V9 PocketMonster legacy NPC ownership, visibility, and routes: PASS');
