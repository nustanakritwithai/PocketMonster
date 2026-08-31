import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { SHORT_HEIGHT_VIEWPORTS } from './p0-ux1-short-height.mjs';

export const HUD_GEOMETRY_SELECTORS = Object.freeze({
  topUtilityRail: '#hud .topbar',
  dock: '[data-unified-hud-dock]',
  joystick: '#joystick',
  camera: '#cameraPad',
  actions: Object.freeze([
    '#skill1Btn', '#skill2Btn', '#skill3Btn', '#skill4Btn', '#captureBtn', '#summonBtn', '#recallBtn',
    '#pirateBlockBtn', '#pirateWeaponBtn', '#piratePotion1Btn', '#piratePotion2Btn',
  ]),
  utilities: Object.freeze(['#persistentFullscreenBtn', '#pirateZoomInBtn', '#pirateZoomOutBtn']),
  zoom: Object.freeze(['#pirateZoomInBtn', '#pirateZoomOutBtn']),
  target: '#targetCard',
  fullscreen: '#persistentFullscreenBtn',
  quest: '#stageObjective',
  chat: '#gameChat',
  party: '#party',
  onboardingProxies: '[data-onboarding-action]',
});

export const HUD_DOCK_BUDGETS = Object.freeze({
  collapsed: Object.freeze({ expectedWidth: 64, expectedHeight: 64, rightInset: 8, bottomInset: 8, maxViewportCoverageRatio: 0.12 }),
  expanded: Object.freeze({ expectedWidth: 320, expectedHeight: 240, rightInset: 16, bottomInset: 8, maxViewportCoverageRatio: 0.45 }),
});

export const PIRATE_GEOMETRY_REPORT_TYPE = 'pocketmonster:hud-geometry-report-v1';
export const PIRATE_GEOMETRY_BOUNDARY = Object.freeze({
  transport: 'postMessage',
  childOrigin: 'null',
  sourceCheck: 'exact-frame-contentWindow',
  parentDomInspection: false,
  allowSameOrigin: false,
  coordinateSpace: 'child-viewport-css-pixels',
  mergedCoordinateSpace: 'parent-shared-css-pixels',
});

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export const TASK1_BROWSER_BASELINE_FIXTURE = deepFreeze(JSON.parse(
  fs.readFileSync(new URL('./fixtures/task1-unified-hud-browser-baselines.json', import.meta.url), 'utf8'),
));

export const LEGACY_BROWSER_BASELINES = Object.freeze(SHORT_HEIGHT_VIEWPORTS.map(viewport => {
  const evidence = TASK1_BROWSER_BASELINE_FIXTURE.baselines.find(item => item.viewport.width === viewport.width && item.viewport.height === viewport.height);
  const observed = evidence ? Object.freeze({
    coarse: evidence.coarse,
    touch: evidence.touch,
    finalUrl: evidence.sceneUrl,
    measuredRects: Object.freeze(Object.fromEntries(Object.entries(evidence.measuredControls).map(([key, rect]) => [key, Object.freeze([rect.width, rect.height])]))),
    traceProvenance: viewport.width === 667 && viewport.height === 375
      ? TASK1_BROWSER_BASELINE_FIXTURE.productionObservations.dualTouchTrace.events
      : Object.freeze([]),
  }) : Object.freeze({});
  const violations = evidence?.measuredControls && Object.keys(evidence.measuredControls).length
    ? Object.freeze(['interactive-under-48']) : Object.freeze([]);
  return Object.freeze({ ...viewport, observed, violations });
}));

function finite(value) { return Number.isFinite(value); }

export function normalizeRect(rect) {
  if (!rect) return null;
  const left = Number(rect.left ?? rect.x);
  const top = Number(rect.top ?? rect.y);
  const width = Number(rect.width ?? (Number(rect.right) - left));
  const height = Number(rect.height ?? (Number(rect.bottom) - top));
  const right = Number(rect.right ?? (left + width));
  const bottom = Number(rect.bottom ?? (top + height));
  if (![left, top, right, bottom, width, height].every(finite) || width < 0 || height < 0 || right < left || bottom < top) return null;
  return Object.freeze({ left, top, right, bottom, width, height });
}

export function intersectionArea(a, b) {
  const first = normalizeRect(a);
  const second = normalizeRect(b);
  if (!first || !second) return 0;
  return Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left))
    * Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
}

/** Plane sweep over x-slabs; merged y-intervals prevent any double-counting. */
export function unionArea(rectangles) {
  const rects = rectangles.map(normalizeRect).filter(rect => rect && rect.width > 0 && rect.height > 0);
  const xs = [...new Set(rects.flatMap(rect => [rect.left, rect.right]))].sort((a, b) => a - b);
  let area = 0;
  for (let index = 0; index < xs.length - 1; index += 1) {
    const left = xs[index];
    const right = xs[index + 1];
    const intervals = rects
      .filter(rect => rect.left < right && rect.right > left)
      .map(rect => [rect.top, rect.bottom])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let coveredY = 0;
    let start = null;
    let end = null;
    for (const [nextStart, nextEnd] of intervals) {
      if (start === null) { start = nextStart; end = nextEnd; continue; }
      if (nextStart > end) { coveredY += end - start; start = nextStart; end = nextEnd; }
      else end = Math.max(end, nextEnd);
    }
    if (start !== null) coveredY += end - start;
    area += (right - left) * coveredY;
  }
  return area;
}

export function overlapPairs(entries) {
  const pairs = [];
  for (let a = 0; a < entries.length; a += 1) {
    if (!entries[a]?.visible || !entries[a]?.rect) continue;
    for (let b = a + 1; b < entries.length; b += 1) {
      if (!entries[b]?.visible || !entries[b]?.rect) continue;
      const area = intersectionArea(entries[a].rect, entries[b].rect);
      if (area > 0) pairs.push(Object.freeze({ pair: `${entries[a].key}×${entries[b].key}`, area }));
    }
  }
  return Object.freeze(pairs);
}

export function expectedDockRegion(viewport, dockState) {
  const budget = HUD_DOCK_BUDGETS[dockState];
  if (!budget) throw new TypeError(`unknown HUD Dock state: ${dockState}`);
  const viewportWidth = Number(viewport?.width);
  const viewportHeight = Number(viewport?.height);
  if (!(viewportWidth > 0 && viewportHeight > 0 && finite(viewportWidth) && finite(viewportHeight))) throw new TypeError('invalid HUD viewport');
  const width = Math.min(budget.expectedWidth, Math.max(0, viewportWidth - budget.rightInset));
  const height = Math.min(budget.expectedHeight, Math.max(0, viewportHeight - budget.bottomInset));
  const right = viewportWidth - budget.rightInset;
  const bottom = viewportHeight - budget.bottomInset;
  return Object.freeze({ left: right - width, top: bottom - height, right, bottom, width, height });
}

export function clipRectToViewport(rect, viewport) {
  const clean = normalizeRect(rect);
  const width = Number(viewport?.width);
  const height = Number(viewport?.height);
  if (!clean || !(finite(width) && finite(height) && width >= 0 && height >= 0)) return null;
  const left = Math.max(0, Math.min(width, clean.left));
  const top = Math.max(0, Math.min(height, clean.top));
  const right = Math.max(left, Math.min(width, clean.right));
  const bottom = Math.max(top, Math.min(height, clean.bottom));
  return Object.freeze({ left, top, right, bottom, width: right - left, height: bottom - top });
}

export function summarizeGeometry(entries, viewport) {
  const visibleEntries = entries.filter(entry => entry.visible && entry.rect);
  const visibleRects = visibleEntries.map(entry => entry.rect);
  const clippedEntries = visibleEntries.map(entry => Object.freeze({
    ...entry,
    rect: clipRectToViewport(entry.rect, viewport),
  }));
  const union = unionArea(clippedEntries.map(entry => entry.rect).filter(Boolean));
  const summed = visibleRects.reduce((sum, rect) => sum + rect.width * rect.height, 0);
  const viewportArea = Math.max(0, Number(viewport?.width) * Number(viewport?.height));
  const violations = [];
  if (entries.some(entry => {
    const rect = normalizeRect(entry.rect);
    return entry.visible && entry.interactive && rect && (rect.width < 48 || rect.height < 48);
  })) {
    violations.push('interactive-under-48');
  }
  return Object.freeze({
    overlapPairs: overlapPairs(clippedEntries),
    unionArea: union,
    summedArea: summed,
    unionCoverage: viewportArea ? union / viewportArea : 0,
    violations: Object.freeze(violations),
  });
}

function snapshotElement(doc, key, selector, interactive = false, element = doc.querySelector(selector)) {
  if (!element) return Object.freeze({ key, selector, present: false, visible: false, interactive, rect: null });
  const style = doc.defaultView?.getComputedStyle?.(element) || {};
  const rect = normalizeRect(element.getBoundingClientRect());
  const visible = style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity ?? 1) !== 0 && Boolean(rect?.width && rect?.height);
  return Object.freeze({ key, selector, present: true, visible, interactive, rect, elementState: element.dataset?.dockState ?? null });
}

function selectorKey(group, selector) { return `${group}:${selector.replace(/^#/, '')}`; }

export function captureUnifiedHudGeometry(doc = globalThis.document, win = globalThis.window, { dockState = 'collapsed' } = {}) {
  if (!doc || !win) throw new Error('Unified HUD geometry capture requires browser document/window');
  if (!HUD_DOCK_BUDGETS[dockState]) throw new TypeError(`unknown HUD Dock state: ${dockState}`);
  const entries = [
    snapshotElement(doc, 'top-utility-rail', HUD_GEOMETRY_SELECTORS.topUtilityRail),
    snapshotElement(doc, 'joystick', HUD_GEOMETRY_SELECTORS.joystick, true),
    snapshotElement(doc, 'camera', HUD_GEOMETRY_SELECTORS.camera, true),
    ...HUD_GEOMETRY_SELECTORS.actions.map(selector => snapshotElement(doc, selectorKey('action', selector), selector, true)),
    ...HUD_GEOMETRY_SELECTORS.utilities.map(selector => snapshotElement(doc, selectorKey('utility', selector), selector, true)),
    snapshotElement(doc, 'target', HUD_GEOMETRY_SELECTORS.target),
    snapshotElement(doc, 'quest', HUD_GEOMETRY_SELECTORS.quest, true),
    snapshotElement(doc, 'chat', HUD_GEOMETRY_SELECTORS.chat, true),
    snapshotElement(doc, 'party', HUD_GEOMETRY_SELECTORS.party, true),
    ...[...(doc.querySelectorAll?.(HUD_GEOMETRY_SELECTORS.onboardingProxies) || [])].map((element, index) => snapshotElement(doc, `onboarding-proxy-${index + 1}`, HUD_GEOMETRY_SELECTORS.onboardingProxies, true, element)),
  ];
  const dockCandidate = snapshotElement(doc, 'dock', HUD_GEOMETRY_SELECTORS.dock);
  const summary = summarizeGeometry(entries, { width: win.innerWidth, height: win.innerHeight });
  const budget = HUD_DOCK_BUDGETS[dockState];
  const expectedRegion = expectedDockRegion({ width: win.innerWidth, height: win.innerHeight }, dockState);
  const viewportArea = win.innerWidth * win.innerHeight;
  const coverage = viewportArea > 0 ? expectedRegion.width * expectedRegion.height / viewportArea : 0;
  const stateValid = !dockCandidate.present || dockCandidate.elementState === dockState;
  const dimensionsValid = !dockCandidate.present || (dockCandidate.rect?.width === expectedRegion.width && dockCandidate.rect?.height === expectedRegion.height);
  const violations = [...summary.violations];
  if (!stateValid) violations.push('dock-state-mismatch');
  if (!dimensionsValid) violations.push('dock-dimensions-mismatch');
  if (coverage > budget.maxViewportCoverageRatio) violations.push(`dock-${dockState}-budget-exceeded`);
  return Object.freeze({
    viewport: Object.freeze({ width: win.innerWidth, height: win.innerHeight, dpr: win.devicePixelRatio ?? 1 }),
    entries: Object.freeze(entries),
    dock: Object.freeze({ state: dockState, present: dockCandidate.present, candidate: dockCandidate, expectedRegion, budget, coverage, stateValid, dimensionsValid, withinBudget: coverage <= budget.maxViewportCoverageRatio }),
    overlapPairs: summary.overlapPairs,
    unionArea: summary.unionArea,
    summedArea: summary.summedArea,
    unionCoverage: summary.unionCoverage,
    violations: Object.freeze(violations),
  });
}

export const PIRATE_GEOMETRY_SCHEMA_VERSION = 1;
export const PIRATE_GEOMETRY_MAX_RECTS = 32;
export const PIRATE_GEOMETRY_MAX_PAYLOAD_BYTES = 8192;
export const PIRATE_GEOMETRY_SEMANTIC_IDS = Object.freeze([
  'tc-root', 'hud-help', 'fullscreen-prompt-root',
  'onboarding-root', 'onboarding-prev', 'onboarding-pause', 'onboarding-next',
]);

const pirateSemanticIds = new Set(PIRATE_GEOMETRY_SEMANTIC_IDS);
function validRequestId(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(value); }
function validRuntimeRevision(value) { return typeof value === 'string' && /^[A-Za-z0-9._-]{1,80}$/.test(value); }
function payloadBytes(value) { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }

export function createPirateGeometryReport(input) {
  if (!input || payloadBytes(input) > PIRATE_GEOMETRY_MAX_PAYLOAD_BYTES) throw new TypeError('Pirate geometry payload limit exceeded');
  const { schemaVersion, frameGeneration, runtimeRevision, requestId, viewport, rects } = input;
  if (schemaVersion !== PIRATE_GEOMETRY_SCHEMA_VERSION) throw new TypeError('invalid Pirate geometry schemaVersion');
  if (!Number.isSafeInteger(frameGeneration) || frameGeneration < 0) throw new TypeError('invalid Pirate geometry frameGeneration');
  if (!validRuntimeRevision(runtimeRevision)) throw new TypeError('invalid Pirate geometry runtimeRevision');
  if (!validRequestId(requestId)) throw new TypeError('invalid Pirate geometry requestId');
  const rawViewport = { width: Number(viewport?.width), height: Number(viewport?.height), dpr: Number(viewport?.dpr ?? 1) };
  if (!(rawViewport.width > 0 && rawViewport.height > 0 && rawViewport.dpr > 0) || !Object.values(rawViewport).every(finite)) throw new TypeError('invalid Pirate geometry viewport');
  const cleanViewport = Object.freeze({
    width: clamp(rawViewport.width, 1, 4096),
    height: clamp(rawViewport.height, 1, 2160),
    dpr: clamp(rawViewport.dpr, 0.5, 8),
  });
  if (!Array.isArray(rects) || rects.length > PIRATE_GEOMETRY_MAX_RECTS) throw new TypeError('Pirate geometry rect limit exceeded');
  const cleanRects = Object.freeze(rects.map((entry, index) => {
    const key = pirateSemanticIds.has(entry?.key) ? entry.key : null;
    const rect = clipRectToViewport(entry?.rect, cleanViewport);
    if (!key) throw new TypeError(`invalid Pirate geometry semantic id at ${index}`);
    if (!rect) throw new TypeError(`invalid Pirate geometry rect at ${index}`);
    return Object.freeze({ key, visible: entry.visible !== false, rect });
  }));
  return Object.freeze({
    type: PIRATE_GEOMETRY_REPORT_TYPE,
    schemaVersion,
    frameGeneration,
    runtimeRevision,
    requestId,
    viewport: cleanViewport,
    rects: cleanRects,
  });
}

/** Pure child-viewport to parent/shared CSS-pixel transform; installs no runtime listener. */
export function mergePirateGeometryReport(report, frameRect, parentViewport = null) {
  const frame = normalizeRect(frameRect);
  if (!frame || !report?.viewport?.width || !report?.viewport?.height || !Array.isArray(report?.rects)) throw new TypeError('invalid Pirate geometry merge input');
  const scaleX = frame.width / report.viewport.width;
  const scaleY = frame.height / report.viewport.height;
  return Object.freeze(report.rects.map(entry => {
    const source = normalizeRect(entry.rect);
    let rect = normalizeRect({
      left: frame.left + source.left * scaleX,
      top: frame.top + source.top * scaleY,
      width: source.width * scaleX,
      height: source.height * scaleY,
    });
    if (parentViewport) rect = clipRectToViewport(rect, parentViewport);
    return Object.freeze({ key: entry.key, visible: entry.visible, rect });
  }));
}

/** Collector seam only. Task 1 deliberately does not install a message listener or child probe. */
export function collectPirateGeometryReport(event, { frameWindow, requestId, frameGeneration, runtimeRevision }) {
  if (event?.source !== frameWindow || event?.origin !== PIRATE_GEOMETRY_BOUNDARY.childOrigin) return null;
  if (event?.data?.type !== PIRATE_GEOMETRY_REPORT_TYPE || event.data.requestId !== requestId) return null;
  if (event.data.frameGeneration !== frameGeneration || event.data.runtimeRevision !== runtimeRevision) return null;
  try { return createPirateGeometryReport(event.data); } catch { return null; }
}

export const BASELINE_VIOLATION_FIXTURE = Object.freeze({
  viewport: Object.freeze({ width: 568, height: 320 }),
  entries: Object.freeze([
    Object.freeze({ key: 'capture', visible: true, interactive: true, rect: Object.freeze({ left: 500, top: 250, right: 560, bottom: 310, width: 60, height: 60 }) }),
    Object.freeze({ key: 'skill', visible: true, interactive: true, rect: Object.freeze({ left: 520, top: 240, right: 562, bottom: 282, width: 42, height: 42 }) }),
  ]),
  expected: Object.freeze({ overlapPair: 'capture×skill', overlapArea: 1280, summedArea: 5364, unionArea: 4084, violations: Object.freeze(['interactive-under-48']) }),
});

assert.deepEqual(LEGACY_BROWSER_BASELINES.map(({ width, height }) => [width, height]), SHORT_HEIGHT_VIEWPORTS.map(({ width, height }) => [width, height]), 'geometry and short-height matrices must stay identical');
assert.equal(LEGACY_BROWSER_BASELINES.length, 9);
assert.deepEqual(Object.keys(HUD_GEOMETRY_SELECTORS), ['topUtilityRail', 'dock', 'joystick', 'camera', 'actions', 'utilities', 'zoom', 'target', 'fullscreen', 'quest', 'chat', 'party', 'onboardingProxies']);
assert.deepEqual(HUD_GEOMETRY_SELECTORS.actions.slice(-4), ['#pirateBlockBtn', '#pirateWeaponBtn', '#piratePotion1Btn', '#piratePotion2Btn']);
assert.equal(HUD_GEOMETRY_SELECTORS.utilities.includes('#persistentFullscreenBtn'), true);
assert.equal(HUD_GEOMETRY_SELECTORS.utilities.includes('#pirateZoomInBtn'), true);
assert.equal(HUD_GEOMETRY_SELECTORS.utilities.includes('#pirateZoomOutBtn'), true);
assert.ok(HUD_DOCK_BUDGETS.collapsed.maxViewportCoverageRatio < HUD_DOCK_BUDGETS.expanded.maxViewportCoverageRatio, 'expanded Dock receives a larger deterministic geometry budget');
assert.deepEqual([HUD_DOCK_BUDGETS.collapsed.expectedWidth, HUD_DOCK_BUDGETS.expanded.expectedWidth], [64, 320]);
assert.equal(unionArea([{ left: 0, top: 0, right: 10, bottom: 10 }, { left: 5, top: 0, right: 15, bottom: 10 }]), 150, 'overlapping rectangles count once');
const clippedCoverage = summarizeGeometry([
  { key: 'offscreen', visible: true, interactive: false, rect: { left: -10, top: 0, right: 10, bottom: 10, width: 20, height: 10 } },
], { width: 100, height: 100 });
assert.equal(clippedCoverage.unionArea, 100, 'union coverage excludes off-screen rectangle area');
assert.equal(clippedCoverage.unionCoverage, 0.01);
const entirelyOffscreenOverlap = summarizeGeometry([
  { key: 'first', visible: true, interactive: false, rect: { left: -20, top: 0, right: -5, bottom: 10, width: 15, height: 10 } },
  { key: 'second', visible: true, interactive: false, rect: { left: -15, top: 0, right: -1, bottom: 10, width: 14, height: 10 } },
], { width: 100, height: 100 });
assert.deepEqual(entirelyOffscreenOverlap.overlapPairs, [], 'overlaps entirely outside the viewport are not reported');
assert.equal(entirelyOffscreenOverlap.unionArea, 0, 'rectangles entirely outside the viewport have zero union area');
const partiallyOffscreenOverlap = summarizeGeometry([
  { key: 'first', visible: true, interactive: false, rect: { left: -10, top: 0, right: 10, bottom: 10, width: 20, height: 10 } },
  { key: 'second', visible: true, interactive: false, rect: { left: -5, top: 0, right: 5, bottom: 10, width: 10, height: 10 } },
], { width: 100, height: 100 });
assert.deepEqual(partiallyOffscreenOverlap.overlapPairs, [{ pair: 'first×second', area: 50 }], 'overlap area is clipped to the viewport');
assert.equal(unionArea(BASELINE_VIOLATION_FIXTURE.entries.map(entry => entry.rect)), BASELINE_VIOLATION_FIXTURE.expected.unionArea);
assert.deepEqual(overlapPairs(BASELINE_VIOLATION_FIXTURE.entries), [Object.freeze({ pair: 'capture×skill', area: BASELINE_VIOLATION_FIXTURE.expected.overlapArea })]);
assert.ok(BASELINE_VIOLATION_FIXTURE.expected.summedArea > BASELINE_VIOLATION_FIXTURE.expected.unionArea, 'fixture makes double-counting observable');
const fixtureReport = summarizeGeometry(BASELINE_VIOLATION_FIXTURE.entries, BASELINE_VIOLATION_FIXTURE.viewport);
assert.deepEqual(fixtureReport.overlapPairs, [{ pair: 'capture×skill', area: 1280 }]);
assert.equal(fixtureReport.unionArea, 4084);
assert.equal(fixtureReport.summedArea, 5364);
assert.deepEqual(fixtureReport.violations, BASELINE_VIOLATION_FIXTURE.expected.violations);
assert.deepEqual(LEGACY_BROWSER_BASELINES[0].observed.measuredRects.skill4Btn, [43, 43]);
assert.deepEqual(LEGACY_BROWSER_BASELINES[0].observed.measuredRects.captureBtn, [60.2, 60.2]);
assert.deepEqual(LEGACY_BROWSER_BASELINES[2].observed.measuredRects.piratePotion2Btn, [41.28, 41.28]);
assert.equal(new Set(LEGACY_BROWSER_BASELINES[1].observed.traceProvenance.map(item => item.pointerId)).size, 2);

function fakeBrowserDocument(rectBySelector = {}, stateBySelector = {}) {
  const elementFor = selector => rectBySelector[selector] ? {
    dataset: stateBySelector[selector] || {},
    getBoundingClientRect: () => rectBySelector[selector],
  } : null;
  return {
    defaultView: { getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }) },
    querySelector: elementFor,
    querySelectorAll: () => [],
  };
}

const fakeWindow = { innerWidth: 568, innerHeight: 320, devicePixelRatio: 2 };
const fakeDoc = fakeBrowserDocument({
  '#skill1Btn': { left: 520, top: 270, right: 561, bottom: 311, width: 41, height: 41 },
});
const collapsedCapture = captureUnifiedHudGeometry(fakeDoc, fakeWindow, { dockState: 'collapsed' });
const expandedCapture = captureUnifiedHudGeometry(fakeDoc, fakeWindow, { dockState: 'expanded' });
for (const selector of [...HUD_GEOMETRY_SELECTORS.actions, ...HUD_GEOMETRY_SELECTORS.utilities]) {
  assert.equal(collapsedCapture.entries.filter(entry => entry.selector === selector).length, 1, `${selector} belongs to exactly one shared-control geometry group`);
}
assert.equal(collapsedCapture.dock.present, false, 'Task 1 does not create a production Dock');
assert.equal(collapsedCapture.violations.includes('dock-placeholder-missing'), false, 'absent future Dock is a valid Task 1 baseline');
assert.deepEqual(collapsedCapture.dock.expectedRegion, { left: 496, top: 248, right: 560, bottom: 312, width: 64, height: 64 });
assert.deepEqual(expandedCapture.dock.expectedRegion, { left: 232, top: 72, right: 552, bottom: 312, width: 320, height: 240 });
assert.notDeepEqual(collapsedCapture.dock.expectedRegion, expandedCapture.dock.expectedRegion);
assert.equal(collapsedCapture.violations.includes('interactive-under-48'), true, 'fake browser document exposes expected baseline violation');
const wrongDock = captureUnifiedHudGeometry(fakeBrowserDocument({
  '[data-unified-hud-dock]': { left: 500, top: 250, right: 550, bottom: 300, width: 50, height: 50 },
}, { '[data-unified-hud-dock]': { dockState: 'expanded' } }), fakeWindow, { dockState: 'collapsed' });
assert.equal(wrongDock.dock.stateValid, false);
assert.equal(wrongDock.dock.dimensionsValid, false);
assert.ok(wrongDock.violations.includes('dock-state-mismatch'));
assert.ok(wrongDock.violations.includes('dock-dimensions-mismatch'));
assert.throws(() => captureUnifiedHudGeometry(fakeDoc, fakeWindow, { dockState: 'open' }), /unknown HUD Dock state/);

const frameWindow = {};
const report = createPirateGeometryReport({
  schemaVersion: 1,
  frameGeneration: 7,
  runtimeRevision: 'pirate-runtime-v900',
  requestId: 'baseline_667x375',
  viewport: { width: 667, height: 375, dpr: 2 },
  rects: [{ key: 'tc-root', rect: { x: 10, y: 20, width: 40, height: 20 } }],
});
assert.equal(report.schemaVersion, PIRATE_GEOMETRY_SCHEMA_VERSION);
assert.equal(report.frameGeneration, 7);
assert.equal(report.runtimeRevision, 'pirate-runtime-v900');
assert.deepEqual(collectPirateGeometryReport(
  { source: frameWindow, origin: 'null', data: report },
  { frameWindow, requestId: 'baseline_667x375', frameGeneration: 7, runtimeRevision: 'pirate-runtime-v900' },
), report);
assert.equal(collectPirateGeometryReport({ source: frameWindow, origin: 'null', data: report }, { frameWindow, requestId: 'baseline_667x375', frameGeneration: 6, runtimeRevision: 'pirate-runtime-v900' }), null, 'stale frame generation is rejected');
assert.equal(collectPirateGeometryReport({ source: frameWindow, origin: 'null', data: report }, { frameWindow, requestId: 'baseline_667x375', frameGeneration: 7, runtimeRevision: 'other-runtime' }), null, 'stale runtime revision is rejected');
assert.equal(collectPirateGeometryReport({ source: {}, origin: 'null', data: report }, { frameWindow, requestId: 'baseline_667x375', frameGeneration: 7, runtimeRevision: 'pirate-runtime-v900' }), null, 'unrelated opaque frame cannot submit geometry');
assert.equal(collectPirateGeometryReport({ source: frameWindow, origin: 'https://game.example', data: report }, { frameWindow, requestId: 'baseline_667x375', frameGeneration: 7, runtimeRevision: 'pirate-runtime-v900' }), null, 'sandbox baseline accepts only the opaque child origin');
assert.throws(() => createPirateGeometryReport({ ...report, rects: [{ key: 'arbitrary-child-node', rect: { x: 0, y: 0, width: 1, height: 1 } }] }), /semantic id/);
assert.throws(() => createPirateGeometryReport({ ...report, rects: Array.from({ length: PIRATE_GEOMETRY_MAX_RECTS + 1 }, () => report.rects[0]) }), /rect limit/);
assert.throws(() => createPirateGeometryReport({ ...report, padding: 'x'.repeat(PIRATE_GEOMETRY_MAX_PAYLOAD_BYTES) }), /payload limit/);
assert.throws(() => createPirateGeometryReport({ ...report, viewport: { width: Infinity, height: 375, dpr: 2 } }), /viewport/);
const clampedReport = createPirateGeometryReport({ ...report, viewport: { width: 99999, height: 99999, dpr: 99 } });
assert.deepEqual(clampedReport.viewport, { width: 4096, height: 2160, dpr: 8 });
const reportBeforeMerge = JSON.stringify(report);
assert.deepEqual(mergePirateGeometryReport(report, { left: 100, top: 50, width: 333.5, height: 187.5 }), [
  { key: 'tc-root', visible: true, rect: { left: 105, top: 60, right: 125, bottom: 70, width: 20, height: 10 } },
]);
assert.equal(JSON.stringify(report), reportBeforeMerge, 'child-to-parent coordinate merge is pure');
assert.equal(PIRATE_GEOMETRY_BOUNDARY.allowSameOrigin, false);

const browserEvidenceFixture = TASK1_BROWSER_BASELINE_FIXTURE;
assert.equal(browserEvidenceFixture.schemaVersion, 1);
const expectedEvidenceMatrix = SHORT_HEIGHT_VIEWPORTS.map(({ width, height }) => [width, height]);
assert.equal(browserEvidenceFixture.baselines.length, 9, 'checked-in browser evidence contains all nine real records');
assert.deepEqual(browserEvidenceFixture.baselines.map(item => [item.viewport.width, item.viewport.height]), expectedEvidenceMatrix, 'browser evidence matrix exactly matches SHORT_HEIGHT_VIEWPORTS');
const expectedMeasuredControls = ['persistentFullscreenBtn', 'skill1Btn', 'skill2Btn', 'skill3Btn', 'skill4Btn', 'captureBtn', 'summonBtn', 'recallBtn', 'pirateBlockBtn', 'pirateWeaponBtn', 'piratePotion1Btn', 'piratePotion2Btn', 'pirateZoomInBtn', 'pirateZoomOutBtn'];
// Frozen from test-output/v90-unified-hud-baseline/geometry-baseline.json; CI does not need that local artifact.
const expectedLocalControlRectanglesSha256 = 'eda42807ba8b50eb43ccbf481311a45e844e8ed21109e0eb02bdac996c7aa6c5';
for (const expectedViewport of SHORT_HEIGHT_VIEWPORTS) {
  const baseline = browserEvidenceFixture.baselines.find(item => item.viewport.width === expectedViewport.width && item.viewport.height === expectedViewport.height);
  assert.ok(baseline, `${expectedViewport.width}x${expectedViewport.height} real browser evidence is present`);
  assert.equal(Number.isFinite(baseline.viewport.dpr), true, `${expectedViewport.width}x${expectedViewport.height} DPR is recorded`);
  assert.equal(typeof baseline.coarse, 'boolean', `${expectedViewport.width}x${expectedViewport.height} coarse metadata is recorded`);
  assert.equal(typeof baseline.touch, 'boolean', `${expectedViewport.width}x${expectedViewport.height} touch metadata is recorded`);
  assert.equal(baseline.touch, baseline.maxTouchPoints > 0, `${expectedViewport.width}x${expectedViewport.height} touch metadata agrees with maxTouchPoints`);
  assert.equal(baseline.hostUrl, 'http://127.0.0.1:8765/asset-lab/index.html');
  assert.equal(baseline.sceneUrl, 'http://127.0.0.1:8765/scene-v900.html?world=pirate-fruit&panel=human&shellRevision=12');
  assert.equal(baseline.state, 'local-pirate-scene-server-offline');
  assert.equal(baseline.source, browserEvidenceFixture.source, `${expectedViewport.width}x${expectedViewport.height} source is explicit`);
  assert.deepEqual(Object.keys(baseline.measuredControls), expectedMeasuredControls, `${expectedViewport.width}x${expectedViewport.height} has every measured control`);
  for (const controlName of expectedMeasuredControls) {
    const control = baseline.measuredControls[controlName];
    assert.deepEqual(Object.keys(control), ['x', 'y', 'width', 'height', 'visible'], `${expectedViewport.width}x${expectedViewport.height} ${controlName} preserves the complete captured rectangle`);
    assert.equal([control?.x, control?.y, control?.width, control?.height].every(Number.isFinite), true, `${expectedViewport.width}x${expectedViewport.height} ${controlName} coordinates and dimensions are recorded`);
    assert.equal(typeof control.visible, 'boolean', `${expectedViewport.width}x${expectedViewport.height} ${controlName} visibility is recorded`);
  }
  assert.deepEqual(baseline.onboardingProxies, [], 'local server-offline capture did not include onboarding proxies');
}
const localControlRectanglesSha256 = createHash('sha256')
  .update(JSON.stringify(browserEvidenceFixture.baselines.map(item => item.measuredControls)))
  .digest('hex');
assert.equal(localControlRectanglesSha256, expectedLocalControlRectanglesSha256, 'all 9×14 local control rectangles exactly match frozen source evidence');
assert.deepEqual(browserEvidenceFixture.baselines[0].measuredControls.skill4Btn, { x: 397.72, y: 261.52, width: 43, height: 43, visible: true });
assert.deepEqual(browserEvidenceFixture.baselines[0].measuredControls.captureBtn, { x: 495.76, y: 244.32, width: 60.2, height: 60.2, visible: true });
assert.deepEqual(browserEvidenceFixture.baselines[8].measuredControls.piratePotion2Btn, { x: 976, y: 588, width: 48, height: 48, visible: true });

const production = browserEvidenceFixture.productionObservations;
assert.equal(production.finalUrl, 'https://nustanakritwithai.github.io/PocketMonster/?world=pirate-fruit&panel=human', 'production observations retain the exact deployed final URL');
assert.deepEqual(production.controlSizeBaselines.map(item => [item.viewport.width, item.viewport.height]), [[568, 320], [740, 280]], 'deployed control-size observations remain separate from local evidence');
assert.deepEqual(production.controlSizeBaselines[0].measuredControls.onboardingPrev, { width: 28, height: 19, visible: true });
assert.deepEqual(production.controlSizeBaselines[0].measuredControls.onboardingPause, { width: 32, height: 19, visible: true });
assert.equal(production.controlSizeBaselines[1].evidenceClass, 'deployed-production-baseline');
const trace = production.dualTouchTrace;
assert.deepEqual(trace.viewport, { width: 667, height: 375 });
assert.deepEqual(trace.events, [
  { type: 'pointerdown', targetName: 'joystick', pointerId: 5, x: 120, y: 310, pointerType: 'touch' },
  { type: 'pointerdown', targetName: 'captureBtn', pointerId: 6, x: 625, y: 330, pointerType: 'touch' },
  { type: 'pointerup', targetName: 'joystick', pointerId: 5, x: 150, y: 295, pointerType: 'touch' },
  { type: 'pointerup', targetName: 'captureBtn', pointerId: 6, x: 625, y: 330, pointerType: 'touch' },
], 'real touch trace preserves exact down/up event semantics');
const activePointers = new Map();
let simultaneousPointerCount = 0;
for (const event of trace.events) {
  if (event.type === 'pointerdown') {
    assert.equal(activePointers.has(event.pointerId), false, 'pointerdown starts a new active pointer');
    activePointers.set(event.pointerId, event.targetName);
    simultaneousPointerCount = Math.max(simultaneousPointerCount, activePointers.size);
  } else {
    assert.equal(event.type, 'pointerup');
    assert.equal(activePointers.get(event.pointerId), event.targetName, 'pointerup closes the matching target/pointer pair');
    activePointers.delete(event.pointerId);
  }
}
assert.equal(simultaneousPointerCount, 2, 'trace demonstrates two concurrent active touch pointers');
assert.equal(activePointers.size, 0, 'trace releases every active pointer');
assert.equal(JSON.stringify(browserEvidenceFixture).includes('screenshot'), false);
assert.equal(JSON.stringify(browserEvidenceFixture).includes('browserRevision'), false);
assert.equal(/[A-Za-z]:[\\/]Users[\\/]/.test(JSON.stringify(browserEvidenceFixture)), false, 'fixture contains no absolute machine paths');

console.log('V9 unified HUD deterministic geometry baseline: PASS (9 viewports; explicit legacy violations)');
