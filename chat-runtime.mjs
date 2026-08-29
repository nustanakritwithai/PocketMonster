const SESSION_KEY = 'monsterlife.session.v1';
const state = { config: null, token: null, after: 0, socket: null, polling: null };
function ensureChatStyles() {
  if (document.querySelector('#chatRuntimeStyles')) return;
  const style = document.createElement('style'); style.id = 'chatRuntimeStyles';
  style.textContent = '.chat-toggle{left:auto!important;bottom:auto!important;top:max(8px,var(--safe-top,8px))!important;right:max(86px,calc(var(--safe-right,8px) + 74px))!important;z-index:15000!important;pointer-events:auto!important}.game-chat{left:auto!important;bottom:auto!important;top:max(58px,calc(var(--safe-top,8px) + 50px))!important;right:max(10px,var(--safe-right,8px))!important;width:min(320px,calc(100vw - 24px))!important;height:min(42vh,calc(100dvh - 58px - 148px))!important;max-height:calc(100dvh - 58px - 148px)!important;z-index:15001!important;pointer-events:auto!important}.game-chat.hidden{display:none!important}';
  document.head.append(style);
}

function sessionToken() {
  if (window.POCKETMONSTER_SERVER_SESSION_TOKEN) return window.POCKETMONSTER_SERVER_SESSION_TOKEN;
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null')?.sessionToken || null; } catch { return null; }
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
async function pullMessages() {
  if (!state.token) return;
  const channel = document.querySelector('#chatChannel')?.value || 'WORLD';
  const response = await fetch(api(`/api/chat/messages?after=${state.after}&channel=${channel}`), { headers: { Authorization: `Bearer ${state.token}`, Accept: 'application/json' }, cache: 'no-store' });
  if (!response.ok) { const error = document.querySelector('#chatError'); if (error) error.textContent = 'เชื่อมต่อแชทไม่สำเร็จ'; return; }
  const payload = await response.json(); for (const message of payload.messages || []) { state.after = Math.max(state.after, Number(message.id) || 0); addMessage(message); }
}
async function sendMessage() {
  const input = document.querySelector('#chatInput'); const message = input?.value.trim(); if (!message || !state.token) return;
  const channel = document.querySelector('#chatChannel')?.value || 'WORLD';
  const response = await fetch(api('/api/chat/send'), { method: 'POST', headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message, channel }) });
  if (response.ok && input) { input.value = ''; await pullMessages(); } else { const error = document.querySelector('#chatError'); if (error) error.textContent = 'ส่งข้อความไม่สำเร็จ'; }
}
function connectSocket() {
  if (!state.token || !state.config.webSocketUrl) return;
  try { state.socket = new WebSocket(state.config.webSocketUrl); state.socket.addEventListener('open', () => state.socket.send(JSON.stringify({ token: state.token }))); state.socket.addEventListener('message', event => { try { if (JSON.parse(event.data)?.type === 'chat') void pullMessages(); } catch {} }); state.socket.addEventListener('close', () => setTimeout(connectSocket, 5000)); } catch { setTimeout(connectSocket, 5000); }
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
  document.querySelector('#chatForm')?.addEventListener('submit', event => { event.preventDefault(); void sendMessage(); });
  channel.addEventListener('change', () => { state.after = 0; document.querySelector('#chatMessages')?.replaceChildren(); void pullMessages(); });
}
async function start() {
  mount();
  const activate = () => {
    state.token = sessionToken();
    if (!state.token || !state.config || state.polling) return;
    void pullMessages();
    connectSocket();
    state.polling = setInterval(() => void pullMessages(), 10000);
  };
  window.addEventListener('pocketmonster:auth-profile-bridge', activate, { once: true });
  state.config = await fetch('./runtime-config.json', { cache: 'no-store' }).then(response => response.json());
  mount();
  state.token = sessionToken();
  if (!state.token) return;
  activate();
}
void start().catch(error => console.warn('Chat runtime unavailable', error));
