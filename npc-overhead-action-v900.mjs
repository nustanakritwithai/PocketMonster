export const NPC_OVERHEAD_ACTION_KIND = 'pocketmonster:npc-overhead-action-v1';

const PROMOTED_ATTR = 'data-npc-overhead-action';

function applyOverheadPresentation(button) {
  if (!button?.style) return false;
  button.setAttribute?.(PROMOTED_ATTR, 'true');
  button.style.position = 'fixed';
  button.style.right = 'auto';
  button.style.bottom = 'auto';
  button.style.transform = 'translate(-50%, calc(-100% - 10px))';
  button.style.zIndex = '35';
  button.style.pointerEvents = 'auto';
  button.style.touchAction = 'manipulation';
  button.style.minHeight = '36px';
  button.style.padding = '7px 12px';
  button.style.borderRadius = '999px';
  button.style.border = '1px solid rgba(255,255,255,.72)';
  button.style.background = 'rgba(15,23,42,.88)';
  button.style.color = '#fff';
  button.style.fontWeight = '800';
  button.style.boxShadow = '0 5px 18px rgba(0,0,0,.45)';
  button.style.backdropFilter = 'blur(5px)';
  return true;
}

/**
 * The gameplay runtime already publishes the active NPC's screen-space head
 * position through npcBtn.style.left/top. This adapter only moves the CTA out
 * of the retired legacy #hud and makes that point the bottom-center anchor of
 * the button, so the action floats above the NPC instead of behaving like a
 * fixed HUD control.
 */
export function installNpcOverheadAction(documentLike = globalThis.document) {
  const button = documentLike?.getElementById?.('npcBtn');
  if (!button) return null;
  if (documentLike.body?.append && button.parentNode !== documentLike.body) {
    documentLike.body.append(button);
  }
  applyOverheadPresentation(button);
  return Object.freeze({
    kind: NPC_OVERHEAD_ACTION_KIND,
    button,
    refresh() { return applyOverheadPresentation(button); },
  });
}
