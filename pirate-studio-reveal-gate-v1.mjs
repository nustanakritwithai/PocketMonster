import {
  PIRATE_STUDIO_CHARACTER_ACCEPTED,
  PIRATE_STUDIO_CHARACTER_FAILED,
} from './asset-presentation/studio-character-pirate-channel.mjs?v=1';

const root = document.documentElement;
let activeFrame = null;

function statusNode() {
  return document.getElementById('sceneBootstrapStatus') || document.getElementById('startupStatus');
}

function currentFrame() {
  return document.getElementById('pirateFruitFrame');
}

function setWaiting(frame) {
  activeFrame = frame || null;
  delete root.dataset.pirateStudioReady;
  root.dataset.pirateStudioGate = 'waiting';
  const status = statusNode();
  if (status) {
    status.textContent = 'กำลังโหลด Blue Explorer…';
    status.classList.remove('hidden', 'error');
  }
}

function armFrame(frame) {
  if (!frame || frame === activeFrame) return;
  setWaiting(frame);
  frame.addEventListener('load', () => {
    if (currentFrame() === frame) setWaiting(frame);
  });
}

function syncFrame() {
  const frame = currentFrame();
  if (frame && frame !== activeFrame) armFrame(frame);
}

const observer = new MutationObserver(syncFrame);
observer.observe(document.documentElement, { childList: true, subtree: true });
syncFrame();

window.addEventListener('message', event => {
  const frame = currentFrame();
  if (!frame || event.source !== frame.contentWindow || event.origin !== 'null') return;
  const message = event.data;
  if (!message || message.capability !== frame.dataset.studioCapability) return;

  if (message.type === PIRATE_STUDIO_CHARACTER_ACCEPTED) {
    root.dataset.pirateStudioGate = 'settling';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (currentFrame() !== frame) return;
      root.dataset.pirateStudioReady = 'true';
      root.dataset.pirateStudioGate = 'ready';
      statusNode()?.classList.add('hidden');
    }));
    return;
  }

  if (message.type === PIRATE_STUDIO_CHARACTER_FAILED) {
    delete root.dataset.pirateStudioReady;
    root.dataset.pirateStudioGate = 'failed';
    const status = statusNode();
    if (status) {
      status.textContent = 'โหลด Blue Explorer ไม่สำเร็จ • ไม่แสดงเวอร์ชันเก่า';
      status.classList.remove('hidden');
      status.classList.add('error');
    }
  }
});
