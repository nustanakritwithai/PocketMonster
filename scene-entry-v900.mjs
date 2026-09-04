import { bindPersistentFullscreenControls } from './persistent-fullscreen-v900.mjs?v=4';
import { requireActiveOnlineLaunchSession } from './launch-bootstrap.mjs?v=912';
import {
  ONLINE_WORLD_SCENE_KIND,
  isHostedOnlineWorldScene,
} from './online-world-bridge-v900.mjs?v=2';

export const ONLINE_WORLD_SCENE_TEARDOWN_EVENT = 'pocketmonster:online-scene-teardown';

if (!isHostedOnlineWorldScene(window)) {
  throw new Error('World scene must be hosted by the authenticated Monster Life shell');
}

const sceneLifetime = new AbortController();
let sceneEnded = false;
let sceneEndReason = null;
let config = null;
let launchSession = window.parent.POCKETMONSTER_LAUNCH_SESSION || null;
let serverGate = window.parent.POCKETMONSTER_SERVER_GATE || null;
let serverGateObservation = window.parent.POCKETMONSTER_SERVER_GATE_OBSERVATION || null;
const sceneHref = window.location.href;
let sceneLease = null;

const endParentSession = reason => {
  try { return window.parent.POCKETMONSTER_ONLINE_SHELL?.endSession?.(reason) === true; } catch { return false; }
};

function registerParentSceneBoot() {
  let lease = null;
  try { lease = window.parent.POCKETMONSTER_ONLINE_SHELL?.registerSceneBoot?.(window, sceneHref) || null; } catch {}
  if (!lease || typeof lease !== 'object' || !Object.isFrozen(lease)) {
    throw Object.assign(new Error('Online scene boot lease is unavailable'), { code: 'ONLINE_SCENE_BOOT_REQUIRED' });
  }
  return lease;
}

function reportParentSceneBoot(outcome) {
  if (!sceneLease) return false;
  try { return window.parent.POCKETMONSTER_ONLINE_SHELL?.reportSceneBoot?.(window, sceneLease, outcome) === true; } catch { return false; }
}

function leaveParentSceneBoot() {
  const lease = sceneLease;
  sceneLease = null;
  if (!lease) return false;
  try { return window.parent.POCKETMONSTER_ONLINE_SHELL?.leaveSceneBoot?.(window, lease) === true; } catch { return false; }
}

function deleteSceneGlobal(name) {
  try { delete window[name]; } catch { window[name] = undefined; }
}

function clearSceneRuntimeGlobals() {
  for (const name of [
    'POCKETMONSTER_LAUNCH_SESSION',
    'POCKETMONSTER_SERVER_SESSION_TOKEN',
    '__POCKETMONSTER_RUNTIME_MANIFEST__',
    'POCKETMONSTER_RUNTIME_CONFIG',
    'POCKETMONSTER_SERVER_GATE',
    'POCKETMONSTER_SERVER_GATE_OBSERVATION',
    'POCKETMONSTER_COMBINED_CHANNEL',
    'POCKETMONSTER_SCENE_EMBEDDED',
    'POCKETMONSTER_WORLD_STATE',
    'POCKETMONSTER_WORLD_PRESENCE',
    'POCKETMONSTER_WORLD_SOCKET_CONNECTED',
    'POCKETMONSTER_ONLINE_SCENE',
  ]) deleteSceneGlobal(name);
}

function teardownScene(reason = 'parent-session-ended') {
  if (sceneEnded) return false;
  sceneEnded = true;
  sceneEndReason = String(reason || 'parent-session-ended');
  sceneLifetime.abort(sceneAbortError());
  launchSession = null;
  config = null;
  serverGate = null;
  serverGateObservation = null;
  clearSceneRuntimeGlobals();
  try { document.body?.replaceChildren(); } catch {}
  return true;
}

const publicScene = Object.freeze({
  kind: ONLINE_WORLD_SCENE_KIND,
  presenceMode: 'read-only',
  diagnostics: () => Object.freeze({
    ended: sceneEnded,
    reason: sceneEndReason,
    aborted: sceneLifetime.signal.aborted,
    hasSessionToken: typeof launchSession?.sessionToken === 'string' && launchSession.sessionToken.length > 0,
  }),
});
Object.defineProperty(window, 'POCKETMONSTER_ONLINE_SCENE', {
  configurable: true,
  enumerable: true,
  writable: false,
  value: publicScene,
});

window.addEventListener(ONLINE_WORLD_SCENE_TEARDOWN_EVENT, event => {
  const acknowledged = teardownScene(event.detail?.reason || 'parent-session-ended');
  if (event.detail && typeof event.detail === 'object') {
    event.detail.acknowledged = acknowledged || sceneEnded;
  }
}, { signal: sceneLifetime.signal });
window.addEventListener('pocketmonster:session-ended', () => {
  if (teardownScene('scene-session-ended')) endParentSession('scene-session-ended');
}, { signal: sceneLifetime.signal });
window.addEventListener('pagehide', () => {
  leaveParentSceneBoot();
  teardownScene('scene-pagehide');
}, { signal: sceneLifetime.signal });

function sceneAbortError() {
  return Object.assign(new Error('Online scene bootstrap was stopped'), {
    name: 'AbortError',
    code: 'ONLINE_SCENE_ENDED',
  });
}

function requireLiveScene() {
  if (sceneEnded) throw sceneAbortError();
}

function requireHealthyParentServerGate() {
  const parentGate = window.parent.POCKETMONSTER_SERVER_GATE;
  const parentObservation = window.parent.POCKETMONSTER_SERVER_GATE_OBSERVATION;
  if (serverGate !== parentGate
    || !Object.isFrozen(serverGate)
    || serverGate?.state !== 'healthy'
    || serverGate.allowFirebaseFallback !== false
    || serverGate.allowPlayerDataWrites !== false
    || serverGate.writePolicy?.enabled !== false
    || serverGateObservation !== parentObservation
    || !Object.isFrozen(serverGateObservation)
    || serverGateObservation?.gateState !== 'healthy') {
    throw Object.assign(new Error('A healthy parent Server gate is required'), { code: 'ONLINE_SERVER_REQUIRED' });
  }
  return serverGate;
}

let bootStage = 'session';
try {
  sceneLease = registerParentSceneBoot();
  config = window.parent.POCKETMONSTER_RUNTIME_CONFIG || null;
  requireLiveScene();
  const trustedSceneNavigation = window.parent.POCKETMONSTER_ONLINE_SHELL?.sceneNavigationTrusted === true;
  // The parent shell authenticates once at entry. Reused in-tab scene
  // navigation trusts that owner instead of repeating the visible checks.
  if (!trustedSceneNavigation) {
    requireActiveOnlineLaunchSession(config, launchSession);
    requireHealthyParentServerGate();
  }

  window.POCKETMONSTER_LAUNCH_SESSION = launchSession;
  window.__POCKETMONSTER_RUNTIME_MANIFEST__ = config;
  window.POCKETMONSTER_RUNTIME_CONFIG = config;
  window.POCKETMONSTER_SERVER_GATE = serverGate;
  window.POCKETMONSTER_SERVER_GATE_OBSERVATION = serverGateObservation;
  window.POCKETMONSTER_COMBINED_CHANNEL = true;
  window.POCKETMONSTER_SCENE_EMBEDDED = true;

  bootStage = 'template';
  const templateUrl = new URL('./v900.html?v=916', import.meta.url);
  const templateResponse = await fetch(templateUrl, { cache: 'no-store', signal: sceneLifetime.signal });
  requireLiveScene();
  if (!templateResponse.ok) throw new Error(`โหลดโครงฉาก V9 ไม่สำเร็จ (${templateResponse.status})`);
  const templateText = await templateResponse.text();
  requireLiveScene();
  const template = new DOMParser().parseFromString(templateText, 'text/html');
  const sceneNodes = [...template.body.childNodes]
    .filter(node => node.nodeName !== 'SCRIPT')
    .map(node => document.importNode(node, true));
  document.body.replaceChildren(...sceneNodes);
  try {
    if (window.parent?.document?.body?.classList?.contains('unified-hud-active')) {
      document.body.classList.add('unified-hud-active');
    }
  } catch {}
  document.getElementById('chatToggleBtn')?.remove();
  document.getElementById('gameChat')?.remove();
  document.getElementById('accountGate')?.classList.add('hidden');
  bindPersistentFullscreenControls(window, { signal: sceneLifetime.signal });

  bootStage = 'startup';
  requireLiveScene();
  await import('./startup-errors.mjs');
  bootStage = 'runtime';
  requireLiveScene();
  await import('./worlds-v900.mjs?v=941');
  requireLiveScene();
  if (!reportParentSceneBoot(Object.freeze({ status: 'ready' }))) {
    throw Object.assign(new Error('Online scene boot lease expired'), { code: 'ONLINE_SCENE_LEASE_EXPIRED' });
  }
} catch (error) {
  if (!sceneEnded && error?.name !== 'AbortError') {
    const reported = reportParentSceneBoot(Object.freeze({
      status: 'error',
      code: 'ONLINE_SCENE_BOOT_FAILED',
      stage: bootStage,
    }));
    if (reported) sceneLease = null;
    const terminalSessionFailure = bootStage === 'session'
      && ['ONLINE_SESSION_REQUIRED', 'ONLINE_SERVER_REQUIRED'].includes(error?.code);
    const reason = terminalSessionFailure ? 'scene-session-invalid' : `scene-${bootStage}-boot-failed`;
    teardownScene(reason);
    if (terminalSessionFailure) endParentSession(reason);
  }
  throw error;
}
