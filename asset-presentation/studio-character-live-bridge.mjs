import { validateStudioCharacterPackage } from './studio-character-package.mjs';

export const STUDIO_CHARACTER_BRIDGE_URL = 'https://nustanakritwithai.github.io/3JS-player-block-asset-engine-/';
export const STUDIO_CHARACTER_BRIDGE_REQUEST = 'POCKET_STUDIO_CHARACTER_REQUEST';
export const STUDIO_CHARACTER_BRIDGE_RESPONSE = 'POCKET_STUDIO_CHARACTER_PACKAGE';
export const STUDIO_CHARACTER_BRIDGE_ERROR = 'POCKET_STUDIO_CHARACTER_ERROR';

function requestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `studio-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function loadStudioCharacterFromEngine({
  sourceUrl = STUDIO_CHARACTER_BRIDGE_URL,
  characterId = 'character.human.pirate.studio-live',
  displayName = 'Studio Player',
  timeoutMs = 8000,
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

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      windowRef.removeEventListener('message', onMessage);
      frame.remove();
      fn(value);
    };
    const onMessage = event => {
      if (event.origin !== targetOrigin || event.source !== frame.contentWindow) return;
      const message = event.data;
      if (!message || message.requestId !== id) return;
      if (message.type === STUDIO_CHARACTER_BRIDGE_ERROR) {
        finish(reject, new Error(message.message || 'Character Studio bridge failed'));
        return;
      }
      if (message.type !== STUDIO_CHARACTER_BRIDGE_RESPONSE) return;
      const result = validateStudioCharacterPackage(message.package);
      if (!result.valid) {
        finish(reject, new Error(`Invalid Studio character package: ${result.errors.join('; ')}`));
        return;
      }
      finish(resolve, message.package);
    };
    const timer = setTimeout(() => finish(reject, new Error('Character Studio bridge timed out')), Math.max(1000, timeoutMs));
    windowRef.addEventListener('message', onMessage);
    frame.addEventListener('load', () => {
      try {
        frame.contentWindow?.postMessage({
          type: STUDIO_CHARACTER_BRIDGE_REQUEST,
          requestId: id,
          characterId,
          displayName,
        }, targetOrigin);
      } catch (error) {
        finish(reject, error);
      }
    }, { once: true });
    documentRef.body.appendChild(frame);
  });
}
