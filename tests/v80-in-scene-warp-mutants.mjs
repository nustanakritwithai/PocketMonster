import assert from 'node:assert/strict';
import fs from 'node:fs';

const game=fs.readFileSync(new URL('../game-v800.js',import.meta.url),'utf8');
const routes=fs.readFileSync(new URL('../warp-routes.mjs',import.meta.url),'utf8');

function assertWarpEscapeContract(candidateGame,candidateRoutes){
  assert.match(candidateRoutes,/id:'grassland-to-hub',from:'grassland',to:'hub'/);
  assert.match(candidateRoutes,/knownZoneIds=\['hub','grassland',\.\.\.Object\.keys\(STAGE_BY_ID\)\]/);
  const beacon=candidateGame.match(/function makeWarpBeacon\(route\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(beacon,/TorusGeometry\(\.82,\.07,8,28\)/);
  assert.match(beacon,/boxGeometry\(\.18,1\.8,\.18\)/);
  assert.doesNotMatch(candidateGame,/el\('huntBtn'\)|hunt\.textContent=/);
  assert.doesNotMatch(candidateGame,/switchZone\(state\.currentZone==='hub'\?'grassland':'hub'\)/);
  assert.match(candidateGame,/เดินไปที่ประตูวาปสีทองเพื่อไปจับมอน/);
  assert.match(candidateRoutes,/function nextWarpPromptState\(/);
  assert.match(candidateGame,/nextWarpPromptState\(/);
  assert.match(candidateGame,/dismissedWarpId=nearbyWarp\?\.id/);
  assert.doesNotMatch(candidateGame,/warpPromptCancel[\s\S]{0,120}warpPromptCooldown=\.35/);
}

assertWarpEscapeContract(game,routes);

const mutants=[
  ['remove legacy escape route',game,routes.replace(/\n  \{id:'grassland-to-hub'[^\n]+/,'')],
  ['remove legacy zone validation',game,routes.replace("['hub','grassland',...Object.keys(STAGE_BY_ID)]","['hub',...Object.keys(STAGE_BY_ID)]")],
  ['shrink portal back to invisible marker',game.replace('TorusGeometry(.82,.07,8,28)','TorusGeometry(.34,.025,6,20)'),routes],
  ['remove vertical light beam',game.replace('boxGeometry(.18,1.8,.18)','boxGeometry(.18,.18,.18)'),routes],
  ['restore route-less Hunt shortcut',game.replace("Ranch เป็น Safe Zone • เดินไปที่ประตูวาปสีทองเพื่อไปจับมอน","Ranch เป็น Safe Zone • กด “ออกล่า” เพื่อไปจับมอน")+ "\nel('huntBtn').onclick=()=>switchZone(state.currentZone==='hub'?'grassland':'hub');",routes],
  ['restore HUD hunt shortcut',game.replace('function renderZoneUI(){','function renderZoneUI(){const hunt=el(\'huntBtn\');if(hunt)hunt.textContent=\'ประตูวาป → Grass Meadow\';'),routes],
  ['drop dismiss-until-leave helper',game,routes.replace('function nextWarpPromptState','function unusedWarpPromptState')],
  ['stop using dismiss-until-leave in the live loop',game.replace('nextWarpPromptState({foundId:found?.id||null,dismissedId:dismissedWarpId})','({nearbyId:found?.id||null,dismissedId:null,open:!!found})'),routes],
  ['restore short cancel cooldown',game.replace('dismissedWarpId=nearbyWarp?.id||null;closeWarpPrompt();','closeWarpPrompt();warpPromptCooldown=.35;'),routes],
];

for(const [name,mutantGame,mutantRoutes] of mutants){
  assert.throws(()=>assertWarpEscapeContract(mutantGame,mutantRoutes),undefined,`${name} must be killed`);
}

console.log(`V8 In-scene Warp mutants: PASS (${mutants.length}/${mutants.length} killed)`);
