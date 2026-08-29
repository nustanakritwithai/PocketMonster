export const HUMAN_CONTROL_PANEL = 'human';
export const THROW_CONTROL_PANEL = 'throw';

export const CONTROL_PANELS = Object.freeze([
  Object.freeze({
    id: HUMAN_CONTROL_PANEL,
    label: 'คน',
    title: 'แผงคน • Pirate Fruit',
    authority: 'pirate-fruit',
    detail: 'ตัวละครหลักและระบบบังคับคนมาจาก Pirate Fruit',
  }),
  Object.freeze({
    id: THROW_CONTROL_PANEL,
    label: 'ปา',
    title: 'แผงปา • จับมอน',
    authority: 'pocket-monster',
    detail: 'ตัวละครจาก Pirate Fruit เข้าใช้ระบบควบคุมสัตว์ของ Pocket Monster ทั้งก้อน',
  }),
]);

export function panelById(id) {
  return CONTROL_PANELS.find(panel => panel.id === id) || null;
}

export function defaultPanelForWorld(worldId) {
  return worldId === 'pocket-monster' ? THROW_CONTROL_PANEL : HUMAN_CONTROL_PANEL;
}

export function panelIdFromLocation(locationLike = globalThis.location, worldId = null) {
  const requested = new URL(locationLike.href).searchParams.get('panel');
  return panelById(requested)?.id || defaultPanelForWorld(worldId);
}

export function combinedLocationQuery(worldId, panelId) {
  const panel = panelById(panelId)?.id || defaultPanelForWorld(worldId);
  return `world=${encodeURIComponent(worldId)}&panel=${encodeURIComponent(panel)}`;
}

export function applyControlPanel(id, worldId = globalThis.document?.body?.dataset?.combinedWorld) {
  const panel = panelById(id) || panelById(defaultPanelForWorld(worldId));
  if (!panel || typeof document === 'undefined') return panel;
  document.body.dataset.controlPanel = panel.id;
  if (window.POCKETMONSTER_COMBINED_BOOT) {
    window.POCKETMONSTER_COMBINED_BOOT = Object.freeze({
      ...window.POCKETMONSTER_COMBINED_BOOT,
      controlPanel: panel.id,
    });
  }
  window.POCKETMONSTER_CONTROL_PANEL = Object.freeze({
    id: panel.id,
    authority: panel.authority,
    characterSystem: 'pirate-fruit',
    throwSystem: 'pocket-monster',
    pocketMonsterCharacterSystem: 'pending-removal',
    keepPocketMonsterModel: true,
    animalControl: 'pocket-monster',
    animalControlHost: worldId === 'pirate-fruit' ? 'pirate-fruit' : 'pocket-monster',
  });
  const switcher = document.getElementById('controlPanelSwitcher');
  if (switcher) {
    switcher.hidden = false;
    for (const button of switcher.querySelectorAll('[data-control-panel]')) {
      button.setAttribute('aria-current', button.dataset.controlPanel === panel.id ? 'page' : 'false');
    }
  }
  const hint = document.getElementById('controlPanelHint');
  if (hint) {
    hint.textContent = panel.detail;
    hint.classList.remove('hidden');
  }
  window.POCKETMONSTER_SYNC_PIRATE_CONTROLS?.();
  if (worldId === 'pirate-fruit' && panel.id === THROW_CONTROL_PANEL) {
    const ensure = window.POCKETMONSTER_ENSURE_THROW_RUNTIME;
    if (typeof ensure === 'function') {
      void Promise.resolve(ensure()).then(() => {
        window.dispatchEvent(new Event('resize'));
      }).catch(err => {
        console.error('Pocket animal control failed to load', err?.message || String(err), err?.stack || '');
      });
    }
  }
  return panel;
}
