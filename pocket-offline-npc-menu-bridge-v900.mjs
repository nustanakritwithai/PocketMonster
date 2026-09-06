export const POCKET_OFFLINE_NPC_MENU_BRIDGE_KIND = 'pocketmonster:offline-npc-menu-bridge-v1';
// The original menu stays game-owned in game-v800.js. This scoped message only
// lets the trusted parent shell hide its layers while that legacy menu is open.
export const POCKET_OFFLINE_NPC_MENU_MESSAGE = 'pocketmonster:legacy-npc-menu-v1';
export const POCKET_OFFLINE_NPC_MENU_ROOT_IDS = Object.freeze([
  'merchantShop',
  'trainerPanel',
  'evolutionPanel',
  'breedingPanel',
  'ranchServices',
  'ranchStoragePage',
  'monsterManager',
  'skillItemConfirm',
  'monsterPicker',
]);

export function hasOpenPocketOfflineNpcMenu(documentLike = globalThis.document) {
  if (documentLike?.body?.dataset?.combinedWorld !== 'pocket-monster') return false;
  return POCKET_OFFLINE_NPC_MENU_ROOT_IDS.some(id => {
    const root = documentLike.getElementById?.(id);
    return Boolean(root && !root.classList?.contains?.('hidden'));
  });
}

export function installPocketOfflineNpcMenuBridge({
  documentLike = globalThis.document,
  windowLike = globalThis.window,
  parentWindow = windowLike?.parent,
  parentOrigin = windowLike?.location?.origin,
  signal,
} = {}) {
  if (!documentLike?.body) return null;

  let stopped = false;
  let lastOpen = null;
  let observer = null;
  const post = open => {
    try {
      parentWindow?.postMessage?.({
        type: POCKET_OFFLINE_NPC_MENU_MESSAGE,
        open: open === true,
        world: 'pocket-monster',
      }, parentOrigin || '*');
    } catch {}
  };
  const sync = () => {
    if (stopped) return false;
    const open = hasOpenPocketOfflineNpcMenu(documentLike);
    if (open === lastOpen) return false;
    lastOpen = open;
    post(open);
    return true;
  };
  const stop = () => {
    if (stopped) return false;
    stopped = true;
    observer?.disconnect?.();
    observer = null;
    if (lastOpen === true) post(false);
    return true;
  };

  const MutationObserverLike = windowLike?.MutationObserver;
  if (typeof MutationObserverLike === 'function') {
    observer = new MutationObserverLike(sync);
    observer.observe(documentLike.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-combined-world'],
    });
  }
  signal?.addEventListener?.('abort', stop, { once: true });
  sync();

  return Object.freeze({
    kind: POCKET_OFFLINE_NPC_MENU_BRIDGE_KIND,
    sync,
    stop,
    diagnostics: () => Object.freeze({
      open: lastOpen === true,
      observing: observer !== null,
      stopped,
    }),
  });
}
