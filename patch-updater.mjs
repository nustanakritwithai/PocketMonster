const GAME_VERSION = '8.4.0';
const APPLIED_KEY = 'monsterlife-applied-patch';
const ASSET_BASE = new URL(globalThis.window?.__POCKETMONSTER_ASSET_BASE__ || '.', import.meta.url);

function createPatchOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'patchUpdater';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;display:grid;place-items:center;background:radial-gradient(circle at 50% 30%,#172554,#020617 65%);color:#fff;font-family:system-ui,sans-serif';
  overlay.innerHTML = `<div style="width:min(520px,88vw);padding:28px;border:1px solid #334155;border-radius:22px;background:#0f172aee;box-shadow:0 24px 80px #000a"><div style="font-size:13px;color:#60a5fa;font-weight:800">MONSTER LIFE PATCHER</div><h2 style="margin:8px 0 4px">กำลังอัปเดตตัวเกม</h2><div id="patchVersion" style="color:#94a3b8;font-size:13px"></div><div style="height:16px;margin-top:20px;border-radius:999px;background:#1e293b;overflow:hidden"><div id="patchBar" style="height:100%;width:0;background:linear-gradient(90deg,#2563eb,#22d3ee);transition:width .18s"></div></div><div id="patchStatus" style="margin-top:9px;font-size:13px;color:#cbd5e1">กำลังตรวจสอบแพตช์…</div></div>`;
  document.body.append(overlay);
  return overlay;
}

async function downloadPatchFile(file, completedBytes, totalBytes, reportProgress) {
  const url = new URL(file.path, ASSET_BASE);
  url.searchParams.set('patch', file.sha256 || Date.now());
  const response = await fetch(url, { cache: 'reload' });
  if (!response.ok) throw new Error(`ดาวน์โหลด ${file.path} ไม่สำเร็จ (${response.status})`);
  if (!response.body) {
    await response.arrayBuffer();
    reportProgress(completedBytes + file.size);
    return;
  }
  const reader = response.body.getReader();
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    loaded += value.byteLength;
    reportProgress(Math.min(totalBytes, completedBytes + loaded));
  }
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
  if (!manifest.buildId || manifest.gameVersion !== GAME_VERSION || localStorage.getItem(APPLIED_KEY) === manifest.buildId) return;

  const overlay = createPatchOverlay();
  const bar = overlay.querySelector('#patchBar');
  const status = overlay.querySelector('#patchStatus');
  overlay.querySelector('#patchVersion').textContent = `เซิร์ฟเวอร์ ${manifest.serverVersion} • ตัวเกม ${manifest.gameVersion} • แพตช์ ${manifest.buildId}`;
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  const totalBytes = Math.max(1, files.reduce((sum, file) => sum + Number(file.size || 0), 0));
  let completedBytes = 0;
  const reportProgress = value => { bar.style.width = `${Math.min(100, Math.round(value / totalBytes * 100))}%`; };

  try {
    for (let index = 0; index < files.length; index += 1) {
      status.textContent = `กำลังรับแพตช์ ${index + 1}/${files.length}: ${files[index].path}`;
      await downloadPatchFile(files[index], completedBytes, totalBytes, reportProgress);
      completedBytes += Number(files[index].size || 0);
      reportProgress(completedBytes);
    }
    localStorage.setItem(APPLIED_KEY, manifest.buildId);
    bar.style.width = '100%';
    status.textContent = 'อัปเดตสำเร็จ กำลังเข้าเกม…';
    await new Promise(resolve => setTimeout(resolve, 500));
    overlay.remove();
  } catch (error) {
    status.textContent = `อัปเดตไม่สำเร็จ: ${error.message} • กำลังลองใหม่ใน 5 วินาที`;
    status.style.color = '#fca5a5';
    setTimeout(() => location.reload(), 5000);
    await new Promise(() => {});
  }
}
