import assert from 'node:assert/strict';
import {
  pirateSaveBootstrapError,
  sanitizeSceneBootDiagnostic,
  sceneBootDiagnosticForError,
} from '../scene-boot-diagnostics-v900.mjs';

const rawError = Object.assign(new Error('https://api.example/?token=secret save=player-data'), {
  code: 'https://attacker.example/?credential=private',
  status: 503,
});
const safeError = pirateSaveBootstrapError(rawError);
assert.deepEqual(safeError.sceneBootDiagnostic, {
  stage: 'pirate-save-bootstrap',
  code: 'SERVER_UNAVAILABLE',
  httpStatus: 503,
});
assert.equal(safeError.message, 'Pirate save bootstrap failed');
assert.equal('cause' in safeError, false, 'raw exception is not retained as an error cause');
assert.deepEqual(sceneBootDiagnosticForError(safeError, 'runtime'), safeError.sceneBootDiagnostic);

assert.deepEqual(sanitizeSceneBootDiagnostic({
  stage: 'https://private.example/?player=1',
  code: 'credential=secret',
  httpStatus: 999,
}, 'runtime'), {
  stage: 'runtime',
  code: 'SCENE_BOOT_FAILED',
  httpStatus: null,
});
assert.deepEqual(sanitizeSceneBootDiagnostic({ stage: 'pirate-save-bootstrap', code: 'STATE_CONFLICT', httpStatus: 409 }), {
  stage: 'pirate-save-bootstrap',
  code: 'STATE_CONFLICT',
  httpStatus: 409,
});
assert.deepEqual(sanitizeSceneBootDiagnostic({ stage: 'pirate-save-bootstrap', code: 'PIRATE_ORIGINAL_NOT_READY', httpStatus: 503 }), {
  stage: 'pirate-save-bootstrap',
  code: 'PIRATE_ORIGINAL_NOT_READY',
  httpStatus: 503,
});
assert.deepEqual(pirateSaveBootstrapError(Object.assign(new Error('private'), {
  code: 'PIRATE_ORIGINAL_NOT_READY',
  status: 503,
})).sceneBootDiagnostic, {
  stage: 'pirate-save-bootstrap',
  code: 'PIRATE_ORIGINAL_NOT_READY',
  httpStatus: 503,
});
assert.deepEqual(sanitizeSceneBootDiagnostic({ stage: 'pirate-save-bootstrap', code: 'unsafe', httpStatus: 403 }), {
  stage: 'pirate-save-bootstrap',
  code: 'AUTH_FORBIDDEN',
  httpStatus: 403,
});
console.log('scene boot diagnostics passed');
