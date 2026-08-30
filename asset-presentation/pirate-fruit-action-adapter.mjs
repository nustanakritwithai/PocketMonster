export const PIRATE_FRUIT_WALK_DISTANCE_SQ = 0.00002;
export const PIRATE_FRUIT_RUN_SPEED = 5;

export const PIRATE_FRUIT_LOCOMOTION_THRESHOLDS = Object.freeze({
  walkDistanceSq: PIRATE_FRUIT_WALK_DISTANCE_SQ,
  runSpeed: PIRATE_FRUIT_RUN_SPEED,
});

const COMBAT_ACTIONS = new Set([
  'hurt',
  'skill',
  'attack-melee',
  'attack-ranged',
  'dead',
]);

function finiteOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function classifyLocomotion(motion) {
  const distanceSq = Math.max(0, finiteOrZero(motion?.distanceSq));
  const speed = Math.max(0, finiteOrZero(motion?.speed));
  if (distanceSq < PIRATE_FRUIT_WALK_DISTANCE_SQ) return 'idle';
  return speed > PIRATE_FRUIT_RUN_SPEED ? 'run' : 'walk';
}

/**
 * Read normalized Pirate Fruit action signals without changing their host.
 * Tracker state is private and only suppresses repeated presentation edges.
 */
export function createPirateFruitActionTracker() {
  let previousAction = null;
  let previousToken;
  let edge = 0;

  return {
    sample(host, _now, motion) {
      const locomotion = classifyLocomotion(motion);
      const signal = host?.userData?.pocketActionSignal;
      const requested = signal?.dead === true ? 'dead' : signal?.action;
      const action = COMBAT_ACTIONS.has(requested) ? requested : null;

      if (action === null) {
        previousAction = null;
        previousToken = undefined;
        return { locomotion, action: null, actionId: null, duration: 0 };
      }

      const token = signal?.token;
      const isTransition = previousAction !== action || !Object.is(previousToken, token);
      previousAction = action;
      previousToken = token;

      let actionId = null;
      if (isTransition) {
        edge += 1;
        actionId = `pirate-fruit-action:${edge}:${action}`;
      }

      return {
        locomotion,
        action,
        actionId,
        duration: Math.max(0, finiteOrZero(signal?.duration)),
      };
    },
  };
}
