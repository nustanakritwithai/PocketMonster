const DIAGNOSTIC_KEY = 'pocketmonster.startup-diagnostics.v1';
const DIAGNOSTIC_LIMIT = 24;
const ALLOWED_DETAIL_KEYS = new Set(['message', 'filename', 'line', 'prewarming', 'canvas', 'sceneRuntimeActive', 'renderPaused', 'stage', 'code', 'world', 'runtime', 'path']);

function redact(value) {
  return String(value ?? '')
    .replace(/([?#&](?:ticket|state|token|session|verifier|codeVerifier)=)[^&#\s]+/gi, '$1[redacted]')
    .replace(/(Bearer\s+)[^\s]+/gi, '$1[redacted]')
    .slice(0, 240);
}

function normalizeFilename(value) {
  try { return new URL(String(value), location.href).pathname.slice(0, 160); } catch { return ''; }
}

function readDiagnostics() {
  try {
    const value = JSON.parse(sessionStorage.getItem(DIAGNOSTIC_KEY) || 'null');
    return value && typeof value === 'object' ? value : { version: 1, events: [] };
  } catch {
    return { version: 1, events: [] };
  }
}

export function recordStartupDiagnostic(phase, detail = {}) {
  const current = readDiagnostics();
  const event = Object.freeze({
    at: new Date().toISOString(),
    phase: redact(phase),
    ...Object.fromEntries(Object.entries(detail || {})
      .filter(([key]) => ALLOWED_DETAIL_KEYS.has(key))
      .slice(0, 6)
      .map(([key, value]) => [key, key === 'filename' ? normalizeFilename(value) : redact(value)])),
  });
  current.events = [...(Array.isArray(current.events) ? current.events : []), event].slice(-DIAGNOSTIC_LIMIT);
  current.last = event;
  try { sessionStorage.setItem(DIAGNOSTIC_KEY, JSON.stringify(current)); } catch {}
  window.POCKETMONSTER_STARTUP_DIAGNOSTICS = Object.freeze({ ...current, events: Object.freeze([...current.events]) });
  return event;
}

window.POCKETMONSTER_RECORD_STARTUP_DIAGNOSTIC = recordStartupDiagnostic;
recordStartupDiagnostic('startup-errors-installed', { path: location.pathname });

window.addEventListener('error', event => {
  recordStartupDiagnostic('window-error', { message: event.message, filename: event.filename, line: event.lineno });
  const status = document.getElementById('startupStatus');
  if (status) { status.textContent = `เกิดข้อผิดพลาด: ${event.message || 'ไม่ทราบสาเหตุ'}`; status.className = 'startup-status error'; }
});

window.addEventListener('unhandledrejection', event => {
  recordStartupDiagnostic('unhandled-rejection', { message: event.reason?.message || event.reason });
  const status = document.getElementById('startupStatus');
  if (status) { status.textContent = `เริ่มเกมไม่สำเร็จ: ${event.reason?.message || event.reason || 'ไม่ทราบสาเหตุ'}`; status.className = 'startup-status error'; }
});
