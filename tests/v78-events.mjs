import assert from 'node:assert/strict';
import { normalizeInstance, trainingUsed } from '../monster-instance.mjs';
import {
  evaluateEventTriggers,
  eventWeight,
  rollEvent,
  getChoices,
  applyChoice,
  validateEventBalance,
} from '../raising-events.mjs';

const mk = (over = {}) => normalizeInstance({ instanceId: 'ev1', level: 10, speciesTags: ['fire'], stage: 'young', ...over });

const stressEvent = {
  id: 'restless_night', category: 'mood', baseWeight: 1, cooldownMs: 24 * 3600 * 1000,
  trigger: { speciesTags: ['fire'], stage: 'young', statRanges: { stress: { min: 40 } } },
  personalityWeights: { Curious: 1.2 },
  choices: [
    { id: 'train', label: 'ฝึกต่อ', effects: { statExp: { power: 8 }, stress: 5 } },
    { id: 'rest', label: 'พัก', effects: { stress: -15, bond: 3 } },
  ],
};
const explore = {
  id: 'cave_find', baseWeight: 2, trigger: { speciesTags: ['fire'], zone: 'cave' },
  choices: [{ id: 'take', label: 'เก็บ', effects: { growthExp: 10, flags: ['found_ember'] } }],
};

// Triggers respect species/stage/stat-range conditions.
const calm = mk({ mind: { stress: 10 } });
const stressed = mk({ mind: { stress: 55 } });
assert.equal(evaluateEventTriggers([stressEvent], calm).length, 0, 'low stress does not trigger the stress event');
assert.equal(evaluateEventTriggers([stressEvent], stressed).length, 1, 'high stress triggers the event');
assert.equal(evaluateEventTriggers([explore], stressed).length, 0, 'zone-gated event does not trigger outside the zone');
assert.equal(evaluateEventTriggers([explore], mk({ currentZone: 'cave' })).length, 1, 'zone-gated event triggers in the right zone');

// Personality modifies weight (R12).
assert.ok(eventWeight(stressEvent, { personality: 'Curious' }) > eventWeight(stressEvent, { personality: 'balanced' }), 'Curious raises event weight');

// Deterministic weighted roll.
const eligible = evaluateEventTriggers([stressEvent], stressed);
const rolledA = rollEvent(eligible, 'seed-1');
const rolledB = rollEvent(eligible, 'seed-1');
assert.equal(rolledA.id, rolledB.id, 'same seed yields the same event');

// Choices + consequences apply and record a history flag.
const actor = mk({ mind: { stress: 55, bond: 30 } });
assert.equal(getChoices(stressEvent).length, 2, 'both choices exposed');
const rest = applyChoice(actor, stressEvent, 'rest');
assert.equal(rest.ok, true, 'valid choice applies');
assert.ok(actor.mind.stress < 55, 'rest lowered stress');
assert.ok(actor.mind.bond > 30, 'rest raised bond');
assert.ok(actor.eventFlags.includes('restless_night:rest'), 'history flag recorded (eventId:choiceId)');
assert.equal(actor.lifeHistory.at(-1).type, 'event', 'event appended to life history');

// Cooldown prevents immediate re-trigger of the same event.
assert.equal(evaluateEventTriggers([stressEvent], actor, { now: Date.now() }).length, 0, 'event on cooldown does not re-trigger');
assert.equal(evaluateEventTriggers([stressEvent], actor, { now: Date.now() + 25 * 3600 * 1000 }).length, 1, 're-triggers after cooldown elapses');

// The "train" choice grants a small amount of training EXP into the shared pool.
const trainer = mk({ mind: { stress: 55 } });
applyChoice(trainer, stressEvent, 'train');
assert.ok(trainingUsed(trainer) > 0, 'event training feeds the shared pool');

// Event Balance: a non-rare event choice must give less than a normal session (R12).
assert.equal(validateEventBalance(stressEvent, { normalSessionGain: 15 }).ok, true, 'balanced event passes the budget check');
const grindy = { id: 'g', choices: [{ id: 'c', effects: { statExp: { power: 30 } } }] };
assert.equal(validateEventBalance(grindy, { normalSessionGain: 15 }).ok, false, 'an over-generous non-rare event is flagged');
const rareOk = { id: 'r', rare: true, choices: [{ id: 'c', effects: { statExp: { power: 30 } } }] };
assert.equal(validateEventBalance(rareOk, { normalSessionGain: 15 }).ok, true, 'rare/milestone events may grant more');

console.log('V7.8 raising events regression: PASS');
