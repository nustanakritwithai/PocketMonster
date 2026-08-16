export const MONSTER_SLIME_BUNDLE = 'monster-slimes';
export const MONSTER_ANIMAL_BUNDLE = 'monster-animals';
export const MONSTER_ID_RE = /^monster\.([a-z0-9_]+)\.([a-z0-9_]+)\.bighead\.v1$/;

export function resolveMonsterAssetId(speciesId, form = 'slime') {
  if (typeof speciesId !== 'string' || !speciesId) throw new Error('speciesId is required');
  const formKey = form || 'slime';
  if (!/^[a-z0-9_]+$/.test(speciesId) || !/^[a-z0-9_]+$/.test(formKey)) {
    throw new Error(`invalid monster id parts ${formKey}.${speciesId}`);
  }
  return `monster.${formKey}.${speciesId}.bighead.v1`;
}

export function parseMonsterAssetId(id) {
  const match = MONSTER_ID_RE.exec(id);
  if (!match) return null;
  return { form: match[1], speciesId: match[2] };
}
