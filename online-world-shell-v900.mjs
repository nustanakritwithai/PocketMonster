import { COMBINED_VERSION, resolveCombinedWorld, worldById } from './combined-worlds-v900.mjs?v=918';
import { allowedPanelForWorld, combinedLocationQuery, panelIdFromLocation } from './control-panels-v900.mjs';
import {
  clearLaunchSession,
  isActiveLaunchSession,
  requireActiveOnlineLaunchSession,
  returnToFirebaseLauncher,
} from './launch-bootstrap.mjs?v=912';
import {
  ONLINE_WORLD_SHELL_KIND,
  createOnlineScenePresenceBridge,
} from './online-world-bridge-v900.mjs?v=2';
import {
  createCombatV91BaseProfile,
  createCombatV91Shell,
} from './combat-v91-entry.mjs?v=1';

export const ONLINE_WORLD_SHELL_VERSION = '9.0.1-persistent-shell';
export const ONLINE_WORLD_SCENE_ENTRY = new URL('./scene-v900.html', import.meta.url).href;
export const ONLINE_WORLD_SCENE_TEARDOWN_EVENT = 'pocketmonster:online-scene-teardown';
export const ONLINE_WORLD_SCENE_LEASE_KIND = 'monsterlife-online-scene-lease-v1';

const ONLINE_SCENE_ERROR_STAGES = new Set(['session', 'template', 'startup', 'runtime']);

const shellPath = location.pathname;
const shellBootId = crypto.randomUUID();
let activeWorld = resolveCombinedWorld(location);
let activePanel = panelIdFromLocation(location, activeWorld);
let sceneLoadCount = 0;
let sceneBootGeneration = 0;
let sceneBootState = 'loading';
let sceneReadyCount = 0;
let sceneErrorCount = 0;
let sceneFocusCount = 0;
let fullscreenRequestCount = 0;
let activeSceneLease = null;
let sessionEnding = false;
let sessionEndReason = null;
let sessionExpiryTimer = null;

function requireHealthyParentServerGate() {
  const gate = window.POCKETMONSTER_SERVER_GATE;
  const observation = window.POCKETMONSTER_SERVER_GATE_OBSERVATION;
  if (!Object.isFrozen(gate)
    || gate?.state !== 'healthy'
    || gate.allowFirebaseFallback !== false
    || gate.allowPlayerDataWrites !== false
    || gate.writePolicy?.enabled !== false
    || !Object.isFrozen(observation)
    || observation?.gateState !== 'healthy') {
    throw Object.assign(new Error('A healthy Monster Life Server gate is required'), { code: 'ONLINE_SERVER_REQUIRED' });
  }
  return gate;
}

try {
  requireActiveOnlineLaunchSession(window.POCKETMONSTER_RUNTIME_CONFIG, window.POCKETMONSTER_LAUNCH_SESSION);
  requireHealthyParentServerGate();
} catch (error) {
  clearLaunchSession(window.sessionStorage);
  returnToFirebaseLauncher(window.location);
  throw error;
}

function sceneUrl(worldId, panelId) {
  const url = new URL(ONLINE_WORLD_SCENE_ENTRY);
  url.search = combinedLocationQuery(worldId, panelId);
  url.searchParams.set('shellRevision', '9');
  return url.href;
}

function canonicalShellLocation(worldId, panelId) {
  return `${shellPath}?${combinedLocationQuery(worldId, panelId)}`;
}

document.documentElement.dataset.onlineWorldShell = 'active';
const shell = document.createElement('main');
shell.id = 'onlineWorldShell';
shell.setAttribute('aria-label', 'Monster Life Online World');
const sceneFrame = document.createElement('iframe');
sceneFrame.id = 'onlineWorldSceneFrame';
sceneFrame.title = worldById(activeWorld)?.title || 'Monster Life scene';
sceneFrame.referrerPolicy = 'no-referrer';
sceneFrame.setAttribute('allow', 'fullscreen');
const combatHost = document.createElement('aside');
combatHost.id = 'combatV91Shell';
combatHost.className = 'combat-v91-shell';
combatHost.hidden = true;
combatHost.setAttribute('aria-label', 'Combat V9.1');
const combatShellResult = createCombatV91Shell({ container: combatHost });
if (!combatShellResult.ok) {
  throw Object.assign(new Error('Combat V9.1 shell could not be mounted'), {
    code: 'COMBAT_V91_SHELL_REQUIRED',
    reason: combatShellResult.reason,
  });
}
const combatShell = combatShellResult.shell;
const shellStatus = document.createElement('div');
shellStatus.id = 'onlineWorldShellStatus';
shellStatus.textContent = 'กำลังเปิดโลกออนไลน์…';
shell.append(sceneFrame, combatHost, shellStatus);
document.body.replaceChildren(shell);

function combatUnavailable() {
  const sessionActive = !sessionEnding && isActiveLaunchSession(window.POCKETMONSTER_LAUNCH_SESSION);
  return Object.freeze({
    ok: false,
    reason: sessionActive ? 'online_scene_inactive' : 'online_session_inactive',
  });
}

function combatSessionAvailable() {
  return !sessionEnding
    && sceneBootState === 'ready'
    && Boolean(activeSceneLease)
    && isActiveLaunchSession(window.POCKETMONSTER_LAUNCH_SESSION);
}

function closeCombatSession() {
  return combatShell.closeSession();
}

const publicCombatShell = Object.freeze({
  kind: 'combat-v91-client-shell/v1',
  version: combatShell.version,
  authority: 'client_projection_only',
  serverReconcileExposed: false,
  calculateBaseProfile(source = {}) {
    return combatSessionAvailable() ? createCombatV91BaseProfile(source) : combatUnavailable();
  },
  openSession(options = {}) {
    return combatSessionAvailable() ? combatShell.openSession(options) : combatUnavailable();
  },
  predict(command = {}, options = {}) {
    return combatSessionAvailable() ? combatShell.predict(command, options) : combatUnavailable();
  },
  focus(entityId, options = {}) {
    return combatSessionAvailable() ? combatShell.focus(entityId, options) : combatUnavailable();
  },
  closeSession() {
    return closeCombatSession();
  },
  readState() {
    return combatSessionAvailable() ? combatShell.getState() : null;
  },
  diagnostics() {
    const state = combatSessionAvailable() ? combatShell.getState() : null;
    return Object.freeze({
      active: Boolean(state),
      pendingCount: state ? Object.keys(state.pendingOverlay).length : 0,
      hostHidden: combatHost.hidden === true,
    });
  },
});

function destroyCombatShell() {
  closeCombatSession();
  try { combatHost.remove(); } catch {}
}

const presenceBridge = createOnlineScenePresenceBridge({
  getSceneWindow: () => sceneFrame.contentWindow,
});

function showSceneLoading(message = 'กำลังเปิดโลกออนไลน์…') {
  sceneBootState = 'loading';
  shellStatus.classList.remove('hidden');
  shellStatus.classList.remove('error');
  shellStatus.textContent = message;
}

function invalidateSceneBoot({ showLoading = false, message } = {}) {
  activeSceneLease = null;
  if (showLoading && !sessionEnding) showSceneLoading(message);
}

function sceneWindowIsCurrent(sceneWindow) {
  try { return sceneWindow === sceneFrame.contentWindow; } catch { return false; }
}

function persistentFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function requestPersistentFullscreen(options) {
  if (sessionEnding) {
    return Promise.reject(Object.assign(new Error('Online session has ended'), { code: 'ONLINE_SESSION_ENDED' }));
  }
  if (persistentFullscreenElement()) return Promise.resolve(true);
  const root = document.documentElement;
  const request = root?.requestFullscreen || root?.webkitRequestFullscreen;
  if (typeof request !== 'function') {
    return Promise.reject(Object.assign(new Error('Fullscreen is unavailable'), { code: 'FULLSCREEN_UNAVAILABLE' }));
  }
  fullscreenRequestCount += 1;
  try {
    return Promise.resolve(request.call(root, options)).then(() => true);
  } catch (error) {
    return Promise.reject(error);
  }
}

function readRegisteredScene(sceneWindow, sceneHref) {
  if (!sceneWindowIsCurrent(sceneWindow) || typeof sceneHref !== 'string' || !sceneHref) return null;
  try {
    if (sceneWindow.location.href !== sceneHref) return null;
    const url = new URL(sceneHref);
    const entryUrl = new URL(ONLINE_WORLD_SCENE_ENTRY);
    if (url.origin !== entryUrl.origin || url.pathname !== entryUrl.pathname) return null;
    const worldId = resolveCombinedWorld(url);
    const world = worldById(worldId);
    if (!world) return null;
    const panel = allowedPanelForWorld(world.id, panelIdFromLocation(url, world.id));
    return Object.freeze({ url, world, panel });
  } catch {
    return null;
  }
}

function scheduleSessionExpiryCheck() {
  if (sessionExpiryTimer) clearTimeout(sessionExpiryTimer);
  sessionExpiryTimer = null;
  if (sessionEnding) return;
  const session = window.POCKETMONSTER_LAUNCH_SESSION;
  if (!isActiveLaunchSession(session)) {
    endSession('session-expired');
    return;
  }
  const expiresAt = Date.parse(session.expiresAtUtc);
  const delay = Math.min(Math.max(expiresAt - Date.now() + 25, 25), 60_000);
  sessionExpiryTimer = setTimeout(scheduleSessionExpiryCheck, delay);
  sessionExpiryTimer?.unref?.();
}

function signalSceneTeardown(reason) {
  closeCombatSession();
  const detail = { reason, acknowledged: false };
  try {
    const sceneWindow = sceneFrame.contentWindow;
    const SceneCustomEvent = sceneWindow?.CustomEvent || CustomEvent;
    sceneWindow?.dispatchEvent?.(new SceneCustomEvent(ONLINE_WORLD_SCENE_TEARDOWN_EVENT, { detail }));
  } catch {}
  return detail;
}

function teardownSceneRealm(reason) {
  const detail = signalSceneTeardown(reason);
  try { sceneFrame.src = 'about:blank'; } catch {}
  try { sceneFrame.remove(); } catch {}
  return detail.acknowledged === true;
}

function endSession(reason = 'session-ended') {
  if (sessionEnding) return false;
  sessionEnding = true;
  sessionEndReason = String(reason || 'session-ended');
  if (sessionExpiryTimer) clearTimeout(sessionExpiryTimer);
  sessionExpiryTimer = null;
  invalidateSceneBoot();
  teardownSceneRealm(sessionEndReason);
  destroyCombatShell();
  presenceBridge.reset();
  window.POCKETMONSTER_CHAT_RUNTIME?.stop?.(sessionEndReason);
  clearLaunchSession(window.sessionStorage);
  shellStatus.classList.remove('hidden');
  shellStatus.textContent = 'เซสชันออนไลน์สิ้นสุดแล้ว กำลังกลับไปหน้าเข้าสู่ระบบ…';
  returnToFirebaseLauncher(window.location);
  return true;
}

window.POCKETMONSTER_WORLD_STATE = () => presenceBridge.readPose();
window.POCKETMONSTER_WORLD_PRESENCE = payload => presenceBridge.acceptSnapshot(payload);
window.addEventListener('pocketmonster:world-socket-status', event => {
  presenceBridge.setTransportConnected(event.detail?.connected === true);
});

function syncShellRouteFromScene() {
  if (sessionEnding) return false;
  let childUrl;
  try { childUrl = new URL(sceneFrame.contentWindow.location.href); } catch { return false; }
  const sceneEntryUrl = new URL(ONLINE_WORLD_SCENE_ENTRY);
  if (childUrl.origin !== sceneEntryUrl.origin || childUrl.pathname !== sceneEntryUrl.pathname) return false;
  const world = resolveCombinedWorld(childUrl);
  const panel = panelIdFromLocation(childUrl, world);
  activeWorld = world;
  activePanel = panel;
  sceneFrame.title = worldById(world)?.title || 'Monster Life scene';
  const canonical = canonicalShellLocation(world, panel);
  if (`${location.pathname}${location.search}` !== canonical) {
    history.replaceState(
      { kind: ONLINE_WORLD_SHELL_KIND, worldId: world, panel },
      '',
      canonical,
    );
  }
  return true;
}

function registerSceneBoot(sceneWindow, sceneHref) {
  if (sessionEnding || activeSceneLease) return null;
  const registered = readRegisteredScene(sceneWindow, sceneHref);
  if (!registered) return null;
  activeWorld = registered.world.id;
  activePanel = registered.panel;
  sceneFrame.title = registered.world.title || 'Monster Life scene';
  sceneBootGeneration += 1;
  const lease = Object.freeze({
    kind: ONLINE_WORLD_SCENE_LEASE_KIND,
    shellBootId,
    generation: sceneBootGeneration,
    worldId: activeWorld,
    panel: activePanel,
    sceneHref,
  });
  activeSceneLease = lease;
  presenceBridge.reset();
  showSceneLoading(`กำลังเปิด${registered.world.label}…`);
  syncShellRouteFromScene();
  return lease;
}

function reportSceneBoot(sceneWindow, lease, outcome) {
  if (sessionEnding
    || !sceneWindowIsCurrent(sceneWindow)
    || !(activeSceneLease === lease)
    || sceneBootState !== 'loading') return false;
  try {
    if (sceneWindow.location.href !== lease.sceneHref) return false;
  } catch {
    return false;
  }
  if (outcome?.status === 'ready') {
    sceneBootState = 'ready';
    sceneReadyCount += 1;
    presenceBridge.reset();
    shellStatus.classList.remove('error');
    shellStatus.classList.add('hidden');
    syncShellRouteFromScene();
    try {
      if (typeof sceneWindow.focus === 'function') {
        sceneWindow.focus();
        sceneFocusCount += 1;
      }
    } catch {}
    const detail = Object.freeze({
      worldId: activeWorld,
      panel: activePanel,
      sceneReadyCount,
      sceneBootGeneration: lease.generation,
    });
    window.dispatchEvent(new CustomEvent('pocketmonster:online-scene-ready', { detail }));
    window.dispatchEvent(new CustomEvent('pocketmonster:online-scene-loaded', { detail }));
    return true;
  }
  if (outcome?.status === 'error'
    && outcome.code === 'ONLINE_SCENE_BOOT_FAILED'
    && ONLINE_SCENE_ERROR_STAGES.has(outcome.stage)) {
    closeCombatSession();
    sceneBootState = 'error';
    sceneErrorCount += 1;
    activeSceneLease = null;
    presenceBridge.reset();
    shellStatus.classList.remove('hidden');
    shellStatus.classList.add('error');
    shellStatus.textContent = 'เปิดฉากออนไลน์ไม่สำเร็จ กรุณาลองเปลี่ยนฉากหรือโหลดใหม่';
    window.dispatchEvent(new CustomEvent('pocketmonster:online-scene-error', {
      detail: Object.freeze({
        worldId: activeWorld,
        panel: activePanel,
        code: 'ONLINE_SCENE_BOOT_FAILED',
        stage: outcome.stage,
        sceneErrorCount,
        sceneBootGeneration: lease.generation,
      }),
    }));
    return true;
  }
  return false;
}

function leaveSceneBoot(sceneWindow, lease) {
  if (sessionEnding || !sceneWindowIsCurrent(sceneWindow) || !(activeSceneLease === lease)) return false;
  closeCombatSession();
  activeSceneLease = null;
  presenceBridge.reset();
  showSceneLoading(`กำลังเปิด${worldById(activeWorld)?.label || 'ฉาก'}…`);
  return true;
}

function navigate(worldId, panelId = null) {
  if (sessionEnding) return false;
  const world = worldById(worldId);
  if (!world) return false;
  const panel = allowedPanelForWorld(world.id, panelId);
  activeWorld = world.id;
  activePanel = panel;
  invalidateSceneBoot({ showLoading: true, message: `กำลังเปิด${world.label}…` });
  signalSceneTeardown('scene-navigation');
  presenceBridge.reset();
  sceneFrame.src = sceneUrl(world.id, panel);
  return true;
}

sceneFrame.addEventListener('load', () => {
  if (sessionEnding) return;
  if (!syncShellRouteFromScene()) return;
  sceneLoadCount += 1;
  window.dispatchEvent(new CustomEvent('pocketmonster:online-scene-document-loaded', {
    detail: { worldId: activeWorld, panel: activePanel, sceneLoadCount },
  }));
});

window.addEventListener('popstate', () => {
  if (sessionEnding) return;
  const world = resolveCombinedWorld(location);
  const panel = panelIdFromLocation(location, world);
  let childUrl = null;
  try { childUrl = new URL(sceneFrame.contentWindow.location.href); } catch {}
  if (childUrl && resolveCombinedWorld(childUrl) === world && panelIdFromLocation(childUrl, world) === panel) return;
  activeWorld = world;
  activePanel = panel;
  invalidateSceneBoot({ showLoading: true, message: `กำลังเปิด${worldById(world)?.label || 'ฉาก'}…` });
  signalSceneTeardown('scene-history-navigation');
  presenceBridge.reset();
  sceneFrame.src = sceneUrl(world, panel);
});

const publicShell = Object.freeze({
  kind: ONLINE_WORLD_SHELL_KIND,
  version: ONLINE_WORLD_SHELL_VERSION,
  combinedVersion: COMBINED_VERSION,
  bootId: shellBootId,
  presenceMode: 'read-only',
  oneSession: true,
  oneSocket: true,
  // Child scenes may trust this authenticated shell during in-tab navigation.
  sceneNavigationTrusted: true,
  combat: publicCombatShell,
  registerSceneBoot,
  reportSceneBoot,
  leaveSceneBoot,
  navigate,
  requestFullscreen: requestPersistentFullscreen,
  endSession,
  diagnostics: () => Object.freeze({
    bootId: shellBootId,
    activeWorld,
    activePanel,
    sceneLoadCount,
    sceneBootGeneration,
    sceneBootState,
    sceneReadyCount,
    sceneErrorCount,
    sceneFocusCount,
    fullscreenActive: Boolean(persistentFullscreenElement()),
    fullscreenRequestCount,
    hasActiveSceneLease: Boolean(activeSceneLease),
    sessionActive: isActiveLaunchSession(window.POCKETMONSTER_LAUNCH_SESSION),
    sessionEnding,
    sessionEndReason,
    combat: publicCombatShell.diagnostics(),
    ...presenceBridge.diagnostics(),
    chat: window.POCKETMONSTER_CHAT_RUNTIME?.diagnostics?.() || null,
  }),
});
Object.defineProperty(window, 'POCKETMONSTER_ONLINE_SHELL', {
  configurable: false,
  enumerable: true,
  writable: false,
  value: publicShell,
});

window.addEventListener('pocketmonster:session-ended', () => {
  if (!sessionEnding) endSession('session-ended');
});
window.addEventListener('pageshow', scheduleSessionExpiryCheck);

showSceneLoading(`กำลังเปิด${worldById(activeWorld)?.label || 'ฉาก'}…`);
sceneFrame.src = sceneUrl(activeWorld, activePanel);
await import('./chat-runtime.mjs?v=8.4.0-unified-world-shell-2');
scheduleSessionExpiryCheck();
