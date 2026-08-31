export const PIRATE_FRUIT_CONTROL_HUD_STYLE_ID = 'pocketmonster-pirate-control-hud';
export const PIRATE_FRUIT_ORIGINAL_HUD = false;

/** Pirate Fruit keeps its gameplay runtime in the same-origin iframe, but the
 * parent v900 document is the only visible/touchable mobile control surface. */
export const PIRATE_FRUIT_CONTROL_HUD_CSS = `
html[data-pirate-hud="pirate-primary-parent"] .tc-root,
html[data-pirate-hud="pirate-primary-parent"] .hud-help {
  visibility: hidden !important;
  pointer-events: none !important;
}
`;

export function syncPirateFruitControlHud(frame = globalThis.document?.getElementById('pirateFruitFrame')) {
  const doc = frame?.contentDocument;
  if (!doc?.documentElement) return false;
  if (doc.head) {
    let style = doc.getElementById(PIRATE_FRUIT_CONTROL_HUD_STYLE_ID);
    if (!style) {
      style = doc.createElement('style');
      style.id = PIRATE_FRUIT_CONTROL_HUD_STYLE_ID;
      doc.head.appendChild(style);
    }
    style.textContent = PIRATE_FRUIT_CONTROL_HUD_CSS;
  }
  doc.documentElement.dataset.pirateHud = 'pirate-primary-parent';
  doc.documentElement.dataset.controlPanel = globalThis.document?.body?.dataset?.controlPanel || 'human';
  return true;
}
