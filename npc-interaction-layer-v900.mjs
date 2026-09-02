export const NPC_INTERACTION_LAYER_STYLE_ID = 'npcInteractionLayerV900';

const NPC_INTERACTION_LAYER_CSS = `
#npcBtn.npc-btn:not(.hidden) {
  display: block !important;
  position: fixed !important;
  z-index: 1000 !important;
  pointer-events: auto !important;
  touch-action: manipulation !important;
}
`;

const NPC_INTERACTION_NODE_IDS = Object.freeze([
  'npcBtn',
  'merchantShop',
  'trainerPanel',
  'evolutionPanel',
  'breedingPanel',
  'ranchServices',
  'ranchStoragePage',
  'monsterManager',
  'monsterPicker',
]);

function promoteNpcInteractionNodes(documentLike) {
  const body = documentLike.body;
  if (!body?.append) return;
  for (const id of NPC_INTERACTION_NODE_IDS) {
    const node = documentLike.getElementById?.(id);
    if (node && node.parentNode !== body) body.append(node);
  }
}

/**
 * Keep the existing Pocket Monster NPC talk CTA above the persistent V9
 * joystick/camera control surface. The gameplay interaction remains owned by
 * game-v800.js; this module only fixes presentation/input stacking.
 */
export function installNpcInteractionLayer(documentLike = globalThis.document) {
  if (!documentLike?.createElement) return null;
  promoteNpcInteractionNodes(documentLike);
  const existing = documentLike.getElementById?.(NPC_INTERACTION_LAYER_STYLE_ID);
  if (existing) return existing;

  const style = documentLike.createElement('style');
  style.id = NPC_INTERACTION_LAYER_STYLE_ID;
  style.textContent = NPC_INTERACTION_LAYER_CSS;
  documentLike.head?.append?.(style);
  return style;
}
