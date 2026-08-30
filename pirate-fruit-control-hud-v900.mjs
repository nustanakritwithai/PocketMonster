export const PIRATE_FRUIT_CONTROL_HUD_STYLE_ID = 'pocketmonster-pirate-control-hud';
export const PIRATE_FRUIT_ORIGINAL_HUD = true;

/** Keep the vendored Pirate Fruit HUD. Human panel must not restyle the desktop
 *  rectangular tray or hide the keyboard help rectangle. Throw only hides PF
 *  combat chrome so Pocket animal control can take the overlay. */
export const PIRATE_FRUIT_CONTROL_HUD_CSS = `
html[data-pirate-hud="original"] .hud-help { display: block; }
html[data-pirate-hud="original"][data-control-panel="throw"] .tc-btn,
html[data-pirate-hud="original"][data-control-panel="throw"] .tc-skill-cancel,
html[data-pirate-hud="original"][data-control-panel="throw"] .hud-help {
  display: none !important;
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
  doc.documentElement.dataset.pirateHud = 'original';
  doc.documentElement.dataset.controlPanel = globalThis.document?.body?.dataset?.controlPanel || 'human';
  return true;
}
