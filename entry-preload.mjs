import { prepareLaunch } from './launch-bootstrap.mjs';
import { applyPendingPatch } from './patch-updater.mjs';
import { loadRuntimeConfig } from './runtime-config.mjs';

const config = await loadRuntimeConfig();
const launch = await prepareLaunch(config);
if (launch.state === 'redirecting') throw new Error('Redirecting to the Firebase launcher');
await applyPendingPatch();
await import('./game-v800.js?v=810');
