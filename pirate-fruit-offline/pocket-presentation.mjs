import * as pirateFruitThree from './assets/vendor-three-Bv6LZXUZ.js';
import { hookPirateFruitRenderer } from '../asset-presentation/pirate-fruit-client-bridge.mjs?v=1';
import {
  PIRATE_FRUIT_CONTROL_HUD_CSS,
  PIRATE_FRUIT_CONTROL_HUD_MESSAGE,
  PIRATE_FRUIT_CONTROL_HUD_STYLE_ID,
  PIRATE_FRUIT_DIALOGUE_MESSAGE,
} from '../pirate-fruit-control-hud-v900.mjs?v=8';
import { installPirateNpcNameChild } from '../pirate-npc-name-interaction-v900.mjs?v=10';

const parentOrigin = new URLSearchParams(location.search).get('parentOrigin');
window.addEventListener('pointerdown', event => {
  const target = event.target;
  if (target && typeof target.closest === 'function' && target.closest('.interaction-prompt, .dialogue-root')) {
    event.stopImmediatePropagation();
  }
}, { capture: true });
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
installPirateNpcNameChild({
  three: pirateFruitThree,
  windowLike: window,
  documentLike: document,
  parentOrigin,
});

const postDialogue = open => {
  try {
    window.parent?.postMessage({ type: PIRATE_FRUIT_DIALOGUE_MESSAGE, open: open === true }, parentOrigin || '*');
  } catch {}
};
const syncDialogue = () => {
  const root = document.querySelector('.dialogue-root');
  postDialogue(!!root && root.style.display === 'flex');
};
if (typeof MutationObserver === 'function') {
  new MutationObserver(syncDialogue).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['style', 'class'],
  });
}
