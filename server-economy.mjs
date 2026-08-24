function url(config, path) {
  return new URL(path.replace(/^\//, ''), `${config.apiBaseUrl.replace(/\/$/, '')}/`).href;
}

async function call(config, token, path, { method = 'GET', body, fetchImpl = globalThis.fetch } = {}) {
  const response = await fetchImpl(url(config, path), {
    method,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-API-Version': config.apiVersion,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({ success: false, message: 'เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง' }));
  if (!response.ok || payload.success === false) throw new Error(payload.message || `HTTP ${response.status}`);
  return payload;
}

function html(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export function createServerEconomy(config, sessionToken, options = {}) {
  if (!config?.featureFlags?.vpsReads || !sessionToken) throw new Error('ระบบเงินยังไม่ได้เชื่อมบัญชีเซิร์ฟเวอร์');
  const mutate = (path, body) => {
    if (!config.featureFlags.economyMutation) throw new Error('เซิร์ฟเวอร์ยังปิดการทำรายการเงิน');
    return call(config, sessionToken, path, { ...options, method: 'POST', body });
  };
  return Object.freeze({
    wallet: () => call(config, sessionToken, '/api/wallet', options),
    products: () => call(config, sessionToken, '/api/mall/products', options),
    mailbox: () => call(config, sessionToken, '/api/mailbox', options),
    purchase: (productId, currency) => mutate('/api/mall/orders', { productId, currency, idempotencyKey: crypto.randomUUID() }),
    claim: deliveryId => mutate(`/api/mailbox/${encodeURIComponent(deliveryId)}/claim`, {}),
    createSandboxTopup: (amountSatang, cashPoints) => mutate('/api/payments/orders', { amountSatang, cashPoints, idempotencyKey: crypto.randomUUID() }),
  });
}

export async function mountServerEconomy(config, bridge, { documentRef = globalThis.document } = {}) {
  if (!documentRef || bridge?.state !== 'linked' || !bridge.sessionToken || !config?.featureFlags?.vpsReads) return null;
  const economy = createServerEconomy(config, bridge.sessionToken);
  const topbar = documentRef.querySelector('.compact-topbar');
  if (!topbar) return economy;
  const button = documentRef.createElement('button');
  button.id = 'serverWalletBtn'; button.className = 'pill server-wallet-pill'; button.type = 'button';
  button.innerHTML = '<b>Cash</b> <span id="serverCashCount">…</span> <small>Bonus <span id="serverBonusCount">…</span></small>';
  topbar.insertBefore(button, documentRef.getElementById('menuBtn'));
  const modal = documentRef.createElement('section');
  modal.id = 'serverEconomyModal'; modal.className = 'server-economy hidden'; modal.setAttribute('role', 'dialog');
  modal.innerHTML = '<div class="server-economy-card"><header><div><b>กระเป๋าเงินเซิร์ฟเวอร์</b><small>ยอดและคำสั่งซื้อยืนยันโดย VPS</small></div><button data-close>✕</button></header><div data-status>กำลังโหลด…</div><div data-products></div><h4>กล่องรับของ</h4><div data-mailbox></div><button data-topup>สร้างรายการเติม Sandbox 20 บาท / 20 Cash</button></div>';
  documentRef.body.appendChild(modal);
  const style = documentRef.createElement('style');
  style.textContent = '.server-wallet-pill{color:#a7f3d0;border-color:#10b98199!important;cursor:pointer}.server-wallet-pill small{color:#fde68a;margin-left:4px}.server-economy{position:fixed;inset:0;z-index:1300;display:grid;place-items:center;background:#020617cc;padding:14px}.server-economy.hidden{display:none}.server-economy-card{width:min(520px,95vw);max-height:86vh;overflow:auto;background:#111827;color:#fff;border:1px solid #10b98188;border-radius:18px;padding:14px}.server-economy-card header{display:flex;justify-content:space-between;gap:8px}.server-economy-card header div{display:grid}.server-economy-card header small,[data-status]{color:#94a3b8;font-size:11px}.server-economy-card button{background:#065f46;color:#fff;border:1px solid #34d39977;border-radius:9px;padding:8px;margin:3px}.server-product,.server-mail{padding:9px;margin:7px 0;border:1px solid #ffffff18;border-radius:10px;background:#182235}.server-product small{display:block;color:#cbd5e1}';
  documentRef.head.appendChild(style);
  const cash = documentRef.getElementById('serverCashCount'), bonus = documentRef.getElementById('serverBonusCount');
  const status = modal.querySelector('[data-status]'), productsEl = modal.querySelector('[data-products]'), mailboxEl = modal.querySelector('[data-mailbox]');
  async function refresh() {
    try {
      const [walletPayload, productPayload, mailboxPayload] = await Promise.all([economy.wallet(), economy.products(), economy.mailbox()]);
      const wallet = walletPayload.wallet || walletPayload;
      cash.textContent = Number(wallet.cashBalance ?? wallet.CashBalance ?? 0).toLocaleString();
      bonus.textContent = Number(wallet.bonusBalance ?? wallet.BonusBalance ?? 0).toLocaleString();
      status.textContent = config.featureFlags.economyMutation ? 'เชื่อมต่อ VPS แล้ว' : 'ดูยอดได้ แต่เซิร์ฟเวอร์ปิดการทำรายการ';
      const products = productPayload.products || productPayload.items || [];
      productsEl.innerHTML = products.length ? products.map(p => `<div class="server-product"><b>${html(p.name)}</b><small>${html(p.description)}</small><button data-buy="${html(p.id)}" data-currency="CASH" ${!config.featureFlags.economyMutation || !(p.cashPrice > 0) ? 'disabled' : ''}>ซื้อ ${Number(p.cashPrice)} Cash</button><button data-buy="${html(p.id)}" data-currency="BONUS" ${!config.featureFlags.economyMutation || !(p.bonusPrice > 0) ? 'disabled' : ''}>ซื้อ ${Number(p.bonusPrice)} Bonus</button></div>`).join('') : '<div class="server-product">ยังไม่มีสินค้าเปิดขาย</div>';
      const mails = mailboxPayload.deliveries || mailboxPayload.mailbox || [];
      mailboxEl.innerHTML = mails.length ? mails.map(m => `<div class="server-mail">${html(m.itemId)} ×${Number(m.quantity)} • ${html(m.status)}${m.status === 'PENDING' ? `<button data-claim="${Number(m.id)}">รับของ</button>` : ''}</div>`).join('') : '<div class="server-mail">ยังไม่มีของรอรับ</div>';
    } catch (error) { status.textContent = `เชื่อมต่อระบบเงินไม่สำเร็จ: ${error.message}`; }
  }
  button.addEventListener('click', async () => { modal.classList.remove('hidden'); await refresh(); });
  modal.querySelector('[data-close]').addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', async event => {
    const buy = event.target.closest('[data-buy]'); const claim = event.target.closest('[data-claim]');
    try {
      if (buy) { buy.disabled = true; await economy.purchase(buy.dataset.buy, buy.dataset.currency); await refresh(); }
      if (claim) { claim.disabled = true; await economy.claim(Number(claim.dataset.claim)); await refresh(); }
    } catch (error) { status.textContent = error.message; }
  });
  modal.querySelector('[data-topup]').addEventListener('click', async event => {
    try { event.currentTarget.disabled = true; const result = await economy.createSandboxTopup(2000, 20); status.textContent = `${result.message} (รอ Admin ยืนยัน)`; }
    catch (error) { status.textContent = error.message; } finally { event.currentTarget.disabled = false; }
  });
  await refresh();
  return economy;
}
