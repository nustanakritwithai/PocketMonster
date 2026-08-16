export const PRESENTATION_ANCHORS = Object.freeze([
  'throwOrigin', 'hitText', 'label', 'headTop', 'feet', 'backpack', 'staffTip', 'rightHand',
]);

export const GAMEPLAY_LOCKS = Object.freeze({
  cameraLookY: 1.10,
  keeperTalkRadius: 3.40,
  projectileDuration: 0.55,
  throwDuration: 0.34,
  skillDuration: 0.28,
  hurtDuration: 0.24,
});

export const LEGACY_FALLBACKS = Object.freeze({
  throwOriginY: 1.15,
  hitTextY: 1.45,
  labelY: 2.00,
});

export function isPresentationAnchor(name) {
  return PRESENTATION_ANCHORS.includes(name);
}

export function applyLegacyAnchor(name, rootPosition, target) {
  const out = target || { x: 0, y: 0, z: 0 };
  out.x = rootPosition.x;
  out.z = rootPosition.z;
  if (name === 'throwOrigin' || name === 'rightHand') out.y = rootPosition.y + LEGACY_FALLBACKS.throwOriginY;
  else if (name === 'hitText') out.y = rootPosition.y + LEGACY_FALLBACKS.hitTextY;
  else if (name === 'label' || name === 'headTop') out.y = rootPosition.y + LEGACY_FALLBACKS.labelY;
  else if (name === 'feet') out.y = rootPosition.y;
  else if (name === 'backpack') out.y = rootPosition.y + 1.02;
  else if (name === 'staffTip') out.y = rootPosition.y + 1.10;
  else out.y = rootPosition.y;
  return out;
}
