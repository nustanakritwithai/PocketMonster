const MAJOR_MAPPINGS = [
  { sources: ['player-rig:hips'], target: 'hipsPivot' },
  { sources: ['player-rig:spine', 'player-rig:chest'], target: 'torsoPivot' },
  { sources: ['player-rig:head'], target: 'headPivot' },
  { sources: ['player-rig:left-arm'], target: 'leftArmRoot' },
  { sources: ['player-rig:right-arm'], target: 'rightArmRoot' },
  { sources: ['player-rig:left-leg'], target: 'leftLegRoot' },
  { sources: ['player-rig:right-leg'], target: 'rightLegRoot' },
];

const OPTIONAL_MAPPINGS = [
  { sources: ['player-rig:left-forearm'], targets: ['leftForearmPivot'] },
  { sources: ['player-rig:right-forearm'], targets: ['rightForearmPivot'] },
  { sources: ['player-rig:left-hand'], targets: ['leftHandPivot', 'leftHandAnchor'] },
  { sources: ['player-rig:right-hand'], targets: ['rightHandPivot', 'rightHandAnchor'] },
  { sources: ['player-rig:left-lower-leg'], targets: ['leftLowerLegPivot'] },
  { sources: ['player-rig:right-lower-leg'], targets: ['rightLowerLegPivot'] },
  { sources: ['player-rig:left-foot'], targets: ['leftFootPivot'] },
  { sources: ['player-rig:right-foot'], targets: ['rightFootPivot'] },
];

function indexNamedNodes(root) {
  const nodes = new Map();
  const seen = new Set();
  const visit = node => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (typeof node.name === 'string' && !nodes.has(node.name)) nodes.set(node.name, node);
    if (Array.isArray(node.children)) node.children.forEach(visit);
  };
  visit(root);
  return nodes;
}

function readRotation(rotation) {
  return {
    x: Number(rotation?.x) || 0,
    y: Number(rotation?.y) || 0,
    z: Number(rotation?.z) || 0,
  };
}

function readTargetRest(targetRig, target) {
  const stored = targetRig?.rest instanceof Map ? targetRig.rest.get(target) : null;
  if (stored) {
    return {
      x: Number(stored.rx ?? stored.x) || 0,
      y: Number(stored.ry ?? stored.y) || 0,
      z: Number(stored.rz ?? stored.z) || 0,
    };
  }
  return readRotation(target.rotation);
}

function shortestAngleDelta(current, rest) {
  const delta = current - rest;
  return Math.atan2(Math.sin(delta), Math.cos(delta));
}

function setRotation(target, x, y, z) {
  if (typeof target.rotation?.set === 'function') target.rotation.set(x, y, z);
  else if (target.rotation) Object.assign(target.rotation, { x, y, z });
}

export function createPirateFruitRigRetargeter(sourceHost, targetRig, options = {}) {
  void options;
  const sourceNodes = indexNamedNodes(sourceHost);
  const targets = targetRig?.pivots ?? targetRig ?? {};
  const mappings = [];
  const mappedTargets = new Set();
  let missingCount = 0;
  const definitions = [
    ...MAJOR_MAPPINGS.map(definition => ({ ...definition, targets: [definition.target], required: true })),
    ...OPTIONAL_MAPPINGS.map(definition => ({ ...definition, required: false })),
  ];

  for (const definition of definitions) {
    const targetName = definition.targets.find(name => (
      targets?.[name]?.rotation && !mappedTargets.has(targets[name])
    ));
    const hasClaimedTarget = definition.targets.some(name => (
      targets?.[name]?.rotation && mappedTargets.has(targets[name])
    ));
    const sourceName = definition.sources.find(name => sourceNodes.has(name));
    if (!definition.required && !targetName && (hasClaimedTarget || !sourceName)) continue;
    const source = sourceName ? sourceNodes.get(sourceName) : null;
    const target = targetName ? targets[targetName] : null;
    if (!source?.rotation || !target?.rotation) {
      missingCount += 1;
      continue;
    }
    mappedTargets.add(target);
    mappings.push({
      source,
      sourceName,
      target,
      sourceRest: readRotation(source.rotation),
      targetRest: readTargetRest(targetRig, target),
    });
  }

  return {
    update() {
      for (const mapping of mappings) {
        const current = readRotation(mapping.source.rotation);
        setRotation(
          mapping.target,
          mapping.targetRest.x + shortestAngleDelta(current.x, mapping.sourceRest.x),
          mapping.targetRest.y + shortestAngleDelta(current.y, mapping.sourceRest.y),
          mapping.targetRest.z + shortestAngleDelta(current.z, mapping.sourceRest.z),
        );
      }
    },
    diagnostics() {
      return {
        mappedCount: mappings.length,
        missingCount,
        mappedSourceNames: mappings.map(mapping => mapping.sourceName),
      };
    },
  };
}
