import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function launcherHtml({ apiOrigin, release }) {
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="referrer" content="no-referrer" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' https://www.gstatic.com; connect-src 'self' ${apiOrigin} https://*.googleapis.com https://*.firebaseio.com; img-src 'self' data:; style-src 'self'; font-src 'self'; frame-src 'self' https://accounts.google.com https://pocketmonster-game.firebaseapp.com; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="theme-color" content="#07111f" />
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <meta http-equiv="Pragma" content="no-cache" />
  <meta http-equiv="Expires" content="0" />
  <title>Pocket Monster</title>
  <link rel="stylesheet" href="./firebase-launcher.css?v=${release}" />
  <script type="module" src="./firebase-launcher-entry.mjs?v=${release}"></script>
</head>
<body>
  <main class="launcher-shell">
    <div id="startupStatus" class="startup-status" aria-live="polite">กำลังเปิดเกม…</div>
    <section id="accountGate" class="account-gate hidden" aria-label="เข้าสู่ระบบ Pocket Monster">
      <div id="loginPage" class="account-card auth-page">
        <div class="account-logo">🐾</div>
        <h1>Pocket Monster</h1>
        <p>เข้าสู่ระบบเพื่อเข้าเกม</p>
        <form id="loginForm">
          <label>อีเมล<input id="loginEmail" type="email" autocomplete="email" required placeholder="อีเมลของคุณ" /></label>
          <label>รหัสผ่าน<input id="loginPassword" type="password" autocomplete="current-password" required placeholder="รหัสผ่าน" /></label>
          <button id="loginAccountBtn" class="account-primary" type="submit">เข้าสู่ระบบ</button>
        </form>
        <button id="googleLoginBtn" class="account-secondary" type="button">เข้าสู่ระบบด้วย Google</button>
        <button id="guestLoginBtn" class="account-secondary" type="button">เข้าเล่นแบบแขก</button>
        <div id="loginStatus" class="account-status" aria-live="polite"></div>
        <div class="auth-switch">ยังไม่มีบัญชี? <button id="showRegisterBtn" type="button">สมัครไอดีใหม่</button></div>
      </div>
      <div id="registerPage" class="account-card auth-page hidden">
        <button id="backToLoginBtn" class="account-back" type="button">← กลับหน้าเข้าสู่ระบบ</button>
        <div class="account-logo">🐾</div>
        <h1>สมัครไอดีใหม่</h1>
        <form id="registerForm">
          <label>อีเมล<input id="registerEmail" type="email" autocomplete="email" required placeholder="อีเมลของคุณ" /></label>
          <label>ชื่อในเกม<input id="registerDisplayName" maxlength="30" placeholder="ชื่อที่แสดงในเกม" /></label>
          <label>รหัสผ่าน<input id="registerPassword" type="password" autocomplete="new-password" required placeholder="อย่างน้อย 8 ตัว" /></label>
          <label>ยืนยันรหัสผ่าน<input id="registerConfirm" type="password" autocomplete="new-password" required placeholder="กรอกรหัสผ่านอีกครั้ง" /></label>
          <button id="registerAccountBtn" class="account-primary" type="submit">สร้างบัญชี</button>
        </form>
        <div id="registerStatus" class="account-status" aria-live="polite"></div>
      </div>
    </section>
  </main>
</body>
</html>
`;
}

function launcherCss() {
  return `:root{color-scheme:dark;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#07111f;color:#eef6ff}*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#07111f}body{min-height:100vh;display:grid;place-items:center}.hidden{display:none!important}.launcher-shell{width:min(92vw,420px);padding:24px}.startup-status{text-align:center;font-size:14px;color:#b9c9da}.account-gate{width:100%}.account-card{display:grid;gap:14px;padding:22px;border:1px solid #26384c;border-radius:18px;background:#0d1a2a;box-shadow:0 18px 48px #0008}.account-logo{text-align:center;font-size:42px}.account-card h1{margin:0;text-align:center;font-size:24px}.account-card p{margin:0;text-align:center;color:#b9c9da}.account-card form{display:grid;gap:12px}.account-card label{display:grid;gap:6px;font-size:13px;color:#c8d7e6}.account-card input{width:100%;border:1px solid #38506a;border-radius:10px;background:#07111f;color:#fff;padding:12px;font:inherit}.account-card button{border:0;border-radius:10px;padding:12px;font:700 14px inherit;cursor:pointer}.account-primary{background:#38bdf8;color:#062033}.account-secondary{background:#1a2a3d;color:#eef6ff}.account-back,.auth-switch button{background:transparent!important;color:#7dd3fc!important;padding:4px!important}.account-status{min-height:18px;font-size:12px;color:#fca5a5}.account-status.ok{color:#86efac}.auth-switch{text-align:center;font-size:12px;color:#9fb2c6}@media(max-height:520px){.launcher-shell{padding:12px}.account-card{padding:14px;gap:9px}.account-logo{font-size:30px}.account-card input,.account-card button{padding:9px}}\n`;
}

export function buildFirebaseLauncher({ root = process.cwd(), output = path.join(root, 'firebase-launcher') } = {}) {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'runtime-config.json'), 'utf8'));
  const assetBase = config.assetBaseUrl;
  const apiOrigin = new URL(config.apiBaseUrl).origin;
  if (!assetBase || new URL(assetBase).protocol !== 'https:') throw new Error('runtime-config.json requires an HTTPS assetBaseUrl');
  if (new URL(apiOrigin).protocol !== 'https:') throw new Error('runtime-config.json requires an HTTPS apiBaseUrl');
  const release = encodeURIComponent(config.deployedRelease || Date.now());
  const html = launcherHtml({ apiOrigin, release });

  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'index.html'), html, 'utf8');
  fs.writeFileSync(path.join(output, '404.html'), html, 'utf8');
  fs.writeFileSync(path.join(output, 'firebase-launcher.css'), launcherCss(), 'utf8');
  fs.copyFileSync(path.join(root, 'firebase-launcher-entry.mjs'), path.join(output, 'firebase-launcher-entry.mjs'));
  for (const module of ['firebase-auth-ui.mjs', 'firebase-runtime.mjs', 'firebase-config.mjs', 'server-auth.mjs', 'launch-bootstrap.mjs']) {
    fs.copyFileSync(path.join(root, module), path.join(output, module));
  }
  fs.writeFileSync(path.join(output, 'runtime-config.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return { output, assetBase, release: config.deployedRelease };
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const result = buildFirebaseLauncher();
  console.log(`Built Firebase launcher in ${result.output}`);
  console.log(`Assets: ${result.assetBase} (${result.release})`);
}
