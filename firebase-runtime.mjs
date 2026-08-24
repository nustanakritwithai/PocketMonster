import { getApp, getApps, initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { firebaseConfig as buildFirebaseConfig } from './firebase-config.mjs';

export function resolveFirebaseConfig(runtimeConfig = globalThis.window?.POCKETMONSTER_RUNTIME_CONFIG) {
  const candidate = runtimeConfig?.firebase;
  return candidate && ['apiKey', 'authDomain', 'projectId', 'appId'].every(key => typeof candidate[key] === 'string' && candidate[key])
    ? candidate
    : buildFirebaseConfig;
}

export function getPocketMonsterFirebaseApp(runtimeConfig) {
  const config = resolveFirebaseConfig(runtimeConfig);
  const existing = getApps().find(app => app.options.projectId === config.projectId);
  return existing || (getApps().length === 0 ? initializeApp(config) : initializeApp(config, `pocketmonster-${config.projectId}`));
}
