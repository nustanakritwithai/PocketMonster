import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertSchedulerRuntimeSource, assertWildAiSchedulerCadence } from './v810-wild-ai-scheduler.mjs';

const performanceSource = fs.readFileSync(new URL('../performance-runtime.mjs', import.meta.url), 'utf8');
const gameSource = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');

async function loadScheduler(source, tag) {
  return import(`data:text/javascript;base64,${Buffer.from(`${source}\n//# sourceURL=${tag}`).toString('base64')}`);
}

const schedulerMutants = [
  ['force every frame', 'if (force) {', 'if (force || true) {'],
  ['double near cadence', 'if (distance <= nearDistance) return 1 / nearHz;', 'if (distance <= nearDistance) return 0.5 / nearHz;'],
  ['urgent cancellation waits for cadence', 'if (force) {', 'if (false) {'],
  ['discard cadence phase remainder', 'timing.phaseSec %= interval;', 'timing.phaseSec = 0;'],
  ['release only one interval of band backlog',
    'timing.phaseSec %= interval;\n      if (timing.phaseSec + Number.EPSILON >= interval) timing.phaseSec = 0;',
    'timing.phaseSec = Math.max(0, timing.phaseSec - interval);'],
];

let killed = 0;
for (const [name, before, after] of schedulerMutants) {
  const mutant = performanceSource.replace(before, after);
  assert.notEqual(mutant, performanceSource, `${name} scheduler mutation must apply`);
  const module = await loadScheduler(mutant, `v810-scheduler-${name}`);
  try {
    assertWildAiSchedulerCadence(module.createDistanceTickScheduler);
  } catch {
    killed += 1;
    continue;
  }
  assert.fail(`${name} scheduler mutant survived`);
}

for (const [name, source] of [
  ['measure distance from player', gameSource.replace(
    'const aiDistance=targetAvailable?distXZ(w.mesh.position,wildAiFrameTarget.position):Infinity;',
    'const aiDistance=distXZ(player.position,w.mesh.position);',
  )],
  ['force every pending frame', gameSource.replace(
    'const urgentCancel=!!w.aiState?.pendingAction&&(!engagedWildIds.has(w.id)||w.aiState.targetId!==wildLoopTargetKey||!targetAvailable);',
    'const urgentCancel=!!w.aiState?.pendingAction;',
  )],
]) {
  assert.notEqual(source, gameSource, `${name} runtime mutation must apply`);
  assert.throws(() => assertSchedulerRuntimeSource(source), undefined, `${name} runtime mutant must be killed`);
  killed += 1;
}

assert.equal(killed, schedulerMutants.length + 2);
console.log(`V8.10 AI scheduler mutants: PASS (${killed}/${killed} killed)`);
