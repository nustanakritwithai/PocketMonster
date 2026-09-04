export const PIRATE_NPC_NAME_MESSAGE = 'pocketmonster:pirate-npc-name-v1';
export const PIRATE_NPC_NAME_PROXY_ID = 'pirateNpcNameHitProxy';
export const PIRATE_NPC_NAME_MAX_DISTANCE = 12;

const NAME_LIMIT = 40;
const STATE_INTERVAL_MS = 80;
const CAMERA_GETTER_PROP = '__pocketNpcNameCameraGetter';

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safeName(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, NAME_LIMIT);
}

function resolveOrigin(value) {
  if (typeof value !== 'string' || !value) return '';
  try { return new URL(value).origin; } catch { return ''; }
}

function trustedNpcNameOrigin(origin, parentOrigin) {
  if (origin === 'null') return true;
  return Boolean(parentOrigin) && origin === parentOrigin;
}

function pirateNpcNameFromAnchor(anchor) {
  return safeName(anchor?.group?.userData?.name)
    || safeName(anchor?.group?.name)
    || safeName(anchor?.sprite?.userData?.name)
    || safeName(anchor?.sprite?.name)
    || 'NPC';
}

function ownProto(value, name) {
  try { return !!Object.getOwnPropertyDescriptor(value?.prototype || {}, name); } catch { return false; }
}

function specializedObject3DProto(proto) {
  return proto?.isCamera === true
    || proto?.isMesh === true
    || proto?.isGroup === true
    || proto?.isSprite === true
    || proto?.isScene === true;
}

function pirateObject3DFromVendor(vendor) {
  const candidates = [];
  for (const value of Object.values(vendor || {})) {
    if (typeof value !== 'function') continue;
    if (!(ownProto(value, 'updateMatrixWorld') && ownProto(value, 'traverse') && ownProto(value, 'add'))) continue;
    if (specializedObject3DProto(value.prototype)) continue;
    candidates.push(value);
  }
  if (!candidates.length) return null;
  for (const candidate of candidates) {
    if (candidates.some(other => other !== candidate && candidate.prototype instanceof other)) continue;
    return candidate;
  }
  return candidates[0];
}

/** Capture the live Pirate Fruit camera and scene without weakening the opaque iframe. */
export function installPirateNpcCameraCapture(vendor) {
  const Object3D = pirateObject3DFromVendor(vendor);
  if (!Object3D?.prototype) return null;
  const existing = Object3D.prototype.updateMatrixWorld;
  if (typeof existing === 'function' && typeof existing[CAMERA_GETTER_PROP] === 'function') {
    return existing[CAMERA_GETTER_PROP];
  }

  let camera = null;
  let scene = null;
  const getCamera = () => camera;
  getCamera.getScene = () => scene;

  function wrapUpdateMatrixWorld(ctor) {
    const original = ctor?.prototype?.updateMatrixWorld;
    if (typeof original !== 'function') return;
    if (typeof original[CAMERA_GETTER_PROP] === 'function') return;
    function updateMatrixWorld(force) {
      if (this?.isCamera === true) camera = this;
      if (this?.isScene === true) scene = this;
      return original.call(this, force);
    }
    Object.defineProperty(updateMatrixWorld, CAMERA_GETTER_PROP, { value: getCamera });
    if (original.__pocketPirateBridge) {
      Object.defineProperty(updateMatrixWorld, '__pocketPirateBridge', { value: original.__pocketPirateBridge });
    }
    ctor.prototype.updateMatrixWorld = updateMatrixWorld;
  }

  wrapUpdateMatrixWorld(Object3D);
  for (const value of Object.values(vendor || {})) {
    if (value === Object3D || typeof value !== 'function') continue;
    if (ownProto(value, 'updateMatrixWorld')) wrapUpdateMatrixWorld(value);
  }
  return getCamera;
}

function inactiveState() {
  return Object.freeze({ active: false, name: '', x: 0, y: 0, width: 0, height: 0 });
}

export function readPirateNpcPromptName(prompt) {
  if (!prompt || prompt.style?.display !== 'block') return '';
  const text = typeof prompt.textContent === 'string' ? prompt.textContent : '';
  if (!text.includes('คุยกับ')) return '';
  const strongs = [...(prompt.querySelectorAll?.('strong') || [])];
  return safeName(strongs.at(-1)?.textContent || '');
}

function npcNameSprite(group) {
  if (!Array.isArray(group?.children)) return null;
  for (const child of group.children) {
    if (child?.isSprite !== true) continue;
    const image = child.material?.map?.image;
    const width = finite(image?.width);
    const height = finite(image?.height);
    if (!(width > 0) || !(height > 0) || width < height) continue;
    const y = finite(child.position?.y);
    if (y === null || y < 1.2) continue;
    return child;
  }
  return null;
}

function sceneFromCamera(camera) {
  let node = camera || null;
  while (node?.parent) node = node.parent;
  return node;
}

function projectionSeed(camera) {
  const position = camera?.position;
  if (typeof position?.clone !== 'function') return null;
  const point = position.clone();
  if (typeof point?.project !== 'function') return null;
  return position;
}

function nodeChildren(node) {
  const children = node?.children;
  if (Array.isArray(children)) return children;
  if (children && typeof children[Symbol.iterator] === 'function') return [...children];
  return [];
}

function worldPositionTarget(group) {
  if (typeof group?.position?.clone === 'function') {
    const cloned = group.position.clone();
    if (cloned && typeof cloned.setFromMatrixPosition === 'function') return cloned;
  }
  return {
    x: 0,
    y: 0,
    z: 0,
    setFromMatrixPosition(matrix) {
      const e = matrix?.elements;
      if (e && e.length >= 15) {
        this.x = Number(e[12]);
        this.y = Number(e[13]);
        this.z = Number(e[14]);
      }
      return this;
    },
  };
}

function groupWorldXz(group) {
  if (typeof group?.getWorldPosition === 'function') {
    try {
      const world = worldPositionTarget(group);
      group.getWorldPosition(world);
      const gx = finite(world.x);
      const gz = finite(world.z);
      if (gx !== null && gz !== null) return { x: gx, z: gz };
    } catch {
      // Live THREE.Object3D.getWorldPosition throws unless the target is a Vector3.
    }
  }
  const gx = finite(group?.position?.x);
  const gz = finite(group?.position?.z);
  if (gx === null || gz === null) return null;
  return { x: gx, z: gz };
}

export function findNearestPirateNpcNameAnchor(scene, playerPosition, maxDistance = PIRATE_NPC_NAME_MAX_DISTANCE) {
  if (!scene || !playerPosition) return null;
  const px = finite(playerPosition.x);
  const pz = finite(playerPosition.z);
  if (px === null || pz === null) return null;
  const limit = Number.isFinite(maxDistance) && maxDistance > 0 ? maxDistance : PIRATE_NPC_NAME_MAX_DISTANCE;
  let best = null;
  let bestDistance = limit;
  const visit = (node) => {
    if (!node || node.visible === false) return;
    const sprite = npcNameSprite(node);
    if (sprite) {
      const xz = groupWorldXz(node);
      if (xz) {
        const distance = Math.hypot(xz.x - px, xz.z - pz);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = Object.freeze({ group: node, sprite, distance });
        }
      }
    }
    for (const child of nodeChildren(node)) visit(child);
  };
  visit(scene);
  return best;
}

export function projectPirateNpcNameAnchor({ sprite, camera, vectorSeed, width, height, group } = {}) {
  if (!sprite?.getWorldPosition || !camera || typeof vectorSeed?.clone !== 'function') return null;
  const viewportWidth = finite(width);
  const viewportHeight = finite(height);
  if (!(viewportWidth > 0) || !(viewportHeight > 0)) return null;
  const projected = vectorSeed.clone();
  if (!projected?.project) return null;
  camera.updateMatrixWorld?.();
  sprite.updateMatrixWorld?.();
  let wx = null;
  let wy = null;
  let wz = null;
  try {
    const world = worldPositionTarget(sprite);
    sprite.getWorldPosition(world);
    wx = finite(world.x);
    wy = finite(world.y);
    wz = finite(world.z);
  } catch {
    wx = wy = wz = null;
  }
  if (wx === null || wy === null || wz === null) {
    const xz = groupWorldXz(group || sprite.parent);
    const sy = finite(sprite.position?.y);
    if (!xz || sy === null) return null;
    wx = xz.x;
    wy = sy;
    wz = xz.z;
  }
  projected.x = wx;
  projected.y = wy;
  projected.z = wz;
  projected.project(camera);
  if (![projected.x, projected.y, projected.z].every(Number.isFinite)) return null;
  if (projected.z < -1 || projected.z > 1 || projected.x < -1.15 || projected.x > 1.15 || projected.y < -1.15 || projected.y > 1.15) return null;
  return Object.freeze({
    x: clamp((projected.x + 1) / 2, 0, 1),
    y: clamp((1 - projected.y) / 2, 0, 1),
  });
}

function sanitizeChildState(input) {
  if (!input || input.active !== true) return inactiveState();
  const name = safeName(input.name);
  const x = finite(input.x);
  const y = finite(input.y);
  const width = finite(input.width);
  const height = finite(input.height);
  if (!name || x === null || y === null || width === null || height === null) return inactiveState();
  if (x < 0 || x > 1 || y < 0 || y > 1 || width <= 0 || width > 0.5 || height <= 0 || height > 0.3) return inactiveState();
  return Object.freeze({ active: true, name, x, y, width, height });
}

function styleParentProxy(button) {
  Object.assign(button.style, {
    position: 'fixed',
    display: 'none',
    zIndex: '80',
    margin: '0',
    padding: '3px 10px',
    border: '2px solid rgba(255,226,145,.85)',
    outline: '0',
    borderRadius: '16px',
    background: 'linear-gradient(180deg, rgba(24,40,54,.94), rgba(10,22,32,.94))',
    color: '#ffdd7d',
    boxShadow: '0 2px 8px rgba(0,0,0,.45)',
    opacity: '1',
    pointerEvents: 'auto',
    touchAction: 'manipulation',
    transform: 'translate(-50%, 40%)',
    font: "700 12px 'Segoe UI',Tahoma,sans-serif",
    whiteSpace: 'nowrap',
    lineHeight: '1.2',
    width: 'auto',
    height: 'auto',
    minWidth: '48px',
    minHeight: '48px',
  });
}

export function createPirateNpcNameParentProxy({ frame, documentLike = globalThis.document, parentOrigin, layoutFrame } = {}) {
  if (!frame || !documentLike?.createElement) return null;
  const trustedParentOrigin = resolveOrigin(parentOrigin)
    || resolveOrigin(documentLike?.defaultView?.location?.href)
    || resolveOrigin(documentLike?.defaultView?.location?.origin)
    || resolveOrigin(globalThis.location?.href)
    || resolveOrigin(globalThis.location?.origin);
  let state = inactiveState();
  let button = documentLike.getElementById?.(PIRATE_NPC_NAME_PROXY_ID) || null;

  function ensureButton() {
    if (button) return button;
    button = documentLike.createElement('button');
    button.id = PIRATE_NPC_NAME_PROXY_ID;
    button.type = 'button';
    button.dataset.pirateNpcNameProxy = 'true';
    button.textContent = 'คุย';
    styleParentProxy(button);
    const sendActivate = event => {
      event.preventDefault?.();
      event.stopPropagation?.();
      if (!state.active) return;
      frame.contentWindow?.postMessage({ type: PIRATE_NPC_NAME_MESSAGE, kind: 'activate', name: state.name }, '*');
    };
    button.addEventListener('pointerdown', sendActivate);
    button.addEventListener('click', sendActivate);
    documentLike.body?.appendChild(button);
    return button;
  }

  function render() {
    const target = ensureButton();
    if (!target) return false;
    if (!state.active) {
      target.style.display = 'none';
      target.removeAttribute?.('aria-label');
      return false;
    }
    const rect = (layoutFrame || frame).getBoundingClientRect?.();
    if (!rect || !(rect.width > 0) || !(rect.height > 0)) {
      target.style.display = 'none';
      return false;
    }
    Object.assign(target.style, {
      display: 'block',
      left: `${rect.left + state.x * rect.width}px`,
      top: `${rect.top + state.y * rect.height}px`,
    });
    target.textContent = 'คุย';
    target.setAttribute?.('aria-label', `คุยกับ ${state.name}`);
    target.title = `คุยกับ ${state.name}`;
    return true;
  }

  function accept(event) {
    if (event?.source !== frame.contentWindow) return false;
    if (!trustedNpcNameOrigin(event.origin, trustedParentOrigin)) return false;
    const message = event.data;
    if (message?.type !== PIRATE_NPC_NAME_MESSAGE || message.kind !== 'state') return false;
    state = sanitizeChildState(message);
    render();
    return true;
  }

  function reset() {
    state = inactiveState();
    render();
    return true;
  }

  function destroy() {
    state = inactiveState();
    button?.remove?.();
    button = null;
    return true;
  }

  return Object.freeze({ accept, reset, render, destroy, snapshot: () => state });
}

function stateMessage(state) {
  return Object.freeze({ type: PIRATE_NPC_NAME_MESSAGE, kind: 'state', ...state });
}

export function requestOriginalPirateInteraction(prompt, windowLike = globalThis.window) {
  if (!prompt?.dispatchEvent) return false;
  const PointerEventCtor = windowLike?.PointerEvent || globalThis.PointerEvent;
  if (typeof PointerEventCtor === 'function') {
    return prompt.dispatchEvent(new PointerEventCtor('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerType: 'touch',
      isPrimary: true,
    }));
  }
  const EventCtor = windowLike?.Event || globalThis.Event;
  if (typeof EventCtor !== 'function') return false;
  return prompt.dispatchEvent(new EventCtor('pointerdown', {
    bubbles: true,
    cancelable: true,
  }));
}

export function installPirateNpcNameChild({
  three,
  windowLike = globalThis.window,
  documentLike = globalThis.document,
  parentOrigin,
  intervalMs = STATE_INTERVAL_MS,
} = {}) {
  if (!windowLike || !documentLike) return null;
  let trustedParentOrigin = '';
  try { trustedParentOrigin = new URL(parentOrigin).origin; } catch { return null; }
  const getCamera = installPirateNpcCameraCapture(three);
  if (typeof getCamera !== 'function') return null;
  let currentName = '';
  let lastSerialized = '';
  let stopped = false;
  let timer = 0;

  function post(state) {
    const rounded = state.active ? {
      ...state,
      x: Math.round(state.x * 10000) / 10000,
      y: Math.round(state.y * 10000) / 10000,
      width: Math.round(state.width * 10000) / 10000,
      height: Math.round(state.height * 10000) / 10000,
    } : inactiveState();
    const serialized = JSON.stringify(rounded);
    if (serialized === lastSerialized && !rounded.active) return false;
    lastSerialized = serialized;
    windowLike.parent?.postMessage?.(stateMessage(rounded), trustedParentOrigin);
    return true;
  }

  function sync() {
    if (stopped) return inactiveState();
    const integrated = Boolean(trustedParentOrigin)
      || documentLike.documentElement?.dataset?.pirateHud === 'pirate-primary-parent';
    if (!integrated) {
      currentName = '';
      post(inactiveState());
      return inactiveState();
    }
    const prompt = documentLike.querySelector?.('.interaction-prompt');
    const promptName = readPirateNpcPromptName(prompt);
    const camera = getCamera();
    const capturedScene = typeof getCamera.getScene === 'function' ? getCamera.getScene() : null;
    const scene = capturedScene || sceneFromCamera(camera);
    const nearby = findNearestPirateNpcNameAnchor(scene, camera?.position, PIRATE_NPC_NAME_MAX_DISTANCE);
    if (!promptName && !nearby) {
      currentName = '';
      post(inactiveState());
      return inactiveState();
    }
    const name = promptName || pirateNpcNameFromAnchor(nearby);
    const vectorSeed = projectionSeed(camera);
    const anchor = nearby || (promptName ? findNearestPirateNpcNameAnchor(scene, camera?.position, 48) : null);
    const projected = anchor ? projectPirateNpcNameAnchor({
      sprite: anchor.sprite,
      camera,
      vectorSeed,
      width: windowLike.innerWidth,
      height: windowLike.innerHeight,
      group: anchor.group,
    }) : null;
    const nameLength = [...name].length;
    const widthPx = clamp(80 + nameLength * 10, 104, 180);
    const heightPx = 48;
    currentName = name;
    const state = Object.freeze({
      active: true,
      name,
      x: projected?.x ?? 0.5,
      y: projected?.y ?? 0.32,
      width: clamp(widthPx / Math.max(1, windowLike.innerWidth), 0.08, 0.5),
      height: clamp(heightPx / Math.max(1, windowLike.innerHeight), 0.05, 0.3),
    });
    post(state);
    return state;
  }

  function onMessage(event) {
    if (event.source !== windowLike.parent || event.origin !== trustedParentOrigin) return;
    const message = event.data;
    if (message?.type !== PIRATE_NPC_NAME_MESSAGE || message.kind !== 'activate') return;
    const requestedName = safeName(message.name);
    if (!currentName || requestedName !== currentName) return;
    const prompt = documentLike.querySelector?.('.interaction-prompt');
    if (!prompt) return;
    requestOriginalPirateInteraction(prompt, windowLike);
  }

  windowLike.addEventListener?.('message', onMessage);
  sync();
  const schedule = windowLike.setInterval?.bind(windowLike) || globalThis.setInterval;
  if (typeof schedule === 'function') timer = schedule(sync, Math.max(50, Number(intervalMs) || STATE_INTERVAL_MS));

  function stop() {
    if (stopped) return false;
    stopped = true;
    windowLike.removeEventListener?.('message', onMessage);
    if (timer) {
      const clear = windowLike.clearInterval?.bind(windowLike) || globalThis.clearInterval;
      clear?.(timer);
      timer = 0;
    }
    currentName = '';
    lastSerialized = '';
    windowLike.parent?.postMessage?.(stateMessage(inactiveState()), trustedParentOrigin);
    return true;
  }

  return Object.freeze({ sync, stop, currentName: () => currentName });
}
