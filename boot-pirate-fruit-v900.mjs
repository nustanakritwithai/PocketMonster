import { syncPirateFruitControlHud } from './pirate-fruit-control-hud-v900.mjs';

export const PIRATE_FRUIT_OFFLINE_ENTRY = './pirate-fruit-offline/index.html';
export const POCKET_ANIMAL_CONTROL_RUNTIME = './game-v800.js?v=810&animalControl=pirate-fruit';

const startup = document.getElementById('startupStatus');
const game = document.getElementById('game');
if (!game) throw new Error('missing #game for Pirate Fruit offline boot');

let throwRuntimePromise = null;

export function ensurePocketAnimalControl() {
  if (typeof window !== 'undefined' && window.POCKETMONSTER_ANIMAL_CONTROL) {
    return Promise.resolve(window.POCKETMONSTER_ANIMAL_CONTROL);
  }
  if (!throwRuntimePromise) {
    throwRuntimePromise = import('./game-v800.js?v=810&animalControl=pirate-fruit').then(() => {
      const control = window.POCKETMONSTER_ANIMAL_CONTROL;
      if (!control) throw new Error('Pocket animal control did not register');
      window.dispatchEvent(new Event('resize'));
      return control;
    });
  }
  return throwRuntimePromise;
}

if (typeof window !== 'undefined') {
  window.POCKETMONSTER_PIRATE_FRUIT = Object.freeze({
    source: 'offline-client',
    entry: PIRATE_FRUIT_OFFLINE_ENTRY,
    remote: false,
    mergedWithV800: false,
    controlHud: 'circular-cluster',
    animalControlRuntime: POCKET_ANIMAL_CONTROL_RUNTIME,
  });
  window.POCKETMONSTER_SYNC_PIRATE_CONTROLS = () => syncPirateFruitControlHud(document.getElementById('pirateFruitOfflineFrame'));
  window.POCKETMONSTER_ENSURE_THROW_RUNTIME = ensurePocketAnimalControl;
}

game.replaceChildren();
const frame = document.createElement('iframe');
frame.id = 'pirateFruitOfflineFrame';
frame.title = 'Pirate Fruit ออฟไลน์';
frame.src = new URL(PIRATE_FRUIT_OFFLINE_ENTRY, import.meta.url).href;
frame.setAttribute('allow', 'fullscreen; gamepad; pointer-lock; autoplay');
frame.setAttribute('allowfullscreen', '');
frame.addEventListener('load', () => {
  syncPirateFruitControlHud(frame);
  if (startup && document.body?.dataset?.controlPanel !== 'throw') startup.className = 'startup-status hidden';
});
game.appendChild(frame);
if (startup) {
  startup.textContent = document.body?.dataset?.controlPanel === 'throw'
    ? 'กำลังเปิดระบบควบคุมสัตว์ของ Pocket Monster…'
    : 'กำลังเปิด Pirate Fruit เวอร์ชันออฟไลน์…';
  startup.className = 'startup-status';
}

if (document.body?.dataset?.controlPanel === 'throw') {
  await ensurePocketAnimalControl();
}
