const ACTION_SELECTORS = [
  '#skill1Btn',
  '#skill2Btn',
  '#skill3Btn',
  '#skill4Btn',
  '#captureBtn',
  '#summonBtn',
  '#recallBtn',
];

export const SHORT_HEIGHT_VIEWPORTS = Object.freeze([
  Object.freeze({ width: 740, height: 280 }),
  Object.freeze({ width: 740, height: 300 }),
  Object.freeze({ width: 844, height: 300 }),
  Object.freeze({ width: 740, height: 360 }),
  Object.freeze({ width: 844, height: 390 }),
  Object.freeze({ width: 915, height: 412 }),
  Object.freeze({ width: 1280, height: 720 }),
]);

function finiteRect(rect) {
  return ['left', 'top', 'right', 'bottom', 'width', 'height'].every(key => Number.isFinite(rect?.[key]));
}

export function intersectionArea(a, b) {
  if (!finiteRect(a) || !finiteRect(b)) return Number.POSITIVE_INFINITY;
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}

function snapshotElement(doc, selector) {
  const element = doc.querySelector(selector);
  if (!element) throw new Error(`UX1.1 missing required element: ${selector}`);
  const style = doc.defaultView.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return Object.freeze({
    selector,
    visible: style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0,
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  });
}

function positiveIntersections(source, targets) {
  return targets
    .map(target => Object.freeze({ pair: `${source.selector}×${target.selector}`, area: intersectionArea(source, target) }))
    .filter(result => result.area > 0);
}

export function measureShortHeightLayout(doc = globalThis.document, win = globalThis.window) {
  if (!doc || !win) throw new Error('UX1.1 browser document/window are required');
  const target = snapshotElement(doc, '#targetCard');
  const party = snapshotElement(doc, '#party');
  const reason = snapshotElement(doc, '#actionReason');
  const topbar = snapshotElement(doc, '#hud .topbar');
  const hunt = snapshotElement(doc, '#huntBtn');
  const actions = ACTION_SELECTORS.map(selector => snapshotElement(doc, selector));
  const skills = actions.slice(0, 4);
  const targetSkillIntersections = positiveIntersections(target, skills);
  const targetActionIntersections = positiveIntersections(target, actions);
  const partyActionIntersections = positiveIntersections(party, actions);
  const reasonPartyArea = intersectionArea(reason, party);
  const topbarTargetArea = intersectionArea(topbar, target);
  const huntTargetArea = intersectionArea(hunt, target);
  const actionMinimums = actions.map(action => Object.freeze({ selector: action.selector, width: action.width, height: action.height }));
  const visualViewport = win.visualViewport;
  const overflowX = Math.max(0, doc.documentElement.scrollWidth - win.innerWidth);
  const overflowY = Math.max(0, doc.documentElement.scrollHeight - win.innerHeight);
  const violations = [];
  if (!target.visible || !party.visible || !reason.visible || actions.some(action => !action.visible)) violations.push('required-control-hidden');
  if (targetSkillIntersections.length) violations.push('target-skill-overlap');
  if (targetActionIntersections.length) violations.push('target-action-overlap');
  if (partyActionIntersections.length) violations.push('party-action-overlap');
  if (reasonPartyArea > 0) violations.push('reason-party-overlap');
  if (topbarTargetArea > 0) violations.push('topbar-target-overlap');
  if (huntTargetArea > 0) violations.push('hunt-target-overlap');
  if (actionMinimums.some(action => action.width < 48 || action.height < 48)) violations.push('action-under-48px');
  if (overflowX > 1 || overflowY > 1) violations.push('document-overflow');
  return Object.freeze({
    viewport: Object.freeze({
      innerWidth: win.innerWidth,
      innerHeight: win.innerHeight,
      visualWidth: visualViewport?.width ?? win.innerWidth,
      visualHeight: visualViewport?.height ?? win.innerHeight,
      dpr: win.devicePixelRatio,
      fullscreen: Boolean(doc.fullscreenElement),
    }),
    rects: Object.freeze({ target, party, reason, topbar, hunt, actions: Object.freeze(actions) }),
    targetSkillIntersections: Object.freeze(targetSkillIntersections),
    targetActionIntersections: Object.freeze(targetActionIntersections),
    partyActionIntersections: Object.freeze(partyActionIntersections),
    reasonPartyArea,
    topbarTargetArea,
    huntTargetArea,
    actionMinimums: Object.freeze(actionMinimums),
    overflow: Object.freeze({ x: overflowX, y: overflowY }),
    violations: Object.freeze(violations),
  });
}

export function assertShortHeightLayout(measurement) {
  if (!measurement || !Array.isArray(measurement.violations)) throw new TypeError('UX1.1 geometry measurement is required');
  if (measurement.violations.length) {
    throw new Error(`UX1.1 geometry violations: ${measurement.violations.join(', ')}\n${JSON.stringify(measurement, null, 2)}`);
  }
  return measurement;
}

if (typeof process !== 'undefined' && process.versions?.node) {
  const assert = (await import('node:assert/strict')).default;
  assert.equal(intersectionArea(
    { left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 },
    { left: 10, top: 0, right: 20, bottom: 10, width: 10, height: 10 },
  ), 0, 'touching edges are not an overlap');
  assert.equal(intersectionArea(
    { left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 },
    { left: 6, top: 5, right: 16, bottom: 15, width: 10, height: 10 },
  ), 20, 'intersection area must be deterministic');
  assert.throws(() => assertShortHeightLayout({ violations: ['target-skill-overlap'] }), /target-skill-overlap/);
  assert.equal(assertShortHeightLayout({ violations: [] }).violations.length, 0);
  assert.equal(SHORT_HEIGHT_VIEWPORTS.length, 7);
  console.log('P0 UX1.1 short-height browser geometry harness: PASS');
}
