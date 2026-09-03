export const PIRATE_FRUIT_CONTROL_HUD_STYLE_ID = 'pocketmonster-pirate-control-hud';
export const PIRATE_FRUIT_ORIGINAL_HUD = false;
export const PIRATE_FRUIT_CONTROL_HUD_MESSAGE = 'pocketmonster:pirate-control-v1';

/** Pirate Fruit keeps its gameplay runtime in an opaque-origin sandbox, while
 * the parent v900 document is the only visible/touchable mobile control surface. */
export const PIRATE_FRUIT_CONTROL_HUD_CSS = `
html[data-pirate-hud="pirate-primary-parent"] .tc-root,
html[data-pirate-hud="pirate-primary-parent"] .hud-help,
html[data-pirate-hud="pirate-primary-parent"] .game-minimap {
  visibility: hidden !important;
  pointer-events: none !important;
}
html[data-pirate-hud="pirate-primary-parent"] .progression-hud {
  opacity: 0 !important;
  pointer-events: none !important;
}
html[data-pirate-hud="pirate-primary-parent"] .fullscreen-prompt-root,
html[data-pirate-hud="pirate-primary-parent"] .onboarding-root,
html[data-pirate-hud="pirate-primary-parent"] .interaction-prompt {
  display: none !important;
  pointer-events: none !important;
}
`;

export function syncPirateFruitControlHud(frame = globalThis.document?.getElementById('pirateFruitFrame')) {
  if (!frame?.contentWindow?.postMessage) return false;
  frame.contentWindow.postMessage({
    type: PIRATE_FRUIT_CONTROL_HUD_MESSAGE,
    panel: globalThis.document?.body?.dataset?.controlPanel || 'human',
  }, '*');
  return true;
}
