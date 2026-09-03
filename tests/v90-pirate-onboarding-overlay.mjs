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

// Standalone Pirate Fruit may still use the compact tutorial presentation.
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

assert.match(childEntry, /unified-input-bridge-v900\.mjs\?v=5/);
assert.match(worldCatalog, /boot-pirate-fruit-v900\.mjs\?v=924/);

// Keep the child bridge intact for standalone Pirate Fruit, but integrated V9
// owns the visible interaction UI through the parent HUD policy.
assert.match(childBridge, /MutationObserver/);
assert.match(childBridge, /\.onboarding-root/);
assert.match(childBridge, /window\.parent\.postMessage\([\s\S]*PIRATE_ONBOARDING_STATE_MESSAGE[\s\S]*allowedParentOrigin/);
assert.match(childBridge, /PIRATE_ONBOARDING_COMPACT_CSS/);
assert.doesNotMatch(childBridge, /pirate-onboarding-local/);

assert.match(parentBoot, /readPirateOnboardingState\(message\)/);
assert.match(parentBoot, /event\.source !== frame\.contentWindow \|\| event\.origin !== 'null'/);
assert.match(parentBoot, /syncPirateOnboardingActionProxies\(onboarding\)/, 'integrated shell consumes onboarding state without creating tutorial action buttons');
assert.match(parentBoot, /layer\.replaceChildren\(\)/, 'integrated onboarding proxy layer is kept empty');
assert.doesNotMatch(parentBoot, /data-onboarding-action/, 'integrated shell creates no invisible tutorial action buttons');
assert.match(parentBoot, /createPirateNpcNameParentProxy/, 'NPC-name interaction is owned by the dedicated transparent name hit target');
assert.match(parentBoot, /npcNameProxy\?\.accept\(event\)/, 'parent accepts NPC-name hit-target state from the opaque child');
assert.match(
  pirateHud,
  /\.onboarding-root,[\s\S]*\.interaction-prompt\s*\{[\s\S]*display:\s*none\s*!important/,
  'integrated Pirate HUD removes both the bottom tutorial bar and bottom interaction prompt',
);

console.log('V9 Pirate onboarding retirement bridge: PASS');
