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

// Authoring rest rotations from PiratePlayerVisual.ts. All other mapped
// pivots are authored at zero; the arms carry the small presentation splay.
const PIRATE_BIND_ROTATIONS = Object.freeze({
  'player-rig:left-arm': Object.freeze({ z: -0.08 }),
  'player-rig:right-arm': Object.freeze({ z: 0.08 }),
});

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
    x: Number(rotation?.x ?? rotation?.rx) || 0,
    y: Number(rotation?.y ?? rotation?.ry) || 0,
    z: Number(rotation?.z ?? rotation?.rz) || 0,
  };
}

function readPosition(position) {
  return {
    x: Number(position?.x ?? position?.px) || 0,
    y: Number(position?.y ?? position?.py) || 0,
    z: Number(position?.z ?? position?.pz) || 0,
  };
}

function readSourceRest(source, options) {
  const configured = options?.sourceRest?.get?.(source);
  if (configured) return {
    rotation: readRotation(configured.rotation || configured),
    position: readPosition(configured.position),
  };
  const bindPose = source?.userData?.bindPose;
  if (bindPose) return {
    rotation: readRotation(bindPose.rotation || bindPose),
    position: readPosition(bindPose.position),
  };
  if (options?.sourceRestMode === 'bind') {
    // Pirate V1 pivots are authored at zero except for the arm splay above.
    // This keeps a late overlay attach from treating an in-flight attack as
    // its bind pose while preserving the authored silhouette.
    return { rotation: readRotation(PIRATE_BIND_ROTATIONS[source?.name]), position: readPosition() };
  }
  return { rotation: readRotation(source?.rotation), position: readPosition(source?.position) };
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

function setPosition(target, x, y, z) {
  if (typeof target.position?.set === 'function') target.position.set(x, y, z);
  else if (target.position) Object.assign(target.position, { x, y, z });
}

function quaternionFromRotation(node, rotation) {
  const quaternion = node?.quaternion?.clone?.();
  const euler = node?.rotation?.clone?.();
  if (!quaternion || !euler || typeof quaternion.setFromEuler !== 'function' || typeof euler.set !== 'function') {
    return null;
  }
  euler.set(rotation.x, rotation.y, rotation.z);
  return quaternion.setFromEuler(euler);
}

export function createPirateFruitRigRetargeter(sourceHost, targetRig, options = {}) {
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
    const sourceRest = readSourceRest(source, options);
    mappings.push({
      source,
      sourceName,
      target,
      sourceRest: sourceRest.rotation,
      targetRest: readTargetRest(targetRig, target),
    });
  }

  const sourceRoot = options.sourceRootName ? sourceNodes.get(options.sourceRootName) : null;
  const targetRoot = options.targetRoot?.position && options.targetRoot?.rotation
    ? options.targetRoot
    : null;
  const rootRest = sourceRoot && targetRoot
    ? {
      source: readSourceRest(sourceRoot, options),
      target: { rotation: readRotation(targetRoot.rotation), position: readPosition(targetRoot.position) },
      sourceQuaternion: quaternionFromRotation(sourceRoot, readSourceRest(sourceRoot, options).rotation),
      targetQuaternion: quaternionFromRotation(targetRoot, readRotation(targetRoot.rotation)),
    }
    : null;

  return {
    update() {
      if (rootRest) {
        const sourceRotation = readRotation(sourceRoot.rotation);
        const sourcePosition = readPosition(sourceRoot.position);
        if (rootRest.sourceQuaternion && rootRest.targetQuaternion && targetRoot.quaternion?.copy) {
          const sourceInverse = rootRest.sourceQuaternion.clone();
          sourceInverse.invert?.();
          const sourceDelta = sourceInverse.multiply(sourceRoot.quaternion);
          targetRoot.quaternion.copy(rootRest.targetQuaternion.clone().multiply(sourceDelta));
        } else {
          setRotation(
            targetRoot,
            rootRest.target.rotation.x + shortestAngleDelta(sourceRotation.x, rootRest.source.rotation.x),
            rootRest.target.rotation.y + shortestAngleDelta(sourceRotation.y, rootRest.source.rotation.y),
            rootRest.target.rotation.z + shortestAngleDelta(sourceRotation.z, rootRest.source.rotation.z),
          );
        }
        setPosition(
          targetRoot,
          rootRest.target.position.x + sourcePosition.x - rootRest.source.position.x,
          rootRest.target.position.y + sourcePosition.y - rootRest.source.position.y,
          rootRest.target.position.z + sourcePosition.z - rootRest.source.position.z,
        );
      }
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
      const diagnostics = {
        mappedCount: mappings.length,
        missingCount,
        mappedSourceNames: mappings.map(mapping => mapping.sourceName),
      };
      if (rootRest) diagnostics.rootMapped = true;
      return diagnostics;
    },
  };
}
