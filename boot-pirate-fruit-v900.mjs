export const PIRATE_FRUIT_BLOCK_WORLD = './world-pirate-fruit-v900.mjs?v=900';
export const POCKET_ANIMAL_CONTROL_RUNTIME = './game-v800.js?v=810&animalControl=pirate-fruit';

const startup = document.getElementById('startupStatus');
const game = document.getElementById('game');
if (!game) throw new Error('missing #game for Pirate Fruit block world boot');

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
    source: 'pocket-block-world',
    entry: PIRATE_FRUIT_BLOCK_WORLD,
    remote: false,
    mergedWithV800: false,
    presentationOnly: true,
    combatAuthority: false,
    animalControlRuntime: POCKET_ANIMAL_CONTROL_RUNTIME,
  });
  window.POCKETMONSTER_ENSURE_THROW_RUNTIME = ensurePocketAnimalControl;
}

if (startup) {
  startup.textContent = document.body?.dataset?.controlPanel === 'throw'
    ? 'กำลังเปิดระบบควบคุมสัตว์ของ Pocket Monster…'
    : 'กำลังเปิดเกาะโจรสลัดภาษาบล็อก…';
  startup.className = 'startup-status';
}

await import('./world-pirate-fruit-v900.mjs?v=900');

if (document.body?.dataset?.controlPanel === 'throw') {
  await ensurePocketAnimalControl();
}
