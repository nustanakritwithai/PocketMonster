/**
 * Unified HUD Task 7A — unified minimap projection.
 *
 * Pure world-geometry → frame projection for the Dock minimap. Real bounds
 * and markers only: unknown geometry fails closed to an unavailable frame,
 * positions clamp to the frame edge instead of inventing data, and marker
 * ids must be safe. The Dock consumes the bounded store through the
 * POCKETMONSTER_MINIMAP_HUD global like every other HUD feature.
 */

import { createHudFeatureStore } from './unified-hud-feature-store.mjs';

export const UNIFIED_MINIMAP_KIND = 'pocketmonster:unified-minimap-v1';
export const MINIMAP_MARKER_LIMIT = 100;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const TEXT_LIMIT = 40;

function finiteOf(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clampUnit(value) {
  return Math.min(1, Math.max(-1, value));
}

function safeId(value) {
  const clean = typeof value === 'string' ? value.trim().slice(0, TEXT_LIMIT) : '';
  return ID_PATTERN.test(clean) ? clean : '';
}

function safeKind(value) {
  const clean = typeof value === 'string' ? value.trim().slice(0, TEXT_LIMIT) : '';
  return ID_PATTERN.test(clean) ? clean : 'poi';
}

function unavailableFrame() {
  return Object.freeze({
    kind: UNIFIED_MINIMAP_KIND,
    available: false,
    aspect: 1,
    player: null,
    markers: Object.freeze([]),
  });
}

/**
 * Project world coordinates into the minimap frame (x/z normalized to
 * [-1, 1] around the bounds center, aspect preserved via the longer side).
 */
export function projectMinimapFrame({ bounds = null, markers = [], player = null } = {}) {
  const minX = finiteOf(bounds?.minX);
  const maxX = finiteOf(bounds?.maxX);
  const minZ = finiteOf(bounds?.minZ);
  const maxZ = finiteOf(bounds?.maxZ);
  if (minX === null || maxX === null || minZ === null || maxZ === null) return unavailableFrame();
  const width = maxX - minX;
  const depth = maxZ - minZ;
  if (!(width > 0) || !(depth > 0)) return unavailableFrame();

  const scale = Math.max(width, depth) / 2;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const projectX = x => clampUnit((x - centerX) / scale);
  const projectZ = z => clampUnit((z - centerZ) / scale);

  let playerProjection = null;
  const playerX = finiteOf(player?.x);
  const playerZ = finiteOf(player?.z);
  if (playerX !== null && playerZ !== null) {
    const heading = finiteOf(player?.heading) ?? 0;
    playerProjection = Object.freeze({
      x: projectX(playerX),
      z: projectZ(playerZ),
      heading: ((heading % 360) + 360) % 360,
    });
  }

  const markerProjections = [];
  const candidates = Array.isArray(markers) ? markers : [];
  for (const candidate of candidates) {
    if (markerProjections.length >= MINIMAP_MARKER_LIMIT) break;
    const id = safeId(candidate?.id);
    const markerX = finiteOf(candidate?.x);
    const markerZ = finiteOf(candidate?.z);
    if (!id || markerX === null || markerZ === null) continue;
    if (markerProjections.some(marker => marker.id === id)) continue;
    markerProjections.push(Object.freeze({
      id,
      kind: safeKind(candidate?.kind),
      x: projectX(markerX),
      z: projectZ(markerZ),
    }));
  }

  return Object.freeze({
    kind: UNIFIED_MINIMAP_KIND,
    available: true,
    aspect: width / depth,
    player: playerProjection,
    markers: Object.freeze(markerProjections),
  });
}

function normalizeMinimapForStore(input, revision) {
  if (!input || typeof input !== 'object' || input.available !== true) {
    return Object.freeze({
      revision,
      kind: UNIFIED_MINIMAP_KIND,
      available: false,
      aspect: 1,
      player: null,
      markers: Object.freeze([]),
    });
  }
  const markers = [];
  for (const candidate of Array.isArray(input.markers) ? input.markers : []) {
    if (markers.length >= MINIMAP_MARKER_LIMIT) break;
    if (!candidate || typeof candidate !== 'object') continue;
    const id = safeId(candidate.id);
    if (!id || markers.some(marker => marker.id === id)) continue;
    markers.push(Object.freeze({
      id,
      kind: safeKind(candidate.kind),
      x: clampUnit(finiteOf(candidate.x) ?? 0),
      z: clampUnit(finiteOf(candidate.z) ?? 0),
    }));
  }
  const player = input.player && typeof input.player === 'object'
    ? Object.freeze({
      x: clampUnit(finiteOf(input.player.x) ?? 0),
      z: clampUnit(finiteOf(input.player.z) ?? 0),
      heading: ((finiteOf(input.player.heading) ?? 0) % 360 + 360) % 360,
    })
    : null;
  return Object.freeze({
    revision,
    kind: UNIFIED_MINIMAP_KIND,
    available: true,
    aspect: finiteOf(input.aspect) ?? 1,
    player,
    markers: Object.freeze(markers),
  });
}

/**
 * Bounded minimap store: same revision/dirty/reset semantics as every
 * other HUD feature.
 */
export function createUnifiedMinimapStore() {
  return createHudFeatureStore(normalizeMinimapForStore);
}
