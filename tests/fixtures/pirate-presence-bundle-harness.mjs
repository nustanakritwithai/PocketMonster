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
  const protocolHelperStart = bundle.lastIndexOf('const Ei=', messageIndex);
  const declarationsStart = protocolHelperStart >= 0 ? protocolHelperStart : Math.max(
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

function compileRemotePlayerManager(bundle, classes, Effects) {
  const block = classes.find(candidate => (
    candidate.source.includes('acceptedPresence')
    && candidate.source.includes('applyPresence(')
    && candidate.source.includes('lastSeenAt')
    && candidate.source.includes('.animator')
  ));
  if (!block) throw new Error('Pirate bundle fixture could not locate the remote-player manager');

  const defaultAnimationMarker = bundle.lastIndexOf(
    'combatState:"idle",category:"style",onGround:!0,dashing:!1,verticalVelocity:0',
    block.start,
  );
  const helpersStart = bundle.lastIndexOf('function ', defaultAnimationMarker);
  if (defaultAnimationMarker < 0 || helpersStart < 0) {
    throw new Error('Pirate bundle fixture could not locate the remote-player helper declaration boundary');
  }
  const fieldHelper = requiredMatch(
    block.source,
    /constructor[\s\S]*?\{([A-Za-z_$][\w$]*)\(this,"players",new Map\)/,
    'remote-player class-field helper',
  )[1];
  // The current manager snapshots `const now = this.now()` and computes the
  // cutoff from the module-level stale constant (`cutoff = now - STALE_MS`).
  // Older bundles inlined the subtraction as `this.now() - STALE_MS` inside
  // the class.  Keep the fixture coupled to the real bundle constant rather
  // than to either minifier spelling.
  const staleLimit = requiredMatch(
    bundle.slice(0, block.start),
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*2e4\b/,
    'remote-player stale timeout constant',
  )[1];
  const vectorType = requiredMatch(
    block.source,
    /new\s+([A-Za-z_$][\w$]*)\(e\.x,e\.y,e\.z\)/,
    'remote-player Vector3 dependency',
  )[1];
  const effectsType = requiredMatch(block.source, /this\.effects=new ([A-Za-z_$][\w$]*)\(e\)/, 'remote-player Effects dependency')[1];
  const mathUtils = requiredMatch(
    block.source,
    /([A-Za-z_$][\w$]*)\.clamp\(r\*l/,
    'remote-player MathUtils dependency',
  )[1];
  const runtimeConstants = requiredMatch(
    bundle.slice(0, block.start),
    new RegExp(
      `(?:const|let|var)\\s+${staleLimit}\\s*=\\s*2e4\\s*,\\s*`
      + `([A-Za-z_$][\\w$]*)\\s*=\\s*\\.25\\s*,\\s*`
      + `([A-Za-z_$][\\w$]*)\\s*=\\s*24\\s*,\\s*`
      + `([A-Za-z_$][\\w$]*)\\s*=\\s*12\\s*,\\s*`
      + `([A-Za-z_$][\\w$]*)\\s*=\\s*60\\s*,\\s*`
      + `([A-Za-z_$][\\w$]*)\\s*=\\s*\\.6\\b`,
    ),
    'remote-player runtime constants',
  );
  const [, extrapolationLimit, maxVelocity, teleportDistance, renderSpeed, renderProgressRate]
    = runtimeConstants;
  const disposableTypes = [...block.source.matchAll(/instanceof ([A-Za-z_$][\w$]*)/g)]
    .map(match => match[1])
    .filter((name, index, names) => names.indexOf(name) === index);
  if (disposableTypes.length < 2) throw new Error('Pirate bundle fixture could not locate remote-player disposable render types');
  const parameterValues = new Map([
    [fieldHelper, defineClassField],
    [staleLimit, 20_000],
    [vectorType, TestVector3],
    [effectsType, Effects],
    [mathUtils, { clamp: (value, min, max) => Math.min(max, Math.max(min, value)) }],
    [extrapolationLimit, 0.25],
    [maxVelocity, 24],
    [teleportDistance, 12],
    [renderSpeed, 60],
    // Keep the bundle's real render-only denominator.  The round-trip tests
    // capture the wire snapshot before `manager.update(1 / 60)` and assert the
    // animator's bounded render progress separately afterward.
    [renderProgressRate, 0.6],
    [disposableTypes[0], class TestMesh {}],
    [disposableTypes[1], class TestSprite {}],
  ]);
  const names = [...parameterValues.keys()];
  const executable = `${bundle.slice(helpersStart, block.end)}; return ${block.name};`;
  return new Function(...names, executable)(...names.map(name => parameterValues.get(name)));
}

async function compileCompiledEffects(bundle, classes, bundleUrl) {
  let block = classes.find(candidate => (
    candidate.source.includes('createEnergyProjectile')
    && candidate.source.includes('replayForOwner')
  ));
  // The compiled Effects class can follow a nested class expression that makes
  // the generic class scanner skip it. Anchor directly on its real method and
  // recover the owning class boundary from the bundle instead of substituting
  // a test double.
  if (!block) {
    const methodIndex = bundle.indexOf('createEnergyProjectile');
    const classStart = methodIndex < 0 ? -1 : bundle.lastIndexOf('class ', methodIndex);
    const classMatch = classStart < 0
      ? null
      : bundle.slice(classStart).match(/^class\s+([A-Za-z_$][\w$]*)\{/);
    if (classMatch) {
      const openingBrace = classStart + classMatch[0].lastIndexOf('{');
      const end = matchingBrace(bundle, openingBrace) + 1;
      block = {
        name: classMatch[1],
        start: classStart,
        end,
        source: bundle.slice(classStart, end),
      };
    }
  }
  if (!block) throw new Error('Pirate bundle fixture could not locate compiled Effects class');
  const importMatch = bundle.match(/import\{([^}]*)\}from"([^"]*vendor-three[^"]*)";/);
  if (!importMatch) throw new Error('Pirate bundle fixture could not locate vendored Three import');
  const vendor = await import(new URL(importMatch[2], bundleUrl).href);
  const aliases = importMatch[1].split(',').map(entry => entry.trim()).filter(Boolean).map(entry => {
    const [exportName, localName] = entry.split(/\s+as\s+/);
    return { exportName, localName: localName || exportName };
  });
  const sourceStart = importMatch.index + importMatch[0].length;
  // The bundle segment contains lazy-loader declarations with import.meta.url;
  // replace that module-only syntax while preserving the actual Effects class
  // and its compiled helper dependencies for this CommonJS-style evaluator.
  const source = bundle.slice(sourceStart, block.end).replaceAll('import.meta.url', '""');
  const names = aliases.map(alias => alias.localName);
  const values = aliases.map(alias => vendor[alias.exportName]);
  const executable = `${source}; return ${block.name};`;
  const classField = (target, key, value) => {
    Object.defineProperty(target, typeof key === 'symbol' ? key : `${key}`, {
      enumerable: true,
      configurable: true,
      writable: true,
      value,
    });
    return value;
  };
  return new Function(...names, 'h', 'document', 'MutationObserver', executable)(
    ...values,
    classField,
    { createElement() { return { getContext() { return null; } }; }, querySelectorAll() { return []; } },
    class TestMutationObserver { observe() {} },
  );
}

export async function loadPiratePresenceBundleHarness() {
  const bootstrapUrl = new URL('../../pirate-fruit-offline/pocket-bootstrap.mjs', import.meta.url);
  const bootstrap = fs.readFileSync(bootstrapUrl, 'utf8');
  const bundleReference = bootstrap.match(/import\(['"]\.\/(assets\/index-[^'"]+\.js)['"]\)/)?.[1];
  if (!bundleReference) throw new Error('Pocket bootstrap does not reference a Pirate Fruit main bundle');
  const bundleUrl = new URL(`../../pirate-fruit-offline/${bundleReference}`, import.meta.url);
  const bundle = fs.readFileSync(bundleUrl, 'utf8');
  const classes = classBlocks(bundle);
  const Effects = await compileCompiledEffects(bundle, classes, bundleUrl);
  return Object.freeze({
    bundleUrl,
    PresenceRuntime: compilePresenceRuntime(bundle, classes),
    RemotePlayerManager: compileRemotePlayerManager(bundle, classes, Effects),
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

  sub(other) {
    this.x -= other.x;
    this.y -= other.y;
    this.z -= other.z;
    return this;
  }

  addScaledVector(other, scalar) {
    this.x += other.x * scalar;
    this.y += other.y * scalar;
    this.z += other.z * scalar;
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

  length() {
    return Math.sqrt(this.lengthSq());
  }

  setLength(value) {
    const current = this.length();
    if (current > 0) this.multiplyScalar(value / current);
    return this;
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
    equipment: null,
    projectiles: new Map(),
    projectileSamples: new Map(),
    endedProjectiles: new Set(),
    shield: null,
    visualSessionId: null,
    visualSequence: 0,
    visualStateSequence: 0,
    retiredVisualSessions: new Set(),
    locomotion: 'idle',
    animation: {
      combatState: 'idle',
      category: 'style',
      onGround: true,
      dashing: false,
      verticalVelocity: 0,
    },
    actionSessionId: null,
    actionHighestSequence: 0,
    activeActionIdentity: null,
    retiredActionSessions: new Set(),
    lod: 'full',
    snapshot: { playerId, islandId, onBoat: false },
    hitOffset: new TestVector3(),
    hitOrigin: new TestVector3(),
    hitDirection: new TestVector3(),
    hitDistance: 0,
    hitUntil: 0,
    targetVelocity: new TestVector3(),
    renderActionIdentity: null,
    renderAttackProgress: 0,
    renderSkillProgress: 0,
  });
  return group;
}

export function createTrackedScene() {
  const children = [];
  return {
    children,
    add(...objects) {
      for (const object of objects) {
        if (!children.includes(object)) children.push(object);
      }
    },
    remove(...objects) {
      for (const object of objects) {
        const index = children.indexOf(object);
        if (index >= 0) children.splice(index, 1);
      }
    },
    getObjectByName(name) {
      for (const object of children) {
        if (object?.name === name) return object;
        const nested = object?.getObjectByName?.(name);
        if (nested) return nested;
      }
      return undefined;
    },
    objectsByName(name) {
      return children.filter(object => object?.name === name);
    },
  };
}

export function createRemoteManager(RemotePlayerManager, islandId, animatorEvents, clock, scene = null) {
  const targetScene = scene ?? {
    add() {},
    remove() {},
  };
  return new RemotePlayerManager(targetScene, islandId, () => clock.now, {
    tier: 'high',
    focus: () => ({ x: 0, y: 0, z: 0 }),
  });
}
