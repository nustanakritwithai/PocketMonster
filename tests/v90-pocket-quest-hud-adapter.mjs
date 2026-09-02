import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildPocketQuestHudFeature,
  createPocketQuestHudStore,
  POCKET_QUEST_HUB_GUIDANCE,
} from '../pocket-quest-hud-view-model.mjs';
import { resolveStageObjective, stageObjectiveTracker } from '../stage-objectives.mjs';
import { normalizeUnifiedHudSnapshot, validateUnifiedHudSnapshot } from '../unified-hud-contract-v900.mjs';

const game = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const stageCatalog = await import('../stage-catalog.mjs');
const { STAGE_BY_ID } = stageCatalog;

function contractCheck(questSnapshot) {
  const full = normalizeUnifiedHudSnapshot({
    context: { worldId: 'pocket-monster', controlMode: 'human', revision: 1 },
    quest: questSnapshot,
  });
  assert.deepEqual(full.quest, questSnapshot, 'quest snapshot must slot into the unified HUD contract unchanged');
  assert.equal(validateUnifiedHudSnapshot(full).ok, true, 'quest snapshot must validate inside the full contract');
}

function makeTracker(zoneId, progression) {
  const zone = { stageId: zoneId, progressionBossSpeciesId: 'mossbun' };
  const objective = resolveStageObjective({ zoneId, zone, ...progression });
  const tracker = stageObjectiveTracker(objective, { stageId: zoneId, stageName: STAGE_BY_ID[zoneId]?.displayName || zoneId, monsterName: 'Mossbun' });
  return { objective, tracker };
}

// ---------- Ranch / no-stage branch ----------
{
  const feature = buildPocketQuestHudFeature({ hasStage: false });
  assert.equal(feature.available, true);
  assert.equal(feature.title, POCKET_QUEST_HUB_GUIDANCE.title);
  assert.equal(feature.summary, POCKET_QUEST_HUB_GUIDANCE.summary, 'Ranch shows the warp-to-Grass-Meadow guidance');
  assert.equal(feature.steps.length, 1);
  assert.equal(feature.steps[0].id, 'goto-grass-meadow');
  assert.equal(feature.steps[0].state, 'current');
}

// ---------- Active objective branch ----------
{
  const fresh = {
    stageProgress: { cleared: [] },
    starterJourney: { grassMeadow: { captured: false } },
    eliteProgress: { defeated: {} },
    bossProgress: { defeated: {} },
  };
  const { objective, tracker } = makeTracker('grass-meadow', fresh);
  assert.equal(objective.phase, 'capture-starter');
  const feature = buildPocketQuestHudFeature({ hasStage: true, tracker, summary: '1/3 จับมอนสเตอร์ 1 ตัว' });
  assert.equal(feature.available, true);
  assert.equal(feature.title, STAGE_BY_ID['grass-meadow'].displayName);
  assert.equal(feature.steps.length, 3, 'Grass Meadow keeps its three-step tracker');
  assert.deepEqual(feature.steps.map(step => step.state), ['current', 'todo', 'todo']);
  assert.equal(feature.summary, '1/3 จับมอนสเตอร์ 1 ตัว');
}

// ---------- Cleared-state branch ----------
{
  const cleared = {
    stageProgress: stageCatalog.recordStageClear(stageCatalog.createStageProgress(), 'grass-meadow'),
    starterJourney: { grassMeadow: { captured: true } },
    eliteProgress: { defeated: { 'grass-meadow:mossbun': { count: 1 } } },
    bossProgress: { defeated: { 'grass-meadow:mossbun': { count: 1 } } },
  };
  const { objective, tracker } = makeTracker('grass-meadow', cleared);
  assert.equal(objective.phase, 'stage-cleared');
  const feature = buildPocketQuestHudFeature({ hasStage: true, tracker, summary: 'เคลียร์แล้ว' });
  assert.deepEqual(feature.steps.map(step => step.state), ['done', 'done', 'done'], 'cleared stages mark every step done');
  assert.match(feature.status, /เคลียร์/, 'cleared status text survives normalization');
}

// ---------- Store semantics: revision ordering, dirty publish, reset ----------
{
  const store = createPocketQuestHudStore();
  const seen = [];
  const unsubscribe = store.subscribe(snapshot => seen.push(snapshot));
  assert.equal(seen.length, 1, 'subscribe delivers the current snapshot immediately');
  assert.equal(seen[0].available, false, 'store starts unavailable before the Pocket world publishes');
  assert.equal(Object.isFrozen(seen[0]), true);
  assert.equal(Object.isFrozen(seen[0].steps), true);
  const hubPublished = store.publish(buildPocketQuestHudFeature({ hasStage: false }));
  contractCheck(hubPublished);

  const fresh = {
    stageProgress: { cleared: [] },
    starterJourney: { grassMeadow: { captured: false } },
    eliteProgress: { defeated: {} },
    bossProgress: { defeated: {} },
  };
  const { tracker } = makeTracker('grass-meadow', fresh);
  const activeFeature = buildPocketQuestHudFeature({ hasStage: true, tracker, summary: '1/3 จับมอน' });

  const first = store.publish(activeFeature);
  assert.equal(first.available, true);
  assert.ok(first.revision > hubPublished.revision, 'active objective bumps revision past the hub guidance');
  assert.equal(seen.length, 3);

  const repeat = store.publish(buildPocketQuestHudFeature({ hasStage: true, tracker, summary: '1/3 จับมอน' }));
  assert.equal(repeat.revision, first.revision, 'identical semantic state cannot bump the revision');
  assert.equal(seen.length, 3, 'identical semantic state cannot notify subscribers');

  const capturedTracker = makeTracker('grass-meadow', {
    ...fresh,
    starterJourney: { grassMeadow: { captured: true } },
  }).tracker;
  const advanced = store.publish(buildPocketQuestHudFeature({ hasStage: true, tracker: capturedTracker, summary: '2/3 ปราบ ELITE' }));
  assert.ok(advanced.revision > first.revision, 'quest progress bumps the revision monotonically');
  assert.equal(seen.length, 4);
  assert.deepEqual(advanced.steps.map(step => step.state), ['done', 'current', 'todo']);

  const cleared = store.reset();
  assert.equal(cleared.available, false, 'leaving the Pocket world hides stale quest state');
  assert.deepEqual(cleared.steps, []);
  assert.equal(cleared.status, 'unavailable');
  assert.ok(cleared.revision > advanced.revision);
  assert.equal(seen.length, 5);
  assert.equal(seen[seen.length - 1].available, false);

  const repeatReset = store.reset();
  assert.equal(repeatReset.revision, cleared.revision, 'reset is idempotent while already unavailable');
  assert.equal(seen.length, 5);

  unsubscribe();
  store.publish(activeFeature);
  assert.equal(seen.length, 5, 'unsubscribed listeners receive no further snapshots');
  assert.equal(store.diagnostics().subscribers, 0);
  contractCheck(store.snapshot());
}

// ---------- game-v800.js wiring ----------
assert.match(game, /from '\.\/pocket-quest-hud-view-model\.mjs'/, 'game imports the quest HUD view model');
assert.match(game, /createPocketQuestHudStore\(\)/, 'game creates exactly one quest HUD store');
assert.match(game, /function renderStarterJourney\(\)\{\s*publishPocketQuestHud\(\);/, 'every quest render publishes the HUD snapshot before legacy DOM guards');
assert.match(game, /window\.POCKETMONSTER_QUEST_HUD\s*=\s*Object\.freeze/, 'quest HUD adapter is exposed as a frozen global');
assert.match(game, /subscribe:\s*pocketQuestHud\.subscribe/, 'adapter exposes subscribe');
assert.match(game, /snapshot:\s*pocketQuestHud\.snapshot/, 'adapter exposes snapshot');
assert.match(game, /togglePanel:\s*toggleQuestHudPanel/, 'adapter exposes the Dock expand/collapse command');
assert.match(game, /reset:\s*pocketQuestHud\.reset/, 'adapter exposes the world-switch reset');
assert.match(game, /addEventListener\('pocketmonster:world-warp-v1',\s*\(\)\s*=>\s*pocketQuestHud\.reset\(\)\)/, 'leaving the Pocket world resets the quest snapshot');
assert.match(game, /addEventListener\('pocketmonster:session-ended',\s*\(\)\s*=>\s*pocketQuestHud\.reset\(\)\)/, 'session end resets the quest snapshot');
assert.match(game, /function toggleQuestHudPanel\(open\)\{[\s\S]{0,220}setStageObjectiveDismissed/, 'Dock panel command still drives the legacy dismissed flag during migration');
const exposedQuestHud = game.match(/window\.POCKETMONSTER_QUEST_HUD\s*=\s*Object\.freeze\(\{[\s\S]*?\}\);/)?.[0] || '';
assert.ok(exposedQuestHud, 'quest adapter global is exposed as one frozen object literal');
assert.doesNotMatch(exposedQuestHud, /state\.|state\[/, 'quest adapter surface exposes only store methods, not mutable game state');

console.log('V9 Pocket quest HUD adapter: PASS');
