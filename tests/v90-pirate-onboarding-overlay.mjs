import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  PIRATE_ONBOARDING_COMPACT_CSS,
  PIRATE_ONBOARDING_STATE_MESSAGE,
  readPirateOnboardingState,
} from '../pirate-onboarding-overlay-v900.mjs';

assert.equal(PIRATE_ONBOARDING_STATE_MESSAGE, 'pocketmonster:pirate-onboarding-state-v1');
assert.deepEqual(
  readPirateOnboardingState({ type: PIRATE_ONBOARDING_STATE_MESSAGE, active: true }),
  { active: true, actions: {} },
);
assert.deepEqual(
  readPirateOnboardingState({ type: PIRATE_ONBOARDING_STATE_MESSAGE, active: false }),
  { active: false, actions: {} },
);
assert.deepEqual(
  readPirateOnboardingState({
    type: PIRATE_ONBOARDING_STATE_MESSAGE,
    active: true,
    actions: { pause: { x: 350, y: 350, width: 40, height: 24 } },
  }),
  { active: true, actions: { pause: { x: 350, y: 350, width: 40, height: 24 } } },
);
assert.equal(readPirateOnboardingState({
  type: PIRATE_ONBOARDING_STATE_MESSAGE,
  active: true,
  actions: { pause: { x: 'bad', y: 350, width: 40, height: 24 } },
}), null);
assert.equal(readPirateOnboardingState({ type: PIRATE_ONBOARDING_STATE_MESSAGE, active: 'yes' }), null);
assert.equal(readPirateOnboardingState({ type: 'other', active: true }), null);

assert.match(PIRATE_ONBOARDING_COMPACT_CSS, /max-height:\s*500px/);
assert.match(PIRATE_ONBOARDING_COMPACT_CSS, /pointer:\s*coarse/);
assert.match(PIRATE_ONBOARDING_COMPACT_CSS, /\.onboarding-root\s*\{[^}]*width:\s*min\(260px/);
assert.match(PIRATE_ONBOARDING_COMPACT_CSS, /\.onboarding-body\s*\{[^}]*-webkit-line-clamp:\s*1/);
assert.match(PIRATE_ONBOARDING_COMPACT_CSS, /\.onboarding-card\s*\{[^}]*padding:\s*5px 7px/);

const childBridge = fs.readFileSync(new URL('../pirate-fruit-offline/unified-input-bridge-v900.mjs', import.meta.url), 'utf8');
const childEntry = fs.readFileSync(new URL('../pirate-fruit-offline/index.html', import.meta.url), 'utf8');
const parentBoot = fs.readFileSync(new URL('../boot-pirate-fruit-v900.mjs', import.meta.url), 'utf8');
const worldCatalog = fs.readFileSync(new URL('../combined-worlds-v900.mjs', import.meta.url), 'utf8');
const pirateHud = fs.readFileSync(new URL('../pirate-fruit-control-hud-v900.mjs', import.meta.url), 'utf8');
const presentation = fs.readFileSync(new URL('../pirate-fruit-offline/pocket-presentation.mjs', import.meta.url), 'utf8');
const shell = fs.readFileSync(new URL('../online-world-shell-v900.mjs', import.meta.url), 'utf8');

assert.match(childEntry, /unified-input-bridge-v900\.mjs\?v=11/);
assert.match(worldCatalog, /boot-pirate-fruit-v900.mjs\?v=957/);

assert.match(childBridge, /MutationObserver/);
assert.match(childBridge, /\.onboarding-root/);
assert.match(childBridge, /window\.parent\.postMessage\([\s\S]*PIRATE_ONBOARDING_STATE_MESSAGE[\s\S]*allowedParentOrigin/);
assert.match(childBridge, /PIRATE_ONBOARDING_COMPACT_CSS/);
assert.match(childBridge, /syncNativeHelmPromptProxy\(helmPrompt\)/, 'only the native helm prompt is marked as parent-wheel-proxied');
assert.doesNotMatch(childBridge, /pirate-onboarding-local/);

assert.match(parentBoot, /readPirateOnboardingState\(message\)/);
assert.match(parentBoot, /event\.source !== frame\.contentWindow/);
assert.match(parentBoot, /event\.origin !== 'null'/);
assert.match(parentBoot, /syncPirateOnboardingActionProxies\(onboarding\)/, 'integrated shell consumes onboarding state without creating tutorial action buttons');
assert.match(parentBoot, /layer\.replaceChildren\(\)/, 'integrated onboarding proxy layer is kept empty');
assert.doesNotMatch(parentBoot, /data-onboarding-action/, 'integrated shell creates no invisible tutorial action buttons');
assert.match(
  pirateHud,
  /\.onboarding-root\s*\{[\s\S]*display:\s*none\s*!important/,
  'integrated Pirate HUD still removes the bottom tutorial bar',
);
assert.doesNotMatch(
  pirateHud,
  /\.interaction-prompt\s*\{[\s\S]*display:\s*none/,
  'original Pirate คุยกับ prompt stays visible',
);
assert.match(
  pirateHud,
  /\.interaction-prompt\s*\{[\s\S]*pointer-events:\s*auto/,
  'original Pirate คุยกับ prompt keeps its own hit',
);
assert.match(
  pirateHud,
  /\.interaction-prompt\s*\{[\s\S]*bottom:\s*120px/,
  'original Pirate คุยกับ prompt sits above the chat dock',
);
assert.match(
  pirateHud,
  /\.interaction-prompt\[data-unified-helm-proxy="true"\]\s*\{[\s\S]*visibility:\s*hidden\s*!important[\s\S]*pointer-events:\s*none\s*!important/,
  'only the duplicate helm center prompt is visually retired; generic prompts remain available',
);
assert.match(pirateHud, /\.graphics-setting/,
  'old iframe graphics chip is retired');
assert.match(pirateHud, /\.audio-toggle/,
  'old iframe speaker chip is retired');
assert.match(pirateHud, /\.inv-open-button/,
  'old iframe bag chip is retired');
assert.match(pirateHud, /\.tc-root \{[\s\S]*display: none/,
  'old iframe punch/shield cluster is retired');
assert.match(pirateHud, /\.dialogue-root \{[\s\S]*inset: auto/, 'talk window is not a fullscreen overlay');
assert.match(pirateHud, /\.dialogue-card \{[\s\S]*height: auto[\s\S]*max-height: 70vh/, 'talk card grows with text up to a phone max');
assert.match(pirateHud, /\.quest-board,[\s\S]*height: auto[\s\S]*max-height: min\(78vh/, 'quest board grows with content up to a phone max');
assert.match(pirateHud, /\.boat-shop,[\s\S]*height: auto[\s\S]*max-height: min\(78vh/, 'boat shop grows with content up to a phone max');
assert.match(pirateHud, /\.potion-shop,[\s\S]*height: auto[\s\S]*max-height: min\(78vh/, 'potion shop grows with content up to a phone max');
assert.match(pirateHud, /\.trade-shop-root[\s\S]*z-index: 90/, 'maritime trade shop sits above iframe HUD chrome');
assert.match(pirateHud, /\.trade-shop[\s\S]*max-height: min\(78vh/, 'maritime trade shop fits phone height');
assert.match(presentation, /\.trade-shop-root/, 'trade shop opens raise the parent dialogue stand-down');
assert.match(parentBoot, /frame\.setAttribute\('sandbox', 'allow-scripts allow-pointer-lock allow-fullscreen'/, 'local child keeps opaque sandbox');
assert.match(childEntry, /pocket-presentation\.mjs\?v=[1-9]\d*"/, 'Pirate child HTML cache-busts presentation with a positive revision');

assert.match(presentation, /skipVendorFullscreen/, 'talk taps skip vendor fullscreen without blocking Pirate pointerdown');
assert.doesNotMatch(presentation, /stopImmediatePropagation/, 'talk taps must reach the original Pirate prompt handler');
assert.match(presentation, /OVERLAY_ROOTS/, 'quest/boat/potion shops hide the parent control surface');
assert.match(presentation, /setInterval\(syncDialogue, 200\)/, 'child keeps publishing overlay open on phones that miss MutationObserver');
assert.match(parentBoot, /window\.parent\?\.postMessage/, 'scene forwards overlay open to the parent shell');
assert.match(shell, /pirate-dialogue-v1/, 'parent shell raises the scene over HUD while a Pirate window is open');
assert.match(presentation, /PIRATE_FRUIT_DIALOGUE_MESSAGE/, 'child publishes dialogue open so parent HUD can stand down');
assert.match(parentBoot, /pocketmonster:pirate-dialogue-v1/, 'parent lets the talk window sit in front of HUD buttons');

assert.doesNotMatch(parentBoot, /createPirateNpcNameParentProxy|npcNameProxy|pirate-npc-name-interaction/, 'failed parent คุย chip is gone');
assert.doesNotMatch(presentation, /installPirateNpcNameChild|pirate-npc-name-interaction/, 'failed child NPC-name publisher is gone');
assert.doesNotMatch(`${parentBoot}\n${presentation}`, /pocketmonster:pirate-npc-name-v1/, 'unused pirate-npc-name-v1 signal is gone');
assert.equal(
  fs.existsSync(new URL('../pirate-npc-name-interaction-v900.mjs', import.meta.url)),
  false,
  'failed NPC-name interaction module is removed',
);

const pirateBootstrap = fs.readFileSync(new URL('../pirate-fruit-offline/pocket-bootstrap.mjs', import.meta.url), 'utf8');
const pirateEntryMatch = pirateBootstrap.match(/await import\('\.\/assets\/([^']+\.js)'\)/);
assert.ok(pirateEntryMatch, 'Pirate bootstrap declares its compiled entry');
const pirateBundle = fs.readFileSync(new URL(`../pirate-fruit-offline/assets/${pirateEntryMatch[1]}`, import.meta.url), 'utf8');
assert.match(
  pirateBundle,
  /className="interaction-prompt",this\.element\.type="button",this\.element\.addEventListener\("pointerdown",t=>\{t\.preventDefault\(\),this\.requested=!0\}\)/,
  'original Pirate prompt only sets requested=true on pointerdown',
);
assert.match(
  pirateBundle,
  /this\.input\.consumeInteract\(\)\|\|this\.prompt\.consumeRequested\(\)/,
  'original NPC dialogue opens from consumeInteract or consumeRequested',
);

console.log('V9 Pirate onboarding overlay and original talk path: PASS');
