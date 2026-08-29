import { loadRuntimeConfig } from './runtime-config.mjs';

const config = await loadRuntimeConfig();
window.POCKETMONSTER_RUNTIME_CONFIG = config;
window.POCKETMONSTER_NEW_WORLD = true;
await import('./game-v900.js?v=900');
