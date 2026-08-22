export const RUNTIME_TYPES = Object.freeze([
  'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground',
  'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy',
]);

export const TYPE_LABEL_TH = Object.freeze({
  Normal: 'ปกติ', Fire: 'ไฟ', Water: 'น้ำ', Electric: 'สายฟ้า', Grass: 'พืช', Ice: 'น้ำแข็ง',
  Fighting: 'ต่อสู้', Poison: 'พิษ', Ground: 'ดิน', Flying: 'บิน', Psychic: 'จิต', Bug: 'แมลง',
  Rock: 'หิน', Ghost: 'วิญญาณ', Dragon: 'มังกร', Dark: 'มืด', Steel: 'เหล็ก', Fairy: 'ภูต',
});

export const TYPE_COLOR = Object.freeze({
  Normal: '#8a8a78', Fire: '#ef6c32', Water: '#4f87e8', Electric: '#e8bd22', Grass: '#63b34b', Ice: '#79c9c9',
  Fighting: '#b9342c', Poison: '#93489e', Ground: '#cba94e', Flying: '#8d7cdb', Psychic: '#ec4d7f', Bug: '#9cab25',
  Rock: '#a48e38', Ghost: '#61568f', Dragon: '#6a45d3', Dark: '#584b43', Steel: '#8e8eaa', Fairy: '#dc87b8',
});

export const TYPE_EMOJI = Object.freeze({
  Normal: '⚪', Fire: '🔥', Water: '💧', Electric: '⚡', Grass: '🌿', Ice: '❄️', Fighting: '🥊', Poison: '☠️',
  Ground: '⛰️', Flying: '🪽', Psychic: '🔮', Bug: '🐛', Rock: '🪨', Ghost: '👻', Dragon: '🐉', Dark: '🌑', Steel: '⚙️', Fairy: '✨',
});

const RAW_TYPE_CHART = {
  Normal: { Rock: 0.5, Ghost: 0, Steel: 0.5 },
  Fire: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Bug: 2, Rock: 0.5, Dragon: 0.5, Steel: 2 },
  Water: { Fire: 2, Water: 0.5, Grass: 0.5, Ground: 2, Rock: 2, Dragon: 0.5 },
  Electric: { Water: 2, Electric: 0.5, Grass: 0.5, Ground: 0, Flying: 2, Dragon: 0.5 },
  Grass: { Fire: 0.5, Water: 2, Grass: 0.5, Poison: 0.5, Ground: 2, Flying: 0.5, Bug: 0.5, Rock: 2, Dragon: 0.5, Steel: 0.5 },
  Ice: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Ground: 2, Flying: 2, Dragon: 2, Steel: 0.5 },
  Fighting: { Normal: 2, Ice: 2, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5, Rock: 2, Ghost: 0, Dark: 2, Steel: 2, Fairy: 0.5 },
  Poison: { Grass: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0, Fairy: 2 },
  Ground: { Fire: 2, Electric: 2, Grass: 0.5, Poison: 2, Flying: 0, Bug: 0.5, Rock: 2, Steel: 2 },
  Flying: { Electric: 0.5, Grass: 2, Fighting: 2, Bug: 2, Rock: 0.5, Steel: 0.5 },
  Psychic: { Fighting: 2, Poison: 2, Psychic: 0.5, Dark: 0, Steel: 0.5 },
  Bug: { Fire: 0.5, Grass: 2, Fighting: 0.5, Poison: 0.5, Flying: 0.5, Psychic: 2, Ghost: 0.5, Dark: 2, Steel: 0.5, Fairy: 0.5 },
  Rock: { Fire: 2, Ice: 2, Fighting: 0.5, Ground: 0.5, Flying: 2, Bug: 2, Steel: 0.5 },
  Ghost: { Normal: 0, Psychic: 2, Ghost: 2, Dark: 0.5 },
  Dragon: { Dragon: 2, Steel: 0.5, Fairy: 0 },
  Dark: { Fighting: 0.5, Psychic: 2, Ghost: 2, Dark: 0.5, Fairy: 0.5 },
  Steel: { Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Rock: 2, Steel: 0.5, Fairy: 2 },
  Fairy: { Fire: 0.5, Fighting: 2, Poison: 0.5, Dragon: 2, Dark: 2, Steel: 0.5 },
};

export const TYPE_CHART = Object.freeze(Object.fromEntries(
  Object.entries(RAW_TYPE_CHART).map(([type, row]) => [type, Object.freeze(row)]),
));

const SOURCE_TYPE_MAP = Object.freeze(Object.fromEntries([
  ...RUNTIME_TYPES.map(type => [type.toUpperCase(), type]),
  ['LIGHT', 'Fairy'],
]));
const TYPE_SET = new Set(RUNTIME_TYPES);
const VALID_MULTIPLIERS = new Set([0, 0.25, 0.5, 1, 2, 4]);

export function sourceTypeToRuntime(sourceType) {
  if (typeof sourceType !== 'string') return null;
  return SOURCE_TYPE_MAP[sourceType.trim().toUpperCase()] ?? null;
}

export function typeProfile(runtimeType) {
  if (!TYPE_SET.has(runtimeType)) return null;
  return Object.freeze({
    id: runtimeType,
    labelTH: TYPE_LABEL_TH[runtimeType],
    color: TYPE_COLOR[runtimeType],
    emoji: TYPE_EMOJI[runtimeType],
    attack: TYPE_CHART[runtimeType],
  });
}

export function typeEffectiveness(attackingType, defendingTypes = []) {
  if (!TYPE_SET.has(attackingType)) return 1;
  const row = TYPE_CHART[attackingType];
  return (Array.isArray(defendingTypes) ? defendingTypes : [])
    .filter(Boolean)
    .reduce((multiplier, defendingType) => multiplier * (TYPE_SET.has(defendingType) ? (row[defendingType] ?? 1) : 1), 1);
}

function typeIssue(code, field, detail = {}) {
  return Object.freeze({ code, field, ...detail });
}

export function validateTypeCatalog({ runtimeTypes = RUNTIME_TYPES, chart = TYPE_CHART } = {}) {
  const issues = [];
  if (!Array.isArray(runtimeTypes)) {
    return Object.freeze({ ok: false, issues: Object.freeze([typeIssue('invalid_runtime_types', 'runtimeTypes')]) });
  }
  if (runtimeTypes.length !== 18) issues.push(typeIssue('runtime_type_count_mismatch', 'runtimeTypes.length', { value: runtimeTypes.length }));
  if (new Set(runtimeTypes).size !== runtimeTypes.length) issues.push(typeIssue('duplicate_runtime_type', 'runtimeTypes'));
  if (runtimeTypes.includes('Light') || runtimeTypes.includes('LIGHT')) issues.push(typeIssue('light_runtime_type_forbidden', 'runtimeTypes'));
  for (const expectedType of RUNTIME_TYPES) {
    if (!runtimeTypes.includes(expectedType)) issues.push(typeIssue('missing_runtime_type', 'runtimeTypes', { type: expectedType }));
  }
  if (!chart || typeof chart !== 'object' || Array.isArray(chart)) {
    issues.push(typeIssue('invalid_type_chart', 'chart'));
  } else {
    for (const attackType of runtimeTypes) {
      const row = chart[attackType];
      if (!row || typeof row !== 'object') {
        issues.push(typeIssue('missing_type_row', 'chart', { attackType }));
        continue;
      }
      for (const defenseType of runtimeTypes) {
        const multiplier = row[defenseType] ?? 1;
        if (!VALID_MULTIPLIERS.has(multiplier)) issues.push(typeIssue('invalid_type_multiplier', 'chart', { attackType, defenseType, multiplier }));
      }
      for (const defenseType of Object.keys(row)) {
        if (!runtimeTypes.includes(defenseType)) issues.push(typeIssue('unknown_defense_type', 'chart', { attackType, defenseType }));
      }
    }
    for (const attackType of Object.keys(chart)) {
      if (!runtimeTypes.includes(attackType)) issues.push(typeIssue('unknown_attack_type', 'chart', { attackType }));
    }
  }
  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });
}
