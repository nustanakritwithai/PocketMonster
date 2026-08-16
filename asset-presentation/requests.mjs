import { ALLOWED_LIFE_STAGES, ALLOWED_ROLES, findGameplayFields } from './schema.mjs';

export function normalizeAssetRequest(request = {}) {
  const errors = [];
  const assetId = request.assetId || request.id;
  const role = request.role;
  const appearanceId = request.appearanceId || null;
  const quality = request.quality || 'medium';
  if (typeof assetId !== 'string' || !assetId) errors.push('AssetRequest.assetId is required');
  if (!ALLOWED_ROLES.includes(role)) errors.push('AssetRequest.role must be a catalog role');
  if (request.lifeStage && !ALLOWED_LIFE_STAGES.includes(request.lifeStage)) {
    errors.push('AssetRequest.lifeStage must be Baby, Juvenile, Adult, or Mature');
  }
  errors.push(...findGameplayFields(request).map(path => `gameplay field not allowed: ${path}`));
  if (errors.length) throw new Error(errors.join('; '));
  const normalized = { assetId, role, appearanceId, quality };
  if (request.formId) normalized.formId = request.formId;
  if (request.lifeStage) normalized.lifeStage = request.lifeStage;
  if (request.marks && typeof request.marks === 'object') {
    normalized.marks = Object.freeze({
      owned: !!request.marks.owned,
      elite: !!request.marks.elite,
      boss: !!request.marks.boss,
    });
  }
  return Object.freeze(normalized);
}
