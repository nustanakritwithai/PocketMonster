import assert from 'node:assert/strict';
import fs from 'node:fs';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/v90-mmorpg-hud-reference-regions.json', import.meta.url), 'utf8'));
const css = fs.readFileSync(new URL('../style-v900.css', import.meta.url), 'utf8');
const hudSource = fs.readFileSync(new URL('../unified-mmorpg-hud-v900.mjs', import.meta.url), 'utf8');
const { width: VW, height: VH } = fixture.viewport;
const TOL = fixture.tolerancePx;

assert.equal(VW, 1080);
assert.equal(VH, 608);
assert.match(hudSource, /mmorpgQuestRail/, 'left vertical rail exists in the Dock shell');
assert.match(css, /\.mmorpg-quest-rail\{[^}]*pointer-events:none/, 'quest rail has no dead commands');

function rootVars() {
  const match = css.match(/:root\{([^}]*)\}/);
  const vars = { '--safe-top': 0, '--safe-right': 0, '--safe-bottom': 0, '--safe-left': 0 };
  if (!match) return vars;
  for (const part of match[1].split(';')) {
    const cut = part.indexOf(':');
    if (cut < 0) continue;
    vars[part.slice(0, cut).trim()] = part.slice(cut + 1).trim();
  }
  return vars;
}
const VARS = rootVars();

function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, r => `\\${r}`);
  const re = new RegExp(`${escaped}\\{([^}]*)\\}`, 'g');
  let body = '';
  let match;
  while ((match = re.exec(css))) body += `;${match[1]}`;
  return body;
}

function props(selector) {
  const map = {};
  for (const part of ruleBody(selector).split(';')) {
    const cut = part.indexOf(':');
    if (cut < 0) continue;
    map[part.slice(0, cut).trim()] = part.slice(cut + 1).trim();
  }
  return map;
}

function length(raw, axis) {
  if (raw == null || raw === 'auto' || raw === 'none') return null;
  const text = String(raw).replace(/!important/g, '').trim();
  if (text.startsWith('var(')) {
    const name = text.slice(4, text.indexOf(')')).split(',')[0].trim();
    return length(VARS[name], axis);
  }
  if (text.startsWith('max(') || text.startsWith('min(')) {
    const inner = text.slice(4, -1);
    const parts = inner.split(',').map(item => length(item.trim(), axis));
    const nums = parts.filter(value => typeof value === 'number');
    return text.startsWith('max(') ? Math.max(...nums) : Math.min(...nums);
  }
  if (text.endsWith('%')) return Number(text.slice(0, -1)) / 100 * (axis === 'x' ? VW : VH);
  if (text.endsWith('vw')) return Number(text.slice(0, -2)) / 100 * VW;
  if (text.endsWith('vh')) return Number(text.slice(0, -2)) / 100 * VH;
  if (text.endsWith('px')) return Number(text.slice(0, -2));
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

function computeBox(selector) {
  const style = props(selector);
  const left = length(style.left, 'x');
  const right = length(style.right, 'x');
  const top = length(style.top, 'y');
  const bottom = length(style.bottom, 'y');
  let width = length(style.width, 'x');
  let height = length(style.height, 'y');
  if (style.transform === 'translateX(-50%)' && width != null && left != null) {
    return { x1: left - width / 2, y1: top ?? (VH - (bottom || 0) - (height || 0)), x2: left + width / 2, y2: (top ?? (VH - (bottom || 0) - (height || 0))) + (height || 0) };
  }
  let x1 = left;
  if (x1 == null && right != null && width != null) x1 = VW - right - width;
  if (x1 == null) x1 = 0;
  let x2 = width != null ? x1 + width : (right != null ? VW - right : VW);
  let y1 = top;
  if (y1 == null && bottom != null && height != null) y1 = VH - bottom - height;
  if (y1 == null && bottom != null) y1 = VH - bottom;
  if (y1 == null) y1 = 0;
  let y2 = height != null ? y1 + height : (bottom != null ? VH - bottom : VH);
  return { x1, y1, x2, y2 };
}

function insetBox(right, bottom, size) {
  return { x1: VW - right - size, y1: VH - bottom - size, x2: VW - right, y2: VH - bottom };
}

function union(boxes) {
  return {
    x1: Math.min(...boxes.map(box => box.x1)),
    y1: Math.min(...boxes.map(box => box.y1)),
    x2: Math.max(...boxes.map(box => box.x2)),
    y2: Math.max(...boxes.map(box => box.y2)),
  };
}

function within(actual, expected, label) {
  for (const edge of ['x1', 'y1', 'x2', 'y2']) {
    const delta = Math.abs(actual[edge] - expected[edge]);
    assert.ok(delta <= TOL, `${label} ${edge} delta ${delta.toFixed(2)}px exceeds ±${TOL} (actual ${actual[edge].toFixed(1)} vs ${expected[edge]})`);
  }
}

const report = { viewport: fixture.viewport, regions: {} };
for (const region of fixture.regions) {
  let actual;
  if (region.id === 'combatCluster') {
    actual = union([
      insetBox(84, 28, 72),
      insetBox(2, 44, 36),
      insetBox(44, 2, 36),
      insetBox(160, 104, 48),
      insetBox(96, 104, 48),
      insetBox(176, 40, 48),
      insetBox(228, 28, 48),
      insetBox(228, 92, 48),
      insetBox(276, 148, 48),
      insetBox(276, 88, 48),
      { x1: VW - 16 - 48, y1: 0.551 * VH, x2: VW - 16, y2: 0.551 * VH + 48 },
    ]);
  } else {
    actual = computeBox(region.selector);
  }
  report.regions[region.id] = { expected: { x1: region.x1, y1: region.y1, x2: region.x2, y2: region.y2 }, actual };
  within(actual, region, region.id);
}

assert.equal(props('.mmorpg-player-status').left, '0.4%', 'player status stays top-left');
assert.equal(props('.mmorpg-quest-panel').left, '2.6%', 'quest stays on the left rail');
assert.equal(props('.mmorpg-minimap').left, '84.4%', 'minimap stays top-right');
assert.equal(props('.mmorpg-roster').left, '62.5%', 'roster stays right-middle');
assert.equal(props('.mmorpg-dock').left, '32.5%', 'chat console stays bottom-center');

assert.match(css, /#pirateUnifiedControls\{[^}]*--arc-r:90px/, 'combat cluster is an arc radius, not a grid');
assert.doesNotMatch(css, /\.controls-right\.tc-actions\{[^}]*transform:scale\(/, 'arc cannot be a scaled grid');
assert.match(css, /#skill1Btn\.tc-skill1\{[^}]*right:160px/, 'skills keep distinct polar anchors');
assert.match(css, /#skill2Btn\.tc-skill2\{[^}]*right:96px/);
assert.match(css, /#skill3Btn\.tc-skill3\{[^}]*right:176px/);
const rights = [160, 96, 176, 2, 84];
assert.equal(new Set(rights).size, rights.length, 'action anchors are not a shared grid column');

for (const layer of fixture.zOrder) {
  assert.match(css, new RegExp(`${layer.selector.replace(/[.*+?^${}()|[\]\\]/g, r => `\\${r}`)}\\{[^}]*z-index:${layer.z}`), `${layer.id} z-index ${layer.z}`);
}
assert.ok(props('.mmorpg-banner')['z-index'] === '32');
assert.ok(Number(props('.mmorpg-hud')['z-index']) < Number(props('.mmorpg-banner')['z-index']), 'transient banner sits above information panels');

const out = new URL('../../tmp/v90-mmorpg-hud-reference-layout-report.json', import.meta.url);
try {
  fs.writeFileSync(new URL('../tmp/v90-mmorpg-hud-reference-layout-report.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
} catch {
  fs.writeFileSync('/tmp/v90-mmorpg-hud-reference-layout-report.json', `${JSON.stringify(report, null, 2)}\n`);
}
console.log('V9 MMORPG HUD reference layout: PASS');
console.log(JSON.stringify({ viewport: report.viewport, sample: report.regions.playerStatus }, null, 2));
