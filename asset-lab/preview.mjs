export const PREVIEW_CAMERA = Object.freeze({
  fov: 32,
  distance: 3.2,
  height: 1.2,
  lookY: 1.1,
});

export const PREVIEW_LIGHT = Object.freeze({
  ambient: 0xffffff,
  key: 0xfff4e6,
  keyIntensity: 1.1,
});

export const PREVIEW_POSES = Object.freeze(['idle', 'walk', 'throw', 'hurt']);
export const PREVIEW_YAWS = Object.freeze([0, 90, 180, 270]);

export function previewState({
  appearanceId,
  contentHash,
  yaw = 0,
  pose = 'idle',
  showTop = false,
  showBottom = false,
} = {}) {
  return Object.freeze({
    camera: PREVIEW_CAMERA,
    light: PREVIEW_LIGHT,
    yaw,
    pose,
    showTop,
    showBottom,
    appearanceId,
    contentHash,
    seed: `${appearanceId}|${contentHash}|${yaw}|${pose}|${showTop}|${showBottom}`,
  });
}

export function previewMatrix(compiled) {
  const shots = [];
  for (const yaw of PREVIEW_YAWS) {
    for (const pose of PREVIEW_POSES) {
      shots.push(previewState({
        appearanceId: compiled.id,
        contentHash: compiled.contentHash,
        yaw,
        pose,
      }));
    }
  }
  shots.push(previewState({ appearanceId: compiled.id, contentHash: compiled.contentHash, showTop: true, pose: 'idle' }));
  shots.push(previewState({ appearanceId: compiled.id, contentHash: compiled.contentHash, showBottom: true, pose: 'idle' }));
  return shots;
}
