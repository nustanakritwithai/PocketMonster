const GAME_VERSION = '8.4.0';
const APPLIED_KEY = 'monsterlife-applied-patch';
const ASSET_BASE = new URL(globalThis.window?.__POCKETMONSTER_ASSET_BASE__ || '.', import.meta.url);
const MAX_CONCURRENT_DOWNLOADS = 6;

function readAppliedBuild() {
  for (const storage of [globalThis.localStorage, globalThis.sessionStorage]) {
    try { const value = storage?.getItem?.(APPLIED_KEY); if (value) return value; } catch { /* storage can be blocked */ }
  }
  return '';
}

function rememberAppliedBuild(buildId) {
  let stored = false;
  for (const storage of [globalThis.localStorage, globalThis.sessionStorage]) {
    try { storage?.setItem?.(APPLIED_KEY, buildId); stored = true; } catch { /* storage can be blocked */ }
  }
  return stored;
}

function createPatchOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'patchUpdater';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;display:grid;place-items:center;background:radial-gradient(circle at 50% 30%,#172554,#020617 65%);color:#fff;font-family:system-ui,sans-serif';
  overlay.innerHTML = `<div style="width:min(520px,88vw);padding:28px;border:1px solid #334155;border-radius:22px;background:#0f172aee;box-shadow:0 24px 80px #000a"><div style="font-size:13px;color:#60a5fa;font-weight:800">MONSTER LIFE PATCHER</div><h2 style="margin:8px 0 4px">กำลังอัปเดตตัวเกม</h2><div id="patchVersion" style="color:#94a3b8;font-size:13px"></div><div style="height:16px;margin-top:20px;border-radius:999px;background:#1e293b;overflow:hidden"><div id="patchBar" style="height:100%;width:0;background:linear-gradient(90deg,#2563eb,#22d3ee);transition:width .18s"></div></div><div id="patchStatus" style="margin-top:9px;font-size:13px;color:#cbd5e1">กำลังตรวจสอบแพตช์…</div></div>`;
  document.body.append(overlay);
  return overlay;
}

async function downloadPatchFile(file, reportLoaded, fetchImpl = globalThis.fetch) {
  const url = new URL(file.path, ASSET_BASE);
  const response = await fetchImpl(url, { cache: 'reload' });
  if (!response.ok) throw new Error(`ดาวน์โหลด ${file.path} ไม่สำเร็จ (${response.status})`);
  if (!response.body) {
    await response.arrayBuffer();
    reportLoaded(Number(file.size || 0));
    return;
  }
  const reader = response.body.getReader();
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    loaded += value.byteLength;
    reportLoaded(loaded);
  }
}

export async function refreshPatchFiles(files, reportProgress, { fetchImpl = globalThis.fetch, concurrency = MAX_CONCURRENT_DOWNLOADS } = {}) {
  const loaded = files.map(() => 0);
  let nextIndex = 0;
  const report = (index, value) => {
    loaded[index] = Math.max(loaded[index], Number(value || 0));
    reportProgress(loaded.reduce((sum, bytes) => sum + bytes, 0));
  };
  const worker = async () => {
    for (;;) {
      const index = nextIndex++;
      if (index >= files.length) return;
      await downloadPatchFile(files[index], value => report(index, value), fetchImpl);
      report(index, Number(files[index].size || loaded[index]));
    }
  };
  const workerCount = Math.min(Math.max(1, Number(concurrency) || 1), Math.max(1, files.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

export async function applyPendingPatch() {
  let manifest;
  try {
    const manifestUrl = new URL('patch-manifest.json', ASSET_BASE);
    manifestUrl.searchParams.set('t', Date.now());
    const response = await fetch(manifestUrl, { cache: 'no-store' });
    if (!response.ok) return;
    manifest = await response.json();
  } catch {
    return;
  }
  if (!manifest.buildId || manifest.gameVersion !== GAME_VERSION || readAppliedBuild() === manifest.buildId) return;

  const overlay = createPatchOverlay();
  const bar = overlay.querySelector('#patchBar');
  const status = overlay.querySelector('#patchStatus');
  overlay.querySelector('#patchVersion').textContent = `เซิร์ฟเวอร์ ${manifest.serverVersion} • ตัวเกม ${manifest.gameVersion} • แพตช์ ${manifest.buildId}`;
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  const totalBytes = Math.max(1, files.reduce((sum, file) => sum + Number(file.size || 0), 0));
  const reportProgress = value => { bar.style.width = `${Math.min(100, Math.round(value / totalBytes * 100))}%`; };

  try {
    status.textContent = `กำลังรับแพตช์ ${files.length} ไฟล์…`;
    await refreshPatchFiles(files, reportProgress);
    const canReloadSafely = rememberAppliedBuild(manifest.buildId);
    bar.style.width = '100%';
    status.textContent = 'อัปเดตสำเร็จ กำลังเข้าเกม…';
    await new Promise(resolve => setTimeout(resolve, 500));
    if (canReloadSafely) {
      location.reload();
      await new Promise(() => {});
    }
    overlay.remove();
  } catch (error) {
    status.textContent = `อัปเดตไม่สำเร็จ: ${error.message}`;
    status.style.color = '#fca5a5';
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;margin-top:14px';
    const retry = document.createElement('button');
    retry.type = 'button'; retry.textContent = 'ลองอัปเดตใหม่'; retry.onclick = () => location.reload();
    const continueButton = document.createElement('button');
    continueButton.type = 'button'; continueButton.textContent = 'เข้าเกมด้วยไฟล์ที่มีอยู่'; continueButton.onclick = () => overlay.remove();
    actions.append(retry, continueButton);
    status.parentElement?.append(actions);
  }
}
