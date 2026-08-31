import assert from 'node:assert/strict';
import fs from 'node:fs';

const game = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../v900.html', import.meta.url), 'utf8');
const liveHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const style = fs.readFileSync(new URL('../style-v900.css', import.meta.url), 'utf8');

assert.doesNotMatch(
  game,
  /mobileDualPointerInput/,
  'scene lifecycle must not reference the removed local pointer controller',
);
assert.match(
  game,
  /window\.POCKETMONSTER_UNIFIED_MOBILE_CONTROLS\?\.reset\?\.\(reason\);[\s\S]*for\(const code of Object\.keys\(keys\)\)keys\[code\]=false;/,
  'scene lifecycle resets the shared controller before clearing keyboard input state',
);
assert.doesNotMatch(game, /\b(?:joyEnd|endCam)\s*\(/, 'scene lifecycle must not call removed legacy pointer helpers');

assert.equal(liveHtml, html, 'index.html and v900.html must remain byte-identical');
for (const id of ['stageObjective', 'stageObjectiveClose', 'stageObjectiveToggle']) {
  assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} must exist exactly once`);
}
assert.match(game, /let stageObjectiveDismissed=false;/);
assert.match(game, /function syncStageObjectiveVisibility\(\)[\s\S]*panel\?\.classList\.toggle\('hidden',stageObjectiveDismissed\);[\s\S]*toggle\?\.classList\.toggle\('hidden',!stageObjectiveDismissed\);/);
assert.match(game, /\[\['stageObjectiveClose',true\],\['stageObjectiveToggle',false\]\][\s\S]*addEventListener\('pointerdown'/);
assert.match(style, /\.quest-tracker\{pointer-events:auto!important/);
assert.match(style, /\.quest-tracker-close\{[^}]*pointer-events:auto;[^}]*touch-action:none/);
assert.match(style, /body\[data-control-panel="human"\] #stageObjectiveToggle,/);

console.log('V9 quest close and scene pointer hotfix: PASS');
