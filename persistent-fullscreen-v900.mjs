export const PERSISTENT_FULLSCREEN_BRIDGE_KIND = 'monsterlife-persistent-fullscreen-bridge-v1';

const FULLSCREEN_CONTROL_IDS = Object.freeze([
  'enterImmersiveBtn',
  'retryImmersiveBtn',
  'fullscreenBtn',
  'persistentFullscreenBtn',
]);
const boundFullscreenControls = new WeakSet();

function defineRequest(root, name, request) {
  try {
    Object.defineProperty(root, name, {
      configurable: true,
      enumerable: false,
      writable: false,
      value: request,
    });
    return true;
  } catch {
    try {
      root[name] = request;
      return root[name] === request;
    } catch {
      return false;
    }
  }
}

export function installPersistentFullscreenBridge(windowLike = globalThis.window) {
  const localRoot = windowLike?.document?.documentElement;
  if (!localRoot) return null;

  let ownerWindow;
  let shell;
  try {
    ownerWindow = windowLike.top;
    if (!ownerWindow || ownerWindow === windowLike) return null;
    shell = ownerWindow.POCKETMONSTER_ONLINE_SHELL;
  } catch {
    return null;
  }

  if (shell?.kind !== 'monsterlife-online-world-shell-v1'
    || typeof shell.requestFullscreen !== 'function') return null;

  const request = options => shell.requestFullscreen(options);
  if (!defineRequest(localRoot, 'requestFullscreen', request)) return null;
  if ('webkitRequestFullscreen' in localRoot) {
    defineRequest(localRoot, 'webkitRequestFullscreen', request);
  }

  const bridge = Object.freeze({
    kind: PERSISTENT_FULLSCREEN_BRIDGE_KIND,
    owner: 'parent-shell',
    request,
  });
  try {
    Object.defineProperty(windowLike, 'POCKETMONSTER_PERSISTENT_FULLSCREEN', {
      configurable: true,
      enumerable: true,
      writable: false,
      value: bridge,
    });
  } catch {}
  return bridge;
}

export function bindPersistentFullscreenControls(windowLike = globalThis.window, { signal } = {}) {
  const documentLike = windowLike?.document;
  const bridge = windowLike?.POCKETMONSTER_PERSISTENT_FULLSCREEN
    || installPersistentFullscreenBridge(windowLike);
  if (!documentLike || typeof bridge?.request !== 'function') return 0;

  let bound = 0;
  for (const id of FULLSCREEN_CONTROL_IDS) {
    const control = documentLike.getElementById?.(id);
    if (!control || boundFullscreenControls.has(control)) continue;
    boundFullscreenControls.add(control);
    control.addEventListener('click', async event => {
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
      try {
        await bridge.request({ navigationUI: 'hide' });
        const orientationLock = windowLike.screen?.orientation?.lock?.('landscape');
        if (orientationLock?.catch) orientationLock.catch(() => {});
      } catch (error) {
        windowLike.console?.warn?.('fullscreen rejected', error);
      }
    }, { capture: true, passive: false, signal });
    bound += 1;
  }
  return bound;
}

if (typeof window !== 'undefined') installPersistentFullscreenBridge(window);
