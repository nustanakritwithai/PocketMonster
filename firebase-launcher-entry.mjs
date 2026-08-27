const status = document.getElementById('startupStatus');

try {
  const response = await fetch('./runtime-config.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Launcher config failed (${response.status})`);
  const config = await response.json();
  const assetBase = new URL(config.assetBaseUrl);
  if (!config?.featureFlags?.launchTicket) {
    if (status) status.textContent = 'กำลังโหลดเกม…';
    await import(new URL(`game-v800.js?v=${encodeURIComponent(config.deployedRelease || Date.now())}`, assetBase).href);
    if (status) status.remove();
  } else {
    const [{ requireFirebaseLogin }, { issueLaunchTicket }] = await Promise.all([
      import('./firebase-auth-ui.mjs'),
      import('./server-auth.mjs'),
    ]);
    const user = await requireFirebaseLogin(config);
    if (status) status.textContent = 'กำลังเปิดเกมอย่างปลอดภัย…';
    const launch = await issueLaunchTicket(config, user);
    window.name = JSON.stringify(launch.launchContext);
    location.replace(launch.launchUrl);
  }
} catch (error) {
  if (status) { status.textContent = `เปิดเกมไม่สำเร็จ: ${error.message || error}`; status.className = 'startup-status error'; }
}
