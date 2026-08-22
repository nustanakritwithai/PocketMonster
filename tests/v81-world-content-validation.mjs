import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateZoneEncounterConfig } from '../stage-catalog.mjs';
import { WARP_ROUTES, validateWarpRoutes } from '../warp-routes.mjs';

assert.equal(validateWarpRoutes().ok,true,'all live warp destinations and coordinate records are valid');

const zones={
  hub:{spawn:[],bounds:{minX:-10,maxX:10,minZ:-10,maxZ:10}},
  'grass-meadow':{
    stageId:'grass-meadow',
    bounds:{minX:-22,maxX:22,minZ:-20,maxZ:20},
    spawn:[['mossbun',0,0,1,{}]],
    rareSpawn:[['mossbun',1,1,2,{rare:true}]],
    eliteSpawn:[['mossbun',2,2,3,{elite:true}]],
    bossSpawn:[['mossbun',3,3,5,{boss:true}]],
    progressionBossSpeciesId:'mossbun',
  },
};
assert.equal(validateZoneEncounterConfig(zones).ok,true,'valid stage species/variant/policy/placement passes');

const unknownSpecies=structuredClone(zones);
unknownSpecies['grass-meadow'].spawn[0][0]='missing';
assert.ok(validateZoneEncounterConfig(unknownSpecies).issues.some(issue=>issue.code==='unknown_species'));

const bossPolicyBypass=structuredClone(zones);
bossPolicyBypass['grass-meadow'].bossSpawn[0][4].capturePolicy='normal';
assert.ok(validateZoneEncounterConfig(bossPolicyBypass).issues.some(issue=>issue.code==='capture_policy_mismatch'));

const badVariant=structuredClone(zones);
badVariant['grass-meadow'].eliteSpawn[0][4]={rare:true};
assert.ok(validateZoneEncounterConfig(badVariant).issues.some(issue=>issue.code==='variant_mismatch'));

const outOfBounds=structuredClone(zones);
outOfBounds['grass-meadow'].spawn[0][1]=99;
assert.ok(validateZoneEncounterConfig(outOfBounds).issues.some(issue=>issue.code==='spawn_out_of_bounds'));

const invalidOptions=structuredClone(zones);
invalidOptions['grass-meadow'].spawn[0][4]=null;
assert.ok(validateZoneEncounterConfig(invalidOptions).issues.some(issue=>issue.code==='invalid_spawn_options'));

const badDestination=WARP_ROUTES.map(route=>({...route,position:[...route.position],spawn:[...route.spawn]}));
badDestination[0].to='missing-stage';
assert.ok(validateWarpRoutes(badDestination).issues.some(issue=>issue.code==='unknown_route_destination'));

const duplicateRoute=WARP_ROUTES.map(route=>({...route,position:[...route.position],spawn:[...route.spawn]}));
duplicateRoute[1].id=duplicateRoute[0].id;
assert.ok(validateWarpRoutes(duplicateRoute).issues.some(issue=>issue.code==='duplicate_route_id'));

const game=fs.readFileSync(new URL('../game-v800.js',import.meta.url),'utf8');
const zonesStart=game.indexOf('const ZONES=')+'const ZONES='.length;
const zonesEnd=game.indexOf('\n};\nconst zoneContentValidation',zonesStart)+2;
assert.ok(zonesStart>='const ZONES='.length&&zonesEnd>zonesStart,'live ZONES literal is extractable for validation');
const liveZones=Function('BALANCE',`"use strict";return (${game.slice(zonesStart,zonesEnd)});`)({
  grassMeadowRare:{level:2,chance:.24},
  grassMeadowBoss:{level:5},
});
const liveValidation=validateZoneEncounterConfig(liveZones);
assert.equal(liveValidation.ok,true,JSON.stringify(liveValidation.issues));
assert.match(game,/const zoneContentValidation=validateZoneEncounterConfig\(ZONES\)/,'live boot validates actual zone encounter data');
assert.match(game,/const warpContentValidation=validateWarpRoutes\(\)/,'live boot validates actual warp data');
assert.match(game,/throw new Error\(`World content validation failed:/,'invalid world content fails closed');

console.log('V8.1 spawn/warp content validation: PASS');
