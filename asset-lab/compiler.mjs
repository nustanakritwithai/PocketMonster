import { compileAppearance } from '../asset-presentation/four-side/atlas.mjs';

export function normalizeLabInput(input = {}) {
  const mode = input.mode || (input.strip ? 'strip' : input.front ? 'four' : 'single');
  const part = input.part || 'head';
  const parts = { [part]: {} };
  if (mode === 'single') {
    parts[part].single = input.single || input.image || null;
  } else if (mode === 'strip') {
    const frames = input.stripFrames || ['front', 'right', 'back', 'left'];
    frames.forEach((face, i) => {
      parts[part][face] = input.strip?.[i] || `${input.stripId || 'strip'}.${face}`;
    });
  } else {
    for (const face of ['front', 'right', 'back', 'left', 'top', 'bottom']) {
      if (input[face]) parts[part][face] = input[face];
    }
  }
  if (input.topColor) parts[part].topColor = input.topColor;
  if (input.bottomColor) parts[part].bottomColor = input.bottomColor;
  return {
    id: input.id || `appearance.lab.${part}.v1`,
    style: 'four-side-block-v1',
    mode,
    parts,
  };
}

export function compileLabAppearance(input, options) {
  return compileAppearance(normalizeLabInput(input), options);
}

export function exportAppearancePacket(compiled) {
  return {
    appearance: {
      id: compiled.id,
      style: compiled.style,
      mode: compiled.mode,
      contentHash: compiled.contentHash,
    },
    atlas: {
      size: compiled.layout.atlas,
      gutter: compiled.layout.gutter,
      materialCount: compiled.materialCount,
    },
    cacheKey: compiled.cacheKey,
  };
}
