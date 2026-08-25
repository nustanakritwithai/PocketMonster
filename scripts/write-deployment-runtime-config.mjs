function secureBaseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('A credential-free HTTPS API URL is required');
  return url.href.replace(/\/$/, '');
}

export function createReadOnlyRuntimeConfig(apiBaseUrl) {
  const base = secureBaseUrl(apiBaseUrl);
  const host = new URL(base).host;
  return {
    configVersion: 1,
    environment: 'vps-readonly',
    apiBaseUrl: base,
    webSocketUrl: `wss://${host}/ws/chat`,
    healthPath: '/api/health',
    versionPath: '/api/version',
    apiVersion: '1.1',
    minimumClientVersion: '8.3.0',
    saveSchemaVersion: 1,
    featureFlags: {
      vpsEnabled: true, vpsReads: true, vpsWrites: false, playerDataWrites: false,
      accountMigration: false, saveMigration: false, economyMutation: false,
      firebaseFallback: true, firebaseAuthBridge: false, accountLinking: false, profileReads: false,
    },
  };
}

export function createAuthProfilePreviewConfig(apiBaseUrl, firebase) {
  if (!firebase?.apiKey || !firebase?.authDomain || !firebase?.projectId || !firebase?.appId) throw new Error('Complete Firebase public web configuration is required');
  const config = createReadOnlyRuntimeConfig(apiBaseUrl);
  return {
    ...config,
    environment: 'hybrid',
    firebase: { ...firebase },
    featureFlags: { ...config.featureFlags, firebaseAuthBridge: true, accountLinking: true, profileReads: true },
  };
}
