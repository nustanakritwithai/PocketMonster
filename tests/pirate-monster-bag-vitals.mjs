import assert from 'node:assert/strict';
import fs from 'node:fs';
import { overlayPiratePartyVitals } from '../pirate-monster-bag-vitals-v900.mjs';

const saved = Object.freeze({ instanceId: 'owned:a', hp: 100, maxHp: 100, fainted: false });
const controlState = Object.freeze({ available: true, party: Object.freeze({ available: true, slots: [
  Object.freeze({ instanceId: 'owned:a', hp: 0, maxHp: 100, fainted: true, available: false }),
] }) });
const view = overlayPiratePartyVitals(saved, { partyIds: ['owned:a'], controlState });
assert.equal(view.hp, 0, 'live combat HP overrides stale full inventory HP in presentation');
assert.equal(view.fainted, true, 'dead latch is reflected in the bag view');
assert.equal(view.combatVitalsUnavailable, false);
assert.equal(saved.hp, 100, 'view overlay never mutates persisted/canonical inventory');
const actorPriority = overlayPiratePartyVitals(saved, { partyIds: ['owned:a'], controlState: {
  available: true,
  party: { available: true, slots: [{ instanceId: 'owned:a', hp: 100, maxHp: 100, fainted: false }] },
  actors: [{ instanceId: 'owned:a', hp: 0, maxHp: 100, fainted: true }],
} });
assert.equal(actorPriority.hp, 0, 'canonical actor combat HP takes precedence over inventory-like party HP');

const unavailable = overlayPiratePartyVitals(saved, { partyIds: ['owned:a'], controlState: { available: false } });
assert.equal(unavailable.hp, null, 'unavailable live state does not present save HP as combat HP');
assert.equal(unavailable.combatVitalsUnavailable, true);
assert.equal(overlayPiratePartyVitals(saved, { partyIds: [], controlState }), saved, 'non-party inventory remains unchanged');
assert.equal(overlayPiratePartyVitals(saved, { partyIds: ['owned:a'], controlState: { available: true, party: { available: true, slots: [] } } }).combatVitalsUnavailable, true,
  'missing party instance fails closed instead of falling back to stale HP');

const game = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const shell = fs.readFileSync(new URL('../online-world-shell-v900.mjs', import.meta.url), 'utf8');
assert.match(game, /overlayPiratePartyVitals\(monster,\{partyIds,controlState:liveControlState\}\)/, 'bag UI uses the view-only live-state overlay');
assert.match(game, /pocketmonster:monster-control-state-v1[\s\S]*?renderMonsterFieldBag\(\)[\s\S]*?renderRanchStoragePage\(\)/, 'open bag rerenders when parent control-state polling updates');
assert.match(shell, /pocketmonster:monster-control-state-v1/, 'parent shell forwards live control-state revisions to the scene UI');

console.log('Pirate bag live-vitals presentation overlay: PASS');
