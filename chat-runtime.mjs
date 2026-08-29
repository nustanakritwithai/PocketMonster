const SESSION_KEY = 'monsterlife.session.v1';
const state = { config: null, token: null, after: 0, socket: null, polling: null };

function sessionToken() {
  if (window.POCKETMONSTER_SERVER_SESSION_TOKEN) return window.POCKETMONSTER_SERVER_SESSION_TOKEN;
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null')?.sessionToken || null; } catch { return null; }
}
function api(path) { return new URL(path.replace(/^\//, ''), `${state.config.apiBaseUrl.replace(/\/$/, '')}/`).href; }
function addMessage(message) {
  const row = document.createElement('div'); row.className = 'ml-chat-row';
  const name = document.createElement('b'); name.textContent = message.username || message.displayName || 'ผู้เล่น';
  if (String(message.username || '').startsWith('aibot_')) name.className = 'ml-chat-bot';
  const text = document.createElement('span'); text.textContent = `: ${message.message}`;
  row.append(name, text); document.querySelector('#mlChatMessages')?.append(row);
  const box = document.querySelector('#mlChatMessages'); if (box) box.scrollTop = box.scrollHeight;
}
async function pullMessages() {
  if (!state.token) return;
  const channel = document.querySelector('#mlChatChannel')?.value || 'WORLD';
  const response = await fetch(api(`/api/chat/messages?after=${state.after}&channel=${channel}`), { headers: { Authorization: `Bearer ${state.token}`, Accept: 'application/json' }, cache: 'no-store' });
  if (!response.ok) return;
  const payload = await response.json(); for (const message of payload.messages || []) { state.after = Math.max(state.after, Number(message.id) || 0); addMessage(message); }
}
async function sendMessage() {
  const input = document.querySelector('#mlChatInput'); const message = input?.value.trim(); if (!message || !state.token) return;
  const channel = document.querySelector('#mlChatChannel')?.value || 'WORLD';
  const response = await fetch(api('/api/chat/send'), { method: 'POST', headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message, channel }) });
  if (response.ok && input) { input.value = ''; await pullMessages(); }
}
function connectSocket() {
  if (!state.token || !state.config.webSocketUrl) return;
  try { state.socket = new WebSocket(state.config.webSocketUrl); state.socket.addEventListener('open', () => state.socket.send(JSON.stringify({ token: state.token }))); state.socket.addEventListener('message', event => { try { if (JSON.parse(event.data)?.type === 'chat') void pullMessages(); } catch {} }); state.socket.addEventListener('close', () => setTimeout(connectSocket, 5000)); } catch { setTimeout(connectSocket, 5000); }
}
function mount() {
  if (document.querySelector('#mlChatPanel')) return;
  const style = document.createElement('style'); style.textContent = `.ml-chat-panel{position:fixed;z-index:80;left:14px;bottom:14px;width:min(360px,calc(100vw - 28px));padding:10px;border:1px solid #ffffff26;border-radius:14px;background:rgba(7,14,25,.9);color:#f8fafc;backdrop-filter:blur(8px);font:12px system-ui,sans-serif}.ml-chat-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;font-weight:800}.ml-chat-messages{height:130px;overflow:auto;padding:5px 7px;background:#020617aa;border-radius:9px}.ml-chat-row{padding:3px 0;line-height:1.35}.ml-chat-bot{color:#facc15}.ml-chat-compose{display:flex;gap:5px;margin-top:7px}.ml-chat-compose input{min-width:0;flex:1;padding:7px;border:0;border-radius:7px}.ml-chat-compose button,.ml-chat-channel{border:0;border-radius:7px;padding:7px;background:#2563eb;color:white}.ml-chat-channel{background:#334155}`; document.head.append(style);
  const panel = document.createElement('section'); panel.id = 'mlChatPanel'; panel.className = 'ml-chat-panel'; panel.innerHTML = `<div class="ml-chat-head"><span>แชทโลก</span><select id="mlChatChannel" class="ml-chat-channel"><option value="WORLD">WORLD</option><option value="ZONE">ZONE</option></select></div><div id="mlChatMessages" class="ml-chat-messages"></div><form id="mlChatForm" class="ml-chat-compose"><input id="mlChatInput" maxlength="500" placeholder="พิมพ์ข้อความ..."><button type="submit">ส่ง</button></form>`; document.body.append(panel); document.querySelector('#mlChatForm').addEventListener('submit', event => { event.preventDefault(); void sendMessage(); }); document.querySelector('#mlChatChannel').addEventListener('change', () => { state.after = 0; document.querySelector('#mlChatMessages').replaceChildren(); void pullMessages(); });
}
async function start() {
  const activate = () => {
    state.token = sessionToken();
    if (!state.token || !state.config || state.polling) return;
    mount();
    void pullMessages();
    connectSocket();
    state.polling = setInterval(() => void pullMessages(), 10000);
  };
  window.addEventListener('pocketmonster:auth-profile-bridge', activate, { once: true });
  state.config = await fetch('./runtime-config.json', { cache: 'no-store' }).then(response => response.json()); state.token = sessionToken();
  if (!state.token) return;
  activate();
}
void start().catch(error => console.warn('Chat runtime unavailable', error));
