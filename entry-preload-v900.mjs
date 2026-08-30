import { prepareLaunch } from './launch-bootstrap.mjs';
import { applyPendingPatch } from './patch-updater.mjs';
import { loadRuntimeConfig } from './runtime-config.mjs';

const config = await loadRuntimeConfig();
const launch = await prepareLaunch(config);
if (launch.state === 'redirecting') throw new Error('Redirecting to the Firebase launcher');
await applyPendingPatch();
document.getElementById('accountGate')?.classList.add('hidden');
window.POCKETMONSTER_RUNTIME_CONFIG = config;
window.POCKETMONSTER_COMBINED_CHANNEL = true;
await import('./worlds-v900.mjs?v=902');
