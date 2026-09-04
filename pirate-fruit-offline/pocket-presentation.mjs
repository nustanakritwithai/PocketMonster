import * as pirateFruitThree from './assets/vendor-three-Bv6LZXUZ.js';
import { hookPirateFruitRenderer } from '../asset-presentation/pirate-fruit-client-bridge.mjs?v=1';
import {
  PIRATE_FRUIT_CONTROL_HUD_CSS,
  PIRATE_FRUIT_CONTROL_HUD_MESSAGE,
  PIRATE_FRUIT_CONTROL_HUD_STYLE_ID,
  PIRATE_FRUIT_DIALOGUE_MESSAGE,
} from '../pirate-fruit-control-hud-v900.mjs?v=10';

const parentOrigin = new URLSearchParams(location.search).get('parentOrigin');
let skipVendorFullscreen = false;
window.addEventListener('pointerdown', event => {
  const target = event.target;
  skipVendorFullscreen = !!(target && typeof target.closest === 'function'
    && target.closest('.interaction-prompt, .dialogue-root, .quest-board-root, .boat-shop-root, .potion-shop-root, .dealer-shop-root, .inv-root'));
}, { capture: true });
const wrapFullscreen = () => {
  const root = document.documentElement;
  const current = root.requestFullscreen || root.webkitRequestFullscreen;
  if (typeof current !== 'function' || current.__pirateTalkSkip) return;
  const wrapped = function wrappedRequestFullscreen(options) {
    if (skipVendorFullscreen) return Promise.resolve(true);
    return current.call(this, options);
  };
  wrapped.__pirateTalkSkip = true;
  try {
    Object.defineProperty(root, 'requestFullscreen', { configurable: true, value: wrapped });
    if ('webkitRequestFullscreen' in root) {
      Object.defineProperty(root, 'webkitRequestFullscreen', { configurable: true, value: wrapped });
    }
  } catch {}
};
wrapFullscreen();
window.addEventListener('load', wrapFullscreen);
setTimeout(wrapFullscreen, 0);
setTimeout(wrapFullscreen, 400);
window.addEventListener('message', event => {
  if (event.source !== window.parent || event.origin !== parentOrigin) return;
  const message = event.data;
  if (message?.type !== PIRATE_FRUIT_CONTROL_HUD_MESSAGE || !['human', 'throw'].includes(message.panel)) return;
  let style = document.getElementById(PIRATE_FRUIT_CONTROL_HUD_STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = PIRATE_FRUIT_CONTROL_HUD_STYLE_ID;
    document.head?.appendChild(style);
  }
  style.textContent = PIRATE_FRUIT_CONTROL_HUD_CSS;
  document.documentElement.dataset.pirateHud = 'pirate-primary-parent';
  document.documentElement.dataset.controlPanel = message.panel;
});

hookPirateFruitRenderer(pirateFruitThree);

const postDialogue = open => {
  try {
    window.parent?.postMessage({ type: PIRATE_FRUIT_DIALOGUE_MESSAGE, open: open === true }, parentOrigin || '*');
  } catch {}
};
const OVERLAY_ROOTS = ['.dialogue-root', '.quest-board-root', '.boat-shop-root', '.potion-shop-root', '.dealer-shop-root', '.inv-root'];
const syncDialogue = () => {
  const open = OVERLAY_ROOTS.some(selector => document.querySelector(selector)?.style?.display === 'flex');
  postDialogue(open);
};
if (typeof MutationObserver === 'function') {
  new MutationObserver(syncDialogue).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['style', 'class'],
  });
}
