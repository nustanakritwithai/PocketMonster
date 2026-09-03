import { createStudioCharacterProvider } from './providers/studio-character.mjs';
import { installStudioCharacterPackage } from './studio-character-package.mjs';

export const STUDIO_CHARACTER_QUERY_PARAM = 'studioCharacter';
export const STUDIO_CHARACTER_DEFAULT_ASSET = 'character.human.pirate-fruit.v1';

function locationParts(locationLike) {
  const href = locationLike?.href || 'https://invalid.local/';
  const url = new URL(href);
  return {
    href,
    origin: locationLike?.origin || url.origin,
    search: locationLike?.search ?? url.search,
  };
}

export function resolveStudioCharacterBootRequest(locationLike) {
  const loc = locationParts(locationLike);
  const raw = new URLSearchParams(loc.search).get(STUDIO_CHARACTER_QUERY_PARAM);
  if (!raw) return null;
  if (raw.length > 512) return { error: 'studioCharacter path is too long' };
  let url;
  try {
    url = new URL(raw, loc.href);
  } catch {
    return { error: 'studioCharacter path is invalid' };
  }
  if (url.origin !== loc.origin) {
    return { error: 'studioCharacter must use a same-origin package URL' };
  }
  if (!url.pathname.endsWith('.pocket-character.json')) {
    return { error: 'studioCharacter must point to a .pocket-character.json file' };
  }
  return { url: url.href, path: `${url.pathname}${url.search}` };
}

export async function bootStudioCharacterLivePlayer({
  assets,
  THREE,
  locationLike = typeof window !== 'undefined' ? window.location : null,
  onStatus,
} = {}) {
  if (!assets || typeof assets.registerProvider !== 'function') {
    throw new Error('bootStudioCharacterLivePlayer needs an AssetEngine');
  }
  const request = resolveStudioCharacterBootRequest(locationLike);
  if (!request) {
    return Object.freeze({ enabled: false, characterId: STUDIO_CHARACTER_DEFAULT_ASSET, reason: 'not-requested' });
  }
  if (request.error) {
    onStatus?.(`Studio character fallback: ${request.error}`, 'warn');
    return Object.freeze({ enabled: false, characterId: STUDIO_CHARACTER_DEFAULT_ASSET, reason: 'invalid-request', error: request.error });
  }

  try {
    onStatus?.('กำลังโหลดตัวละครจาก Character Studio…', '');
    assets.registerProvider('studio-character', createStudioCharacterProvider({ THREE }));
    const installed = await installStudioCharacterPackage(assets, request.url, {
      bundleName: 'studio-live-player',
    });
    const characterId = installed.package.manifest.id;
    onStatus?.(`โหลด Studio Character แล้ว: ${characterId}`, 'ok');
    return Object.freeze({
      enabled: true,
      characterId,
      packageUrl: request.url,
      bundleName: installed.bundleName,
      warnings: installed.package.validation?.warnings || [],
    });
  } catch (error) {
    console.warn('Studio character live-player boot failed; using Pirate Fruit fallback', error);
    onStatus?.('Studio Character โหลดไม่สำเร็จ — ใช้ตัวละครเดิม', 'warn');
    return Object.freeze({
      enabled: false,
      characterId: STUDIO_CHARACTER_DEFAULT_ASSET,
      packageUrl: request.url,
      reason: 'load-failed',
      error: error?.message || String(error),
    });
  }
}
