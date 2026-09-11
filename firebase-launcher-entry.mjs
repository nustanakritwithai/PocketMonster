const status = document.getElementById('startupStatus');

try {
  const response = await fetch('./runtime-config.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Launcher config failed (${response.status})`);
  const config = await response.json();
  const assetBase = new URL(config.assetBaseUrl);
  if (!config?.featureFlags?.launchTicket) {
    throw Object.assign(new Error('Monster Life online launch-ticket mode is required'), { code: 'ONLINE_CONFIG_REQUIRED' });
  } else {
    let brave = false;
    try { brave = await globalThis.navigator?.brave?.isBrave?.() === true; } catch { brave = false; }
    let gameWindow = null;
    let pendingLaunch = null;
    const openGameWindow = () => {
      if (!brave || (gameWindow && !gameWindow.closed)) return gameWindow;
      gameWindow = window.open('about:blank', 'monsterlife-game');
      return gameWindow;
    };
    if (brave) {
      window.addEventListener('pocketmonster:auth-intent', event => { if (event.detail?.method !== 'google') openGameWindow(); });
      window.addEventListener('message', event => {
        if (!pendingLaunch || event.origin !== assetBase.origin || event.source !== gameWindow || event.data?.kind !== 'monsterlife-launch-context-request-v1') return;
        gameWindow.postMessage({ kind: 'monsterlife-launch-context-v1', context: pendingLaunch.launchContext }, assetBase.origin);
      });
    }
    const [{ requireFirebaseLogin }, { issueLaunchTicket }] = await Promise.all([
      import('./firebase-auth-ui.mjs'),
      import('./server-auth.mjs'),
    ]);
    const user = await requireFirebaseLogin(config);
    document.querySelector('#accountGate')?.classList.add('hidden');
    if (status) status.textContent = 'กำลังเปิดเกมอย่างปลอดภัย…';
    const launch = await issueLaunchTicket(config, user);
    if (launch) {
      if (!brave) {
        window.name = JSON.stringify(launch.launchContext);
        location.replace(launch.launchUrl);
      } else {
        pendingLaunch = launch;
        const target = openGameWindow();
        if (target) target.location.replace(launch.launchUrl);
        else {
          if (status) status.textContent = 'แตะเพื่อเปิดเกมบน Brave อย่างปลอดภัย';
          const button = document.createElement('button');
          button.type = 'button'; button.textContent = 'เปิดเกม'; button.className = 'account-primary';
          button.addEventListener('click', () => { const popup = openGameWindow(); if (popup) popup.location.replace(launch.launchUrl); });
          status?.after(button);
        }
      }
    }
  }
} catch (error) {
  if (status) { status.textContent = `เปิดเกมไม่สำเร็จ: ${error.message || error}`; status.className = 'startup-status error'; }
}
