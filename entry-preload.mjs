import { prepareLaunch } from './launch-bootstrap.mjs';
import { applyPendingPatch } from './patch-updater.mjs';
import { loadRuntimeConfig } from './runtime-config.mjs';

const chatBoot = import('./chat-runtime.mjs?v=8.4.0-chat-visible');
const config = await loadRuntimeConfig();
const launch = await prepareLaunch(config);
if (launch.state === 'redirecting') throw new Error('Redirecting to the Firebase launcher');
if (launch.state === 'authenticated') document.getElementById('accountGate')?.classList.add('hidden');
await applyPendingPatch();
await chatBoot;
await import('./game-v800.js?v=810');
