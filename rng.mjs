// Monster Life RPG — deterministic seeded RNG.
// Breeding and Raising Events must be reproducible for seeded tests (R23 V7.9
// "deterministic seeded tests"). This is a small, fast, dependency-free PRNG.

// Hash an arbitrary string/number seed into a 32-bit integer.
export function hashSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  const text = String(seed ?? '');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32 — returns a function producing floats in [0, 1).
export function createRng(seed = 0) {
  let a = hashSeed(seed);
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    // Float in [min, max).
    range(min, max) {
      return min + (max - min) * next();
    },
    // Integer in [min, max] inclusive.
    int(min, max) {
      return Math.floor(min + (max - min + 1) * next());
    },
    // True with the given probability.
    chance(probability) {
      return next() < probability;
    },
    // Uniformly pick one element.
    pick(list) {
      if (!Array.isArray(list) || list.length === 0) return undefined;
      return list[Math.floor(next() * list.length)];
    },
    // Weighted pick: entries are [value, weight].
    weighted(entries) {
      const valid = (entries ?? []).filter(e => Array.isArray(e) && e[1] > 0);
      const total = valid.reduce((sum, e) => sum + e[1], 0);
      if (total <= 0) return undefined;
      let roll = next() * total;
      for (const [value, weight] of valid) {
        roll -= weight;
        if (roll < 0) return value;
      }
      return valid[valid.length - 1][0];
    },
  };
}
