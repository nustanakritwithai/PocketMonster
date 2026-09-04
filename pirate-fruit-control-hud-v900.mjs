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
  max-height: 22vh !important;
  overflow: auto !important;
  padding: 6px 8px 6px !important;
  border-radius: 10px !important;
  box-sizing: border-box !important;
}
html[data-pirate-hud="pirate-primary-parent"] .dialogue-name { font-size: 13px !important; }
html[data-pirate-hud="pirate-primary-parent"] .dialogue-role,
html[data-pirate-hud="pirate-primary-parent"] .dialogue-page { font-size: 9px !important; }
html[data-pirate-hud="pirate-primary-parent"] .dialogue-text {
  font-size: 11px !important;
  min-height: 20px !important;
  margin: 4px 0 6px !important;
  line-height: 1.35 !important;
}
html[data-pirate-hud="pirate-primary-parent"] .dialogue-close {
  font-size: 20px !important;
  min-width: 40px;
  min-height: 40px;
}
html[data-pirate-hud="pirate-primary-parent"] .dialogue-next,
html[data-pirate-hud="pirate-primary-parent"] .dialogue-action {
  min-height: 40px;
  padding: 4px 8px !important;
  font-size: 11px !important;
}
html[data-pirate-hud="pirate-primary-parent"] .quest-board-root,
html[data-pirate-hud="pirate-primary-parent"] .boat-shop-root,
html[data-pirate-hud="pirate-primary-parent"] .potion-shop-root,
html[data-pirate-hud="pirate-primary-parent"] .dealer-shop-root {
  align-items: flex-end !important;
  padding: 6px 8px 64px !important;
}
html[data-pirate-hud="pirate-primary-parent"] .quest-board,
html[data-pirate-hud="pirate-primary-parent"] .boat-shop,
html[data-pirate-hud="pirate-primary-parent"] .potion-shop,
html[data-pirate-hud="pirate-primary-parent"] .dealer-shop {
  width: min(380px, 100%) !important;
  max-height: 48vh !important;
  padding: 8px 10px !important;
  border-radius: 10px !important;
}
html[data-pirate-hud="pirate-primary-parent"] .quest-board h2,
html[data-pirate-hud="pirate-primary-parent"] .boat-shop-head h2,
html[data-pirate-hud="pirate-primary-parent"] .potion-shop-head h2,
html[data-pirate-hud="pirate-primary-parent"] .dealer-shop-head h2 {
  font-size: 14px !important;
}
html[data-pirate-hud="pirate-primary-parent"] .quest-board header p,
html[data-pirate-hud="pirate-primary-parent"] .boat-shop-head p,
html[data-pirate-hud="pirate-primary-parent"] .potion-shop-head p,
html[data-pirate-hud="pirate-primary-parent"] .dealer-shop-head p {
  font-size: 10px !important;
  margin: 2px 0 0 !important;
}
html[data-pirate-hud="pirate-primary-parent"] .quest-board-cards,
html[data-pirate-hud="pirate-primary-parent"] .boat-shop-cards,
html[data-pirate-hud="pirate-primary-parent"] .dealer-cards {
  grid-template-columns: 1fr !important;
  gap: 6px !important;
  margin-top: 8px !important;
}
html[data-pirate-hud="pirate-primary-parent"] .quest-card,
html[data-pirate-hud="pirate-primary-parent"] .boat-card,
html[data-pirate-hud="pirate-primary-parent"] .potion-card,
html[data-pirate-hud="pirate-primary-parent"] .dealer-card {
  padding: 8px !important;
}
html[data-pirate-hud="pirate-primary-parent"] .quest-card h3,
html[data-pirate-hud="pirate-primary-parent"] .boat-card h3,
html[data-pirate-hud="pirate-primary-parent"] .potion-card-body h4,
html[data-pirate-hud="pirate-primary-parent"] .dealer-card-body h4 {
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
