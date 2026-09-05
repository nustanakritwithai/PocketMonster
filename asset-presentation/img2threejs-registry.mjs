const models = new Map();

function assertId(id) {
  if (typeof id !== 'string' || !id.trim()) throw new Error('img2threejs model id is required');
  return id.trim();
}

function pickFunction(module, explicit, patterns = []) {
  if (explicit) {
    const fn = module?.[explicit];
    if (typeof fn !== 'function') throw new Error(`img2threejs export ${explicit} is not a function`);
    return { name: explicit, fn };
  }
  for (const name of patterns) {
    if (typeof module?.[name] === 'function') return { name, fn: module[name] };
  }
  const candidates = Object.entries(module || {}).filter(([name, value]) => (
    typeof value === 'function' && /^create.*Model$/i.test(name)
  ));
  if (candidates.length === 1) return { name: candidates[0][0], fn: candidates[0][1] };
  if (typeof module?.default === 'function') return { name: 'default', fn: module.default };
  return null;
}

function pickPrewarm(module, explicit) {
  if (explicit) {
    const fn = module?.[explicit];
    if (typeof fn !== 'function') throw new Error(`img2threejs prewarm export ${explicit} is not a function`);
    return { name: explicit, fn };
  }
  const candidates = Object.entries(module || {}).filter(([name, value]) => (
    typeof value === 'function' && /^prewarm/i.test(name)
  ));
  return candidates[0] ? { name: candidates[0][0], fn: candidates[0][1] } : null;
}

export function registerImg2ThreeJsModel(id, descriptor = {}) {
  const key = assertId(id);
  if (typeof descriptor.build !== 'function') throw new Error(`img2threejs model ${key} needs build()`);
  const record = {
    id: key,
    build: descriptor.build,
    prewarm: typeof descriptor.prewarm === 'function' ? descriptor.prewarm : null,
    animationMap: { ...(descriptor.animationMap || {}) },
    metadata: { ...(descriptor.metadata || {}) },
    moduleUrl: descriptor.moduleUrl || null,
    buildExport: descriptor.buildExport || null,
    prewarmExport: descriptor.prewarmExport || null,
    prewarmState: descriptor.prewarm ? 'cold' : 'ready',
    prewarmError: null,
    prewarmPromise: null,
  };
  models.set(key, record);
  return record;
}

export function registerImg2ThreeJsModule(id, module, options = {}) {
  const key = assertId(id);
  const build = pickFunction(module, options.buildExport, [
    'createModel',
    'createImg2ThreeJsModel',
    'createCharacterModel',
  ]);
  if (!build) {
    throw new Error(`img2threejs module ${key} has no usable model factory; set buildExport explicitly`);
  }
  const prewarm = pickPrewarm(module, options.prewarmExport);
  return registerImg2ThreeJsModel(key, {
    build: build.fn,
    prewarm: prewarm?.fn,
    animationMap: options.animationMap,
    metadata: {
      ...options.metadata,
      detectedBuildExport: build.name,
      detectedPrewarmExport: prewarm?.name || null,
    },
    moduleUrl: options.moduleUrl,
    buildExport: build.name,
    prewarmExport: prewarm?.name || null,
  });
}

export async function loadImg2ThreeJsModule(id, moduleUrl, options = {}) {
  const key = assertId(id);
  if (typeof moduleUrl !== 'string' || !moduleUrl.trim()) throw new Error('moduleUrl is required');
  const module = await import(moduleUrl);
  return registerImg2ThreeJsModule(key, module, { ...options, moduleUrl });
}

export async function prewarmImg2ThreeJsModel(id) {
  const record = getImg2ThreeJsModel(id);
  if (!record) throw new Error(`unknown img2threejs model ${id}`);
  if (!record.prewarm) {
    record.prewarmState = 'ready';
    return record;
  }
  if (record.prewarmState === 'ready') return record;
  if (record.prewarmPromise) return record.prewarmPromise;
  record.prewarmState = 'warming';
  record.prewarmError = null;
  record.prewarmPromise = Promise.resolve()
    .then(() => record.prewarm())
    .then(() => {
      record.prewarmState = 'ready';
      return record;
    })
    .catch((error) => {
      record.prewarmState = 'error';
      record.prewarmError = error;
      throw error;
    })
    .finally(() => {
      record.prewarmPromise = null;
    });
  return record.prewarmPromise;
}

export function getImg2ThreeJsModel(id) {
  return models.get(String(id || '')) || null;
}

export function listImg2ThreeJsModels() {
  return [...models.values()].map(record => ({
    id: record.id,
    moduleUrl: record.moduleUrl,
    buildExport: record.buildExport,
    prewarmExport: record.prewarmExport,
    prewarmState: record.prewarmState,
    prewarmError: record.prewarmError ? String(record.prewarmError.message || record.prewarmError) : null,
    animationMap: { ...record.animationMap },
    metadata: { ...record.metadata },
  }));
}

export function resetImg2ThreeJsRegistry() {
  models.clear();
}
