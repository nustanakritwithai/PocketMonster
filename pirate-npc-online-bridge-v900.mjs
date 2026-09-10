export const PIRATE_NPC_ONLINE_BRIDGE_KIND = 'pocketmonster:pirate-npc-online-bridge-v1';
export const PIRATE_NPC_ONLINE_MESSAGE = 'pocketmonster:pirate-npc-online-interaction-v1';
export const PIRATE_NPC_ONLINE_PROXY_ID = 'pirateNpcOnlineTalkProxy';

const STATE_INTERVAL_MS = 80;
const MAX_LABEL = 80;

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safeLabel(value) {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ').slice(0, MAX_LABEL)
    : '';
}

export function isPirateTalkPrompt(prompt, windowLike = globalThis.window) {
  if (!prompt) return false;
  const text = safeLabel(prompt.textContent);
  if (!text.includes('คุยกับ')) return false;
  if (prompt.dataset?.unifiedHelmProxy === 'true') return false;
  if (prompt.style?.display === 'none' || prompt.style?.visibility === 'hidden') return false;
  let computed = null;
  try { computed = windowLike?.getComputedStyle?.(prompt) || globalThis.getComputedStyle?.(prompt); } catch {}
  if (computed?.display === 'none' || computed?.visibility === 'hidden') return false;
  const rect = prompt.getBoundingClientRect?.();
  return Boolean(rect && rect.width > 0 && rect.height > 0);
}

function inactiveState() {
  return Object.freeze({ active: false, label: '', x: 0, y: 0, width: 0, height: 0 });
}

export function readPirateTalkPromptState({
  documentLike = globalThis.document,
  windowLike = globalThis.window,
} = {}) {
  const prompt = documentLike?.querySelector?.('.interaction-prompt');
  if (!isPirateTalkPrompt(prompt, windowLike)) return inactiveState();
  const rect = prompt.getBoundingClientRect();
  const viewportWidth = Math.max(1, finite(windowLike?.innerWidth) || 1);
  const viewportHeight = Math.max(1, finite(windowLike?.innerHeight) || 1);
  return Object.freeze({
    active: true,
    label: safeLabel(prompt.textContent) || 'คุยกับ NPC',
    x: clamp((rect.left + rect.width / 2) / viewportWidth, 0, 1),
    y: clamp((rect.top + rect.height / 2) / viewportHeight, 0, 1),
    width: clamp(rect.width / viewportWidth, 0.03, 0.8),
    height: clamp(rect.height / viewportHeight, 0.03, 0.5),
  });
}

export function sanitizePirateTalkState(input) {
  if (!input || input.active !== true) return inactiveState();
  const label = safeLabel(input.label);
  const x = finite(input.x);
  const y = finite(input.y);
  const width = finite(input.width);
  const height = finite(input.height);
  if (!label || x === null || y === null || width === null || height === null) return inactiveState();
  if (x < 0 || x > 1 || y < 0 || y > 1 || width <= 0 || width > 0.8 || height <= 0 || height > 0.5) {
    return inactiveState();
  }
  return Object.freeze({ active: true, label, x, y, width, height });
}

export function requestOriginalPirateTalk(prompt, windowLike = globalThis.window) {
  if (!isPirateTalkPrompt(prompt, windowLike) || !prompt?.dispatchEvent) return false;
  const rect = prompt.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 };
  const init = {
    bubbles: true,
    cancelable: true,
    pointerId: 9701,
    pointerType: 'touch',
    isPrimary: true,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  };
  const PointerEventCtor = windowLike?.PointerEvent || globalThis.PointerEvent;
  if (typeof PointerEventCtor === 'function') {
    return prompt.dispatchEvent(new PointerEventCtor('pointerdown', init));
  }
  const EventCtor = windowLike?.Event || globalThis.Event;
  if (typeof EventCtor !== 'function') return false;
  return prompt.dispatchEvent(new EventCtor('pointerdown', { bubbles: true, cancelable: true }));
}

function resolveOrigin(value) {
  if (typeof value !== 'string' || !value) return '';
  try { return new URL(value).origin; } catch { return ''; }
}

export function installPirateNpcOnlineChildBridge({
  documentLike = globalThis.document,
  windowLike = globalThis.window,
  parentOrigin,
  intervalMs = STATE_INTERVAL_MS,
} = {}) {
  const trustedParentOrigin = resolveOrigin(parentOrigin);
  if (!documentLike || !windowLike || !trustedParentOrigin || windowLike.parent === windowLike) return null;

  let stopped = false;
  let timer = null;
  let observer = null;
  let lastSerialized = '';

  const postState = state => {
    if (stopped) return false;
    const safe = sanitizePirateTalkState(state);
    const serialized = JSON.stringify(safe);
    if (serialized === lastSerialized) return false;
    lastSerialized = serialized;
    try {
      windowLike.parent?.postMessage?.({
        type: PIRATE_NPC_ONLINE_MESSAGE,
        kind: 'state',
        ...safe,
      }, trustedParentOrigin);
      return true;
    } catch {
      return false;
    }
  };

  const sync = () => postState(readPirateTalkPromptState({ documentLike, windowLike }));

  const onMessage = event => {
    if (stopped || event?.source !== windowLike.parent || event?.origin !== trustedParentOrigin) return;
    const message = event.data;
    if (message?.type !== PIRATE_NPC_ONLINE_MESSAGE || message.kind !== 'activate') return;
    const state = readPirateTalkPromptState({ documentLike, windowLike });
    if (!state.active) return;
    const requestedLabel = safeLabel(message.label);
    if (requestedLabel && requestedLabel !== state.label) return;
    const prompt = documentLike.querySelector?.('.interaction-prompt');
    requestOriginalPirateTalk(prompt, windowLike);
    if (typeof globalThis.queueMicrotask === 'function') globalThis.queueMicrotask(sync);
  };

  windowLike.addEventListener?.('message', onMessage);
  const MutationObserverLike = windowLike.MutationObserver || globalThis.MutationObserver;
  if (typeof MutationObserverLike === 'function' && documentLike.documentElement) {
    observer = new MutationObserverLike(sync);
    observer.observe(documentLike.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-unified-helm-proxy'],
    });
  }
  const schedule = windowLike.setInterval?.bind(windowLike) || globalThis.setInterval;
  if (typeof schedule === 'function') timer = schedule(sync, Math.max(50, Number(intervalMs) || STATE_INTERVAL_MS));
  sync();

  const stop = () => {
    if (stopped) return false;
    stopped = true;
    windowLike.removeEventListener?.('message', onMessage);
    observer?.disconnect?.();
    observer = null;
    if (timer !== null) {
      const clear = windowLike.clearInterval?.bind(windowLike) || globalThis.clearInterval;
      clear?.(timer);
      timer = null;
    }
    lastSerialized = '';
    try {
      windowLike.parent?.postMessage?.({ type: PIRATE_NPC_ONLINE_MESSAGE, kind: 'state', ...inactiveState() }, trustedParentOrigin);
    } catch {}
    return true;
  };
  windowLike.addEventListener?.('pagehide', stop, { once: true });

  return Object.freeze({
    kind: PIRATE_NPC_ONLINE_BRIDGE_KIND,
    role: 'child',
    sync,
    stop,
    diagnostics: () => Object.freeze({ stopped, active: readPirateTalkPromptState({ documentLike, windowLike }).active }),
  });
}

function pirateWorldActive(documentLike) {
  return documentLike?.body?.dataset?.combinedWorld === 'pirate-fruit'
    && documentLike?.body?.dataset?.controlPanel !== 'throw'
    && documentLike?.body?.dataset?.pirateDialogue !== 'open';
}

function styleParentProxy(button) {
  Object.assign(button.style, {
    position: 'fixed',
    display: 'none',
    zIndex: '80',
    margin: '0',
    padding: '0',
    border: '0',
    outline: '0',
    background: 'transparent',
    color: 'transparent',
    boxShadow: 'none',
    opacity: '0.01',
    pointerEvents: 'auto',
    touchAction: 'manipulation',
    transform: 'translate(-50%,-50%)',
  });
}

export function installPirateNpcOnlineParentBridge({
  documentLike = globalThis.document,
  windowLike = globalThis.window,
  hostDocument = windowLike?.frameElement?.ownerDocument || documentLike,
  layoutFrame = windowLike?.frameElement || null,
} = {}) {
  if (!documentLike?.body || !windowLike || !hostDocument?.createElement) return null;

  let stopped = false;
  let childFrame = null;
  let state = inactiveState();
  let proxy = null;
  let observer = null;

  const findChildFrame = () => documentLike.getElementById?.('pirateFruitFrame') || null;

  const ensureProxy = () => {
    if (proxy) return proxy;
    proxy = hostDocument.getElementById?.(PIRATE_NPC_ONLINE_PROXY_ID) || hostDocument.createElement('button');
    proxy.id = PIRATE_NPC_ONLINE_PROXY_ID;
    proxy.type = 'button';
    proxy.dataset.pirateNpcOnlineProxy = 'true';
    proxy.setAttribute?.('aria-hidden', 'true');
    styleParentProxy(proxy);
    proxy.addEventListener?.('pointerdown', event => {
      event.preventDefault?.();
      event.stopPropagation?.();
      if (!pirateWorldActive(documentLike) || !state.active || !childFrame?.contentWindow) return;
      const label = state.label;
      state = inactiveState();
      render();
      try {
        childFrame.contentWindow.postMessage({
          type: PIRATE_NPC_ONLINE_MESSAGE,
          kind: 'activate',
          label,
        }, '*');
      } catch {}
    });
    hostDocument.body?.appendChild?.(proxy);
    return proxy;
  };

  const render = () => {
    const button = ensureProxy();
    if (!button) return false;
    childFrame = findChildFrame();
    if (!pirateWorldActive(documentLike) || !state.active || !childFrame) {
      button.style.display = 'none';
      button.removeAttribute?.('aria-label');
      return false;
    }

    const childRect = childFrame.getBoundingClientRect?.();
    const hostRect = layoutFrame?.getBoundingClientRect?.()
      || { left: 0, top: 0, width: windowLike.innerWidth || 1, height: windowLike.innerHeight || 1 };
    const sceneWidth = Math.max(1, finite(windowLike.innerWidth) || childRect?.width || 1);
    const sceneHeight = Math.max(1, finite(windowLike.innerHeight) || childRect?.height || 1);
    if (!childRect || childRect.width <= 0 || childRect.height <= 0 || hostRect.width <= 0 || hostRect.height <= 0) {
      button.style.display = 'none';
      return false;
    }

    const localX = childRect.left + state.x * childRect.width;
    const localY = childRect.top + state.y * childRect.height;
    const localWidth = Math.max(48, state.width * childRect.width);
    const localHeight = Math.max(44, state.height * childRect.height);
    const scaleX = hostRect.width / sceneWidth;
    const scaleY = hostRect.height / sceneHeight;
    Object.assign(button.style, {
      display: 'block',
      left: `${hostRect.left + localX * scaleX}px`,
      top: `${hostRect.top + localY * scaleY}px`,
      width: `${localWidth * scaleX}px`,
      height: `${localHeight * scaleY}px`,
    });
    button.setAttribute?.('aria-label', state.label);
    return true;
  };

  const reset = () => {
    state = inactiveState();
    render();
    return true;
  };

  const onMessage = event => {
    if (stopped) return;
    const currentFrame = findChildFrame();
    if (!currentFrame || event?.source !== currentFrame.contentWindow || event?.origin !== 'null') return;
    const message = event.data;
    if (message?.type !== PIRATE_NPC_ONLINE_MESSAGE || message.kind !== 'state') return;
    childFrame = currentFrame;
    state = sanitizePirateTalkState(message);
    render();
  };

  const refresh = () => {
    childFrame = findChildFrame();
    if (!pirateWorldActive(documentLike) || !childFrame) reset();
    else render();
  };

  windowLike.addEventListener?.('message', onMessage);
  const MutationObserverLike = windowLike.MutationObserver || globalThis.MutationObserver;
  if (typeof MutationObserverLike === 'function') {
    observer = new MutationObserverLike(refresh);
    observer.observe(documentLike.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-combined-world', 'data-control-panel', 'data-pirate-dialogue'],
    });
  }
  windowLike.addEventListener?.('resize', render);
  windowLike.addEventListener?.('orientationchange', render);
  refresh();

  const stop = () => {
    if (stopped) return false;
    stopped = true;
    windowLike.removeEventListener?.('message', onMessage);
    windowLike.removeEventListener?.('resize', render);
    windowLike.removeEventListener?.('orientationchange', render);
    observer?.disconnect?.();
    observer = null;
    state = inactiveState();
    proxy?.remove?.();
    proxy = null;
    childFrame = null;
    return true;
  };
  windowLike.addEventListener?.('pagehide', stop, { once: true });

  return Object.freeze({
    kind: PIRATE_NPC_ONLINE_BRIDGE_KIND,
    role: 'parent',
    refresh,
    reset,
    stop,
    diagnostics: () => Object.freeze({
      stopped,
      world: documentLike.body?.dataset?.combinedWorld || null,
      active: state.active,
      hasChild: Boolean(findChildFrame()),
      proxyVisible: proxy?.style?.display === 'block',
    }),
  });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const parentOrigin = new URLSearchParams(globalThis.location?.search || '').get('parentOrigin');
  if (parentOrigin && window.parent !== window) {
    window.POCKETMONSTER_PIRATE_NPC_ONLINE_BRIDGE = installPirateNpcOnlineChildBridge({
      documentLike: document,
      windowLike: window,
      parentOrigin,
    });
  } else {
    window.POCKETMONSTER_PIRATE_NPC_ONLINE_BRIDGE = installPirateNpcOnlineParentBridge({
      documentLike: document,
      windowLike: window,
    });
  }
}
