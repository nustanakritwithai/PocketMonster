import { loadRuntimeConfig } from './runtime-config.mjs';

const config = await loadRuntimeConfig();
window.POCKETMONSTER_RUNTIME_CONFIG = config;
window.POCKETMONSTER_COMBINED_CHANNEL = true;
await import('./worlds-v900.mjs?v=900');
