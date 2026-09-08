import { validateStudioCharacterPackage } from './studio-character-package.mjs';

export const STUDIO_CHARACTER_BRIDGE_URL = 'https://nustanakritwithai.github.io/3JS-player-block-asset-engine-/';
export const STUDIO_CHARACTER_BRIDGE_REQUEST = 'POCKET_STUDIO_CHARACTER_REQUEST';
export const STUDIO_CHARACTER_BRIDGE_RESPONSE = 'POCKET_STUDIO_CHARACTER_PACKAGE';
export const STUDIO_CHARACTER_BRIDGE_ERROR = 'POCKET_STUDIO_CHARACTER_ERROR';
export const STUDIO_CHARACTER_BRIDGE_DEFAULT_TIMEOUT_MS = 30000;
export const STUDIO_CHARACTER_BRIDGE_DEFAULT_RETRY_MS = 750;

function requestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `studio-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function loadStudioCharacterFromEngine({
  sourceUrl = STUDIO_CHARACTER_BRIDGE_URL,
  characterId = 'character.human.pirate.studio-live',
  displayName = 'Studio Player',
  timeoutMs = STUDIO_CHARACTER_BRIDGE_DEFAULT_TIMEOUT_MS,
  retryMs = STUDIO_CHARACTER_BRIDGE_DEFAULT_RETRY_MS,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
} = {}) {
  if (!documentRef?.createElement || !documentRef?.body || !windowRef?.addEventListener) {
    return Promise.reject(new Error('Studio character bridge needs a browser document'));
  }

  const targetUrl = new URL(sourceUrl, windowRef.location?.href || STUDIO_CHARACTER_BRIDGE_URL);
  targetUrl.searchParams.set('pocketBridge', '1');
  const targetOrigin = targetUrl.origin;
  const id = requestId();
  const frame = documentRef.createElement('iframe');
  frame.title = 'Pocket Monster Character Studio bridge';
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.loading = 'eager';
  frame.style.display = 'none';
  frame.src = targetUrl.href;

  const startedAt = Date.now();
  const diagnostics = {
    state: 'loading',
    sourceUrl: targetUrl.href,
    targetOrigin,
    requestId: id,
    attempts: 0,
    frameLoaded: false,
    frameError: false,
    lastAttemptAt: null,
    lastAttemptReason: null,
    lastMessageType: null,
    lastError: null,
    completedAt: null,
  };
  const readDiagnostics = () => Object.freeze({
    ...diagnostics,
    elapsedMs: Math.max(0, (diagnostics.completedAt || Date.now()) - startedAt),
  });
  try { windowRef.POCKETMONSTER_STUDIO_CHARACTER_BRIDGE_DIAGNOSTICS = readDiagnostics; } catch {}

  return new Promise((resolve, reject) => {
    let settled = false;
    let retryTimer = null;
    const finish = (fn, value, state, error = null) => {
      if (settled) return;
      settled = true;
      diagnostics.state = state;
      diagnostics.lastError = error ? String(error?.message || error) : diagnostics.lastError;
      diagnostics.completedAt = Date.now();
      clearTimeout(timer);
      if (retryTimer != null) clearInterval(retryTimer);
      windowRef.removeEventListener('message', onMessage);
      frame.remove();
      fn(value);
    };
    const sendRequest = reason => {
      if (settled || !frame.contentWindow) return;
      diagnostics.attempts += 1;
      diagnostics.lastAttemptAt = Date.now();
      diagnostics.lastAttemptReason = reason;
      try {
        frame.contentWindow.postMessage({
          type: STUDIO_CHARACTER_BRIDGE_REQUEST,
          requestId: id,
          characterId,
          displayName,
        }, targetOrigin);
      } catch (error) {
        diagnostics.lastError = String(error?.message || error);
      }
    };
    const onMessage = event => {
      if (event.origin !== targetOrigin || event.source !== frame.contentWindow) return;
      const message = event.data;
      if (!message || message.requestId !== id) return;
      diagnostics.lastMessageType = message.type || null;
      if (message.type === STUDIO_CHARACTER_BRIDGE_ERROR) {
        const error = new Error(message.message || 'Character Studio bridge failed');
        diagnostics.lastError = error.message;
        if (/not ready/i.test(error.message)) {
          diagnostics.state = 'waiting-for-engine';
          return;
        }
        finish(reject, error, 'engine-error', error);
        return;
      }
      if (message.type !== STUDIO_CHARACTER_BRIDGE_RESPONSE) return;
      const result = validateStudioCharacterPackage(message.package);
      if (!result.valid) {
        const error = new Error(`Invalid Studio character package: ${result.errors.join('; ')}`);
        finish(reject, error, 'invalid-package', error);
        return;
      }
      finish(resolve, message.package, 'validated');
    };
    const timer = setTimeout(() => {
      const error = new Error(`Character Studio bridge timed out after ${Math.max(250, timeoutMs)}ms (${diagnostics.attempts} request attempt(s))`);
      finish(reject, error, 'timeout', error);
    }, Math.max(250, timeoutMs));
    windowRef.addEventListener('message', onMessage);
    frame.addEventListener('load', () => {
      diagnostics.frameLoaded = true;
      diagnostics.state = 'requesting';
      sendRequest('frame-load');
    }, { once: true });
    frame.addEventListener?.('error', () => {
      diagnostics.frameError = true;
      diagnostics.lastError = 'Character Studio iframe load error';
    }, { once: true });
    documentRef.body.appendChild(frame);
    // The Studio page performs top-level async module boot before its message
    // listener exists. Retry the same authenticated request until that listener
    // is ready instead of assuming one iframe load edge is sufficient.
    retryTimer = setInterval(() => sendRequest('readiness-retry'), Math.max(100, retryMs));
    queueMicrotask(() => sendRequest('initial'));
  });
}
