import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildPocketPlayerHudFeature,
  buildPocketTargetHudFeature,
  buildPocketActionsHudFeature,
  buildPocketUtilitiesHudFeature,
  buildPocketBannerFeature,
  createPocketPlayerHudStore,
  createPocketTargetHudStore,
  createPocketActionsHudStore,
  createPocketUtilitiesHudStore,
  createPocketBannerHudStore,
} from '../pocket-hud-view-model.mjs';
import { normalizeUnifiedHudSnapshot, validateUnifiedHudSnapshot } from '../unified-hud-contract-v900.mjs';

const game = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');

function contractCheck(features) {
  const full = normalizeUnifiedHudSnapshot({
    context: { worldId: 'pocket-monster', controlMode: 'human', revision: 1 },
    ...features,
  });
  assert.equal(validateUnifiedHudSnapshot(full).ok, true, 'complete Pocket HUD snapshots must validate inside the full contract');
  return full;
}

// ---------- Legacy replacement matrix (plan Task 5A step 1-2) ----------
const replacementMatrix = [
  { legacy: '#playerHp', unifiedField: 'player.hp/hpMax' },
  { legacy: '#captureBallCount', unifiedField: 'player.resource' },
  { legacy: '#goldCount', unifiedField: 'player.modeLabel' },
  { legacy: '#playerExp', unifiedField: 'player.modeLabel' },
  { legacy: '#zoneLabel', unifiedField: 'player.modeLabel' },
  { legacy: '#activeMonsterStatus', unifiedField: 'player.displayName/actions.summon.label' },
  { legacy: '#ownedStatusStrip', unifiedField: 'player.buffs' },
  { legacy: '#targetCard', unifiedField: 'target' },
  { legacy: '#targetName', unifiedField: 'target.name' },
  { legacy: '#targetLevel', unifiedField: 'target.level' },
  { legacy: '#targetHpText', unifiedField: 'target.hp/hpMax' },
  { legacy: '#targetTypes', unifiedField: 'target.states' },
  { legacy: '#targetStatusStrip', unifiedField: 'target.states' },
  { legacy: '#message', unifiedField: 'banner.text' },
  { legacy: '#actionReason', unifiedField: 'actions.items[].reason' },
  { legacy: '#skill1Btn..#skill4Btn', unifiedField: 'actions.items[skill-1..skill-4]' },
  { legacy: '#captureBtn', unifiedField: 'actions.items[capture]' },
  { legacy: '#summonBtn', unifiedField: 'actions.items[summon]' },
  { legacy: '#recallBtn', unifiedField: 'actions.items[recall]' },
  { legacy: 'utility menu', unifiedField: 'utilities.items' },
  { legacy: '#globalCharacterBtn', unifiedField: 'utilities.items[character]' },
  { legacy: '#ranchCount/#collectionCount/#wildCount', unifiedField: 'not-applicable: Ranch/collection management stays in the character overlay; no HUD surface in the golden reference' },
];
for (const row of replacementMatrix) {
  assert.ok(row.unifiedField && row.unifiedField.length > 0, `legacy ${row.legacy} must have an explicit replacement or not-applicable reason`);
  assert.notEqual(row.unifiedField, 'unmapped', `legacy ${row.legacy} cannot stay unmapped`);
}

// ---------- Player feature ----------
{
  const store = createPocketPlayerHudStore();
  assert.equal(store.snapshot().available, false, 'player store starts unavailable');
  const snap = store.publish(buildPocketPlayerHudFeature({
    available: true,
    portraitKey: 'keeper',
    displayName: '  ผู้ดูแลทดสอบ  ',
    level: 12,
    title: '',
    hp: 100,
    hpMax: 100,
    resourceKind: 'capture-balls',
    resource: 3,
    resourceMax: 3,
    modeLabel: 'Grass Meadow • Gold 300',
    modePercent: 0,
    buffs: [
      { id: 'burn', label: 'เผาไหม้', visualKey: 'negative', description: 'Burn • 3.0 วินาที', expiresAt: 0 },
      { id: 'burn', label: 'ซ้ำ', visualKey: 'negative', description: 'duplicate id must dedupe' },
    ],
  }));
  assert.equal(snap.available, true);
  assert.equal(snap.displayName, 'ผู้ดูแลทดสอบ', 'display names are trimmed');
  assert.equal(snap.hp, 100);
  assert.equal(snap.resource, 3);
  assert.equal(snap.buffs.length, 1, 'duplicate buff ids are deduped');
  contractCheck({ player: snap });
}

// ---------- Target feature ----------
{
  const store = createPocketTargetHudStore();
  assert.equal(store.snapshot().available, false);
  const active = store.publish(buildPocketTargetHudFeature({
    id: 'wild-mossbun-1',
    portraitKey: 'mossbun',
    name: 'Mossbun ★ ELITE',
    level: 4,
    hp: 18,
    hpMax: 60,
    states: ['Grass', 'elite'],
  }));
  assert.equal(active.available, true);
  assert.deepEqual(active.states, ['Grass', 'elite']);
  const cleared = store.publish(buildPocketTargetHudFeature(null));
  assert.equal(cleared.available, false, 'losing the target clears the snapshot');
  assert.ok(cleared.revision > active.revision);
  contractCheck({ target: active });
}

// ---------- Actions feature ----------
{
  const store = createPocketActionsHudStore();
  const snap = store.publish(buildPocketActionsHudFeature({
    captureBalls: 2,
    core: {
      capture: { state: 'ready', disabled: false, statusText: 'พร้อมปาจับ', reason: '' },
      summon: { state: 'disabled', disabled: true, statusText: 'Party ช่องนี้ว่าง', reason: 'Party ช่องนี้ว่าง • เลือกมอนก่อน' },
      recall: { state: 'disabled', disabled: true, statusText: 'ยังไม่มีคู่หูในสนาม', reason: 'ยังไม่มีคู่หูในสนาม' },
    },
    skills: [
      { name: 'Leaf Blade', state: 'cooldown', disabled: true, reason: 'Leaf Blade ยังไม่พร้อม', cooldownRemaining: 1.2, cooldownTotal: 0, currentUses: 3 },
      { name: 'Tackle', state: 'ready', disabled: false, reason: '', cooldownRemaining: 0, currentUses: 5 },
    ],
  }));
  const byId = Object.fromEntries(snap.items.map(item => [item.id, item]));
  assert.ok(byId.capture && byId.summon && byId.recall, 'capture/summon/recall all have replacement actions');
  assert.equal(byId.capture.count, 2, 'capture action carries the ball count');
  assert.equal(byId.capture.enabled, true);
  assert.equal(byId.summon.enabled, false);
  assert.ok(byId.summon.reason.length > 0, 'disabled actions expose their reason');
  assert.ok(byId['skill-1'] && byId['skill-2'], 'skill slots map to skill-1..skill-4 items');
  assert.equal(byId['skill-1'].cooldownRemaining, 1.2);
  assert.equal(byId['skill-1'].cooldownTotal, 1.2, 'cooldown totals clamp at least to the remaining value');
  assert.equal(byId['skill-2'].count, 5, 'skill uses survive as counts');
  const full = contractCheck({ actions: snap });
  assert.deepEqual(full.actions.items.map(item => item.id), snap.items.map(item => item.id));
}

// ---------- Utilities + banner features ----------
{
  const utilities = createPocketUtilitiesHudStore();
  const utilSnap = utilities.publish(buildPocketUtilitiesHudFeature({ audioMuted: false }));
  assert.ok(utilSnap.items.some(item => item.id === 'character'), 'character entry is part of utilities');
  assert.ok(utilSnap.items.some(item => item.id === 'save'));
  contractCheck({ utilities: utilSnap });

  const banner = createPocketBannerHudStore();
  const first = banner.publish(buildPocketBannerFeature('Ranch เป็นพื้นที่ปลอดภัย'));
  assert.equal(first.kind, 'system');
  assert.equal(first.text, 'Ranch เป็นพื้นที่ปลอดภัย');
  const repeat = banner.publish(buildPocketBannerFeature('Ranch เป็นพื้นที่ปลอดภัย'));
  assert.equal(repeat.revision, first.revision, 'identical banner text cannot bump the revision (no duplicate timers/listeners)');
  const cleared = banner.publish(buildPocketBannerFeature(''));
  assert.equal(cleared.text, '', 'empty msg clears the banner');
  assert.ok(cleared.revision > repeat.revision);
  contractCheck({ banner: first });
}

// ---------- game-v800.js wiring ----------
assert.match(game, /from '\.\/pocket-hud-view-model\.mjs'/, 'game imports the complete Pocket HUD view models');
assert.match(game, /createPocketPlayerHudStore\(\)/, 'player store exists');
assert.match(game, /createPocketTargetHudStore\(\)/, 'target store exists');
assert.match(game, /createPocketActionsHudStore\(\)/, 'actions store exists');
assert.match(game, /createPocketUtilitiesHudStore\(\)/, 'utilities store exists');
assert.match(game, /createPocketBannerHudStore\(\)/, 'banner store exists');
assert.match(game, /function renderHUD\(\)\{\s*publishPocketPlayerHud\(\);/, 'renderHUD publishes the player snapshot before legacy DOM writes');
assert.match(game, /function updateTarget\(\)\{\s*publishPocketTargetHud\(\);/, 'updateTarget publishes the target snapshot before legacy DOM writes');
assert.match(game, /function renderCombatPresentation\(\)\{\s*publishPocketActionsHud\(\);/, 'combat presentation publishes action snapshots before legacy DOM writes');
assert.match(game, /function msg\(t\)\{[\s\S]{0,120}publishPocketBannerHud\(t\)/, 'msg publishes banner snapshots');
assert.match(game, /window\.POCKETMONSTER_POCKET_HUD\s*=\s*Object\.freeze/, 'complete Pocket HUD adapter is exposed as a frozen global');
const exposed = game.match(/window\.POCKETMONSTER_POCKET_HUD\s*=\s*Object\.freeze\(\{[\s\S]*?\n\}\);/)?.[0] || '';
assert.ok(exposed, 'adapter global is one object literal');
for (const feature of ['player', 'target', 'actions', 'utilities', 'banner']) {
  assert.match(exposed, new RegExp(`${feature}:Object\\.freeze\\(\\{subscribe:pocket${feature[0].toUpperCase()}${feature.slice(1)}Hud\\.subscribe`), `${feature} adapter exposes subscribe/snapshot`);
}
assert.match(exposed, /resetAll/, 'adapter exposes a combined reset');
assert.match(game, /addEventListener\('pocketmonster:world-warp-v1',\s*\(\)\s*=>\s*window\.POCKETMONSTER_POCKET_HUD\.resetAll\(\)\)/, 'leaving the Pocket world resets every Pocket HUD feature');
assert.match(game, /addEventListener\('pocketmonster:session-ended',\s*\(\)\s*=>\s*window\.POCKETMONSTER_POCKET_HUD\.resetAll\(\)\)/, 'session end resets every Pocket HUD feature');

console.log('V9 Pocket complete HUD adapter (task 5A): PASS');
