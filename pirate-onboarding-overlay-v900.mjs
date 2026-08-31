export const PIRATE_ONBOARDING_STATE_MESSAGE = 'pocketmonster:pirate-onboarding-state-v1';
export const PIRATE_ONBOARDING_COMPACT_STYLE_ID = 'pocketmonster-pirate-onboarding-compact';

export const PIRATE_ONBOARDING_COMPACT_CSS = `
@media (max-height: 500px) and (pointer: coarse) {
  .onboarding-root {
    left: 38%;
    bottom: max(4px, env(safe-area-inset-bottom));
    width: min(260px, calc(100vw - 170px));
  }
  .onboarding-card { padding: 5px 7px; border-radius: 10px; }
  .onboarding-kicker { font-size: 7px; }
  .onboarding-guide-open { padding: 2px 5px; font-size: 7px; }
  .onboarding-title { margin: 1px 0; font-size: 11px; line-height: 1.15; }
  .onboarding-body {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    font-size: 8px;
    line-height: 1.2;
  }
  .onboarding-waypoint { margin-top: 3px; padding: 2px 5px; font-size: 8px; }
  .onboarding-arrow { font-size: 12px; }
  .onboarding-hint { display: none; }
  .onboarding-actions { gap: 3px; margin-top: 3px; }
  .onboarding-actions button { min-height: 24px; padding: 3px 6px; font-size: 8px; }
}
`;

export function readPirateOnboardingState(message) {
  if (message?.type !== PIRATE_ONBOARDING_STATE_MESSAGE || typeof message.active !== 'boolean') return null;
  const actions = {};
  const source = message.actions ?? {};
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  for (const action of ['prev', 'pause', 'next']) {
    const rect = source[action];
    if (rect === undefined) continue;
    if (!rect || typeof rect !== 'object') return null;
    const values = [rect.x, rect.y, rect.width, rect.height];
    if (!values.every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return null;
    actions[action] = Object.freeze({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    });
  }
  return Object.freeze({ active: message.active, actions: Object.freeze(actions) });
}
