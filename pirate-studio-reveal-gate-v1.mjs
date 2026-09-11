import {
  PIRATE_STUDIO_CHARACTER_ACCEPTED,
  PIRATE_STUDIO_CHARACTER_FAILED,
  PIRATE_STUDIO_CHARACTER_READY,
} from './asset-presentation/studio-character-pirate-channel.mjs?v=1';

const root = document.documentElement;
let activeFrame = null;

function releaseToken() {
  try {
    return new URL(location.href).searchParams.get('release')
      || window.parent?.POCKETMONSTER_RUNTIME_CONFIG?.deployedRelease
      || '';
  } catch {
    return '';
  }
}

function bindPirateFrameRelease() {
  const proto = globalThis.HTMLIFrameElement?.prototype;
  const descriptor = proto && Object.getOwnPropertyDescriptor(proto, 'src');
  if (!descriptor?.get || !descriptor?.set || descriptor.set.__pocketPirateReleaseBound) return;
  const nativeSet = descriptor.set;
  function setReleaseBoundSrc(value) {
    let next = value;
    try {
      const url = new URL(String(value), location.href);
      if (url.pathname.endsWith('/pirate-fruit-offline/index.html')) {
        const release = releaseToken();
        if (release) url.searchParams.set('release', release);
        next = url.href;
        if (this.id === 'pirateFruitFrame') setWaiting(this);
      }
    } catch {}
    return nativeSet.call(this, next);
  }
  setReleaseBoundSrc.__pocketPirateReleaseBound = true;
  Object.defineProperty(proto, 'src', { ...descriptor, set: setReleaseBoundSrc });
}

function statusNode() {
  return document.getElementById('sceneBootstrapStatus') || document.getElementById('startupStatus');
}

function currentFrame() {
  return document.getElementById('pirateFruitFrame');
}

function setWaiting(frame) {
  activeFrame = frame || null;
  delete root.dataset.pirateWorldReady;
  delete root.dataset.pirateStudioReady;
  root.dataset.pirateStudioGate = 'waiting-world';
  const status = statusNode();
  if (status) {
    status.textContent = 'กำลังเปิดโลก Pirate Fruit…';
    status.classList.remove('hidden', 'error');
  }
}

function armFrame(frame) {
  if (!frame || frame === activeFrame) return;
  setWaiting(frame);
}

function syncFrame() {
  const frame = currentFrame();
  if (frame && frame !== activeFrame) armFrame(frame);
}

bindPirateFrameRelease();
const observer = new MutationObserver(syncFrame);
observer.observe(document.documentElement, { childList: true, subtree: true });
syncFrame();

window.addEventListener('message', event => {
  const frame = currentFrame();
  if (!frame || event.source !== frame.contentWindow || event.origin !== 'null') return;
  const message = event.data;
  if (!message || message.capability !== frame.dataset.studioCapability) return;

  // READY is emitted only after the Pirate child has installed its renderer hook
  // and the local-player visibility guard. The world can safely become visible
  // now; Blue may continue loading asynchronously without blocking gameplay.
  if (message.type === PIRATE_STUDIO_CHARACTER_READY) {
    root.dataset.pirateWorldReady = 'true';
    root.dataset.pirateStudioGate = 'world-ready-blue-loading';
    statusNode()?.classList.add('hidden');
    return;
  }

  if (message.type === PIRATE_STUDIO_CHARACTER_ACCEPTED) {
    root.dataset.pirateStudioReady = 'true';
    root.dataset.pirateStudioGate = 'ready';
    statusNode()?.classList.add('hidden');
    return;
  }

  if (message.type === PIRATE_STUDIO_CHARACTER_FAILED) {
    delete root.dataset.pirateStudioReady;
    root.dataset.pirateStudioGate = 'blue-failed-world-live';
    // Never re-block the already-safe world. The legacy local player remains
    // hidden by the child guard, so a slow/unavailable Studio cannot hang boot
    // or reveal the old character.
    statusNode()?.classList.add('hidden');
  }
});
