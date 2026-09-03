import {
  clearLaunchSession,
  prepareLaunch,
  requireActiveOnlineLaunchSession,
} from './launch-bootstrap.mjs?v=912';
import { applyPendingPatch } from './patch-updater.mjs';
import { loadRuntimeConfig } from './runtime-config.mjs';
import { installPersistentMinimapOwner } from './persistent-minimap-owner-v900.mjs?v=2';
import {
  healthVersionGate,
  publishServerGateTelemetry,
} from './server-sync.mjs';

const config = await loadRuntimeConfig();
if (config.manifestValid !== true || config.featureFlags?.launchTicket !== true) {
  clearLaunchSession();
  const status = document.getElementById('startupStatus');
  if (status) {
    status.textContent = 'ไม่สามารถเปิดโหมดออนไลน์ได้: การยืนยัน Monster Life session ไม่พร้อม';
    status.className = 'startup-status error';
  }
  throw Object.assign(new Error('V9 online mode requires a valid launch-ticket configuration'), { code: 'ONLINE_CONFIG_REQUIRED' });
}
const launch = await prepareLaunch(config);
if (launch.state === 'redirecting') throw new Error('Redirecting to the Firebase launcher');
requireActiveOnlineLaunchSession(config, launch.session);
const serverGate = await healthVersionGate(config);
const serverGateObservation = publishServerGateTelemetry(serverGate);
window.POCKETMONSTER_SERVER_GATE = serverGate;
window.POCKETMONSTER_SERVER_GATE_OBSERVATION = serverGateObservation;
if (serverGate.state !== 'healthy') {
  const status = document.getElementById('startupStatus');
  if (status) {
    status.textContent = 'ไม่สามารถเข้าโลกออนไลน์ได้: Server ยังไม่พร้อม กรุณาลองใหม่';
    status.className = 'startup-status error';
  }
  throw Object.assign(new Error(`V9 online Server gate rejected startup (${serverGate.state})`), {
    code: 'ONLINE_SERVER_REQUIRED',
    gateState: serverGate.state,
    reason: serverGate.reason || '',
  });
}
await applyPendingPatch();
document.getElementById('accountGate')?.classList.add('hidden');
window.POCKETMONSTER_RUNTIME_CONFIG = config;
window.POCKETMONSTER_COMBINED_CHANNEL = true;
installPersistentMinimapOwner({ windowLike: window, documentLike: document });
await import('./online-world-shell-v900.mjs?v=25');