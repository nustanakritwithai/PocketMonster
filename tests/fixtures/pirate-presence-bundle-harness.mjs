import fs from 'node:fs';

function defineClassField(target, key, value) {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

function matchingBrace(source, openingBrace) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = openingBrace; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error(`unterminated block at byte ${openingBrace}`);
}

function classBlocks(source) {
  const blocks = [];
  const pattern = /class\s+([A-Za-z_$][\w$]*)\{/g;
  for (const match of source.matchAll(pattern)) {
    const start = match.index;
    const openingBrace = start + match[0].lastIndexOf('{');
    const end = matchingBrace(source, openingBrace) + 1;
    blocks.push({ name: match[1], start, end, source: source.slice(start, end) });
    pattern.lastIndex = end;
  }
  return blocks;
}

function requiredMatch(source, pattern, label) {
  const match = source.match(pattern);
  if (!match) throw new Error(`Pirate bundle fixture could not locate ${label}`);
  return match;
}

function compilePresenceRuntime(bundle, classes) {
  const block = classes.find(candidate => (
    candidate.source.includes('publishLocalPresence(')
    && candidate.source.includes('applySnapshot(')
    && candidate.source.includes('previousPositions')
  ));
  if (!block) throw new Error('Pirate bundle fixture could not locate the presence publisher/receiver');

  const messageIndex = bundle.lastIndexOf('pocketmonster:pirate-presence-v1', block.start);
  const declarationsStart = Math.max(
    bundle.lastIndexOf('const ', messageIndex),
    bundle.lastIndexOf('let ', messageIndex),
    bundle.lastIndexOf('var ', messageIndex),
  );
  if (messageIndex < 0 || declarationsStart < 0) {
    throw new Error('Pirate bundle fixture could not locate presence message declarations');
  }
  const fieldHelper = requiredMatch(
    block.source,
    /constructor[\s\S]*?\{([A-Za-z_$][\w$]*)\(this,"remotePlayers"/,
    'presence class-field helper',
  )[1];
  const executable = `${bundle.slice(declarationsStart, block.end)}; return ${block.name};`;
  return new Function(fieldHelper, executable)(defineClassField);
}

function compileRemotePlayerManager(bundle, classes) {
  const block = classes.find(candidate => (
    candidate.source.includes('acceptedPresence')
    && candidate.source.includes('applyPresence(')
    && candidate.source.includes('lastSeenAt')
    && candidate.source.includes('.animator')
  ));
  if (!block) throw new Error('Pirate bundle fixture could not locate the remote-player manager');

  const footMarker = bundle.lastIndexOf(':"foot"', block.start);
  const helpersStart = bundle.lastIndexOf('function ', footMarker);
  if (footMarker < 0 || helpersStart < 0) {
    throw new Error('Pirate bundle fixture could not locate the remote-player avatar-kind helper');
  }
  const fieldHelper = requiredMatch(
    block.source,
    /constructor[\s\S]*?\{([A-Za-z_$][\w$]*)\(this,"players",new Map\)/,
    'remote-player class-field helper',
  )[1];
  const staleLimit = requiredMatch(
    block.source,
    /this\.now\(\)-([A-Za-z_$][\w$]*)/,
    'remote-player stale timeout',
  )[1];
  const disposableTypes = requiredMatch(
    block.source,
    /instanceof ([A-Za-z_$][\w$]*)\?\([^:]+\):t instanceof ([A-Za-z_$][\w$]*)/,
    'remote-player disposable render types',
  );
  const parameterValues = new Map([
    [fieldHelper, defineClassField],
    [staleLimit, 20_000],
    [disposableTypes[1], class TestMesh {}],
    [disposableTypes[2], class TestSprite {}],
  ]);
  const names = [...parameterValues.keys()];
  const executable = `${bundle.slice(helpersStart, block.end)}; return ${block.name};`;
  return new Function(...names, executable)(...names.map(name => parameterValues.get(name)));
}

export function loadPiratePresenceBundleHarness() {
  const bootstrapUrl = new URL('../../pirate-fruit-offline/pocket-bootstrap.mjs', import.meta.url);
  const bootstrap = fs.readFileSync(bootstrapUrl, 'utf8');
  const bundleReference = bootstrap.match(/import\(['"]\.\/(assets\/index-[^'"]+\.js)['"]\)/)?.[1];
  if (!bundleReference) throw new Error('Pocket bootstrap does not reference a Pirate Fruit main bundle');
  const bundleUrl = new URL(`../../pirate-fruit-offline/${bundleReference}`, import.meta.url);
  const bundle = fs.readFileSync(bundleUrl, 'utf8');
  const classes = classBlocks(bundle);
  return Object.freeze({
    bundleUrl,
    PresenceRuntime: compilePresenceRuntime(bundle, classes),
    RemotePlayerManager: compileRemotePlayerManager(bundle, classes),
  });
}

export class TestVector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.set(x, y, z);
  }

  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  copy(other) {
    return this.set(other.x, other.y, other.z);
  }

  clone() {
    return new TestVector3(this.x, this.y, this.z);
  }

  lerp(target, alpha) {
    this.x += (target.x - this.x) * alpha;
    this.y += (target.y - this.y) * alpha;
    this.z += (target.z - this.z) * alpha;
    return this;
  }

  add(other) {
    this.x += other.x;
    this.y += other.y;
    this.z += other.z;
    return this;
  }

  multiplyScalar(value) {
    this.x *= value;
    this.y *= value;
    this.z *= value;
    return this;
  }

  lengthSq() {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }
}

export function createMessageHost(targetOrigin = 'https://parent.example') {
  const listeners = new Set();
  const posted = [];
  const parentSource = Object.freeze({ role: 'parent-window' });
  return {
    targetOrigin,
    parentSource,
    posted,
    get listenerCount() { return listeners.size; },
    addMessageListener(listener) { listeners.add(listener); },
    removeMessageListener(listener) { listeners.delete(listener); },
    postToParent(message, origin) { posted.push(structuredClone({ message, origin })); },
    isParentSource(source) { return source === parentSource; },
    dispatch(message, overrides = {}) {
      const event = {
        data: message,
        origin: overrides.origin ?? targetOrigin,
        source: overrides.source ?? parentSource,
      };
      for (const listener of [...listeners]) listener(event);
    },
  };
}

export function seedRemotePlayer(manager, playerId, islandId, animatorEvents, now) {
  const position = new TestVector3();
  const group = {
    position,
    rotation: { y: 0 },
    visible: true,
    traverse(visitor) { visitor(this); },
  };
  manager.players.set(playerId, {
    group,
    target: new TestVector3(),
    targetHeading: 0,
    islandId,
    onBoat: false,
    name: 'Remote player',
    avatarKind: 'foot',
    lastSeenAt: now,
    defeated: false,
    animator: {
      update(deltaSeconds, state) {
        animatorEvents.push(structuredClone({ playerId, deltaSeconds, state }));
      },
    },
    locomotion: 'idle',
    animation: {
      combatState: 'idle',
      category: 'style',
      onGround: true,
      dashing: false,
      verticalVelocity: 0,
    },
    lod: 'full',
    snapshot: { playerId, islandId, onBoat: false },
    hitOffset: new TestVector3(),
    hitOrigin: new TestVector3(),
    hitDirection: new TestVector3(),
    hitDistance: 0,
    hitUntil: 0,
  });
  return group;
}

export function createRemoteManager(RemotePlayerManager, islandId, animatorEvents, clock) {
  const scene = {
    add() {},
    remove() {},
  };
  return new RemotePlayerManager(scene, islandId, () => clock.now, {
    tier: 'high',
    focus: () => ({ x: 0, y: 0, z: 0 }),
  });
}
