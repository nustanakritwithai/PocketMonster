// Monster Life RPG — shared data-driven requirement engine.
// Used by Skill candidates (R7) and the Evolution rule engine (R10). Requirements
// are pure data; the UI can show known ones while hidden flags stay hidden (R10).
// Eligibility model: eligible = ALL(required) AND ANY(optionalGroups) AND NOT(blockers).

export const MASTERY_RANK_ORDER = Object.freeze(['novice', 'familiar', 'skilled', 'expert', 'master']);

// Resolve a dotted path (e.g. "training.power", "career.eliteWins") from context.
export function getPath(context, path) {
  if (context == null || typeof path !== 'string') return undefined;
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), context);
}

function rankIndex(value) {
  if (typeof value === 'number') return value;
  return MASTERY_RANK_ORDER.indexOf(String(value).toLowerCase());
}

// Compare an actual value against an expected one with a named operator.
export function compare(op, actual, expected) {
  switch (op) {
    case 'gte': return Number(actual) >= Number(expected);
    case 'lte': return Number(actual) <= Number(expected);
    case 'gt': return Number(actual) > Number(expected);
    case 'lt': return Number(actual) < Number(expected);
    case 'eq': return actual === expected;
    case 'neq': return actual !== expected;
    case 'in': return Array.isArray(expected) && expected.includes(actual);
    case 'includes': return Array.isArray(actual) && actual.includes(expected);
    case 'rankGte': return rankIndex(actual) >= rankIndex(expected);
    default: return false;
  }
}

// Evaluate a single requirement { field, op, value } against the context.
export function checkRequirement(requirement, context) {
  if (!requirement || typeof requirement !== 'object') return { met: false, requirement };
  const { field, op = 'gte', value } = requirement;
  const actual = getPath(context, field);
  const met = compare(op, actual, value);
  return { met, requirement, actual };
}

// Evaluate a full requirement set. optionalGroups: array of arrays; each group is
// satisfied if ANY of its requirements is met, and ALL groups must be satisfied.
export function evaluateEligibility(spec = {}, context = {}) {
  const required = Array.isArray(spec.required) ? spec.required : [];
  const optionalGroups = Array.isArray(spec.optionalGroups) ? spec.optionalGroups : [];
  const blockers = Array.isArray(spec.blockers) ? spec.blockers : [];

  const requiredResults = required.map(req => checkRequirement(req, context));
  const failedRequired = requiredResults.filter(r => !r.met).map(r => r.requirement);

  const optionalResults = optionalGroups.map(group => {
    const checks = (Array.isArray(group) ? group : []).map(req => checkRequirement(req, context));
    return { met: checks.some(c => c.met), checks };
  });
  const optionalMet = optionalResults.every(g => g.met);

  const blockerResults = blockers.map(req => checkRequirement(req, context));
  const blocked = blockerResults.some(r => r.met);

  return {
    eligible: failedRequired.length === 0 && optionalMet && !blocked,
    requiredMet: failedRequired.length === 0,
    failedRequired,
    optionalMet,
    blocked,
    blockedBy: blockerResults.filter(r => r.met).map(r => r.requirement),
  };
}
