import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeCss as css, activeHtml as html, activeJs as js } from './active-assets.mjs';

assert.equal(html,fs.readFileSync(new URL('../v900.html',import.meta.url),'utf8'),'active V9 HTML parity remains exact');
assert.match(html,/id="stageObjective"/,'Stage objective / quest tracker HUD exists');
assert.match(html,/id="stageObjectiveStep"/,'Objective step label exists');
assert.match(html,/id="stageObjectiveList"/,'Quest tracker lists stage steps');
assert.match(css,/\.starter-journey/,'Starter Journey has compact mobile styling');
assert.match(css,/\.starter-journey,\.quest-tracker\{[^}]*left:var\(--safe-left\)/,'Quest tracker stays on the left rail');
assert.match(js,/starterJourney:\{version:1,grassMeadow:/,'Starter Journey is persisted in state');
assert.match(js,/function markStarterJourney\(/,'Starter Journey progress handler exists');
assert.match(js,/markStarterJourney\('battled'\)/,'Battle advances Starter Journey');
assert.match(js,/markStarterJourney\('recalled'\)/,'Recall advances Starter Journey');
assert.match(js,/markStarterJourney\('captured'\)/,'Capture advances Starter Journey');
assert.match(js,/state\.starterJourney=clean\.starterJourney\|\|starterJourneyDefaults\(\)/,'Legacy saves receive Starter Journey defaults');
console.log('V8.3 Grass Meadow Starter Journey: PASS');
