import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildPocketPartyHudFeature,
  createPocketPartyHudStore,
  PARTY_SLOT_COUNT,
} from '../pocket-party-hud-view-model.mjs';
import { normalizeUnifiedHudSnapshot, validateUnifiedHudSnapshot } from '../unified-hud-contract-v900.mjs';

const game = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');

function contractCheck(partySnapshot) {
  const full = normalizeUnifiedHudSnapshot({
    context: { worldId: 'pocket-monster', controlMode: 'human', revision: 1 },
    party: partySnapshot,
  });
  assert.deepEqual(full.party, partySnapshot, 'party snapshot must slot into the unified HUD contract unchanged');
  assert.equal(validateUnifiedHudSnapshot(full).ok, true, 'party snapshot must validate inside the full contract');
}

// ---------- Empty party ----------
{
  const feature = buildPocketPartyHudFeature({
    selectedSlot: 0,
    activeInstanceId: '',
    canSwitch: true,
    slots: [null, null, null],
  });
  assert.equal(feature.available, true);
  assert.equal(feature.slots.length, PARTY_SLOT_COUNT);
  assert.deepEqual(feature.slots.map(slot => slot.available), [false, false, false], 'all three slots render as empty');
  assert.deepEqual(feature.slots.map(slot => slot.selected), [true, false, false], 'selected empty slot stays visible as selected');
  assert.equal(feature.canSwitch, true);
}

// ---------- Full party with active summon ----------
{
  const slots = [
    { instanceId: 'mon-a', portraitKey: 'mossbun', name: 'Mossbun', level: 5, hp: 20, hpMax: 40, condition: 'normal', fainted: false },
    { instanceId: 'mon-b', portraitKey: 'emberkit', name: 'Emberkit', level: 7, hp: 33, hpMax: 33, condition: 'energized', fainted: false },
    { instanceId: 'mon-c', portraitKey: 'tideling', name: 'Tidelin', level: 3, hp: 0, hpMax: 25, condition: 'normal', fainted: true },
  ];
  const feature = buildPocketPartyHudFeature({
    selectedSlot: 1,
    activeInstanceId: 'mon-b',
    canSwitch: false,
    slots,
  });
  assert.equal(feature.selectedSlot, 1);
  assert.equal(feature.activeInstanceId, 'mon-b');
  assert.equal(feature.canSwitch, false, 'switch stays disabled while a summon is active');
  assert.deepEqual(feature.slots.map(slot => slot.selected), [false, true, false]);
  assert.deepEqual(feature.slots.map(slot => slot.active), [false, true, false], 'only the summoned monster is active');
  assert.equal(feature.slots[2].fainted, true, 'fainted flag survives the projection');
  assert.equal(feature.slots[0].hp, 20);
  assert.equal(feature.slots[0].hpMax, 40);

  const store = createPocketPartyHudStore();
  const seen = [];
  const unsubscribe = store.subscribe(snapshot => seen.push(snapshot));
  assert.equal(seen[0].available, false, 'party store starts unavailable before the Pocket world publishes');
  assert.equal(seen[0].slots.length, PARTY_SLOT_COUNT, 'unavailable snapshots keep the fixed three-slot shape');

  const first = store.publish(feature);
  assert.equal(first.available, true);
  assert.equal(first.slots[1].name, 'Emberkit');
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.slots), true);
  assert.equal(Object.isFrozen(first.slots[1]), true);
  contractCheck(first);

  const repeat = store.publish(buildPocketPartyHudFeature({ selectedSlot: 1, activeInstanceId: 'mon-b', canSwitch: false, slots }));
  assert.equal(repeat.revision, first.revision, 'identical semantic party state cannot bump the revision');
  assert.equal(seen.length, 2, 'identical semantic party state cannot notify subscribers');

  const hpChanged = slots.map(slot => ({ ...slot }));
  hpChanged[0] = { ...hpChanged[0], hp: 12 };
  const advanced = store.publish(buildPocketPartyHudFeature({ selectedSlot: 1, activeInstanceId: 'mon-b', canSwitch: false, slots: hpChanged }));
  assert.ok(advanced.revision > first.revision, 'HP changes bump the revision monotonically');
  assert.equal(advanced.slots[0].hp, 12);

  const reset = store.reset();
  assert.equal(reset.available, false, 'leaving the Pocket world hides stale party state');
  assert.deepEqual(reset.slots.map(slot => slot.available), [false, false, false]);
  assert.ok(reset.revision > advanced.revision);
  unsubscribe();
  store.publish(feature);
  assert.equal(store.diagnostics().subscribers, 0);
}

// ---------- Bounded normalization ----------
{
  const store = createPocketPartyHudStore();
  const bounded = store.publish(buildPocketPartyHudFeature({
    selectedSlot: 9,
    activeInstanceId: '<<bad id>>',
    canSwitch: 'yes',
    slots: [
      { instanceId: 'mon-a', portraitKey: 'x'.repeat(400), name: '  Lóng   ', level: 5000, hp: 999999, hpMax: 30, condition: null, fainted: 'maybe' },
    ],
  }));
  assert.equal(bounded.selectedSlot, null, 'out-of-range selectedSlot normalizes to null');
  assert.equal(bounded.activeInstanceId, '', 'unsafe active instance ids are dropped');
  assert.equal(bounded.canSwitch, false, 'non-boolean canSwitch fails closed');
  const slot = bounded.slots[0];
  assert.equal(slot.level, 999, 'levels clamp to the contract maximum');
  assert.equal(slot.hp, 30, 'HP clamps to hpMax');
  assert.equal(slot.name.length <= 160, true, 'names are bounded');
  assert.equal(slot.portraitKey.length <= 160, true, 'portrait keys are bounded');
  assert.equal(slot.fainted, false, 'non-boolean fainted fails closed');
  assert.deepEqual(bounded.slots.slice(1).map(s => s.available), [false, false], 'missing slots stay empty');
  contractCheck(bounded);
}

// ---------- game-v800.js wiring ----------
assert.match(game, /from '\.\/pocket-party-hud-view-model\.mjs'/, 'game imports the party HUD view model');
assert.match(game, /createPocketPartyHudStore\(\)/, 'game creates exactly one party HUD store');
assert.match(game, /function renderParty\(\)\{\s*publishPocketPartyHud\(\);/, 'every party render publishes the HUD snapshot before legacy DOM mutation');
assert.match(game, /window\.POCKETMONSTER_PARTY_HUD\s*=\s*Object\.freeze/, 'party HUD adapter is exposed as a frozen global');
const exposedPartyHud = game.match(/window\.POCKETMONSTER_PARTY_HUD\s*=\s*Object\.freeze\(\{[\s\S]*?\}\);/)?.[0] || '';
assert.ok(exposedPartyHud, 'party adapter global is one frozen object literal');
assert.match(exposedPartyHud, /subscribe:\s*pocketPartyHud\.subscribe/);
assert.match(exposedPartyHud, /snapshot:\s*pocketPartyHud\.snapshot/);
assert.match(exposedPartyHud, /selectPartySlot:\s*selectPartySlotCommand/);
assert.match(exposedPartyHud, /switchPartySlot:\s*selectPartySlotCommand/);
assert.match(exposedPartyHud, /armSummon:\s*armSummonCommand/);
assert.match(exposedPartyHud, /executeArmedSummon:\s*executeArmedSummonCommand/);
assert.match(exposedPartyHud, /openCharacter:\s*openCharacterCommand/);
assert.match(exposedPartyHud, /reset:\s*pocketPartyHud.reset/);
assert.match(game, /function selectPartySlotCommand\(slot,options\)\{[\s\S]{0,900}switchPartySlot\(index/, 'slot selection routes through the existing gameplay switch exactly once');
assert.match(game, /function selectPartySlotCommand\(slot,options\)\{[\s\S]{0,900}characterUI\.requestSwitchParty\(index\)/, 'slot selection respects the character controller switch gate');
assert.match(game, /function openCharacterCommand\(slot\)\{[\s\S]{0,300}characterUI\.peekPartySlot/, 'openCharacter routes through the existing quick character panel');
assert.match(game, /addEventListener\('pocketmonster:world-warp-v1',\s*\(\)\s*=>\s*pocketPartyHud\.reset\(\)\)/, 'leaving the Pocket world resets the party snapshot');
assert.match(game, /addEventListener\('pocketmonster:session-ended',\s*\(\)\s*=>\s*pocketPartyHud\.reset\(\)\)/, 'session end resets the party snapshot');
const projection = game.match(/function pocketPartyHudProjection\(\)\{[\s\S]*?\n\}/)?.[0] || '';
assert.ok(projection, 'the party projection is a dedicated pure presenter');
assert.doesNotMatch(projection, /return\s+inst\b|:\s*inst[,}\s]/, 'monster instances never cross the projection boundary');
assert.match(projection, /instanceId|portraitKey/, 'projection extracts only primitive display fields');

console.log('V9 Pocket party HUD adapter: PASS');
