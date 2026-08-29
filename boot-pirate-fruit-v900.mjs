export const PIRATE_FRUIT_OFFLINE_ENTRY = './pirate-fruit-offline/index.html';

const startup = document.getElementById('startupStatus');
const game = document.getElementById('game');
if (!game) throw new Error('missing #game for Pirate Fruit offline boot');

if (typeof window !== 'undefined') {
  window.POCKETMONSTER_PIRATE_FRUIT = Object.freeze({
    source: 'offline-client',
    entry: PIRATE_FRUIT_OFFLINE_ENTRY,
    remote: false,
    mergedWithV800: false,
  });
}

game.replaceChildren();
const frame = document.createElement('iframe');
frame.id = 'pirateFruitOfflineFrame';
frame.title = 'Pirate Fruit ออฟไลน์';
frame.src = new URL(PIRATE_FRUIT_OFFLINE_ENTRY, import.meta.url).href;
frame.setAttribute('allow', 'fullscreen; gamepad; pointer-lock; autoplay');
frame.setAttribute('allowfullscreen', '');
frame.addEventListener('load', () => {
  if (startup) startup.className = 'startup-status hidden';
});
game.appendChild(frame);
if (startup) {
  startup.textContent = 'กำลังเปิด Pirate Fruit เวอร์ชันออฟไลน์…';
  startup.className = 'startup-status';
}
