import { prepareLaunch } from './launch-bootstrap.mjs';
import { applyPendingPatch } from './patch-updater.mjs';
import { loadRuntimeConfig } from './runtime-config.mjs';

const config = await loadRuntimeConfig();
const launch = await prepareLaunch(config);
if (launch.state === 'redirecting') throw new Error('Redirecting to the Firebase launcher');
await applyPendingPatch();
await import('./chat-runtime.mjs?v=8.4.0-presence-protocol-owner');
await import('./unified-mmorpg-hud-v900.mjs?v=930');
await import('./game-v800.js?v=818');
