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
const parentCss = fs.readFileSync(new URL('../style-v900.css', import.meta.url), 'utf8');

assert.match(childEntry, /unified-input-bridge-v900\.mjs\?v=5/);
assert.match(worldCatalog, /boot-pirate-fruit-v900\.mjs\?v=920/);

assert.match(childBridge, /MutationObserver/);
assert.match(childBridge, /\.onboarding-root/);
assert.match(childBridge, /\.onboarding-prev/);
assert.match(childBridge, /\.onboarding-pause/);
assert.match(childBridge, /\.onboarding-next/);
assert.match(childBridge, /window\.parent\.postMessage\([\s\S]*PIRATE_ONBOARDING_STATE_MESSAGE[\s\S]*allowedParentOrigin/);
assert.match(childBridge, /PIRATE_ONBOARDING_COMPACT_CSS/);
assert.match(childBridge, /message\.kind === 'onboarding-action'/);
assert.doesNotMatch(childBridge, /pirate-onboarding-local/);

assert.match(parentBoot, /readPirateOnboardingState\(message\)/);
assert.match(parentBoot, /event\.source !== frame\.contentWindow \|\| event\.origin !== 'null'/);
assert.match(parentBoot, /syncPirateOnboardingActionProxies\(onboarding, sendInput\)/);
assert.match(parentBoot, /pirateOnboardingActionProxies/);
assert.doesNotMatch(parentCss, /#pirateUnifiedControls\[data-pirate-onboarding="active"\]/);
assert.match(parentCss, /#pirateOnboardingActionProxies\{[^}]*pointer-events:none/);
assert.match(parentCss, /\.pirate-onboarding-action-proxy\{[^}]*pointer-events:auto/);

console.log('V9 Pirate onboarding overlay bridge: PASS');
