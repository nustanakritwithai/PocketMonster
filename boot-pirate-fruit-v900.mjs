import { combinedWorldLinksFrom } from './combined-worlds-v900.mjs?v=901';
import { combinedLocationQuery, defaultPanelForWorld } from './control-panels-v900.mjs';
import { installWorldPresence, publishWorldState } from './world-presence-v800.mjs';

export const PIRATE_FRUIT_OFFLINE_ENTRY = new URL('./pirate-fruit-offline/index.html', import.meta.url).href;
export const POCKET_ANIMAL_CONTROL_RUNTIME = './game-v800.js?v=810&animalControl=pirate-fruit';

const startup = document.getElementById('startupStatus');
const game = document.getElementById('game');
if (!game) throw new Error('missing #game for Pirate Fruit boot');

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

function mountPirateOffline() {
  game.replaceChildren();
  const frame = document.createElement('iframe');
  frame.id = 'pirateFruitFrame';
  frame.title = 'Pirate Fruit';
  frame.src = PIRATE_FRUIT_OFFLINE_ENTRY;
  frame.setAttribute('allow', 'fullscreen');
  game.appendChild(frame);
  return frame;
}

function assignCombinedWorld(worldId) {
  location.assign(`${location.pathname}?${combinedLocationQuery(worldId, defaultPanelForWorld(worldId))}`);
}

function bindPocketMonsterLink() {
  const link = combinedWorldLinksFrom('pirate-fruit')[0];
  const button = document.getElementById('pocketWorldWarpBtn');
  if (button && link) {
    button.hidden = false;
    button.removeAttribute('hidden');
    button.classList.add('is-visible');
    button.textContent = `วาปเข้า${link.label}`;
    button.onclick = () => assignCombinedWorld(link.to);
    button.textContent = 'เข้าสู่โลก Pocket Monster • จับและเลี้ยงมอนสเตอร์';
    button.setAttribute('aria-label', 'เข้าสู่โลก Pocket Monster');
  }
  const zoneLabel = document.getElementById('zoneLabel');
  if (zoneLabel) zoneLabel.textContent = 'Pirate Fruit';
  const message = document.getElementById('message');
  if (message) message.textContent = 'โลก Pirate Fruit จริง • กดวาปเพื่อเข้าเกมเดิม';
}

if (typeof window !== 'undefined') {
  window.POCKETMONSTER_PIRATE_FRUIT = Object.freeze({
    source: 'pirate-fruit-offline',
    entry: PIRATE_FRUIT_OFFLINE_ENTRY,
    remote: false,
    mergedWithV800: false,
    presentationOnly: true,
    combatAuthority: false,
    animalControlRuntime: POCKET_ANIMAL_CONTROL_RUNTIME,
  });
  window.POCKETMONSTER_ENSURE_THROW_RUNTIME = ensurePocketAnimalControl;
  publishWorldState({
    getZone: () => 'pirate-fruit',
    getPosition: () => ({ x: 0, z: 0 }),
    getDir: () => 0,
  });
  installWorldPresence({ getZone: () => 'pirate-fruit' });
}

if (startup) {
  startup.textContent = document.body?.dataset?.controlPanel === 'throw'
    ? 'กำลังเปิดระบบควบคุมสัตว์ของ Pocket Monster…'
    : 'กำลังเปิดโลก Pirate Fruit…';
  startup.className = 'startup-status';
}

mountPirateOffline();
bindPocketMonsterLink();
if (startup) {
  startup.textContent = 'เข้าโลก Pirate Fruit แล้ว';
  startup.className = 'startup-status ok';
}

if (document.body?.dataset?.controlPanel === 'throw') {
  await ensurePocketAnimalControl();
}
