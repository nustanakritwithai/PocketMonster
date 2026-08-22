export const GROUND_TILE = 128;
export const GROUND_GRID = 16;
export const GROUND_COARSE = 64;
export const GROUND_REPEAT = 20;
export const SKY_WIDTH = 2;
export const SKY_HEIGHT = 128;

export const SKY_STOPS = Object.freeze({
  0x72c7ef: Object.freeze({ top: 0x72c7ef, mid: null, bottom: 0xbfefff }),
  0x68d2f5: Object.freeze({ top: 0x68d2f5, mid: null, bottom: 0xc8eeff }),
  0x334155: Object.freeze({ top: 0x1a1a2e, mid: 0x1e293b, bottom: 0x334155 }),
});

export function hexToRgb(color) {
  const n = Number(color) >>> 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hash2(a, b) {
  let h = ((a * 374761393) + (b * 668265263) + 0x9e3779b9) >>> 0;
  h = ((h ^ (h >>> 16)) * 0x7feb352d) >>> 0;
  h = ((h ^ (h >>> 15)) * 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function unit(seed, salt) {
  return hash2(seed >>> 0, salt >>> 0) / 4294967296;
}

function makeImage(width, height, rgb) {
  const rgba = new Uint8Array(width * height * 4);
  const [r, g, b] = rgb;
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    rgba[o] = r;
    rgba[o + 1] = g;
    rgba[o + 2] = b;
    rgba[o + 3] = 255;
  }
  return { width, height, rgba };
}

function blendPixel(rgba, i, r, g, b, a) {
  const ia = 1 - a;
  rgba[i] = Math.round(rgba[i] * ia + r * a);
  rgba[i + 1] = Math.round(rgba[i + 1] * ia + g * a);
  rgba[i + 2] = Math.round(rgba[i + 2] * ia + b * a);
}

function blendRect(img, x, y, w, h, rgb, alpha) {
  const [r, g, b] = rgb;
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(img.width, Math.ceil(x + w));
  const y1 = Math.min(img.height, Math.ceil(y + h));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      blendPixel(img.rgba, (py * img.width + px) * 4, r, g, b, alpha);
    }
  }
}

function strokeGrid(img, step, thickness, alpha) {
  for (let i = 0; i < img.width; i += step) {
    blendRect(img, i, 0, thickness, img.height, [0, 0, 0], alpha);
    blendRect(img, 0, i, img.width, thickness, [0, 0, 0], alpha);
  }
}

function scatter(img, count, w, h, rgb, alpha, seed) {
  for (let i = 0; i < count; i++) {
    const x = Math.floor(unit(seed, i * 3 + 1) * img.width);
    const y = Math.floor(unit(seed, i * 3 + 2) * img.height);
    blendRect(img, x, y, w, h, rgb, alpha);
  }
}

export function paintGroundGrid(zoneColor, zoneType = 'grass') {
  const img = makeImage(GROUND_TILE, GROUND_TILE, hexToRgb(zoneColor));
  strokeGrid(img, GROUND_GRID, 1, 0.14);
  strokeGrid(img, GROUND_COARSE, 2, 0.24);
  const seed = ((Number(zoneColor) >>> 0) ^ (zoneType === 'cave' ? 0xca7e0001 : zoneType === 'frozen' ? 0xf20ce001 : zoneType === 'rocky' ? 0xca700001 : zoneType === 'ruins' ? 0x5ca70001 : zoneType === 'marsh' ? 0x5aa70001 : zoneType === 'shrine' ? 0x5a170001 : 0x9a55)) >>> 0;
  scatter(img, 40, 2, 2, [255, 255, 255], 0.05, seed);
  if (zoneType === 'cave') {
    scatter(img, 36, 3, 3, [0, 0, 0], 0.18, seed ^ 0x11111111);
  } else if (zoneType === 'frozen') {
    scatter(img, 34, 2, 3, [125, 211, 252], 0.16, seed ^ 0x33333333);
  } else if (zoneType === 'rocky') {
    scatter(img, 34, 3, 2, [120, 53, 15], 0.14, seed ^ 0x44444444);
  } else if (zoneType === 'ruins') {
    scatter(img, 34, 2, 2, [51, 65, 85], 0.15, seed ^ 0x55555555);
  } else if (zoneType === 'marsh') {
    scatter(img, 34, 2, 3, [132, 204, 22], 0.14, seed ^ 0x66666666);
  } else if (zoneType === 'shrine') {
    scatter(img, 34, 2, 2, [216, 180, 254], 0.15, seed ^ 0x77777777);
  } else {
    scatter(img, 30, 2, 4, [0, 100, 0], 0.08, seed ^ 0x22222222);
  }
  return img;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpRgb(c0, c1, t) {
  return [
    Math.round(lerp(c0[0], c1[0], t)),
    Math.round(lerp(c0[1], c1[1], t)),
    Math.round(lerp(c0[2], c1[2], t)),
  ];
}

export function skyStopsFor(zoneColor) {
  const mapped = SKY_STOPS[zoneColor];
  if (mapped) return mapped;
  const top = hexToRgb(zoneColor);
  const bottom = lerpRgb(top, [255, 255, 255], 0.35);
  return {
    top: (top[0] << 16) | (top[1] << 8) | top[2],
    mid: null,
    bottom: (bottom[0] << 16) | (bottom[1] << 8) | bottom[2],
  };
}

export function paintSkyGradient(zoneColor) {
  const stops = skyStopsFor(zoneColor);
  const top = hexToRgb(stops.top);
  const mid = stops.mid == null ? null : hexToRgb(stops.mid);
  const bottom = hexToRgb(stops.bottom);
  const rgba = new Uint8Array(SKY_WIDTH * SKY_HEIGHT * 4);
  for (let y = 0; y < SKY_HEIGHT; y++) {
    const t = y / (SKY_HEIGHT - 1);
    let rgb;
    if (mid) {
      rgb = t < 0.5 ? lerpRgb(top, mid, t / 0.5) : lerpRgb(mid, bottom, (t - 0.5) / 0.5);
    } else {
      rgb = lerpRgb(top, bottom, t);
    }
    for (let x = 0; x < SKY_WIDTH; x++) {
      const i = (y * SKY_WIDTH + x) * 4;
      rgba[i] = rgb[0];
      rgba[i + 1] = rgb[1];
      rgba[i + 2] = rgb[2];
      rgba[i + 3] = 255;
    }
  }
  return { width: SKY_WIDTH, height: SKY_HEIGHT, rgba };
}
