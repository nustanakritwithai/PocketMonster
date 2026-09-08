// Presentation-only state machine. Reads the existing Pirate controller; it
// never invokes combat, movement, inventory, capture, or save commands.
const priorities = Object.freeze({ dead: 100, hurt: 90, knockback: 85,
  dodge_l: 80, dodge_r: 80, skill: 70, attack: 60, attack_ranged: 60,
  capture_throw: 60, capture_throw_r: 60, capture_throw_l: 60,
  summon_monster_throw: 60, monster_command: 50, get_up: 45, land: 40 });
const normalize = value => String(value || '').replace(/-/g, '_');
const canonical = value => value === 'attack-melee' || value === 'attack_melee' ? 'attack' : normalize(value);
const loops = new Set(['idle', 'walk', 'run', 'sprint', 'fall', 'ball_aim', 'crouch_idle', 'crouch_walk', 'turn_l', 'turn_r', 'strafe_l', 'strafe_r']);
function sourceAction(sample) {
  if (sample?.dead || sample?.action === 'dead') return 'dead';
  if (sample?.hurt || sample?.action === 'hurt') return 'hurt';
  return canonical(sample?.action) || (sample?.skill ? 'skill' : sample?.attack ? 'attack' : null);
}
function locomotion(sample) { return loops.has(sample?.locomotion) ? sample.locomotion : 'idle'; }

export function selectPirateFruitStudioAction(sample, animationState = null) {
  const action = sourceAction(sample);
  if (!action) return locomotion(sample);
  if (action !== 'dead' && animationState?.finished && canonical(animationState.action) === action) return locomotion(sample);
  return action;
}

export function applyPirateFruitStudioPresentation(handle, previous = null, sample = null) {
  const input = sourceAction(sample);
  const priorInput = previous?.combatAction ?? (priorities[previous?.action] ? previous.action : null);
  // Pirate emits actionId only on the edge. Null on the next frame does not
  // mean a new event, and must not rewind attack/throw back to its first pose.
  const actionId = input ? sample?.actionId ?? (input === priorInput ? previous?.actionId ?? null : null) : null;
  const fresh = !!input && (input !== priorInput || (sample?.actionId != null && sample.actionId !== previous?.actionId));
  const animation = handle?.animationState;
  let desired = selectPirateFruitStudioAction(sample, animation);
  const completedSameInput = input && input !== 'dead' && !fresh && (
    (animation?.finished && canonical(animation.action) === input)
    || (priorInput === input && previous?.action !== input)
  );
  if (completedSameInput) desired = locomotion(sample);
  const playing = canonical(animation?.action);
  const unfinished = playing && !loops.has(playing) && playing !== 'dead' && animation?.finished === false;
  if (unfinished && (!fresh || (priorities[input] || 0) < (priorities[playing] || 0))) desired = playing;
  // A genuinely new same-kind action is allowed to restart a completed clip.
  if (fresh && (!unfinished || (priorities[input] || 0) >= (priorities[playing] || 0))) desired = input;
  const unsupported = handle?.animationState?.motion?.unsupportedActions?.[normalize(desired)];
  if (unsupported) desired = locomotion(sample);
  const changed = previous?.action !== desired;
  if (changed || (fresh && desired === input)) {
    const options = { restart: true };
    if (desired === input && Number.isFinite(sample?.duration) && sample.duration > 0) options.duration = sample.duration;
    handle?.play?.(desired, options);
  }
  return Object.freeze({ action: desired, actionId, combatAction: input });
}

export function createStudioControllerSampler() {
  let previousGrounded, previousDead = false, priorPose = null, serial = 0;
  return function sampleController(base, controller) {
    if (!controller) return base;
    const motion = controller.moveState || {};
    const grounded = typeof motion.onGround === 'boolean' ? motion.onGround : undefined;
    const dead = base?.action === 'dead';
    let pose = null, duration = 0;
    if (dead || base?.action === 'hurt') pose = base.action;
    else if (previousDead) { pose = 'get_up'; duration = 1.2; }
    else if (motion.dashing) {
      const heading = Number(controller.heading) || 0;
      const lateral = (Number(controller.dashDir?.x) || 0) * Math.cos(heading) - (Number(controller.dashDir?.z) || 0) * Math.sin(heading);
      pose = lateral < 0 ? 'dodge_l' : 'dodge_r';
      duration = Math.max(.12, Number(controller.dashTimer) || .25);
    } else if (base?.action) pose = base.action;
    else if (grounded === false) pose = Number(controller.verticalSpeed) > .1 ? 'jump' : 'fall';
    else if (grounded === true && previousGrounded === false) { pose = 'land'; duration = .28; }
    previousGrounded = grounded;
    previousDead = dead;
    const ownEvent = pose && pose !== base?.action;
    const actionId = ownEvent ? (pose !== priorPose ? `studio-controller:${++serial}:${pose}` : null) : base?.actionId ?? null;
    priorPose = pose;
    let move = base?.locomotion || 'idle';
    if (move !== 'idle' && motion.sprinting) move = 'sprint';
    if (motion.swimming) move = 'idle'; // No authored swimming clip; never call walking swim parity.
    return { ...base, locomotion: move, action: pose, actionId, duration: ownEvent ? duration : base?.duration || 0 };
  };
}
