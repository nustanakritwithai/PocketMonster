import { ALLOWED_ROLES } from './schema.mjs';

export function normalizeAssetRequest(request = {}) {
  const errors = [];
  const assetId = request.assetId || request.id;
  const role = request.role;
  const appearanceId = request.appearanceId || null;
  const quality = request.quality || 'medium';
  if (typeof assetId !== 'string' || !assetId) errors.push('AssetRequest.assetId is required');
  if (!ALLOWED_ROLES.includes(role)) errors.push('AssetRequest.role must be player or keeper');
  if (errors.length) throw new Error(errors.join('; '));
  return Object.freeze({ assetId, role, appearanceId, quality });
}
