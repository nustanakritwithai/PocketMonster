export const PIRATE_NPC_NAME_MESSAGE = 'pocketmonster:pirate-npc-name-v1';
export const PIRATE_NPC_NAME_PROXY_ID = 'pirateNpcNameHitProxy';
export const PIRATE_NPC_NAME_MAX_DISTANCE = 4.6;

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

function ownProto(value, name) {
  try { return !!Object.getOwnPropertyDescriptor(value?.prototype || {}, name); } catch { return false; }
}

function pirateObject3DFromVendor(vendor) {
  for (const value of Object.values(vendor || {})) {
    if (typeof value !== 'function') continue;
    if (ownProto(value, 'updateMatrixWorld') && ownProto(value, 'traverse') && ownProto(value, 'add')) return value;
  }
  return null;
}

/** Capture the live Pirate Fruit camera without weakening the opaque iframe. */
export function installPirateNpcCameraCapture(vendor) {
  const Object3D = pirateObject3DFromVendor(vendor);
  if (!Object3D?.prototype) return null;
  const original = Object3D.prototype.updateMatrixWorld;
  if (typeof original !== 'function') return null;
  if (typeof original[CAMERA_GETTER_PROP] === 'function') return original[CAMERA_GETTER_PROP];

  let camera = null;
  const getCamera = () => camera;
  function updateMatrixWorld(force) {
    if (this?.isCamera === true) camera = this;
    return original.call(this, force);
  }
  Object.defineProperty(updateMatrixWorld, CAMERA_GETTER_PROP, { value: getCamera });
  if (original.__pocketPirateBridge) {
    Object.defineProperty(updateMatrixWorld, '__pocketPirateBridge', { value: original.__pocketPirateBridge });
  }
  Object3D.prototype.updateMatrixWorld = updateMatrixWorld;
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
    if (image?.width !== 384 || image?.height !== 96) continue;
    const y = finite(child.position?.y);
    if (y === null || Math.abs(y - 3.55) > 0.45) continue;
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

export function findNearestPirateNpcNameAnchor(scene, playerPosition, maxDistance = PIRATE_NPC_NAME_MAX_DISTANCE) {
  if (!Array.isArray(scene?.children) || !playerPosition) return null;
  const px = finite(playerPosition.x);
  const pz = finite(playerPosition.z);
  if (px === null || pz === null) return null;
  const limit = Number.isFinite(maxDistance) && maxDistance > 0 ? maxDistance : PIRATE_NPC_NAME_MAX_DISTANCE;
  let best = null;
  let bestDistance = limit;
  for (const group of scene.children) {
    if (group?.visible === false) continue;
    const sprite = npcNameSprite(group);
    if (!sprite) continue;
    const gx = finite(group.position?.x);
    const gz = finite(group.position?.z);
    if (gx === null || gz === null) continue;
    const distance = Math.hypot(gx - px, gz - pz);
    if (distance >= bestDistance) continue;
    bestDistance = distance;
    best = Object.freeze({ group, sprite, distance });
  }
  return best;
}

export function projectPirateNpcNameAnchor({ sprite, camera, vectorSeed, width, height } = {}) {
  if (!sprite?.getWorldPosition || !camera || typeof vectorSeed?.clone !== 'function') return null;
  const viewportWidth = finite(width);
  const viewportHeight = finite(height);
  if (!(viewportWidth > 0) || !(viewportHeight > 0)) return null;
  const point = vectorSeed.clone();
  if (!point?.project) return null;
  camera.updateMatrixWorld?.();
  sprite.getWorldPosition(point);
  point.project(camera);
  if (![point.x, point.y, point.z].every(Number.isFinite)) return null;
  if (point.z < -1 || point.z > 1 || point.x < -1.15 || point.x > 1.15 || point.y < -1.15 || point.y > 1.15) return null;
  return Object.freeze({
    x: clamp((point.x + 1) / 2, 0, 1),
    y: clamp((1 - point.y) / 2, 0, 1),
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
    zIndex: '40',
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
  });
}

export function createPirateNpcNameParentProxy({ frame, documentLike = globalThis.document } = {}) {
  if (!frame || !documentLike?.createElement) return null;
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
    const rect = frame.getBoundingClientRect?.();
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
    if (event?.source !== frame.contentWindow || event?.origin !== 'null') return false;
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
    if (serialized === lastSerialized) return false;
    lastSerialized = serialized;
    windowLike.parent?.postMessage?.(stateMessage(rounded), trustedParentOrigin);
    return true;
  }

  function sync() {
    if (stopped) return inactiveState();
    if (documentLike.documentElement?.dataset?.pirateHud !== 'pirate-primary-parent') {
      currentName = '';
      post(inactiveState());
      return inactiveState();
    }
    const prompt = documentLike.querySelector?.('.interaction-prompt');
    const name = readPirateNpcPromptName(prompt);
    const camera = getCamera();
    const scene = name ? sceneFromCamera(camera) : null;
    const vectorSeed = name ? projectionSeed(camera) : null;
    const anchor = name ? findNearestPirateNpcNameAnchor(scene, camera?.position, 48) : null;
    const projected = anchor ? projectPirateNpcNameAnchor({
      sprite: anchor.sprite,
      camera,
      vectorSeed,
      width: windowLike.innerWidth,
      height: windowLike.innerHeight,
    }) : null;
    if (!name || !projected) {
      currentName = '';
      post(inactiveState());
      return inactiveState();
    }
    const nameLength = [...name].length;
    const widthPx = clamp(80 + nameLength * 10, 104, 180);
    const heightPx = 48;
    currentName = name;
    const state = Object.freeze({
      active: true,
      name,
      x: projected.x,
      y: projected.y,
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
    const prompt = documentLike.querySelector?.('.interaction-prompt');
    const liveName = readPirateNpcPromptName(prompt);
    if (!currentName || requestedName !== currentName || liveName !== currentName) return;
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
