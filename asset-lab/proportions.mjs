export const PROPORTION_SHEET = Object.freeze({
  height: 1.8,
  headTopY: 1.8,
  recommended: 'B',
  locked: false,
  options: Object.freeze({
    A: Object.freeze({ id: 'A', head: [0.62, 0.68, 0.54], headY: 1.46, ratio: 0.378, status: 'comparison' }),
    B: Object.freeze({ id: 'B', head: [0.64, 0.72, 0.56], headY: 1.44, ratio: 0.400, status: 'recommended' }),
    C: Object.freeze({ id: 'C', head: [0.66, 0.76, 0.58], headY: 1.42, ratio: 0.422, status: 'comparison' }),
  }),
});

export const EVIDENCE_VIEWS = Object.freeze(['front', 'right', 'back', 'left', 'top', 'bottom', 'grayscale']);

export function proportionEvidence(optionId, { grayscale = false } = {}) {
  const option = PROPORTION_SHEET.options[optionId];
  if (!option) throw new Error(`unknown proportion ${optionId}`);
  const [w, h, d] = option.head;
  return {
    option: option.id,
    status: option.status,
    camera: { fov: 32, distance: 3.2, height: 1.2, lookY: 1.1 },
    pose: 'idle',
    scale: 1,
    metrics: {
      height: PROPORTION_SHEET.height,
      headTopY: PROPORTION_SHEET.headTopY,
      head: { w, h, d },
      headY: option.headY,
      ratio: option.ratio,
    },
    views: EVIDENCE_VIEWS.filter(view => grayscale || view !== 'grayscale' ? true : true),
    grayscale,
    seed: `bh0|${option.id}|${option.headY}|${w}x${h}x${d}|${grayscale ? 'gray' : 'color'}`,
  };
}

export function allProportionEvidence() {
  return ['A', 'B', 'C'].flatMap(id => [
    proportionEvidence(id),
    proportionEvidence(id, { grayscale: true }),
  ]);
}
