import assert from 'node:assert/strict';
import fs from 'node:fs';

const game = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const routes = fs.readFileSync(new URL('../warp-routes.mjs', import.meta.url), 'utf8');

function assertWalkThroughWarpContract(candidateGame, candidateRoutes) {
  assert.match(candidateRoutes, /id:'grassland-to-hub',from:'grassland',to:'hub'/);
  assert.match(candidateRoutes, /knownZoneIds=\['hub','grassland',\.\.\.Object\.keys\(STAGE_BY_ID\)\]/);
  const beacon = candidateGame.match(/function makeWarpBeacon\(route\)\{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(beacon, /TorusGeometry\(\.82,\.07,8,28\)/);
  assert.match(beacon, /boxGeometry\(\.18,1\.8,\.18\)/);
  assert.match(candidateGame, /function updateWalkThroughWarp\(dt\)/);
  assert.match(candidateGame, /nearbyWarp=found;\s*startWarp\(found\)/);
  assert.doesNotMatch(candidateGame, /warpPromptAction|warpPromptCancel|renderWarpPrompt\(|huntBtn/);
}

assertWalkThroughWarpContract(game, routes);

const mutants = [
  ['remove legacy escape route', game, routes.replace(/\n  \{id:'grassland-to-hub'[^\n]+/, '')],
  ['remove legacy zone validation', game, routes.replace("['hub','grassland',...Object.keys(STAGE_BY_ID)]", "['hub',...Object.keys(STAGE_BY_ID)]")],
  ['shrink portal back to invisible marker', game.replace('TorusGeometry(.82,.07,8,28)', 'TorusGeometry(.34,.025,6,20)'), routes],
  ['remove vertical light beam', game.replace('boxGeometry(.18,1.8,.18)', 'boxGeometry(.18,.18,.18)'), routes],
  ['stop walk-through activation', game.replace(/nearbyWarp=found;\r?\n  startWarp\(found\);/, 'nearbyWarp=found;'), routes],
  ['restore clickable prompt', game + '\nwarpPromptAction;\nhuntBtn;', routes],
];

for (const [name, mutantGame, mutantRoutes] of mutants) {
  assert.throws(
    () => assertWalkThroughWarpContract(mutantGame, mutantRoutes),
    undefined,
    `${name} must be killed`,
  );
}

console.log(`V8 walk-through warp mutants: PASS (${mutants.length}/${mutants.length} killed)`);
