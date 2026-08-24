import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function createReadOnlyRuntimeConfig(origin) {
  const parsed = new URL(origin);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('MONSTERLIFE_READONLY_ORIGIN must be a plain HTTPS origin');
  }
  const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
  const apiBaseUrl = `${parsed.origin}${path}`;
  return {
    configVersion: 1,
    environment: 'vps-readonly',
    apiBaseUrl,
    webSocketUrl: `${apiBaseUrl.replace(/^https:/, 'wss:')}/ws/chat`,
    apiVersion: '1.1',
    minimumClientVersion: '8.3.0',
    saveSchemaVersion: 1,
    deployedRelease: '',
    featureFlags: {
      vpsEnabled: true,
      vpsReads: true,
      vpsWrites: false,
      playerDataWrites: false,
      accountMigration: false,
      saveMigration: false,
      economyMutation: false,
      firebaseFallback: true,
      firebaseAuthBridge: false,
      accountLinking: false,
      profileReads: false,
    },
  };
}

export function createAuthProfilePreviewConfig(origin, firebase) {
  const config = createReadOnlyRuntimeConfig(origin);
  if (!firebase || !['apiKey', 'authDomain', 'projectId', 'appId'].every(key => typeof firebase[key] === 'string' && firebase[key])) {
    throw new Error('Firebase test-project web configuration is incomplete');
  }
  return {
    ...config,
    environment: 'hybrid',
    firebase: { ...firebase },
    featureFlags: { ...config.featureFlags, firebaseAuthBridge: true, accountLinking: true, profileReads: true },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const authPreview = process.env.MONSTERLIFE_AUTH_PROFILE_PREVIEW === 'true';
  const firebase = authPreview ? {
    apiKey: process.env.FIREBASE_TEST_API_KEY,
    authDomain: process.env.FIREBASE_TEST_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_TEST_PROJECT_ID,
    storageBucket: process.env.FIREBASE_TEST_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_TEST_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_TEST_APP_ID,
  } : undefined;
  const config = authPreview
    ? createAuthProfilePreviewConfig(process.env.MONSTERLIFE_READONLY_ORIGIN || '', firebase)
    : createReadOnlyRuntimeConfig(process.env.MONSTERLIFE_READONLY_ORIGIN || '');
  await writeFile('runtime-config.json', `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}
