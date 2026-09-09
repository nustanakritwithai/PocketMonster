import { validateStudioCharacterPackage } from './studio-character-package.mjs';

export const STUDIO_CHARACTER_BRIDGE_URL = 'https://nustanakritwithai.github.io/3JS-player-block-asset-engine-/';
export const STUDIO_CHARACTER_BRIDGE_REQUEST = 'POCKET_STUDIO_CHARACTER_REQUEST';
export const STUDIO_CHARACTER_BRIDGE_RESPONSE = 'POCKET_STUDIO_CHARACTER_PACKAGE';
export const STUDIO_CHARACTER_BRIDGE_ERROR = 'POCKET_STUDIO_CHARACTER_ERROR';
export const STUDIO_CHARACTER_BRIDGE_DEFAULT_TIMEOUT_MS = 30000;
export const STUDIO_CHARACTER_BRIDGE_DEFAULT_RETRY_MS = 750;
export const STUDIO_CHARACTER_PRIMARY_MODEL_ID = 'blue-explorer-primary-v1';
export const STUDIO_CHARACTER_PRIMARY_NAME = 'Blue Explorer';
export const STUDIO_CHARACTER_PIVOT_CONTRACT = 'studio-rigid-pivot-local-axes-v1';
export const STUDIO_CHARACTER_REQUIRED_PIVOTS = Object.freeze([
  'pelvis', 'chest', 'neck', 'head',
  'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR',
  'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR',
]);

function requestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `studio-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function nodeAtPath(root, path) {
  let node = root;
  for (const index of Array.isArray(path) ? path : []) {
    node = node?.children?.[index];
    if (!node) return null;
  }
  return node || null;
}
function isFiniteVec(value, size) {
  return Array.isArray(value) && value.length >= size && value.slice(0, size).every(Number.isFinite);
}
function validPivotTransform(transform) {
  const rotation = transform?.rotation;
  return isFiniteVec(transform?.position, 3) && isFiniteVec(rotation, 3)
    && typeof rotation?.[3] === 'string' && rotation[3].length > 0
    && isFiniteVec(transform?.scale, 3) && transform.scale.every(value => Math.abs(value) > 0.000001);
}
function pathStartsWith(path, ancestor) {
  return Array.isArray(path) && Array.isArray(ancestor) && ancestor.length <= path.length
    && ancestor.every((value, index) => path[index] === value);
}
function findBlueExplorerMarker(root) {
  if (!root || typeof root !== 'object') return null;
  if (root.userData?.primaryCharacter === STUDIO_CHARACTER_PRIMARY_MODEL_ID
      && root.userData?.engineRole === 'primary-character') return root;
  for (const child of root.children || []) {
    const match = findBlueExplorerMarker(child);
    if (match) return match;
  }
  return null;
}
function pivotFrame(pkg, joint) {
  const binding = pkg?.rig?.jointBindings?.[joint];
  const node = binding ? nodeAtPath(pkg?.sceneGraph?.root, binding.path) : null;
  if (!binding || !node) return null;
  const rotation = node.transform?.rotation || [0, 0, 0, 'XYZ'];
  return Object.freeze({
    joint,
    path: [...binding.path],
    nodeName: node.name || binding.nodeName || null,
    position: [...(node.transform?.position || [0, 0, 0])],
    rotation: rotation.slice(0, 3),
    rotationOrder: rotation[3] || 'XYZ',
    scale: [...(node.transform?.scale || [1, 1, 1])],
  });
}

/**
 * Strict presentation contract for the Engine's current primary model.
 * A package can be generally valid but is not allowed to replace the game's
 * player unless the Blue Explorer rigid-pivot hierarchy is actually present.
 */
export function inspectBlueExplorerPrimaryPackage(pkg) {
  const errors = [];
  const root = pkg?.sceneGraph?.root;
  if (!root) errors.push('sceneGraph.root missing');
  if (!findBlueExplorerMarker(root)) errors.push(`primary marker ${STUDIO_CHARACTER_PRIMARY_MODEL_ID} missing`);
  const bindings = pkg?.rig?.jointBindings || {};
  const frames = {};
  for (const joint of STUDIO_CHARACTER_REQUIRED_PIVOTS) {
    const binding = bindings[joint];
    const node = binding ? nodeAtPath(root, binding.path) : null;
    if (!binding || !node) { errors.push(`required pivot ${joint} missing`); continue; }
    if (node.nodeType !== 'group') errors.push(`pivot ${joint} must resolve to a THREE.Group snapshot`);
    if (node.userData?.engineJointKey && node.userData.engineJointKey !== joint) errors.push(`pivot ${joint} engineJointKey mismatch`);
    if (!validPivotTransform(node.transform)) errors.push(`pivot ${joint} local transform/rotation order invalid`);
    frames[joint] = pivotFrame(pkg, joint);
  }
  const relations = [
    ['pelvis', 'chest'], ['chest', 'neck'], ['neck', 'head'],
    ['chest', 'shoulderL'], ['shoulderL', 'elbowL'], ['elbowL', 'wristL'],
    ['chest', 'shoulderR'], ['shoulderR', 'elbowR'], ['elbowR', 'wristR'],
    ['pelvis', 'hipL'], ['hipL', 'kneeL'], ['kneeL', 'ankleL'],
    ['pelvis', 'hipR'], ['hipR', 'kneeR'], ['kneeR', 'ankleR'],
  ];
  for (const [parent, child] of relations) {
    const parentPath = bindings[parent]?.path, childPath = bindings[child]?.path;
    if (parentPath && childPath && (!pathStartsWith(childPath, parentPath) || childPath.length <= parentPath.length)) {
      errors.push(`pivot hierarchy ${parent} -> ${child} is not preserved`);
    }
  }
  const sockets = pkg?.rig?.sockets || {};
  if (sockets.rightHand?.joint !== 'wristR') errors.push('rightHand socket must bind wristR');
  if (sockets.leftHand?.joint !== 'wristL') errors.push('leftHand socket must bind wristL');
  if (sockets.throwOrigin?.joint !== 'wristR') errors.push('throwOrigin socket must bind wristR');
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors), frames: Object.freeze(frames) });
}

/** Add game-facing aliases without changing gameplay authority or authored clips. */
export function promoteBlueExplorerGamePackage(pkg) {
  const out = typeof structuredClone === 'function' ? structuredClone(pkg) : JSON.parse(JSON.stringify(pkg));
  out.manifest = { ...(out.manifest || {}), name: STUDIO_CHARACTER_PRIMARY_NAME };
  out.catalogEntry = { ...(out.catalogEntry || {}), name: STUDIO_CHARACTER_PRIMARY_NAME };
  out.motionPack ??= {};
  out.motionPack.actionMap = { ...(out.motionPack.actionMap || {}) };
  const map = out.motionPack.actionMap;
  const captureThrow = map.capture_throw || map.capture_throw_r;
  const summonThrow = map.summon_monster_throw;
  const command = map.monster_command;
  if (captureThrow) map.throw = captureThrow; // current Pocket capture presentation call
  if (summonThrow) { map.summon = summonThrow; map.summon_throw = summonThrow; }
  if (command) { map.command = command; map.recall = command; }
  const inspection = inspectBlueExplorerPrimaryPackage(out);
  if (!inspection.valid) throw new Error(`Blue Explorer primary rig invalid: ${inspection.errors.join('; ')}`);
  out.rig = {
    ...(out.rig || {}),
    primaryCharacter: STUDIO_CHARACTER_PRIMARY_MODEL_ID,
    pivotContract: STUDIO_CHARACTER_PIVOT_CONTRACT,
    pivotFrames: Object.fromEntries(Object.entries(inspection.frames).map(([key, value]) => [key, { ...value }])),
  };
  return out;
}

export function loadStudioCharacterFromEngine({
  sourceUrl = STUDIO_CHARACTER_BRIDGE_URL,
  characterId = 'character.human.pirate.studio-live',
  displayName = STUDIO_CHARACTER_PRIMARY_NAME,
  timeoutMs = STUDIO_CHARACTER_BRIDGE_DEFAULT_TIMEOUT_MS,
  retryMs = STUDIO_CHARACTER_BRIDGE_DEFAULT_RETRY_MS,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
} = {}) {
  if (!documentRef?.createElement || !documentRef?.body || !windowRef?.addEventListener) {
    return Promise.reject(new Error('Studio character bridge needs a browser document'));
  }

  const targetUrl = new URL(sourceUrl, windowRef.location?.href || STUDIO_CHARACTER_BRIDGE_URL);
  targetUrl.searchParams.set('pocketBridge', '1');
  const targetOrigin = targetUrl.origin;
  const id = requestId();
  const frame = documentRef.createElement('iframe');
  frame.title = 'Pocket Monster Character Studio bridge';
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.loading = 'eager';
  frame.style.display = 'none';
  frame.src = targetUrl.href;

  const startedAt = Date.now();
  const diagnostics = {
    state: 'loading',
    sourceUrl: targetUrl.href,
    targetOrigin,
    requestId: id,
    primaryCharacter: STUDIO_CHARACTER_PRIMARY_MODEL_ID,
    pivotContract: STUDIO_CHARACTER_PIVOT_CONTRACT,
    attempts: 0,
    frameLoaded: false,
    frameError: false,
    lastAttemptAt: null,
    lastAttemptReason: null,
    lastMessageType: null,
    lastError: null,
    completedAt: null,
  };
  const readDiagnostics = () => Object.freeze({
    ...diagnostics,
    elapsedMs: Math.max(0, (diagnostics.completedAt || Date.now()) - startedAt),
  });
  try { windowRef.POCKETMONSTER_STUDIO_CHARACTER_BRIDGE_DIAGNOSTICS = readDiagnostics; } catch {}

  return new Promise((resolve, reject) => {
    let settled = false;
    let retryTimer = null;
    const finish = (fn, value, state, error = null) => {
      if (settled) return;
      settled = true;
      diagnostics.state = state;
      diagnostics.lastError = error ? String(error?.message || error) : diagnostics.lastError;
      diagnostics.completedAt = Date.now();
      clearTimeout(timer);
      if (retryTimer != null) clearInterval(retryTimer);
      windowRef.removeEventListener('message', onMessage);
      frame.remove();
      fn(value);
    };
    const sendRequest = reason => {
      if (settled || !frame.contentWindow) return;
      diagnostics.attempts += 1;
      diagnostics.lastAttemptAt = Date.now();
      diagnostics.lastAttemptReason = reason;
      try {
        frame.contentWindow.postMessage({
          type: STUDIO_CHARACTER_BRIDGE_REQUEST,
          requestId: id,
          characterId,
          displayName,
        }, targetOrigin);
      } catch (error) {
        diagnostics.lastError = String(error?.message || error);
      }
    };
    const onMessage = event => {
      if (event.origin !== targetOrigin || event.source !== frame.contentWindow) return;
      const message = event.data;
      if (!message || message.requestId !== id) return;
      diagnostics.lastMessageType = message.type || null;
      if (message.type === STUDIO_CHARACTER_BRIDGE_ERROR) {
        const error = new Error(message.message || 'Character Studio bridge failed');
        diagnostics.lastError = error.message;
        if (/not ready/i.test(error.message)) {
          diagnostics.state = 'waiting-for-engine';
          return;
        }
        finish(reject, error, 'engine-error', error);
        return;
      }
      if (message.type !== STUDIO_CHARACTER_BRIDGE_RESPONSE) return;
      const result = validateStudioCharacterPackage(message.package);
      if (!result.valid) {
        const error = new Error(`Invalid Studio character package: ${result.errors.join('; ')}`);
        finish(reject, error, 'invalid-package', error);
        return;
      }
      try {
        const primary = promoteBlueExplorerGamePackage(message.package);
        const promotedValidation = validateStudioCharacterPackage(primary);
        if (!promotedValidation.valid) throw new Error(promotedValidation.errors.join('; '));
        diagnostics.state = 'validated-blue-explorer';
        finish(resolve, primary, 'validated-blue-explorer');
      } catch (cause) {
        const error = new Error(`Blue Explorer primary package rejected: ${cause?.message || cause}`);
        finish(reject, error, 'invalid-primary-rig', error);
      }
    };
    const timer = setTimeout(() => {
      const error = new Error(`Character Studio bridge timed out after ${Math.max(250, timeoutMs)}ms (${diagnostics.attempts} request attempt(s))`);
      finish(reject, error, 'timeout', error);
    }, Math.max(250, timeoutMs));
    windowRef.addEventListener('message', onMessage);
    frame.addEventListener('load', () => {
      diagnostics.frameLoaded = true;
      diagnostics.state = 'requesting';
      sendRequest('frame-load');
    }, { once: true });
    frame.addEventListener?.('error', () => {
      diagnostics.frameError = true;
      diagnostics.lastError = 'Character Studio iframe load error';
    }, { once: true });
    documentRef.body.appendChild(frame);
    // The Studio page performs top-level async module boot before its message
    // listener exists. Retry the same authenticated request until that listener
    // is ready instead of assuming one iframe load edge is sufficient.
    retryTimer = setInterval(() => sendRequest('readiness-retry'), Math.max(100, retryMs));
    queueMicrotask(() => sendRequest('initial'));
  });
}
