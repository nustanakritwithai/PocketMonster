import { isActiveLaunchSession } from './launch-bootstrap.mjs?v=912';
import { buildWorldPosFrame, currentSelfPresenceId, filterRemotePlayers, worldSnapshotPayload } from './world-presence-protocol.mjs';

const CHAT_RUNTIME_SLOT = Symbol.for('monsterlife.chat-runtime.singleton.v1');
const existingRuntime = window[CHAT_RUNTIME_SLOT];
if (existingRuntime) {
  window.POCKETMONSTER_CHAT_RUNTIME = existingRuntime;
  existingRuntime.mount();
} else {
const SESSION_KEY = 'monsterlife.session.v1';
const MAX_SOCKET_MESSAGE_LENGTH = 262_144;
const MAX_COMBAT_FRAME_BYTES = 32 * 1024;
const COMBAT_PREDICTION_SCHEMA = 'combat-prediction-envelope/v9.1';
const COMBAT_AUTHORITY_RESPONSE_SCHEMA = 'combat-authority-response/v9.1.2';
const TERMINAL_SESSION_REJECTIONS = new Set([
  'AUTHENTICATION_REQUIRED',
  'INVALID_SESSION',
  'SESSION_EXPIRED',
  'SESSION_INVALID',
  'SESSION_REQUIRED',
  'SESSION_REVOKED',
]);
const state = {
  config: null,
  token: null,
  after: 0,
  socket: null,
  polling: null,
  worldPulse: null,
  reconnectTimer: null,
  worldConnected: false,
  combatConnected: false,
  combatPredictionSends: 0,
  combatAuthorityMessages: 0,
  stopped: false,
  paused: false,
  stopReason: null,
  lifecycleGeneration: 0,
  chatViewGeneration: 0,
  pullInFlight: false,
  pullQueued: false,
  restAbortController: new AbortController(),
  socketCreates: 0,
  socketGeneration: 0,
};
const combatAuthorityListeners = new Set();
const combatStatusListeners = new Set();

function combatStatus() {
  return Object.freeze({
    connected: state.combatConnected,
    socketGeneration: state.socketGeneration,
    stopped: state.stopped,
    paused: state.paused,
  });
}

function setCombatConnected(connected) {
  const next = connected === true;
  if (state.combatConnected === next) return;
  state.combatConnected = next;
  const status = combatStatus();
  for (const listener of [...combatStatusListeners]) {
    try { listener(status); } catch {}
  }
}

function subscribeCombatAuthority(listener) {
  if (typeof listener !== 'function') return null;
  combatAuthorityListeners.add(listener);
  return () => combatAuthorityListeners.delete(listener);
}

function subscribeCombatStatus(listener) {
  if (typeof listener !== 'function') return null;
  combatStatusListeners.add(listener);
  try { listener(combatStatus()); } catch {}
  return () => combatStatusListeners.delete(listener);
}

function sendCombatPrediction(envelope) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)
    || envelope.schemaVersion !== COMBAT_PREDICTION_SCHEMA) {
    return Object.freeze({ ok: false, reason: 'invalid_prediction_envelope' });
  }
  const context = activeRequestContext();
  const socket = state.socket;
  if (!context || !state.combatConnected || socket?.readyState !== WebSocket.OPEN) {
    return Object.freeze({ ok: false, reason: 'combat_transport_disconnected' });
  }
  let payload;
  try { payload = JSON.stringify(envelope); } catch {
    return Object.freeze({ ok: false, reason: 'prediction_serialization_failed' });
  }
  if (new TextEncoder().encode(payload).byteLength > MAX_COMBAT_FRAME_BYTES) {
    return Object.freeze({ ok: false, reason: 'prediction_frame_too_large' });
  }
  try { socket.send(payload); } catch {
    setCombatConnected(false);
    return Object.freeze({ ok: false, reason: 'combat_transport_send_failed' });
  }
  state.combatPredictionSends += 1;
  return Object.freeze({ ok: true, reason: 'prediction_sent', socketGeneration: state.socketGeneration });
}
function setWorldConnected(connected) {
  const next = connected === true;
  if (state.worldConnected === next && window.POCKETMONSTER_WORLD_SOCKET_CONNECTED === next) return;
  state.worldConnected = next;
  window.POCKETMONSTER_WORLD_SOCKET_CONNECTED = next;
  window.dispatchEvent(new CustomEvent('pocketmonster:world-socket-status', { detail: { connected: next } }));
}
function ensureChatStyles() {
  if (document.querySelector('#chatRuntimeStyles')) return;
  const style = document.createElement('style'); style.id = 'chatRuntimeStyles';
  style.textContent = '.chat-toggle{left:auto!important;bottom:auto!important;top:max(8px,var(--safe-top,8px))!important;right:max(86px,calc(var(--safe-right,8px) + 74px))!important;z-index:15000!important;pointer-events:auto!important}.game-chat{bottom:auto!important;max-height:calc(100dvh - 58px - 220px)!important;z-index:15001!important;pointer-events:auto!important}.game-chat.hidden{display:none!important}@media (orientation:landscape) and (max-height:560px){.game-chat{left:50%!important;right:auto!important;transform:translateX(-50%)!important;width:min(340px,46vw)!important;max-height:calc(100dvh - 48px - 140px)!important}}';
  document.head.append(style);
}

function sessionToken() {
  try {
    const launchSession = window.POCKETMONSTER_LAUNCH_SESSION;
    if (launchSession) {
      return isActiveLaunchSession(launchSession) ? launchSession.sessionToken : null;
    }
    const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    if (session) {
      return isActiveLaunchSession(session) ? session.sessionToken : null;
    }
  } catch { return null; }
  return window.POCKETMONSTER_SERVER_SESSION_TOKEN || null;
}
function invalidateSession(reason = 'session-expired') {
  if (state.stopped) return;
  stop(reason);
  try { window.POCKETMONSTER_ONLINE_SHELL?.endSession?.(reason); } catch {}
}
function activeRequestContext() {
  if (state.stopped || state.paused || !state.token) return null;
  if (sessionToken() !== state.token) {
    invalidateSession('session-expired');
    return null;
  }
  return Object.freeze({ token: state.token, generation: state.lifecycleGeneration });
}
function requestIsCurrent(context) {
  return Boolean(context)
    && !state.stopped
    && !state.paused
    && context.token === state.token
    && context.generation === state.lifecycleGeneration
    && sessionToken() === context.token;
}
function normalizeRejectionCode(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
function isExplicitSessionRejection(payload) {
  if (typeof payload === 'string') return TERMINAL_SESSION_REJECTIONS.has(normalizeRejectionCode(payload));
  if (!payload || typeof payload !== 'object') return false;
  const candidates = [payload.errorCode, payload.code, payload.reason];
  if (payload.error && typeof payload.error === 'object') {
    candidates.push(payload.error.errorCode, payload.error.code, payload.error.reason);
  }
  return candidates.some(value => TERMINAL_SESSION_REJECTIONS.has(normalizeRejectionCode(value)));
}
async function readResponsePayload(response) {
  try { return await response.json(); } catch { return null; }
}
function currentChatChannel() {
  return document.querySelector('#chatChannel')?.value === 'ZONE' ? 'ZONE' : 'WORLD';
}
function pullRequestIsCurrent(context) {
  return requestIsCurrent(context)
    && context.viewGeneration === state.chatViewGeneration
    && context.channel === currentChatChannel();
}
function api(path) { return new URL(path.replace(/^\//, ''), `${state.config.apiBaseUrl.replace(/\/$/, '')}/`).href; }
function addMessage(message) {
  const list = document.querySelector('#chatMessages'); if (!list) return;
  list.querySelector('.chat-empty')?.remove();
  const row = document.createElement('div'); row.className = 'chat-row';
  const avatar = document.createElement('div'); avatar.className = 'chat-avatar'; avatar.textContent = (message.displayName || message.username || '?').trim().charAt(0).toUpperCase();
  const content = document.createElement('div'); content.className = 'chat-content';
  const meta = document.createElement('div'); meta.className = 'chat-meta';
  const name = document.createElement('b'); name.textContent = message.displayName || message.username || 'ผู้เล่น';
  const account = document.createElement('span'); account.className = 'chat-account'; account.textContent = `@${message.username || '-'}`;
  meta.append(name, account); content.append(meta);
  const text = document.createElement('div'); text.className = 'chat-text'; text.textContent = message.message || ''; content.append(text);
  row.append(avatar, content); list.append(row); list.scrollTop = list.scrollHeight;
}
async function pullMessagesOnce() {
  const sessionContext = activeRequestContext();
  if (!sessionContext) return;
  const context = Object.freeze({
    ...sessionContext,
    channel: currentChatChannel(),
    viewGeneration: state.chatViewGeneration,
    after: state.after,
  });
  const response = await fetch(api(`/api/chat/messages?after=${context.after}&channel=${context.channel}`), { headers: { Authorization: `Bearer ${context.token}`, Accept: 'application/json' }, cache: 'no-store', signal: state.restAbortController.signal });
  if (!pullRequestIsCurrent(context)) return;
  const payload = await readResponsePayload(response);
  if (!pullRequestIsCurrent(context)) return;
  if (response.status === 401 || isExplicitSessionRejection(payload)) { invalidateSession('session-rejected'); return; }
  if (!response.ok) { const error = document.querySelector('#chatError'); if (error) error.textContent = 'เชื่อมต่อแชทไม่สำเร็จ'; return; }
  for (const message of payload?.messages || []) { state.after = Math.max(state.after, Number(message.id) || 0); addMessage(message); }
}
async function drainPullMessages() {
  if (state.pullInFlight) return;
  state.pullInFlight = true;
  try {
    while (state.pullQueued && !state.stopped && !state.paused) {
      state.pullQueued = false;
      try { await pullMessagesOnce(); } catch {}
    }
  } finally {
    state.pullInFlight = false;
    if (state.pullQueued && !state.stopped && !state.paused) safelyPullMessages();
  }
}
async function sendMessage() {
  const input = document.querySelector('#chatInput'); const message = input?.value.trim();
  const context = activeRequestContext();
  if (!message || !context) return;
  const channel = document.querySelector('#chatChannel')?.value || 'WORLD';
  const response = await fetch(api('/api/chat/send'), { method: 'POST', headers: { Authorization: `Bearer ${context.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message, channel }), signal: state.restAbortController.signal });
  if (!requestIsCurrent(context)) return;
  const payload = await readResponsePayload(response);
  if (!requestIsCurrent(context)) return;
  if (response.status === 401 || isExplicitSessionRejection(payload)) { invalidateSession('session-rejected'); return; }
  if (response.ok && input) { input.value = ''; safelyPullMessages(); } else { const error = document.querySelector('#chatError'); if (error) error.textContent = 'ส่งข้อความไม่สำเร็จ'; }
}
function safelyPullMessages() {
  if (state.stopped || state.paused || !state.token) return;
  state.pullQueued = true;
  if (!state.pullInFlight) void drainPullMessages();
}
function abortRestRequests() {
  if (!state.restAbortController.signal.aborted) state.restAbortController.abort();
}
function renewRestRequests() {
  if (state.restAbortController.signal.aborted) state.restAbortController = new AbortController();
}
function clearTransportTimers() {
  if (state.polling) clearInterval(state.polling);
  if (state.worldPulse) clearInterval(state.worldPulse);
  if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
  state.polling = null;
  state.worldPulse = null;
  state.reconnectTimer = null;
}
function closeTransport(reason) {
  clearTransportTimers();
  setCombatConnected(false);
  const socket = state.socket;
  try {
    if (socket?.readyState === WebSocket.CLOSED) state.socket = null;
    else if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, reason);
  } catch {}
  setWorldConnected(false);
}
function ensurePolling() {
  if (!state.polling && !state.stopped && !state.paused) {
    state.polling = setInterval(safelyPullMessages, 10000);
  }
}
function connectSocket() {
  if (state.stopped || state.paused || !state.config?.webSocketUrl) {
    setWorldConnected(false);
    return;
  }
  const context = activeRequestContext();
  if (!context) {
    setWorldConnected(false);
    return;
  }
  if (state.socket && state.socket.readyState !== WebSocket.CLOSED) return;
  if (state.socket?.readyState === WebSocket.CLOSED) state.socket = null;
  try {
    setWorldConnected(false);
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
    const socket = new WebSocket(state.config.webSocketUrl);
    state.socket = socket;
    state.socketCreates += 1;
    state.socketGeneration += 1;
    socket.addEventListener('open', () => {
      if (state.socket !== socket || state.stopped || state.paused) return;
      const openContext = activeRequestContext();
      if (!openContext) return;
      socket.send(JSON.stringify({ token: openContext.token }));
      setCombatConnected(true);
      const sendWorld = () => {
        if (!activeRequestContext()) return;
        const snapshot = window.POCKETMONSTER_WORLD_STATE?.();
        const frame = buildWorldPosFrame(snapshot);
        if (!frame || state.socket !== socket || socket.readyState !== WebSocket.OPEN) return;
        socket.send(JSON.stringify({ type: 'world-pos', ...frame }));
      };
      sendWorld();
      if (state.worldPulse) clearInterval(state.worldPulse);
      state.worldPulse = setInterval(sendWorld, 250);
    });
    socket.addEventListener('message', event => {
      if (state.socket !== socket || state.stopped || state.paused) return;
      if (typeof event.data !== 'string' || event.data.length > MAX_SOCKET_MESSAGE_LENGTH) return;
      try {
        const message = JSON.parse(event.data);
        if (message?.schemaVersion === COMBAT_AUTHORITY_RESPONSE_SCHEMA) {
          state.combatAuthorityMessages += 1;
          const response = Object.freeze(message);
          for (const listener of [...combatAuthorityListeners]) {
            try { listener(response); } catch {}
          }
        }
        if (message?.type === 'chat') safelyPullMessages();
        if (message?.type === 'world-snapshot') {
          const payload = worldSnapshotPayload(message);
          if (!payload) return;
          const filtered = Object.freeze({ ...payload, players: filterRemotePlayers(payload.players, currentSelfPresenceId()) });
          const accepted = window.POCKETMONSTER_WORLD_PRESENCE?.(filtered);
          if (accepted !== false) setWorldConnected(true);
        }
      } catch {}
    });
    socket.addEventListener('error', () => {
      if (state.socket === socket) {
        setCombatConnected(false);
        setWorldConnected(false);
      }
    });
    socket.addEventListener('close', event => {
      if (state.socket !== socket) return;
      state.socket = null;
      setCombatConnected(false);
      setWorldConnected(false);
      if (state.worldPulse) {
        clearInterval(state.worldPulse);
        state.worldPulse = null;
      }
      if (event?.code === 1008 && isExplicitSessionRejection(event.reason)) {
        invalidateSession('session-rejected');
        return;
      }
      scheduleReconnect();
    });
  } catch {
    setWorldConnected(false);
    scheduleReconnect();
  }
}
function scheduleReconnect() {
  if (state.stopped || state.paused || state.reconnectTimer || !activeRequestContext()) return;
  if (state.socket && state.socket.readyState !== WebSocket.CLOSED) return;
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    connectSocket();
  }, 5000);
}
function suspend() {
  if (state.stopped || state.paused) return;
  state.paused = true;
  state.lifecycleGeneration += 1;
  state.pullQueued = false;
  abortRestRequests();
  closeTransport('page hidden');
}
function resume() {
  if (state.stopped || !state.paused) return;
  state.paused = false;
  state.lifecycleGeneration += 1;
  const currentToken = sessionToken();
  if (!state.token) state.token = currentToken;
  if (!state.token || currentToken !== state.token) {
    invalidateSession('session-expired');
    return;
  }
  renewRestRequests();
  ensurePolling();
  safelyPullMessages();
  connectSocket();
}
function stop(reason = 'session-ended') {
  if (state.stopped) return;
  state.stopped = true;
  state.paused = false;
  state.stopReason = String(reason || 'session-ended');
  state.lifecycleGeneration += 1;
  state.chatViewGeneration += 1;
  state.pullQueued = false;
  abortRestRequests();
  state.token = null;
  state.after = 0;
  closeTransport('session ended');
}
function ensureChatMarkup() {
  ensureChatStyles();
  if (document.querySelector('#gameChat')) return;
  const root = document.createElement('div');
  root.innerHTML = `<button id="chatToggleBtn" class="chat-toggle" aria-label="เปิดแชท">💬 <span id="chatUnread" data-count="0">0</span></button><section id="gameChat" class="game-chat hidden"><header><b>แชทผู้เล่น</b><span>กรุณาใช้คำสุภาพ</span><button id="chatCloseBtn" type="button">×</button></header><div id="chatMessages" class="chat-messages"><div class="chat-empty">ยังไม่มีข้อความ เริ่มทักทายกันได้เลย</div></div><div id="chatError" class="chat-error"></div><form id="chatForm" class="chat-form"><input id="chatInput" maxlength="160" autocomplete="off" placeholder="พิมพ์ข้อความ…"><button type="submit">ส่ง</button></form></section>`;
  document.body.append(...root.children);
}
function mount() {
  ensureChatMarkup();
  const panel = document.querySelector('#gameChat'); if (!panel || panel.dataset.bound) return;
  panel.dataset.bound = 'true';
  const headerNote = panel.querySelector('header span'); const channel = document.createElement('select'); channel.id = 'chatChannel'; channel.className = 'chat-channel'; channel.innerHTML = '<option value="WORLD">🌍 โลก</option><option value="ZONE">📍 พื้นที่</option>'; headerNote?.after(channel);
  document.querySelector('#chatToggleBtn')?.addEventListener('click', () => { panel.classList.toggle('hidden'); if (!panel.classList.contains('hidden')) { const unread = document.querySelector('#chatUnread'); if (unread) { unread.textContent = '0'; unread.dataset.count = '0'; } document.querySelector('#chatInput')?.focus(); } });
  document.querySelector('#chatCloseBtn')?.addEventListener('click', () => panel.classList.add('hidden'));
  document.querySelector('#chatForm')?.addEventListener('submit', event => { event.preventDefault(); void sendMessage().catch(() => {}); });
  channel.addEventListener('change', () => {
    state.chatViewGeneration += 1;
    state.after = 0;
    document.querySelector('#chatMessages')?.replaceChildren();
    safelyPullMessages();
  });
}
async function start() {
  mount();
  const activate = () => {
    if (state.stopped || state.paused || !state.config) return;
    const currentToken = sessionToken();
    if (!currentToken) return;
    if (state.token && state.token !== currentToken) {
      invalidateSession('session-changed');
      return;
    }
    state.token = currentToken;
    ensurePolling();
    safelyPullMessages();
    connectSocket();
  };
  window.addEventListener('pocketmonster:auth-profile-bridge', activate);
  state.config = window.POCKETMONSTER_RUNTIME_CONFIG
    || await fetch('./runtime-config.json', { cache: 'no-store' }).then(response => response.json());
  mount();
  if (state.stopped || state.paused) return;
  activate();
}
const runtime = Object.freeze({
  mount,
  stop,
  combat: Object.freeze({
    sendPrediction: sendCombatPrediction,
    subscribeAuthority: subscribeCombatAuthority,
    subscribeStatus: subscribeCombatStatus,
    diagnostics: () => Object.freeze({
      connected: state.combatConnected,
      socketGeneration: state.socketGeneration,
      predictionSends: state.combatPredictionSends,
      authorityMessages: state.combatAuthorityMessages,
      authoritySubscribers: combatAuthorityListeners.size,
      statusSubscribers: combatStatusListeners.size,
    }),
  }),
  diagnostics: () => Object.freeze({
    socketCreates: state.socketCreates,
    socketGeneration: state.socketGeneration,
    socketReadyState: state.socket?.readyState ?? null,
    pollingActive: Boolean(state.polling),
    worldPulseActive: Boolean(state.worldPulse),
    reconnectPending: Boolean(state.reconnectTimer),
    worldConnected: state.worldConnected,
    combatConnected: state.combatConnected,
    combatPredictionSends: state.combatPredictionSends,
    combatAuthorityMessages: state.combatAuthorityMessages,
    stopped: state.stopped,
    paused: state.paused,
    stopReason: state.stopReason,
    hasToken: Boolean(state.token),
    lifecycleGeneration: state.lifecycleGeneration,
    chatViewGeneration: state.chatViewGeneration,
    pullInFlight: state.pullInFlight,
    pullQueued: state.pullQueued,
  }),
});
Object.defineProperty(window, CHAT_RUNTIME_SLOT, { value: runtime });
window.POCKETMONSTER_CHAT_RUNTIME = runtime;
window.addEventListener('pocketmonster:session-ended', () => stop('session-ended'));
window.addEventListener('pagehide', suspend);
window.addEventListener('pageshow', resume);
void start().catch(error => console.warn('Chat runtime unavailable', error));
}
