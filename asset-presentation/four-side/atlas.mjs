import { atlasLayout, DEFAULT_ATLAS, FACE_ORDER } from './uv.mjs';
import { resolvePartFaces } from './fallback.mjs';

export function appearanceKey({ appearanceId, quality = 'medium', contentHash }) {
  return `${appearanceId}:${quality}:${contentHash}`;
}

export function hashAppearance(appearance) {
  const text = JSON.stringify(appearance);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function compileAppearance(appearance = {}, {
  tile = DEFAULT_ATLAS.tile,
  gutter = DEFAULT_ATLAS.gutter,
  atlas = DEFAULT_ATLAS.atlas,
  quality = 'medium',
} = {}) {
  const layout = atlasLayout({ tile, gutter, atlas });
  const parts = {};
  for (const [partName, part] of Object.entries(appearance.parts || {})) {
    parts[partName] = resolvePartFaces(part);
  }
  const compiled = {
    id: appearance.id || null,
    style: 'four-side-block-v1',
    mode: appearance.mode || 'fallback',
    materialCount: 1,
    layout,
    parts,
    quality,
  };
  compiled.contentHash = hashAppearance({ id: compiled.id, parts, layout: { tile, gutter, atlas } });
  compiled.cacheKey = appearanceKey({
    appearanceId: compiled.id || 'anonymous',
    quality,
    contentHash: compiled.contentHash,
  });
  return compiled;
}

export function faceList(compiled, partName) {
  const part = compiled.parts[partName];
  if (!part) return [];
  return FACE_ORDER.map(face => ({ face, ...part[face], uv: compiled.layout.faces[face].uv }));
}
