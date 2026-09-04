export const PIRATE_FRUIT_CONTROL_HUD_STYLE_ID = 'pocketmonster-pirate-control-hud';
export const PIRATE_FRUIT_ORIGINAL_HUD = false;
export const PIRATE_FRUIT_CONTROL_HUD_MESSAGE = 'pocketmonster:pirate-control-v1';
export const PIRATE_FRUIT_DIALOGUE_MESSAGE = 'pocketmonster:pirate-dialogue-v1';

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
html[data-pirate-hud="pirate-primary-parent"] .onboarding-root {
  display: none !important;
  pointer-events: none !important;
}
html[data-pirate-hud="pirate-primary-parent"] .interaction-prompt {
  bottom: 120px !important;
  pointer-events: auto !important;
  z-index: 40 !important;
}
html[data-pirate-hud="pirate-primary-parent"] .dialogue-root {
  inset: auto !important;
  left: 10% !important;
  right: 10% !important;
  bottom: 120px !important;
  top: auto !important;
  padding: 0 !important;
  align-items: stretch !important;
  z-index: 80 !important;
}
html[data-pirate-hud="pirate-primary-parent"] .dialogue-card {
  width: 100% !important;
  max-width: 100% !important;
  max-height: 28vh !important;
  overflow: auto !important;
  padding: 8px 10px 8px !important;
  border-radius: 12px !important;
  box-sizing: border-box !important;
}
html[data-pirate-hud="pirate-primary-parent"] .dialogue-name { font-size: 14px !important; }
html[data-pirate-hud="pirate-primary-parent"] .dialogue-role,
html[data-pirate-hud="pirate-primary-parent"] .dialogue-page { font-size: 10px !important; }
html[data-pirate-hud="pirate-primary-parent"] .dialogue-text {
  font-size: 12px !important;
  min-height: 28px !important;
  margin: 6px 0 8px !important;
  line-height: 1.4 !important;
}
html[data-pirate-hud="pirate-primary-parent"] .dialogue-close {
  font-size: 22px !important;
  min-width: 44px;
  min-height: 44px;
}
html[data-pirate-hud="pirate-primary-parent"] .dialogue-next,
html[data-pirate-hud="pirate-primary-parent"] .dialogue-action {
  min-height: 44px;
  padding: 6px 10px !important;
  font-size: 12px !important;
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
