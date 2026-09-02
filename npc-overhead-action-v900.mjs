export const NPC_OVERHEAD_ACTION_KIND = 'pocketmonster:npc-overhead-action-v2';

const PROMOTED_ATTR = 'data-npc-overhead-action';
const OWNER_KEY = '__POCKETMONSTER_NPC_OVERHEAD_ACTION__';
const ACTION_TO_NAME = Object.freeze({
  'คุย': 'ผู้ดูแลฟาร์ม',
  'ร้านค้า': 'พ่อค้าเร่เสบียง',
  'ฝึก': 'ครูฝึกเรนเจอร์',
  'วิวัฒนาการ': 'นักวิจัยวิวัฒนาการ',
  'ผสมพันธุ์': 'ผู้ดูแลเพาะพันธุ์',
});
const NPC_NAMES = new Set(Object.values(ACTION_TO_NAME));

function syncNpcName(button) {
  if (!button) return false;
  const raw = String(button.textContent || '').trim();
  if (ACTION_TO_NAME[raw]) {
    button.dataset.npcAction = raw;
    const next = ACTION_TO_NAME[raw];
    if (button.textContent !== next) button.textContent = next;
    button.setAttribute?.('aria-label', `${next} • แตะเพื่อโต้ตอบ`);
    return true;
  }
  if (NPC_NAMES.has(raw)) {
    button.setAttribute?.('aria-label', `${raw} • แตะเพื่อโต้ตอบ`);
    return true;
  }
  const remembered = ACTION_TO_NAME[button.dataset?.npcAction];
  if (remembered && button.textContent !== remembered) button.textContent = remembered;
  return Boolean(remembered);
}

function applyOverheadPresentation(button) {
  if (!button?.style) return false;
  button.setAttribute?.(PROMOTED_ATTR, 'name');
  button.style.position = 'fixed';
  button.style.right = 'auto';
  button.style.bottom = 'auto';
  button.style.transform = 'translate(-50%, calc(-100% - 8px))';
  button.style.zIndex = '35';
  button.style.pointerEvents = 'auto';
  button.style.touchAction = 'manipulation';
  button.style.minHeight = '28px';
  button.style.padding = '3px 7px';
  button.style.borderRadius = '0';
  button.style.border = '0';
  button.style.background = 'transparent';
  button.style.color = '#fff';
  button.style.fontWeight = '800';
  button.style.fontSize = '13px';
  button.style.lineHeight = '1.2';
  button.style.boxShadow = 'none';
  button.style.backdropFilter = 'none';
  button.style.textShadow = '0 2px 4px rgba(0,0,0,.95), 0 0 3px rgba(0,0,0,.85)';
  button.style.cursor = 'pointer';
  syncNpcName(button);
  return true;
}

/**
 * Reuse the gameplay-owned npcBtn click handler but retire its button-like
 * presentation. game-v800.js already publishes the active NPC screen-space
 * head position through style.left/top. The same node is promoted out of the
 * retired HUD and rendered as the clickable NPC name at that head anchor.
 */
export function installNpcOverheadAction(documentLike = globalThis.document, windowLike = globalThis.window) {
  const button = documentLike?.getElementById?.('npcBtn');
  if (!button) return null;
  if (documentLike.body?.append && button.parentNode !== documentLike.body) {
    documentLike.body.append(button);
  }
  applyOverheadPresentation(button);

  let textObserver = null;
  if (typeof windowLike?.MutationObserver === 'function') {
    textObserver = new windowLike.MutationObserver(() => syncNpcName(button));
    textObserver.observe(button, { childList: true, characterData: true, subtree: true });
  }

  return Object.freeze({
    kind: NPC_OVERHEAD_ACTION_KIND,
    button,
    refresh() {
      applyOverheadPresentation(button);
      return syncNpcName(button);
    },
    stop() {
      textObserver?.disconnect?.();
      textObserver = null;
      return true;
    },
  });
}

export function watchNpcOverheadAction({
  documentLike = globalThis.document,
  windowLike = globalThis.window,
} = {}) {
  if (!documentLike || !windowLike) return null;
  const existing = windowLike[OWNER_KEY];
  if (existing?.kind === NPC_OVERHEAD_ACTION_KIND) return existing;
  existing?.stop?.();

  let observer = null;
  let binding = null;
  const bind = () => {
    binding = installNpcOverheadAction(documentLike, windowLike) || binding;
    if (binding && observer) {
      observer.disconnect();
      observer = null;
    }
    return binding;
  };

  bind();
  if (!binding && typeof windowLike.MutationObserver === 'function') {
    observer = new windowLike.MutationObserver(bind);
    observer.observe(documentLike.documentElement || documentLike, { childList: true, subtree: true });
  }

  const owner = Object.freeze({
    kind: NPC_OVERHEAD_ACTION_KIND,
    refresh: bind,
    stop() {
      observer?.disconnect?.();
      observer = null;
      binding?.stop?.();
      binding = null;
      return true;
    },
  });
  try { windowLike[OWNER_KEY] = owner; } catch {}
  return owner;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  watchNpcOverheadAction({ windowLike: window, documentLike: document });
}
