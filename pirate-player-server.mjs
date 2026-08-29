import {
  PIRATE_FRUIT_ASSET_FORM,
  PIRATE_FRUIT_PLAYER_ID,
  PIRATE_FRUIT_SOURCE,
  PIRATE_PRESENTATION_FORBIDDEN,
} from './asset-presentation/providers/pirate-fruit-player.mjs';

/** Pocket Monster human-character server APIs, hosted on the Pirate Fruit player. */
export const POCKET_CHARACTER_SERVER_FUNCTIONS = Object.freeze([
  'readPlayerState',
  'saveCharacterProfile',
  'syncPlayerData',
  'loadServerSave',
  'saveServerSave',
]);

export const PLAYER_CHARACTER_SERVER = Object.freeze({
  host: 'pirate-fruit',
  assetId: PIRATE_FRUIT_PLAYER_ID,
  assetForm: PIRATE_FRUIT_ASSET_FORM,
  appearanceId: 'appearance.human.player-orange.v1',
  visualContract: PIRATE_FRUIT_SOURCE.contract,
  pocketFunctions: POCKET_CHARACTER_SERVER_FUNCTIONS,
});

function cleanName(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function piratePlayerCharacterPayload(input = {}) {
  const payload = {
    name: cleanName(input.name) || 'Pirate',
    characterId: PLAYER_CHARACTER_SERVER.assetId,
    characterSystem: PLAYER_CHARACTER_SERVER.host,
    appearanceId: PLAYER_CHARACTER_SERVER.appearanceId,
    assetForm: PLAYER_CHARACTER_SERVER.assetForm,
    visualContract: PLAYER_CHARACTER_SERVER.visualContract,
  };
  for (const field of PIRATE_PRESENTATION_FORBIDDEN) delete payload[field];
  return Object.freeze(payload);
}

export function characterFromPlayerState(playerState) {
  const profile = playerState?.profile && typeof playerState.profile === 'object' ? playerState.profile : playerState;
  const character = profile?.character && typeof profile.character === 'object' ? profile.character : {};
  return piratePlayerCharacterPayload({
    name: cleanName(character.name) || cleanName(profile?.displayName),
  });
}

export function publishPlayerCharacterBinding({ writeArmed = false, playerState = null, name } = {}) {
  const payload = playerState
    ? characterFromPlayerState(playerState)
    : piratePlayerCharacterPayload({ name });
  return Object.freeze({
    ...PLAYER_CHARACTER_SERVER,
    writeArmed: writeArmed === true,
    payload,
  });
}

export async function savePirateHostedCharacter({
  saveCharacterProfile,
  config,
  sessionToken,
  character,
  writesEnabled,
  live,
  ...requestOptions
} = {}) {
  const liveValues = typeof live === 'function' ? live() : (live || {});
  const payload = piratePlayerCharacterPayload({ ...liveValues, ...character });
  if (!writesEnabled) {
    return Object.freeze({
      success: false,
      skipped: true,
      reason: 'player-data-writes-disabled',
      character: payload,
    });
  }
  if (typeof saveCharacterProfile !== 'function') throw new Error('saveCharacterProfile is required');
  const result = await saveCharacterProfile(config, sessionToken, payload, requestOptions);
  if (result && typeof result === 'object') return Object.freeze({ ...result, character: payload });
  return Object.freeze({ success: true, character: payload, result });
}
