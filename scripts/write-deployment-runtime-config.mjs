import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function createReadOnlyRuntimeConfig(origin) {
  const parsed = new URL(origin);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('MONSTERLIFE_READONLY_ORIGIN must be a plain HTTPS origin');
  }
  const apiBaseUrl = parsed.origin;
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
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = createReadOnlyRuntimeConfig(process.env.MONSTERLIFE_READONLY_ORIGIN || '');
  await writeFile('runtime-config.json', `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}
