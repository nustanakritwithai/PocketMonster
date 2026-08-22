import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WORKBOOK_CAPTURE_ADAPTER } from '../balance-config.mjs';

const root = new URL('../', import.meta.url);

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const compactHeader = source.indexOf('){', start);
  const spacedHeader = source.indexOf(') {', start);
  const headerEnd = compactHeader >= 0 && (spacedHeader < 0 || compactHeader < spacedHeader)
    ? compactHeader
    : spacedHeader;
  assert.ok(headerEnd > start, `${name} header`);
  const brace = source.indexOf('{', headerEnd);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`unclosed ${name}`);
}

export function assertCaptureLiveWiring({ js, config, packageJson }) {
  const execute = extractFunction(js, 'executeCaptureThrow');
  const resolve = extractFunction(js, 'resolveCapture');
  const start = extractFunction(js, 'startCaptureSequence');
  const update = extractFunction(js, 'updateCaptureSequence');
  const success = extractFunction(js, 'finishCaptureSuccess');
  const failure = extractFunction(js, 'finishCaptureFail');
  const chance = extractFunction(js, 'captureChance');
  const prerequisite = extractFunction(js, 'capturePrerequisite');
  const calculatorInput = extractFunction(js, 'captureCalculatorInput');
  const identity = extractFunction(js, 'captureIdentityForWild');
  const sourceType = extractFunction(js, 'captureWorkbookType');
  const statuses = extractFunction(js, 'captureActiveStatusIds');
  const damageWild = extractFunction(js, 'damageWild');
  const updateWild = extractFunction(js, 'updateWild');
  const reset = extractFunction(js, 'resetWild');
  const clearWilds = extractFunction(js, 'clearWilds');
  const abort = extractFunction(js, 'abortCaptureSequence');
  const summon = extractFunction(js, 'summonThrow');
  const makeInstance = extractFunction(js, 'makeInstance');
  const saveEnvelope = extractFunction(js, 'currentSaveEnvelope');

  assert.match(js, /from '\.\/capture-transaction\.mjs'/, 'live client imports the capture transaction boundary');
  assert.match(js, /from '\.\/balance-capture\.mjs'/, 'live client imports CAP_v1.0 calculator');
  assert.match(js, /monsterCatalogEntry/, 'live identity uses the workbook/runtime catalog');
  assert.match(js, /const captureAttemptLedger=createCaptureAttemptLedger\(\)/, 'ledger stays module-local and transient');
  assert.doesNotMatch(js, /liveCaptureChance\(/, 'legacy capture formula is not called by the playable client');
  assert.doesNotMatch(js, /eliteCaptureModifier|captureBonus:\.05/, 'legacy scene coefficients cannot shadow CAP_v1.0');

  assert.match(execute, /beginCaptureAttempt\(/, 'a valid throw begins the transaction before projectile flight');
  assert.match(execute, /attemptId:attemptId/, 'the throw binds a stable attempt identity');
  assert.match(execute, /inventory:state\.inventory/, 'the transaction owns live ball inventory mutation');
  assert.match(execute, /targetMonsterId,ballClass:'Basic'/, 'begin binds the resolved workbook monster identity');
  assert.match(execute, /ownedMonsterActive:!!\(activeSummon\|\|pendingSummon\)/, 'begin snapshots active and in-flight summon state');
  assert.match(execute, /ensureCaptureReferenceLevel\(t\)/, 'a targeted throw starts the encounter reference snapshot');
  assert.doesNotMatch(execute, /captureBalls\s*--|captureBalls\s*-=|captureBalls\s*=/, 'the scene cannot consume a ball outside the transaction');
  assert.match(execute, /t\.capturing=true/, 'target remains frozen for projectile flight');

  assert.match(resolve, /resolveCaptureAttempt\(/, 'projectile completion enters the idempotent resolver');
  assert.match(resolve, /projectileHit/, 'miss/hit is explicitly bound at the projectile boundary');
  assert.match(resolve, /rng:Math\.random/, 'the one client RNG call is injected into the transaction');
  assert.match(resolve, /if\(resolved\.replay\)return/, 'duplicate projectile callbacks are exact no-ops');
  assert.match(resolve, /commitCaptureAttempt\(/, 'non-rolling miss/disabled outcomes commit through the same guard');

  assert.match(start, /resolution/, 'tension animation consumes an immutable resolution');
  assert.match(start, /success:resolution\.captureSucceeded/, 'the sequence cannot decide outcome itself');
  assert.doesNotMatch(start, /Math\.random|captureChance\(/, 'tension never rerolls or recomputes chance');
  assert.match(update, /commitCaptureAttempt\(/, 'animation completion commits side effects once');
  assert.match(update, /onSuccess:\(\)=>finishCaptureSuccess\(cs\)/, 'success side effects stay behind commit');
  assert.match(update, /onFailure:\(\)=>finishCaptureFail\(cs\)/, 'failure side effects stay behind commit');

  assert.equal((success.match(/makeInstance\(/g) ?? []).length, 1, 'success calls the canonical instance factory exactly once');
  assert.match(success, /captureProfile\.baseBond/, 'captured Bond comes from the workbook Stage profile');
  assert.match(success, /captureProfile\.stage===2\?captureProfile\.monsterId:undefined/, 'captured Stage2 gets canonical workbook form evidence');
  assert.match(success, /captureProfile\.monsterId!==identity\.monsterId\|\|captureProfile\.stage!==identity\.stage/, 'factory fails closed if wild identity drifts after resolution');
  assert.match(success, /endEncounterEffects\(/, 'successful capture closes encounter statuses');
  assert.match(makeInstance, /formId:opts\.formId\?\?opts\.evolutionPath\?\?sp\.id/, 'factory accepts explicit canonical Stage2 form identity');
  assert.match(failure, /engaged=true/, 'failed capture preserves the encounter and resumes chase');
  assert.doesNotMatch(failure, /endEncounterEffects\(/, 'failed capture preserves HP/status encounter state');

  assert.match(identity, /workbookStage2MonsterId/, 'evolved wild uses the Stage2 workbook ID');
  assert.match(identity, /workbookBaseMonsterId/, 'base wild uses the Stage1 workbook ID');
  assert.match(identity, /wildPath\(w\)/, 'known Stage2 path may contribute canonical secondary type');
  assert.match(identity, /const stage=w\?\.evolutionPath\?2:1/, 'every non-empty live evolutionPath is Stage2 identity evidence');
  assert.doesNotMatch(identity, /stage===2&&!path/, 'legacy live Stage2 aliases cannot be rejected before capture policy');
  const liveStage2Aliases = [...new Set([...js.matchAll(/evolutionPath:'([^']+)'/g)].map(match => match[1]))].sort();
  assert.deepEqual(liveStage2Aliases, ['flame_wolf', 'magma_bear'], 'every configured legacy Stage2 spawn alias enters the generic Stage2 identity path');
  assert.match(sourceType, /runtimeType==='Fairy'\?'LIGHT'/, 'runtime Fairy maps back to workbook LIGHT');
  assert.match(statuses, /expiresAtSec>status\.currentTimeSec/, 'only active encounter statuses affect capture');
  assert.match(calculatorInput, /captureWorkbookMonsterId\(w\)/, 'calculator input resolves Stage1/Stage2 workbook identity');
  assert.match(calculatorInput, /captureActiveStatusIds\(w\)/, 'calculator reads canonical encounter statuses');
  assert.match(calculatorInput, /captureWorkbookVariant\(w\)/, 'calculator reads central variant policy');
  assert.match(calculatorInput, /validCapturePolicyForWild\(w\)/, 'variant flags and encounter capture policy must agree');
  assert.match(calculatorInput, /ownedMonsterActive:!!\(activeSummon\|\|pendingSummon\)/, 'calculator cannot ignore an in-flight summon');
  assert.match(chance, /resolveWorkbookCapture\(/, 'HUD preview uses CAP_v1.0');
  assert.match(chance, /finalChancePct\/100/, 'HUD converts workbook percent exactly once');
  assert.doesNotMatch(chance, /ensureCaptureReferenceLevel\(/, 'HUD preview cannot start or mutate an encounter snapshot');

  assert.match(reset, /captureReferenceLevel=null/, 'proper encounter reset discards the reference snapshot');
  assert.match(prerequisite, /pendingSummon\|\|projectiles\.some\(p=>p\.type==='summon'\)/, 'reverse summon-to-capture race is blocked');
  assert.match(damageWild, /ensureCaptureReferenceLevel\(w\)/, 'first owned-monster hit snapshots the encounter reference');
  assert.match(updateWild, /ensureCaptureReferenceLevel\(w\)/, 'first wild engagement snapshots the encounter reference');
  assert.match(abort, /cancelCaptureAttempt\(/, 'abort terminally cancels a thrown transaction without refund');
  assert.match(clearWilds, /clearCaptureAttemptLedger\(/, 'zone/encounter teardown releases bounded ledger state');
  assert.match(summon, /if\(activeCaptureAttempt\|\|captureSequence\)/, 'summon is blocked while capture is active');
  assert.doesNotMatch(saveEnvelope, /captureAttemptLedger|activeCaptureAttempt|captureReferenceLevel/, 'transient ledger/reference never enter save envelopes');

  assert.match(config, /activation: 'live_client_transaction'/, 'CAP_v1.0 is live only behind the accepted client transaction');
  assert.match(config, /rollAuthority: 'future_server_boundary'/, 'client activation does not claim server authority');
  const scripts = JSON.parse(packageJson).scripts;
  assert.match(scripts['test:v81:capture'], /v81-capture-transaction\.mjs/);
  assert.match(scripts['test:v81:capture'], /v81-capture-transaction-mutants\.mjs/);
  assert.match(scripts['test:v81:capture'], /v81-capture-live-wiring\.mjs/);
  assert.match(scripts['test:v81:capture'], /v81-capture-live-wiring-mutants\.mjs/);
}

assert.equal(WORKBOOK_CAPTURE_ADAPTER.activation, 'live_client_transaction');
assert.equal(WORKBOOK_CAPTURE_ADAPTER.rollAuthority, 'future_server_boundary');
assertCaptureLiveWiring({
  js: fs.readFileSync(new URL('game-v800.js', root), 'utf8'),
  config: fs.readFileSync(new URL('balance-config.mjs', root), 'utf8'),
  packageJson: fs.readFileSync(new URL('package.json', root), 'utf8'),
});

console.log('V8.1 A27 live capture wiring: PASS');
