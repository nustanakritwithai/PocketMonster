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
html[data-pirate-hud="pirate-primary-parent"] .tc-root {
  display: none !important;
}
html[data-pirate-hud="pirate-primary-parent"] .graphics-setting,
html[data-pirate-hud="pirate-primary-parent"] .audio-toggle,
html[data-pirate-hud="pirate-primary-parent"] .audio-panel,
html[data-pirate-hud="pirate-primary-parent"] .inv-open-button,
html[data-pirate-hud="pirate-primary-parent"] .stats-open-button,
html[data-pirate-hud="pirate-primary-parent"] .stats-panel-root {
  display: none !important;
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
/* The parent ☸ button dispatches this exact native prompt signal.  Hide only
   the helm duplicate; generic interaction prompts (NPC, shops, boarding) keep
   their original visible/tappable UI.  Keep its inline display state: the
   native BoatManager reads that state. */
html[data-pirate-hud="pirate-primary-parent"] .interaction-prompt[data-unified-helm-proxy="true"] {
  visibility: hidden !important;
  pointer-events: none !important;
}
html[data-pirate-hud="pirate-primary-parent"] .dialogue-root {
  inset: auto !important;
  left: 4% !important;
  right: 4% !important;
  bottom: 108px !important;
  top: auto !important;
  padding: 0 !important;
  align-items: stretch !important;
  z-index: 80 !important;
}
html[data-pirate-hud="pirate-primary-parent"] .dialogue-card {
  width: 100% !important;
  max-width: 100% !important;
  height: auto !important;
  min-height: 0 !important;
  max-height: 70vh !important;
  overflow: auto !important;
  padding: 14px 16px 12px !important;
  border-radius: 12px !important;
  box-sizing: border-box !important;
}
html[data-pirate-hud="pirate-primary-parent"] .dialogue-name { font-size: 17px !important; }
html[data-pirate-hud="pirate-primary-parent"] .dialogue-role,
html[data-pirate-hud="pirate-primary-parent"] .dialogue-page { font-size: 12px !important; }
html[data-pirate-hud="pirate-primary-parent"] .dialogue-text {
  font-size: 16px !important;
  min-height: 0 !important;
  height: auto !important;
  margin: 8px 0 10px !important;
  line-height: 1.45 !important;
  white-space: pre-wrap !important;
  overflow-wrap: anywhere !important;
}
html[data-pirate-hud="pirate-primary-parent"] .dialogue-close {
  font-size: 22px !important;
  min-width: 44px;
  min-height: 44px;
}
html[data-pirate-hud="pirate-primary-parent"] .dialogue-next,
html[data-pirate-hud="pirate-primary-parent"] .dialogue-action {
  min-height: 44px;
  padding: 8px 12px !important;
  font-size: 15px !important;
}
html[data-pirate-hud="pirate-primary-parent"] .quest-board-root,
html[data-pirate-hud="pirate-primary-parent"] .boat-shop-root,
html[data-pirate-hud="pirate-primary-parent"] .potion-shop-root,
html[data-pirate-hud="pirate-primary-parent"] .dealer-shop-root {
  align-items: center !important;
  justify-content: center !important;
  inset: 0 !important;
  padding: max(12px, env(safe-area-inset-top, 0px)) 12px max(12px, env(safe-area-inset-bottom, 0px)) 12px !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
}
html[data-pirate-hud="pirate-primary-parent"] .quest-board,
html[data-pirate-hud="pirate-primary-parent"] .boat-shop,
html[data-pirate-hud="pirate-primary-parent"] .potion-shop,
html[data-pirate-hud="pirate-primary-parent"] .dealer-shop {
  width: min(280px, 72vw) !important;
  max-width: min(280px, 72vw) !important;
  height: auto !important;
  min-height: 0 !important;
  max-height: min(64vh, calc(100dvh - 96px)) !important;
  margin: 0 auto !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  overscroll-behavior: contain !important;
  padding: 10px 10px 8px !important;
  border-radius: 16px !important;
  box-sizing: border-box !important;
  box-shadow: 0 14px 36px #000a !important;
}
html[data-pirate-hud="pirate-primary-parent"] .quest-board-cards,
html[data-pirate-hud="pirate-primary-parent"] .boat-shop-cards,
html[data-pirate-hud="pirate-primary-parent"] .potion-shop-cards,
html[data-pirate-hud="pirate-primary-parent"] .dealer-cards {
  max-height: none !important;
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
