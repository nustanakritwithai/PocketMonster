export const PIRATE_FRUIT_CONTROL_HUD_STYLE_ID = 'pocketmonster-pirate-control-hud';

/** Restore the prototype circular combat cluster. Desktop Pirate Fruit currently
 *  draws a 292×140 rectangular tray and lines the buttons into two rows. */
export const PIRATE_FRUIT_CONTROL_HUD_CSS = `
.tc-root.tc-desktop::before {
  content: none !important;
  display: none !important;
  width: 0 !important;
  height: 0 !important;
  border: 0 !important;
  background: none !important;
  box-shadow: none !important;
}
.hud-help { display: none !important; }
.tc-desktop .tc-attack { right: 14px !important; bottom: 18px !important; width: 70px !important; height: 70px !important; font-size: 28px !important; }
.tc-desktop .tc-dash { right: 92px !important; bottom: 24px !important; width: 48px !important; height: 48px !important; }
.tc-desktop .tc-jump { right: 86px !important; bottom: 82px !important; width: 48px !important; height: 48px !important; }
.tc-desktop .tc-block { right: 202px !important; bottom: 76px !important; width: 42px !important; height: 42px !important; }
.tc-desktop .tc-weapon { right: 16px !important; top: 52% !important; bottom: auto !important; transform: translateY(-50%) !important; width: 42px !important; height: 42px !important; }
.tc-desktop .tc-skill1 { right: 18px !important; bottom: 108px !important; width: 42px !important; height: 42px !important; }
.tc-desktop .tc-skill2 { right: 70px !important; bottom: 146px !important; width: 42px !important; height: 42px !important; }
.tc-desktop .tc-skill3 { right: 124px !important; bottom: 124px !important; width: 42px !important; height: 42px !important; }
.tc-desktop .tc-ult { right: 148px !important; bottom: 18px !important; width: 50px !important; height: 50px !important; }
.tc-desktop .tc-skill-cancel { right: 88px !important; bottom: 220px !important; }
.tc-desktop .tc-cannon-right { right: 14px !important; bottom: 18px !important; }
.tc-desktop .tc-cannon-left { right: 156px !important; bottom: 18px !important; }
html[data-control-panel="throw"] .tc-btn,
html[data-control-panel="throw"] .tc-skill-cancel {
  display: none !important;
}
`;

export function syncPirateFruitControlHud(frame = globalThis.document?.getElementById('pirateFruitOfflineFrame')) {
  const doc = frame?.contentDocument;
  if (!doc?.head) return false;
  let style = doc.getElementById(PIRATE_FRUIT_CONTROL_HUD_STYLE_ID);
  if (!style) {
    style = doc.createElement('style');
    style.id = PIRATE_FRUIT_CONTROL_HUD_STYLE_ID;
    style.textContent = PIRATE_FRUIT_CONTROL_HUD_CSS;
    doc.head.appendChild(style);
  }
  doc.documentElement.dataset.controlPanel = globalThis.document?.body?.dataset?.controlPanel || 'human';
  return true;
}
