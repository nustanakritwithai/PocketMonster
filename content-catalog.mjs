// Monster Life RPG — V8.0 data-driven content catalog (R1, R18, P1).
// Species visuals stay in the runtime; progression data lives here so balance
// and the R22 vertical slice can change without editing game-v800.js.

export const PERSONALITY_MODS = Object.freeze({
  Brave: Object.freeze({ training: Object.freeze({ power: 1.1 }), stressInBattle: 0.9 }),
  Energetic: Object.freeze({ training: Object.freeze({ speed: 1.1 }), restEnergy: 0.9 }),
  Calm: Object.freeze({ training: Object.freeze({ technique: 1.1, spirit: 1.1 }), stressRecovery: 1.1 }),
  Lazy: Object.freeze({ training: Object.freeze({ all: 0.85 }), restEnergy: 1.2 }),
  Aggressive: Object.freeze({ training: Object.freeze({ power: 1.08 }), eventWeight: 0.9 }),
  Curious: Object.freeze({ training: Object.freeze({ technique: 1.05 }), eventReward: 1.15 }),
  Playful: Object.freeze({ training: Object.freeze({ speed: 1.05 }), playBond: 1.15 }),
  Patient: Object.freeze({ training: Object.freeze({ defense: 1.08, spirit: 1.05 }) }),
});

export const FOOD_CATALOG = Object.freeze({
  protein: Object.freeze({ id: 'protein', category: 'daily', name: 'โปรตีน', effects: Object.freeze({ hunger: 24, fitness: 8, bond: 2 }) }),
  healthy: Object.freeze({ id: 'healthy', category: 'daily', name: 'สุขภาพ', effects: Object.freeze({ hunger: 30, energy: 10, health: 20, bond: 2 }) }),
  favorite: Object.freeze({ id: 'favorite', category: 'favorite', name: 'ของโปรด', effects: Object.freeze({ hunger: 20, mood: 22, bond: 5 }), preferenceTags: Object.freeze(['spicy']) }),
  trainingChow: Object.freeze({
    id: 'trainingChow', category: 'training', name: 'อาหารฝึก',
    trainingBuff: Object.freeze({ group: 'training', multiplier: 1.25, durationMs: 10 * 60 * 1000, lines: Object.freeze(['power', 'defense', 'speed', 'technique', 'spirit']) }),
  }),
  mineralBite: Object.freeze({
    id: 'mineralBite', category: 'nutrition', name: 'แร่บำรุง',
    nutrition: Object.freeze({ stat: 'atk', amount: 2 }),
  }),
  emberFruit: Object.freeze({ id: 'emberFruit', category: 'skill', name: 'ผลไฟ', effects: Object.freeze({}) }),
  moonFruit: Object.freeze({ id: 'moonFruit', category: 'evolution', name: 'ผลจันทร์', effects: Object.freeze({}) }),
});

export const EQUIPMENT_CATALOG = Object.freeze([
  Object.freeze({ id: 'ranch_band', slot: 'gear', name: 'Ranch Band', affixes: Object.freeze([Object.freeze({ group: 'atk', stat: 'atk', value: 2 })]) }),
  Object.freeze({ id: 'guard_charm', slot: 'charm', name: 'Guard Charm', affixes: Object.freeze([Object.freeze({ group: 'def', stat: 'def', value: 2 })]) }),
  Object.freeze({ id: 'swift_lens', slot: 'utility', name: 'Swift Lens', affixes: Object.freeze([Object.freeze({ group: 'spd', stat: 'spd', value: 1 })]) }),
  Object.freeze({ id: 'flame_claw', slot: 'gear', name: 'Flame Claw', affixes: Object.freeze([Object.freeze({ group: 'atk', stat: 'atk', value: 5 })]) }),
  Object.freeze({ id: 'guard_band', slot: 'charm', name: 'Guard Band', affixes: Object.freeze([Object.freeze({ group: 'def', stat: 'def', value: 4 })]) }),
  Object.freeze({ id: 'focus_lens', slot: 'utility', name: 'Focus Lens', affixes: Object.freeze([Object.freeze({ group: 'cdr', derived: 'cooldownReduction', value: 0.03 })]) }),
]);

export const DEFAULT_INVENTORY = Object.freeze({
  captureBalls: 12,
  protein: 6,
  healthy: 6,
  favorite: 6,
  trainingChow: 3,
  mineralBite: 3,
  emberFruit: 2,
  moonFruit: 2,
  stash: Object.freeze(['ranch_band', 'guard_charm', 'swift_lens', 'flame_claw', 'guard_band', 'focus_lens']),
});

export const SKILL_CANDIDATES = Object.freeze({
  flameling: Object.freeze([
    Object.freeze({
      id: 'Flame Bite',
      replaces: 'Flame Burst',
      slot: 's1',
      move: Object.freeze({ name: 'Flame Bite', type: 'Fire', power: 32, targetType: 'enemy', range: 5.5, cooldown: 4 }),
      requirements: Object.freeze({
        required: Object.freeze([
          Object.freeze({ field: 'level', op: 'gte', value: 5 }),
          Object.freeze({ field: 'training.power', op: 'gte', value: 18 }),
        ]),
      }),
    }),
  ]),
});

export const SKILL_MUTATIONS = Object.freeze({
  'Flame Bite': Object.freeze([
    Object.freeze({
      id: 'flame_bite_pierce',
      name: 'Flame Bite • Pierce',
      damage: 106,
      utility: 0,
      tradeoffs: Object.freeze([Object.freeze({ stat: 'cooldown', delta: '+1.5s' })]),
      move: Object.freeze({ power: 36, cooldown: 5.5 }),
    }),
  ]),
  'Flame Burst': Object.freeze([
    Object.freeze({
      id: 'flame_burst_wide',
      name: 'Flame Burst • Wide',
      damage: 104,
      utility: 4,
      tradeoffs: Object.freeze([Object.freeze({ stat: 'cooldown', delta: '+1.2s' })]),
      move: Object.freeze({ power: 30, cooldown: 5.2 }),
    }),
  ]),
});

export const RAISING_EVENT_CATALOG = Object.freeze([
  Object.freeze({
    id: 'curious_find', baseWeight: 1.2,
    personalityWeights: Object.freeze({ Curious: 1.25, Brave: 1.1 }),
    trigger: Object.freeze({ statRanges: Object.freeze({ mood: Object.freeze({ min: 50 }) }) }),
    choices: Object.freeze([
      Object.freeze({ id: 'explore', label: 'สำรวจ', effects: Object.freeze({ growthExp: 8, mood: 5, bond: 2 }) }),
      Object.freeze({ id: 'ignore', label: 'ไม่สนใจ', effects: Object.freeze({ mood: -3 }) }),
    ]),
  }),
  Object.freeze({
    id: 'tired_rest', baseWeight: 1.0,
    personalityWeights: Object.freeze({ Lazy: 1.3, Calm: 1.1 }),
    trigger: Object.freeze({ statRanges: Object.freeze({ energy: Object.freeze({ max: 30 }) }) }),
    choices: Object.freeze([
      Object.freeze({ id: 'rest', label: 'ให้พัก', effects: Object.freeze({ energy: 15, stress: -5, bond: 3 }) }),
      Object.freeze({ id: 'push', label: 'ฝืนต่อ', effects: Object.freeze({ energy: -5, stress: 8, mood: -5 }) }),
    ]),
  }),
  Object.freeze({
    id: 'playful_bond', baseWeight: 0.8,
    personalityWeights: Object.freeze({ Playful: 1.3, Curious: 1.1 }),
    trigger: Object.freeze({ statRanges: Object.freeze({ bond: Object.freeze({ min: 40 }), mood: Object.freeze({ min: 60 }) }) }),
    choices: Object.freeze([
      Object.freeze({ id: 'play', label: 'เล่นด้วย', effects: Object.freeze({ mood: 8, bond: 5, trust: 3 }) }),
      Object.freeze({ id: 'scold', label: 'ดุ', effects: Object.freeze({ mood: -10, bond: -3, discipline: 5 }) }),
    ]),
  }),
  Object.freeze({
    id: 'ember_find', baseWeight: 0.7, rare: true,
    trigger: Object.freeze({ statRanges: Object.freeze({ bond: Object.freeze({ min: 20 }) }) }),
    choices: Object.freeze([
      Object.freeze({ id: 'take', label: 'เก็บผลไฟ', effects: Object.freeze({ growthExp: 6, flags: Object.freeze(['found_ember']) }) }),
      Object.freeze({ id: 'leave', label: 'วางไว้', effects: Object.freeze({ mood: 2 }) }),
    ]),
  }),
]);

export const SPECIES_PROGRESSION = Object.freeze({
  flameling: Object.freeze({
    aptitudeBase: Object.freeze({ power: 4, defense: 2, speed: 3, technique: 3, spirit: 2 }),
    favoriteTags: Object.freeze(['spicy']),
    allowedSecondary: Object.freeze(['Dragon', 'Dark']),
    extraEvolutionPaths: Object.freeze([
      Object.freeze({
        id: 'flame_wolf',
        fromFormId: 'flameling_lv2',
        toFormId: 'flame_wolf',
        name: 'Flame Wolf',
        form: 'flame_wolf',
        color: 0xff4d1a,
        scale: 1.22,
        statMods: Object.freeze({ hp: 1.0, atk: 1.08, def: 0.96, spd: 1.02 }),
        secondaryType: 'Dragon',
        skillMapping: Object.freeze({ 'Flame Bite': Object.freeze({ to: 'Flame Fang', carry: 0.85 }) }),
        requires: Object.freeze({
          level: 20,
          training: Object.freeze({ power: 70 }),
          career: Object.freeze({ eliteWins: 2 }),
        }),
      }),
      Object.freeze({
        id: 'magma_bear',
        fromFormId: 'flameling_lv2',
        toFormId: 'magma_bear',
        name: 'Magma Bear',
        form: 'magma_bear',
        color: 0xb45309,
        scale: 1.24,
        statMods: Object.freeze({ hp: 1.04, atk: 0.98, def: 1.08, spd: 0.96 }),
        secondaryType: 'Rock',
        requires: Object.freeze({
          level: 20,
          training: Object.freeze({ defense: 80 }),
        }),
      }),
    ]),
  }),
});

export function equipmentById(id) {
  return EQUIPMENT_CATALOG.find(item => item.id === id) ?? null;
}

export function foodById(id) {
  return FOOD_CATALOG[id] ?? null;
}

export function personalityTrainingMultiplier(personalityId, line) {
  const mods = PERSONALITY_MODS[personalityId]?.training ?? {};
  return mods[line] ?? mods.all ?? 1;
}

export function applySpeciesProgression(species) {
  if (!Array.isArray(species)) return species;
  for (const sp of species) {
    const extra = SPECIES_PROGRESSION[sp.id];
    if (!sp.aptitudeBase) sp.aptitudeBase = extra?.aptitudeBase ?? { power: 3, defense: 3, speed: 3, technique: 3, spirit: 3 };
    if (!sp.favoriteTags) sp.favoriteTags = extra?.favoriteTags ?? [];
    if (extra?.allowedSecondary?.length) {
      const merged = new Set([...(sp.allowedSecondary ?? []), ...extra.allowedSecondary]);
      sp.allowedSecondary = [...merged];
    }
    for (const path of sp.evolutionPaths ?? []) {
      if (!path.fromFormId) path.fromFormId = sp.id;
      if (!path.toFormId) path.toFormId = path.id;
    }
    if (extra?.extraEvolutionPaths?.length) {
      sp.evolutionPaths = [...(sp.evolutionPaths ?? []), ...extra.extraEvolutionPaths.map(p => ({ ...p }))];
    }
  }
  return species;
}
