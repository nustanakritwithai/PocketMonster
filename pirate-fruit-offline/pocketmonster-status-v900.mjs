const STATUS_MESSAGE = 'pocketmonster:pirate-presence-status-v1';
const STATUS_ZONE = 'pirate-fruit';
const STATUS_SELECTOR = '[data-testid="server-status"]';

function requestedParentOrigin() {
  const value = new URLSearchParams(location.search).get('parentOrigin');
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const parentOrigin = requestedParentOrigin();
if (parentOrigin) {
  let connected = false;
  let banner = null;
  let applying = false;
  let bannerObserver = null;

  const setValue = (target, property, value) => {
    if (target && target[property] !== value) target[property] = value;
  };

  const applyStatus = () => {
    if (!banner || applying) return;
    applying = true;
    try {
      const label = banner.firstElementChild;
      const detail = banner.children[1];
      const mode = connected ? 'presence-online' : 'presence-connecting';
      const labelText = connected
        ? '🌐 WORLD ONLINE · SAVE LOCAL'
        : '⏳ กำลังเชื่อม WORLD ONLINE · SAVE LOCAL';
      const detailText = connected
        ? 'เห็นผู้เล่นผ่าน Pocket Monster · ข้อมูลเกมยังเซฟในเครื่อง'
        : 'กำลังรอ world presence จาก Pocket Monster';
      setValue(banner.dataset, 'mode', mode);
      setValue(label, 'textContent', labelText);
      setValue(detail, 'textContent', detailText);
      if (detail && detail.style.display !== 'block') detail.style.display = 'block';
      const color = connected ? '#dfffea' : '#fff7d6';
      const background = connected ? 'rgba(8, 116, 67, 0.91)' : 'rgba(128, 96, 0, 0.91)';
      if (banner.style.color !== color) banner.style.color = color;
      if (banner.style.background !== background) banner.style.background = background;
    } finally {
      applying = false;
    }
  };

  const bindBanner = () => {
    const next = document.querySelector(STATUS_SELECTOR);
    if (!next || next === banner) return;
    banner = next;
    bannerObserver?.disconnect();
    bannerObserver = new MutationObserver(applyStatus);
    bannerObserver.observe(banner, {
      attributes: true,
      attributeFilter: ['data-mode', 'style'],
      childList: true,
      characterData: true,
      subtree: true,
    });
    applyStatus();
  };

  const rootObserver = new MutationObserver(bindBanner);
  rootObserver.observe(document.documentElement, { childList: true, subtree: true });
  bindBanner();

  window.addEventListener('message', event => {
    if (event.source !== parent || event.origin !== parentOrigin) return;
    const message = event.data;
    if (!message || message.type !== STATUS_MESSAGE || message.zone !== STATUS_ZONE) return;
    if (typeof message.connected !== 'boolean') return;
    connected = message.connected;
    bindBanner();
    applyStatus();
  });
}
