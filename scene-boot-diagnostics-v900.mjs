const SAFE_STAGES = new Set([
  'session',
  'template',
  'startup',
  'runtime',
  'pirate-save-bootstrap',
]);

const SAFE_CODES = new Set([
  'AUTH_FORBIDDEN',
  'AUTH_REQUIRED',
  'ONLINE_SCENE_BOOT_REQUIRED',
  'ONLINE_SCENE_LEASE_EXPIRED',
  'ONLINE_SERVER_REQUIRED',
  'ONLINE_SESSION_REQUIRED',
  'PIRATE_ORIGINAL_NOT_READY',
  'PIRATE_STATE_INVALID',
  'RATE_LIMITED',
  'REQUEST_REJECTED',
  'SCENE_BOOT_FAILED',
  'SERVER_UNAVAILABLE',
  'SESSION_REQUIRED',
  'STALE_SESSION',
  'STATE_CONFLICT',
  'STATE_UNAVAILABLE',
]);

function codeForHttpStatus(status) {
  if (status === 401) return 'AUTH_REQUIRED';
  if (status === 403) return 'AUTH_FORBIDDEN';
  if (status === 404) return 'STATE_UNAVAILABLE';
  if (status === 409) return 'STATE_CONFLICT';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'SERVER_UNAVAILABLE';
  return 'REQUEST_REJECTED';
}

export function sanitizeSceneBootDiagnostic(value, fallbackStage = 'runtime') {
  const stage = SAFE_STAGES.has(value?.stage)
    ? value.stage
    : SAFE_STAGES.has(fallbackStage) ? fallbackStage : 'runtime';
  const httpStatus = Number.isInteger(value?.httpStatus) && value.httpStatus >= 400 && value.httpStatus <= 599
    ? value.httpStatus
    : null;
  const code = SAFE_CODES.has(value?.code)
    ? value.code
    : httpStatus === null ? 'SCENE_BOOT_FAILED' : codeForHttpStatus(httpStatus);
  return Object.freeze({ stage, code, httpStatus });
}

export function pirateSaveBootstrapError(error) {
  const diagnostic = sanitizeSceneBootDiagnostic({
    stage: 'pirate-save-bootstrap',
    code: error?.code,
    httpStatus: error?.status,
  }, 'pirate-save-bootstrap');
  const safeError = new Error('Pirate save bootstrap failed');
  safeError.code = diagnostic.code;
  safeError.sceneBootDiagnostic = diagnostic;
  return safeError;
}

export function sceneBootDiagnosticForError(error, fallbackStage) {
  return sanitizeSceneBootDiagnostic(
    error?.sceneBootDiagnostic || {
      stage: fallbackStage,
      code: error?.code,
      httpStatus: error?.status,
    },
    fallbackStage,
  );
}
