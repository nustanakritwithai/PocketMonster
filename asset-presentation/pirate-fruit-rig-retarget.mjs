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

function readScale(scale) {
  return {
    x: Number(scale?.x) || 1,
    y: Number(scale?.y) || 1,
    z: Number(scale?.z) || 1,
  };
}

function readSourceRest(source, options, { root = false } = {}) {
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
    return {
      rotation: readRotation(PIRATE_BIND_ROTATIONS[source?.name]),
      position: root ? readPosition() : readPosition(source?.position),
    };
  }
  return { rotation: readRotation(source?.rotation), position: readPosition(source?.position) };
}

function readSourceBindScale(source, options) {
  const bindPose = source?.userData?.bindPose;
  if (bindPose?.scale) return readScale(bindPose.scale);
  if (options?.sourceRestMode === 'bind') return { x: 1, y: 1, z: 1 };
  return readScale(source?.scale);
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

function setScale(target, x, y, z) {
  if (typeof target.scale?.set === 'function') target.scale.set(x, y, z);
  else if (target.scale) Object.assign(target.scale, { x, y, z });
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

function identityQuaternion(node) {
  const quaternion = node?.quaternion?.clone?.();
  if (!quaternion || typeof quaternion.set !== 'function') return null;
  return quaternion.set(0, 0, 0, 1);
}

function sourceChain(node, sourceRoot) {
  const chain = [];
  const seen = new Set();
  let current = node;
  while (current && !seen.has(current) && current !== sourceRoot) {
    seen.add(current);
    chain.unshift(current);
    current = current.parent;
  }
  return chain;
}

function chainQuaternion(chain, current) {
  const first = chain[0]?.node?.quaternion?.clone?.();
  if (!first || typeof first.multiply !== 'function') return null;
  const out = identityQuaternion(chain[0].node);
  if (!out) return null;
  for (const entry of chain) {
    const quaternion = current
      ? entry.node?.quaternion?.clone?.()
      : quaternionFromRotation(entry.node, entry.rotation);
    if (!quaternion) return null;
    out.multiply(quaternion);
  }
  return out;
}

function targetRestWorldQuaternion(targetRoot, target) {
  const chain = [];
  const seen = new Set();
  let current = target;
  while (current && current !== targetRoot && !seen.has(current)) {
    seen.add(current);
    chain.unshift(current);
    current = current.parent;
  }
  if (current !== targetRoot) return target?.quaternion?.clone?.() || null;
  const first = chain[0]?.quaternion?.clone?.();
  if (!first) return null;
  const out = identityQuaternion(chain[0]);
  if (!out) return null;
  for (const node of chain) out.multiply(node.quaternion.clone());
  return out;
}

function currentTargetParentQuaternion(targetRoot, target) {
  if (!target?.parent || target.parent === targetRoot) return identityQuaternion(targetRoot || target);
  return targetRestWorldQuaternion(targetRoot, target.parent);
}

function targetRestPosition(targetRig, target) {
  const stored = targetRig?.rest instanceof Map ? targetRig.rest.get(target) : null;
  return stored
    ? readPosition(stored)
    : readPosition(target?.position);
}

function targetRestScale(target) {
  return readScale(target?.scale);
}

function ratio(current, rest) {
  return (Number.isFinite(current) ? current : 1) / (Number.isFinite(rest) && rest !== 0 ? rest : 1);
}

// วัดเฉพาะผิวตัวละครในพิกัดของ actor จึงไม่เรียก scene/world hook ซ้ำ
// การยกร่างที่ล้มพ้นพื้นเปลี่ยนเฉพาะ overlay และคำนวณใหม่ทุกเฟรม ไม่สะสม offset
function createGroundContact(targetRoot) {
  const point = targetRoot?.position?.clone?.();
  if (!point?.applyMatrix4 || !targetRoot?.matrix?.clone) return null;
  const bounds = new Map();
  targetRoot.traverse?.(node => {
    if (!node.isMesh || !node.geometry || node.userData?.part === 'capture-ball') return;
    node.geometry.computeBoundingBox?.();
    const box = node.geometry.boundingBox;
    if (box) bounds.set(node, { min: box.min.clone(), max: box.max.clone() });
  });
  if (!bounds.size) return null;
  return () => {
    let lowest = Infinity;
    const visit = (node, parentMatrix) => {
      if (node.visible === false) return;
      if (node.matrixAutoUpdate !== false) node.updateMatrix?.();
      const matrix = parentMatrix ? parentMatrix.clone().multiply(node.matrix) : node.matrix.clone();
      const box = bounds.get(node);
      if (box) {
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) {
          for (const z of [box.min.z, box.max.z]) {
            point.set(x, y, z).applyMatrix4(matrix);
            lowest = Math.min(lowest, point.y);
          }
        }
      }
      for (const child of node.children || []) visit(child, matrix);
    };
    visit(targetRoot, null);
    if (Number.isFinite(lowest) && lowest < 0) targetRoot.position.y -= lowest;
  };
}

export function createPirateFruitRigRetargeter(sourceHost, targetRig, options = {}) {
  const sourceNodes = indexNamedNodes(sourceHost);
  const targets = targetRig?.pivots ?? targetRig ?? {};
  const mappings = [];
  const mappedTargets = new Set();
  let missingCount = 0;
  let requiredMappedCount = 0;
  const sourceRoot = options.sourceRootName ? sourceNodes.get(options.sourceRootName) : null;
  const targetRoot = options.targetRoot?.position && options.targetRoot?.rotation
    ? options.targetRoot
    : null;
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
    if (definition.required) requiredMappedCount += 1;
    const poseSourceName = [...definition.sources].reverse().find(name => sourceNodes.has(name)) || sourceName;
    const poseSource = sourceNodes.get(poseSourceName) || source;
    const chain = sourceRoot
      ? sourceChain(poseSource, sourceRoot)
      : [poseSource];
    const chainRest = chain.map(node => ({
      node,
      position: readSourceRest(node, options).position,
      rotation: readSourceRest(node, options).rotation,
      scale: readSourceBindScale(node, options),
    }));
    const sourceRest = readSourceRest(source, options);
    const targetRest = readTargetRest(targetRig, target);
    mappings.push({
      source,
      sourceName,
      poseSource,
      chainRest,
      target,
      sourceRest: sourceRest.rotation,
      targetRest,
      targetRestPosition: targetRestPosition(targetRig, target),
      targetRestScale: targetRestScale(target),
      targetRestQuaternion: quaternionFromRotation(target, targetRest),
      targetRestWorldQuaternion: targetRestWorldQuaternion(targetRoot, target),
    });
  }

  const rootRest = sourceRoot && targetRoot
    ? {
      source: readSourceRest(sourceRoot, options, { root: true }),
      target: { rotation: readRotation(targetRoot.rotation), position: readPosition(targetRoot.position) },
      sourceQuaternion: quaternionFromRotation(sourceRoot, readSourceRest(sourceRoot, options, { root: true }).rotation),
      targetQuaternion: quaternionFromRotation(targetRoot, readRotation(targetRoot.rotation)),
      sourceScale: readSourceBindScale(sourceRoot, options),
      targetScale: targetRestScale(targetRoot),
    }
    : null;
  const groundContact = options.keepGroundContact ? createGroundContact(targetRoot) : null;

  return {
    update() {
      if (rootRest) {
        const sourceRotation = readRotation(sourceRoot.rotation);
        const sourcePosition = readPosition(sourceRoot.position);
        if (rootRest.sourceQuaternion && rootRest.targetQuaternion && targetRoot.quaternion?.copy) {
          const sourceDelta = sourceRoot.quaternion.clone().multiply(rootRest.sourceQuaternion.clone().invert());
          targetRoot.quaternion.copy(sourceDelta.multiply(rootRest.targetQuaternion.clone()));
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
        if (targetRoot.scale && sourceRoot.scale) {
          const sourceScale = readScale(sourceRoot.scale);
          setScale(
            targetRoot,
            rootRest.targetScale.x * ratio(sourceScale.x, rootRest.sourceScale.x),
            rootRest.targetScale.y * ratio(sourceScale.y, rootRest.sourceScale.y),
            rootRest.targetScale.z * ratio(sourceScale.z, rootRest.sourceScale.z),
          );
        }
      }
      for (const mapping of mappings) {
        const currentChain = chainQuaternion(mapping.chainRest, true);
        const bindChain = chainQuaternion(mapping.chainRest, false);
        const sourceDelta = currentChain && bindChain
          ? currentChain.multiply(bindChain.clone().invert())
          : null;
        if (sourceDelta && mapping.targetRestWorldQuaternion && rootRest?.targetQuaternion) {
          const targetBasis = rootRest.targetQuaternion.clone();
          const desiredWorld = targetBasis.clone().invert()
            .multiply(sourceDelta)
            .multiply(targetBasis)
            .multiply(mapping.targetRestWorldQuaternion);
          const parentCurrent = currentTargetParentQuaternion(targetRoot, mapping.target);
          mapping.target.quaternion.copy(parentCurrent.clone().invert().multiply(desiredWorld));
        } else if (sourceDelta && mapping.targetRestQuaternion && mapping.target.quaternion?.copy) {
          mapping.target.quaternion.copy(mapping.targetRestQuaternion.clone().multiply(sourceDelta));
        } else {
          const current = readRotation(mapping.source.rotation);
          setRotation(
            mapping.target,
            mapping.targetRest.x + shortestAngleDelta(current.x, mapping.sourceRest.x),
            mapping.targetRest.y + shortestAngleDelta(current.y, mapping.sourceRest.y),
            mapping.targetRest.z + shortestAngleDelta(current.z, mapping.sourceRest.z),
          );
        }
        const terminal = mapping.poseSource || mapping.source;
        const terminalRest = mapping.chainRest[mapping.chainRest.length - 1];
        const currentPosition = readPosition(terminal.position);
        setPosition(
          mapping.target,
          mapping.targetRestPosition.x + currentPosition.x - terminalRest.position.x,
          mapping.targetRestPosition.y + currentPosition.y - terminalRest.position.y,
          mapping.targetRestPosition.z + currentPosition.z - terminalRest.position.z,
        );
        const currentScale = readScale(terminal.scale);
        let scaleX = ratio(currentScale.x, terminalRest.scale.x);
        let scaleY = ratio(currentScale.y, terminalRest.scale.y);
        let scaleZ = ratio(currentScale.z, terminalRest.scale.z);
        const targetParentIsMapped = mappings.some(other => other.target === mapping.target.parent);
        if (!targetParentIsMapped) {
          for (let index = 0; index < mapping.chainRest.length - 1; index += 1) {
            const ancestor = mapping.chainRest[index];
            const ancestorScale = readScale(ancestor.node.scale);
            scaleX *= ratio(ancestorScale.x, ancestor.scale.x);
            scaleY *= ratio(ancestorScale.y, ancestor.scale.y);
            scaleZ *= ratio(ancestorScale.z, ancestor.scale.z);
          }
        }
        if (mapping.target.scale) {
          setScale(
            mapping.target,
            mapping.targetRestScale.x * scaleX,
            mapping.targetRestScale.y * scaleY,
            mapping.targetRestScale.z * scaleZ,
          );
        }
      }
      if (groundContact && sourceRoot?.quaternion) {
        const { x, z } = sourceRoot.quaternion;
        // ท่าเดิน/กระโดด/พุ่งยังใช้ offset เดิม; จัดพื้นเมื่อร่างเอียงล้มมากแล้วเท่านั้น
        if (1 - 2 * (x * x + z * z) < 0.65) groundContact();
      }
    },
    diagnostics() {
      const diagnostics = {
        mappedCount: mappings.length,
        missingCount,
        mappedSourceNames: mappings.map(mapping => mapping.sourceName),
      };
      if (rootRest) diagnostics.rootMapped = true;
      if (rootRest) diagnostics.mappedRig = requiredMappedCount === MAJOR_MAPPINGS.length;
      return diagnostics;
    },
  };
}
