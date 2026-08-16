export const MONSTER_BUNDLE = 'monster-core';
export const MONSTER_ID_RE = /^monster\.([a-z0-9_]+)\.([a-z0-9_]+)\.v1$/;

export function resolveMonsterAssetId(speciesId, formKey = 'base') {
  if (typeof speciesId !== 'string' || !speciesId) throw new Error('speciesId is required');
  const form = formKey || 'base';
  if (!/^[a-z0-9_]+$/.test(speciesId) || !/^[a-z0-9_]+$/.test(form)) {
    throw new Error(`invalid monster id parts ${speciesId}.${form}`);
  }
  return `monster.${speciesId}.${form}.v1`;
}

export function parseMonsterAssetId(id) {
  const match = MONSTER_ID_RE.exec(id);
  if (!match) return null;
  return { speciesId: match[1], formKey: match[2] };
}
