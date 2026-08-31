export const PERSISTENT_FULLSCREEN_BRIDGE_KIND = 'monsterlife-persistent-fullscreen-bridge-v1';

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

if (typeof window !== 'undefined') installPersistentFullscreenBridge(window);
