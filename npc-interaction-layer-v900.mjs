export const NPC_INTERACTION_LAYER_STYLE_ID = 'npcInteractionLayerV900';

const NPC_INTERACTION_LAYER_CSS = `
body[data-combined-world="pocket-monster"] #npcBtn.npc-btn {
  z-index: 30 !important;
  pointer-events: auto !important;
  touch-action: manipulation !important;
}
`;

/**
 * Keep the existing Pocket Monster NPC talk CTA above the persistent V9
 * joystick/camera control surface. The gameplay interaction remains owned by
 * game-v800.js; this module only fixes presentation/input stacking.
 */
export function installNpcInteractionLayer(documentLike = globalThis.document) {
  if (!documentLike?.createElement) return null;
  const existing = documentLike.getElementById?.(NPC_INTERACTION_LAYER_STYLE_ID);
  if (existing) return existing;

  const style = documentLike.createElement('style');
  style.id = NPC_INTERACTION_LAYER_STYLE_ID;
  style.textContent = NPC_INTERACTION_LAYER_CSS;
  documentLike.head?.append?.(style);
  return style;
}
