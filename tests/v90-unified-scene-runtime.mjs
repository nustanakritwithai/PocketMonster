import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

assert.equal(
  typeof vm.SourceTextModule,
  'function',
  'run this test with node --experimental-vm-modules',
);

const read = relative => fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
const actualSources = new Map([
  ['/scene-entry-v900.mjs', read('scene-entry-v900.mjs')],
  ['/persistent-fullscreen-v900.mjs', read('persistent-fullscreen-v900.mjs')],
  ['/worlds-v900.mjs', read('worlds-v900.mjs')],
  ['/scene-route-controller-v900.mjs', read('scene-route-controller-v900.mjs')],
  ['/online-world-bridge-v900.mjs', read('online-world-bridge-v900.mjs')],
  ['/world-presence-protocol.mjs', read('world-presence-protocol.mjs')],
  ['/combined-worlds-v900.mjs', read('combined-worlds-v900.mjs')],
  ['/unified-mobile-controls-v900.mjs', read('unified-mobile-controls-v900.mjs')],
  ['/mobile-dual-pointer-input-v900.mjs', read('mobile-dual-pointer-input-v900.mjs')],
]);
const realTemplateText = read('v900.html');

const worldCases = Object.freeze([
  Object.freeze({
    world: 'pirate-fruit',
    panel: 'human',
    runtime: './boot-pirate-fruit-v900.mjs?v=940',
  }),
  Object.freeze({
    world: 'pocket-monster',
    panel: 'throw',
    runtime: './game-v800.js?v=827',
  }),
  Object.freeze({
    world: 'living-world',
    panel: 'human',
    runtime: './world-living-v900.mjs?v=904',
  }),
]);
const worldRuntimePaths = new Set(worldCases.map(item => new URL(item.runtime, 'https://game.example/').pathname));

class TestCustomEvent extends Event {
  constructor(type, options) {
    super(type);
    this.detail = options?.detail;
  }
}

function makeClassList() {
  const values = new Set();
  return {
    add(value) { values.add(value); },
    remove(value) { values.delete(value); },
    contains(value) { return values.has(value); },
  };
}

function makeElement(id, metrics, nodeName = 'DIV') {
  return {
    id,
    nodeName,
    classList: makeClassList(),
    removed: false,
    textContent: '',
    remove() {
      this.removed = true;
      metrics.timeline.push(`dom:remove:${id}`);
    },
  };
}

function createHarness({ world = 'pirate-fruit', panel = 'human', hostMode = 'hosted', gateMode = 'healthy', failureStage = null } = {}) {
  const metrics = {
    actualLoads: [],
    dynamicImports: [],
    fetches: [],
    importedNodes: [],
    parentEndReasons: [],
    requireSessionArgs: [],
    runtimeImports: [],
    staticImports: [],
    timeline: [],
    configLoads: 0,
    historyReplacements: 0,
    sessionStorageReads: 0,
    sceneBootRegistrations: [],
    sceneBootReports: [],
    sceneBootLeaves: [],
    webSocketConstructs: 0,
  };
  const sceneQuery = new URLSearchParams({ world, panel });
  if (hostMode === 'hosted') sceneQuery.set('shellRevision', '13');
  const initialSceneHref = `https://game.example/scene-v900.html?${sceneQuery}`;

  const config = Object.freeze({
    manifestValid: true,
    apiBaseUrl: 'https://server.example',
    webSocketUrl: 'wss://server.example/ws/chat',
    featureFlags: Object.freeze({
      launchTicket: true,
      vpsWrites: false,
      playerDataWrites: false,
      firebaseFallback: false,
    }),
  });
  const launchSession = Object.freeze({
    sessionToken: `parent-session-${world}`,
    expiresAtUtc: '2099-01-01T00:00:00Z',
  });
  const serverGate = Object.freeze({
    state: gateMode === 'unhealthy' ? 'offline' : 'healthy',
    allowFirebaseFallback: false,
    allowPlayerDataWrites: false,
    writePolicy: Object.freeze({ enabled: false, playerDataWrites: false }),
  });
  const serverGateObservation = Object.freeze({
    gateState: serverGate.state,
    observedAtUtc: '2026-08-30T00:00:00Z',
  });
  const sceneLease = Object.freeze({
    kind: 'monsterlife-online-scene-lease-v1',
    generation: 1,
    worldId: world,
    panel,
    sceneHref: initialSceneHref,
  });
  let childWindow = null;

  const parentWindow = {
    location: { origin: hostMode === 'cross-origin' ? 'https://other.example' : 'https://game.example' },
    POCKETMONSTER_RUNTIME_CONFIG: config,
    POCKETMONSTER_LAUNCH_SESSION: launchSession,
    POCKETMONSTER_ONLINE_SHELL: Object.freeze({
      kind: 'monsterlife-online-world-shell-v1',
      registerSceneBoot(receivedWindow, href) {
        assert.equal(receivedWindow, childWindow);
        assert.equal(href, childWindow.location.href);
        metrics.sceneBootRegistrations.push({ receivedWindow, href });
        metrics.timeline.push('scene:register');
        return sceneLease;
      },
      reportSceneBoot(receivedWindow, lease, outcome) {
        assert.equal(receivedWindow, childWindow);
        assert.equal(lease, sceneLease);
        if (childWindow.location.href !== lease.sceneHref) return false;
        metrics.sceneBootReports.push(outcome);
        metrics.timeline.push(`scene:report:${outcome?.status || 'invalid'}`);
        return true;
      },
      leaveSceneBoot(receivedWindow, lease) {
        assert.equal(receivedWindow, childWindow);
        assert.equal(lease, sceneLease);
        metrics.sceneBootLeaves.push(lease);
        metrics.timeline.push('scene:leave');
        return true;
      },
      endSession(reason) {
        metrics.parentEndReasons.push(reason);
        return true;
      },
    }),
  };
  if (gateMode !== 'missing') {
    parentWindow.POCKETMONSTER_SERVER_GATE = serverGate;
    parentWindow.POCKETMONSTER_SERVER_GATE_OBSERVATION = serverGateObservation;
  }

  const childEvents = new EventTarget();
  const location = {
    href: initialSceneHref,
    origin: 'https://game.example',
    pathname: '/scene-v900.html',
    search: `?${sceneQuery}`,
    assign() { assert.fail('child scene boot must not navigate its browsing context'); },
  };
  childWindow = {
    location,
    CustomEvent: TestCustomEvent,
    addEventListener: childEvents.addEventListener.bind(childEvents),
    removeEventListener: childEvents.removeEventListener.bind(childEvents),
    dispatchEvent: childEvents.dispatchEvent.bind(childEvents),
  };
  childWindow.parent = hostMode === 'standalone' ? childWindow : parentWindow;

  const elements = new Map();
  for (const id of ['chatToggleBtn', 'gameChat', 'accountGate', 'startupStatus']) {
    elements.set(id, makeElement(id, metrics));
  }
  for (const id of ['pirateUnifiedControls', 'joystick', 'stick', 'pirateJoyKnob', 'cameraPad', 'skill1Btn', 'skill2Btn', 'skill3Btn', 'skill4Btn', 'captureBtn', 'summonBtn', 'recallBtn', 'pirateBlockBtn', 'pirateWeaponBtn', 'piratePotion1Btn', 'piratePotion2Btn', 'pirateZoomInBtn', 'pirateZoomOutBtn']) {
    const target = new EventTarget();
    target.id = id;
    target.style = {};
    target.dataset = {};
    target.classList = makeClassList();
    target.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
    target.setPointerCapture = () => {};
    target.hasPointerCapture = () => false;
    target.releasePointerCapture = () => {};
    elements.set(id, target);
  }
  const body = {
    dataset: {},
    children: [],
    replaceChildren(...children) {
      this.children = children;
      metrics.timeline.push(`dom:replace:${children.length}`);
    },
  };
  const templateNodes = [
    makeElement('template-script', metrics, 'SCRIPT'),
    makeElement('scene-root', metrics, 'MAIN'),
    makeElement('scene-overlay', metrics, 'ASIDE'),
  ];
  const documentEvents = new EventTarget();
  const document = {
    body,
    visibilityState: 'visible',
    addEventListener: documentEvents.addEventListener.bind(documentEvents),
    removeEventListener: documentEvents.removeEventListener.bind(documentEvents),
    getElementById(id) { return elements.get(id) || null; },
    importNode(node, deep) {
      assert.equal(deep, true);
      metrics.importedNodes.push(node.id);
      metrics.timeline.push(`dom:import:${node.id}`);
      return { ...node, cloned: true };
    },
  };

  class FakeDOMParser {
    parseFromString(text, type) {
      assert.equal(text, realTemplateText, 'scene entry parses the actual V9 DOM template response');
      assert.equal(type, 'text/html');
      metrics.timeline.push('dom:parse-template');
      return { body: { childNodes: templateNodes } };
    }
  }

  class ForbiddenWebSocket {
    constructor() {
      metrics.webSocketConstructs += 1;
      throw new Error('child attempted to create a WebSocket');
    }
  }

  const history = {
    replaceState(_state, _title, value) {
      metrics.historyReplacements += 1;
      const next = new URL(value, location.href);
      location.href = next.href;
      location.pathname = next.pathname;
      location.search = next.search;
    },
  };
  const sessionStorage = new Proxy({}, {
    get() {
      metrics.sessionStorageReads += 1;
      throw new Error('child attempted to read sessionStorage');
    },
  });
  const fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    metrics.fetches.push({ url: url.href, options });
    metrics.timeline.push('fetch:template');
    assert.equal(url.origin, 'https://game.example');
    assert.equal(url.pathname, '/v900.html');
    assert.equal(url.search, '?v=916');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    return {
      ok: failureStage !== 'template',
      status: failureStage === 'template' ? 503 : 200,
      async text() {
        metrics.timeline.push('fetch:template-text');
        return realTemplateText;
      },
    };
  };

  const sandbox = {
    AbortController,
    AbortSignal,
    CustomEvent: TestCustomEvent,
    DOMParser: FakeDOMParser,
    Event,
    EventTarget,
    URL,
    URLSearchParams,
    WebSocket: ForbiddenWebSocket,
    console,
    document,
    fetch,
    history,
    location,
    sessionStorage,
    window: childWindow,
  };
  const context = vm.createContext(sandbox, { name: `scene-${world}-${hostMode}` });
  const moduleCache = new Map();

  function makeSynthetic(identifier, exports) {
    return new vm.SyntheticModule(Object.keys(exports), function setSyntheticExports() {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context, identifier });
  }

  function syntheticFor(resolvedUrl) {
    const { pathname } = new URL(resolvedUrl);
    if (pathname === '/runtime-config.mjs') {
      return makeSynthetic(resolvedUrl, {
        async loadRuntimeConfig() {
          metrics.configLoads += 1;
          throw new Error('hosted child must reuse the parent runtime config');
        },
      });
    }
    if (pathname === '/launch-bootstrap.mjs') {
      return makeSynthetic(resolvedUrl, {
        requireActiveOnlineLaunchSession(receivedConfig, receivedSession) {
          metrics.requireSessionArgs.push([receivedConfig, receivedSession]);
          assert.equal(receivedConfig, config, 'session gate receives the exact parent config object');
          assert.equal(receivedSession, launchSession, 'session gate receives the exact parent session object');
          return receivedSession;
        },
      });
    }
    if (pathname === '/control-panels-v900.mjs') {
      return makeSynthetic(resolvedUrl, {
        allowedPanelForWorld(worldId, panelId) {
          return worldId === 'pocket-monster' ? 'throw' : panelId || 'human';
        },
        applyControlPanel(id) {
          body.dataset.controlPanel = id;
          metrics.timeline.push(`panel:${id}`);
          return Object.freeze({ id });
        },
        combinedLocationQuery(worldId, panelId) {
          return new URLSearchParams({ world: worldId, panel: panelId }).toString();
        },
        panelIdFromLocation(locationLike, worldId) {
          return new URL(locationLike.href).searchParams.get('panel')
            || (worldId === 'pocket-monster' ? 'throw' : 'human');
        },
      });
    }
    if (pathname === '/npc-interaction-layer-v900.mjs') {
      return makeSynthetic(resolvedUrl, {
        installNpcInteractionLayer() {
          metrics.timeline.push('module:npc-interaction-layer');
        },
      });
    }
    if (pathname === '/startup-errors.mjs') {
      metrics.timeline.push('module:startup-errors');
      return makeSynthetic(resolvedUrl, {});
    }
    if (pathname === '/chat-runtime.mjs') {
      throw new Error('hosted child attempted to import chat-runtime');
    }
    if (worldRuntimePaths.has(pathname)) {
      metrics.runtimeImports.push(resolvedUrl);
      metrics.timeline.push(`module:runtime:${pathname}`);
      if (failureStage === 'runtime') {
        return new vm.SyntheticModule([], function rejectRuntimeBoot() {
          throw new Error('simulated world runtime failure');
        }, { context, identifier: resolvedUrl });
      }
      return makeSynthetic(resolvedUrl, {});
    }
    throw new Error(`unexpected child module import: ${resolvedUrl}`);
  }

  async function moduleFor(resolvedUrl) {
    if (moduleCache.has(resolvedUrl)) return moduleCache.get(resolvedUrl);
    const url = new URL(resolvedUrl);
    const source = actualSources.get(url.pathname);
    let module;
    if (source !== undefined) {
      metrics.actualLoads.push(url.pathname);
      module = new vm.SourceTextModule(source, {
        context,
        identifier: resolvedUrl,
        initializeImportMeta(meta) { meta.url = resolvedUrl; },
        importModuleDynamically: dynamicImport,
      });
    } else {
      module = syntheticFor(resolvedUrl);
    }
    moduleCache.set(resolvedUrl, module);
    return module;
  }

  async function linker(specifier, referencingModule) {
    const resolvedUrl = new URL(specifier, referencingModule.identifier).href;
    metrics.staticImports.push({
      specifier,
      resolvedUrl,
      fromPath: new URL(referencingModule.identifier).pathname,
    });
    return moduleFor(resolvedUrl);
  }

  async function dynamicImport(specifier, referencingModule) {
    const resolvedUrl = new URL(specifier, referencingModule.identifier).href;
    metrics.dynamicImports.push({ specifier, resolvedUrl });
    metrics.timeline.push(`dynamic:${new URL(resolvedUrl).pathname}`);
    const module = await moduleFor(resolvedUrl);
    if (module.status === 'unlinked') await module.link(linker);
    if (module.status === 'linked') await module.evaluate();
    return module;
  }

  async function evaluate() {
    const entryUrl = `https://game.example/scene-entry-v900.mjs?vm-world=${world}&host=${hostMode}`;
    const entry = await moduleFor(entryUrl);
    await entry.link(linker);
    await entry.evaluate();
    return entry;
  }

  return {
    body,
    childWindow,
    config,
    elements,
    evaluate,
    launchSession,
    metrics,
    parentWindow,
    serverGate,
    serverGateObservation,
    sceneLease,
  };
}

function assertBootOrder(metrics) {
  const index = prefix => metrics.timeline.findIndex(item => item.startsWith(prefix));
  assert.ok(index('fetch:template') >= 0);
  assert.ok(index('scene:register') >= 0 && index('scene:register') < index('fetch:template'));
  assert.ok(index('dom:parse-template') > index('fetch:template-text'));
  assert.ok(index('dom:replace:2') > index('dom:parse-template'));
  assert.ok(index('dynamic:/startup-errors.mjs') > index('dom:replace:2'));
  assert.ok(index('dynamic:/worlds-v900.mjs') > index('dynamic:/startup-errors.mjs'));
  assert.ok(index('module:runtime:') > index('dynamic:/worlds-v900.mjs'));
  assert.ok(index('scene:report:ready') > index('module:runtime:'));
}

for (const expected of worldCases) {
  const harness = createHarness(expected);
  await harness.evaluate();

  const {
    body,
    childWindow,
    config,
    elements,
    launchSession,
    metrics,
    parentWindow,
    serverGate,
    serverGateObservation,
    sceneLease,
  } = harness;
  assert.equal(childWindow.POCKETMONSTER_LAUNCH_SESSION, launchSession);
  assert.equal(childWindow.POCKETMONSTER_RUNTIME_CONFIG, config);
  assert.equal(childWindow.__POCKETMONSTER_RUNTIME_MANIFEST__, config);
  assert.equal(childWindow.POCKETMONSTER_SERVER_GATE, serverGate, 'scene receives the exact frozen parent gate');
  assert.equal(childWindow.POCKETMONSTER_SERVER_GATE_OBSERVATION, serverGateObservation);
  assert.equal(childWindow.POCKETMONSTER_SCENE_EMBEDDED, true);
  assert.equal(childWindow.POCKETMONSTER_COMBINED_BOOT.worldId, expected.world);
  assert.equal(childWindow.POCKETMONSTER_COMBINED_BOOT.runtime, expected.runtime);
  assert.equal(body.dataset.combinedWorld, expected.world);
  assert.equal(body.dataset.controlPanel, expected.panel);
  assert.deepEqual(metrics.requireSessionArgs, [[config, launchSession]]);
  assert.equal(metrics.configLoads, 0, 'hosted scene never falls back to a child config load');
  assert.equal(metrics.fetches.length, 1, 'the V9 DOM template is fetched exactly once');
  assert.equal(metrics.sceneBootRegistrations.length, 1);
  assert.equal(metrics.sceneBootReports.length, 1);
  assert.deepEqual({ ...metrics.sceneBootReports[0] }, { status: 'ready' });
  assert.equal(new URL(childWindow.location.href).searchParams.get('shellRevision'), '13', 'hosted route normalization preserves the exact scene lease URL');
  assert.equal(Object.isFrozen(sceneLease), true);
  assert.deepEqual(metrics.importedNodes, ['scene-root', 'scene-overlay'], 'template scripts are not re-imported');
  assert.equal(elements.get('chatToggleBtn').removed, true);
  assert.equal(elements.get('gameChat').removed, true);
  assert.equal(elements.get('accountGate').classList.contains('hidden'), true);
  assert.equal(metrics.actualLoads.filter(path => path === '/scene-entry-v900.mjs').length, 1);
  assert.equal(metrics.actualLoads.filter(path => path === '/worlds-v900.mjs').length, 1);
  assert.deepEqual(metrics.runtimeImports.map(url => new URL(url).pathname + new URL(url).search), [expected.runtime.slice(1)]);
  assert.equal(metrics.webSocketConstructs, 0);
  assert.equal(metrics.sessionStorageReads, 0);
  assert.equal(metrics.dynamicImports.some(item => item.resolvedUrl.includes('/chat-runtime.mjs')), false);
  assert.equal(metrics.staticImports.some(item => item.fromPath === '/scene-entry-v900.mjs'
    && item.resolvedUrl.includes('/runtime-config.mjs')), false, 'hosted scene entry cannot independently load or normalize another config');
  assert.equal(metrics.staticImports.some(item => /entry-preload|firebase-launcher/.test(item.resolvedUrl)), false);
  assertBootOrder(metrics);

  const sceneHandle = childWindow.POCKETMONSTER_ONLINE_SCENE;
  assert.equal(sceneHandle.diagnostics().hasSessionToken, true);
  const detail = { reason: `switch-from-${expected.world}`, acknowledged: false };
  childWindow.dispatchEvent(new TestCustomEvent('pocketmonster:online-scene-teardown', { detail }));
  assert.equal(detail.acknowledged, true);
  const endedDiagnostics = sceneHandle.diagnostics();
  assert.equal(endedDiagnostics.ended, true);
  assert.equal(endedDiagnostics.reason, `switch-from-${expected.world}`);
  assert.equal(endedDiagnostics.aborted, true);
  assert.equal(endedDiagnostics.hasSessionToken, false);
  assert.deepEqual(body.children, []);
  assert.equal('POCKETMONSTER_LAUNCH_SESSION' in childWindow, false);
  assert.equal('POCKETMONSTER_RUNTIME_CONFIG' in childWindow, false);
  assert.equal('POCKETMONSTER_SERVER_GATE' in childWindow, false);
  assert.equal('POCKETMONSTER_SERVER_GATE_OBSERVATION' in childWindow, false);
  assert.equal(metrics.parentEndReasons.length, 0, 'parent-originated teardown cannot recursively end the session');
  assert.equal(parentWindow.POCKETMONSTER_LAUNCH_SESSION, launchSession);
  assert.equal(parentWindow.POCKETMONSTER_RUNTIME_CONFIG, config);
  assert.equal(parentWindow.POCKETMONSTER_SERVER_GATE, serverGate);
}

for (const hostMode of ['standalone', 'cross-origin']) {
  const harness = createHarness({ hostMode });
  await assert.rejects(
    harness.evaluate(),
    /World scene must be hosted by the authenticated Monster Life shell/,
  );
  assert.equal(harness.metrics.fetches.length, 0, `${hostMode} scene is rejected before template fetch`);
  assert.equal(harness.metrics.requireSessionArgs.length, 0, `${hostMode} scene is rejected before session use`);
  assert.equal(harness.metrics.actualLoads.includes('/worlds-v900.mjs'), false);
  assert.equal(harness.metrics.webSocketConstructs, 0);
}

for (const gateMode of ['missing', 'unhealthy']) {
  const harness = createHarness({ gateMode });
  await assert.rejects(
    harness.evaluate(),
    error => error?.code === 'ONLINE_SERVER_REQUIRED',
    `${gateMode} parent Server gate must fail closed`,
  );
  assert.equal(harness.metrics.fetches.length, 0, `${gateMode} gate is rejected before template fetch`);
  assert.equal(harness.metrics.actualLoads.includes('/worlds-v900.mjs'), false);
  assert.equal(harness.metrics.webSocketConstructs, 0);
}

for (const failureStage of ['template', 'runtime']) {
  const harness = createHarness({ failureStage });
  await assert.rejects(harness.evaluate());
  assert.equal(harness.metrics.sceneBootRegistrations.length, 1);
  assert.equal(harness.metrics.sceneBootReports.length, 1);
  assert.deepEqual({ ...harness.metrics.sceneBootReports[0] }, {
    status: 'error',
    code: 'ONLINE_SCENE_BOOT_FAILED',
    stage: failureStage,
  });
  assert.equal(harness.metrics.parentEndReasons.length, 0, `${failureStage} failure does not revoke the valid parent session`);
  assert.deepEqual(harness.body.children, []);
  assert.equal('POCKETMONSTER_LAUNCH_SESSION' in harness.childWindow, false);
  assert.equal('POCKETMONSTER_SERVER_GATE' in harness.childWindow, false);
}

const directNavigationHarness = createHarness(worldCases[0]);
await directNavigationHarness.evaluate();
directNavigationHarness.childWindow.dispatchEvent(new Event('pagehide'));
assert.equal(directNavigationHarness.metrics.sceneBootLeaves.length, 1, 'direct child navigation releases the exact document lease');
assert.equal(directNavigationHarness.parentWindow.POCKETMONSTER_LAUNCH_SESSION, directNavigationHarness.launchSession, 'direct navigation keeps the parent session owner alive');
assert.equal(directNavigationHarness.metrics.parentEndReasons.length, 0);

const logoutHarness = createHarness(worldCases[0]);
await logoutHarness.evaluate();
const logoutHandle = logoutHarness.childWindow.POCKETMONSTER_ONLINE_SCENE;
logoutHarness.childWindow.dispatchEvent(new Event('pocketmonster:session-ended'));
assert.deepEqual(logoutHarness.metrics.parentEndReasons, ['scene-session-ended']);
assert.equal(logoutHandle.diagnostics().ended, true);
assert.equal(logoutHandle.diagnostics().hasSessionToken, false);
assert.deepEqual(logoutHarness.body.children, []);
assert.equal(logoutHarness.parentWindow.POCKETMONSTER_LAUNCH_SESSION, logoutHarness.launchSession);

console.log('V9 unified child scene source runtime: PASS');
