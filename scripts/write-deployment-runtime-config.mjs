import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function secureBaseUrl(value, label = 'URL') {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`A credential-free HTTPS ${label} is required`);
  return url.href.replace(/\/$/, '');
}

export function createReadOnlyRuntimeConfig(apiBaseUrl, { assetBaseUrl = '', deployedRelease = '', launchTicket = false } = {}) {
  const base = secureBaseUrl(apiBaseUrl, 'API URL');
  const assetBase = assetBaseUrl ? `${secureBaseUrl(assetBaseUrl, 'asset URL')}/` : '';
  const host = new URL(base).host;
  return {
    configVersion: 1,
    environment: 'vps-readonly',
    assetBaseUrl: assetBase,
    apiBaseUrl: base,
    webSocketUrl: `wss://${host}/ws/chat`,
    healthPath: '/api/health',
    versionPath: '/api/version',
    apiVersion: '1.1',
    minimumClientVersion: '8.3.0',
    saveSchemaVersion: 1,
    deployedRelease,
    featureFlags: {
      vpsEnabled: true, vpsReads: true, vpsWrites: false, playerDataWrites: false,
      accountMigration: false, saveMigration: false, economyMutation: false,
      firebaseFallback: false, firebaseAuthBridge: false, accountLinking: false, profileReads: false,
      launchTicket: launchTicket === true,
    },
  };
}

export function createAuthProfilePreviewConfig(apiBaseUrl, firebase, options = {}) {
  if (!firebase?.apiKey || !firebase?.authDomain || !firebase?.projectId || !firebase?.appId) throw new Error('Complete Firebase public web configuration is required');
  const config = createReadOnlyRuntimeConfig(apiBaseUrl, options);
  return {
    ...config,
    environment: 'hybrid',
    firebase: { ...firebase },
    featureFlags: { ...config.featureFlags, firebaseAuthBridge: true, accountLinking: true, profileReads: true },
  };
}

function loadCheckedInFirebaseConfig(root) {
  const current = JSON.parse(fs.readFileSync(path.join(root, 'runtime-config.json'), 'utf8'));
  if (!current.firebase) throw new Error('runtime-config.json must contain the public Firebase web configuration');
  return current.firebase;
}

function loadFirebaseConfig(root, env) {
  if (env.MONSTERLIFE_AUTH_PROFILE_PREVIEW === 'true') {
    return {
      apiKey: env.FIREBASE_TEST_API_KEY,
      authDomain: env.FIREBASE_TEST_AUTH_DOMAIN,
      projectId: env.FIREBASE_TEST_PROJECT_ID,
      storageBucket: env.FIREBASE_TEST_STORAGE_BUCKET,
      messagingSenderId: env.FIREBASE_TEST_MESSAGING_SENDER_ID,
      appId: env.FIREBASE_TEST_APP_ID,
    };
  }
  return loadCheckedInFirebaseConfig(root);
}

export function writeDeploymentRuntimeConfig({ root = process.cwd(), env = process.env } = {}) {
  const apiBaseUrl = env.MONSTERLIFE_READONLY_ORIGIN;
  if (!apiBaseUrl) throw new Error('MONSTERLIFE_READONLY_ORIGIN is required');
  const assetBaseUrl = env.MONSTERLIFE_ASSET_BASE_URL || 'https://nustanakritwithai.github.io/PocketMonster/';
  const deployedRelease = env.MONSTERLIFE_RELEASE_VERSION || (env.GITHUB_SHA ? `8.4.0-github.${env.GITHUB_SHA.slice(0, 7)}` : '8.4.0-local');
  const enableAuthBridge = env.MONSTERLIFE_FIREBASE_AUTH_BRIDGE !== 'false';
  const launchTicket = env.MONSTERLIFE_LAUNCH_TICKET === 'true';
  const options = { assetBaseUrl, deployedRelease, launchTicket };
  const config = enableAuthBridge
    ? createAuthProfilePreviewConfig(apiBaseUrl, loadFirebaseConfig(root, env), options)
    : createReadOnlyRuntimeConfig(apiBaseUrl, options);
  const output = path.join(root, 'runtime-config.json');
  fs.writeFileSync(output, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return { config, output };
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const { output, config } = writeDeploymentRuntimeConfig();
  console.log(`Wrote ${output} (${config.environment}, ${config.deployedRelease})`);
}
