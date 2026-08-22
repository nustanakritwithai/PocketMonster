import { STAGE_BY_ID } from './stage-catalog.mjs';

export const WARP_ROUTES=Object.freeze([
  {id:'hub-to-grass',from:'hub',to:'grass-meadow',label:'Grass Meadow',position:[0,18],spawn:[0,0,16],kind:'forward'},
  {id:'grass-to-hub',from:'grass-meadow',to:'hub',label:'Ranch Hub',position:[0,19],spawn:[0,0,7],kind:'return'},
  {id:'grass-to-ember',from:'grass-meadow',to:'ember-valley',label:'Ember Valley',position:[20,0],spawn:[-19,0,0],kind:'forward'},
  {id:'ember-to-grass',from:'ember-valley',to:'grass-meadow',label:'Grass Meadow',position:[-20,0],spawn:[19,0,0],kind:'return'},
  {id:'ember-to-misty',from:'ember-valley',to:'misty-lake',label:'Misty Lake',position:[20,0],spawn:[-19,0,0],kind:'forward'},
  {id:'misty-to-ember',from:'misty-lake',to:'ember-valley',label:'Ember Valley',position:[-20,0],spawn:[19,0,0],kind:'return'},
  {id:'misty-to-storm',from:'misty-lake',to:'storm-field',label:'Storm Field',position:[0,-18],spawn:[0,0,17],kind:'forward'},
  {id:'storm-to-misty',from:'storm-field',to:'misty-lake',label:'Misty Lake',position:[0,18],spawn:[0,0,-17],kind:'return'},
  {id:'storm-to-frozen',from:'storm-field',to:'frozen-pass',label:'Frozen Pass',position:[20,0],spawn:[-19,0,0],kind:'forward'},
  {id:'frozen-to-storm',from:'frozen-pass',to:'storm-field',label:'Storm Field',position:[-20,0],spawn:[19,0,0],kind:'return'},
  {id:'frozen-to-rocky',from:'frozen-pass',to:'rocky-canyon',label:'Rocky Canyon',position:[20,0],spawn:[-19,0,0],kind:'forward'},
  {id:'rocky-to-frozen',from:'rocky-canyon',to:'frozen-pass',label:'Frozen Pass',position:[-20,0],spawn:[19,0,0],kind:'return'},
  {id:'rocky-to-sky',from:'rocky-canyon',to:'sky-ruins',label:'Sky Ruins',position:[20,0],spawn:[-19,0,0],kind:'forward'},
  {id:'sky-to-rocky',from:'sky-ruins',to:'rocky-canyon',label:'Rocky Canyon',position:[-20,0],spawn:[19,0,0],kind:'return'},
  {id:'sky-to-poison',from:'sky-ruins',to:'poison-marsh',label:'Poison Marsh',position:[0,-18],spawn:[0,0,17],kind:'forward'},
  {id:'poison-to-sky',from:'poison-marsh',to:'sky-ruins',label:'Sky Ruins',position:[0,18],spawn:[0,0,-17],kind:'return'},
  {id:'poison-to-hub',from:'poison-marsh',to:'hub',label:'Ranch Hub',position:[0,-19],spawn:[0,0,-7],kind:'return'},
  {id:'poison-to-dream',from:'poison-marsh',to:'dream-shrine',label:'Dream Shrine',position:[20,0],spawn:[-19,0,0],kind:'forward'},
  {id:'dream-to-poison',from:'dream-shrine',to:'poison-marsh',label:'Poison Marsh',position:[-20,0],spawn:[19,0,0],kind:'return'},
  {id:'dream-to-haunted',from:'dream-shrine',to:'haunted-woods',label:'Haunted Woods',position:[20,0],spawn:[-19,0,0],kind:'forward'},
  {id:'haunted-to-dream',from:'haunted-woods',to:'dream-shrine',label:'Dream Shrine',position:[-20,0],spawn:[19,0,0],kind:'return'},
  {id:'haunted-to-shadow',from:'haunted-woods',to:'shadow-city',label:'Shadow City',position:[20,0],spawn:[-19,0,0],kind:'forward'},
  {id:'shadow-to-haunted',from:'shadow-city',to:'haunted-woods',label:'Haunted Woods',position:[-20,0],spawn:[19,0,0],kind:'return'},
  {id:'shadow-to-steel',from:'shadow-city',to:'steel-factory',label:'Steel Factory',position:[20,0],spawn:[-19,0,0],kind:'forward'},
  {id:'steel-to-shadow',from:'steel-factory',to:'shadow-city',label:'Shadow City',position:[-20,0],spawn:[19,0,0],kind:'return'},
  {id:'steel-to-hub',from:'steel-factory',to:'hub',label:'Ranch Hub',position:[0,-19],spawn:[0,0,-7],kind:'return'},
  {id:'storm-to-hub',from:'storm-field',to:'hub',label:'Ranch Hub',position:[0,-19],spawn:[0,0,-7],kind:'return'},
]);

export function validateWarpRoutes(routes=WARP_ROUTES,{knownZoneIds=['hub',...Object.keys(STAGE_BY_ID)]}={}){
  const issues=[],known=new Set(knownZoneIds),ids=new Set();
  if(!Array.isArray(routes))return Object.freeze({ok:false,issues:Object.freeze([{code:'invalid_route_catalog'}])});
  routes.forEach((route,index)=>{
    if(!route||typeof route!=='object'){
      issues.push(Object.freeze({code:'invalid_route',index}));
      return;
    }
    if(typeof route.id!=='string'||!route.id)issues.push(Object.freeze({code:'invalid_route_id',index}));
    else if(ids.has(route.id))issues.push(Object.freeze({code:'duplicate_route_id',index,id:route.id}));
    else ids.add(route.id);
    if(!known.has(route.from))issues.push(Object.freeze({code:'unknown_route_origin',index,value:route.from??null}));
    if(!known.has(route.to))issues.push(Object.freeze({code:'unknown_route_destination',index,value:route.to??null}));
    if(route.from===route.to)issues.push(Object.freeze({code:'self_route',index,value:route.from??null}));
    if(!['forward','return'].includes(route.kind))issues.push(Object.freeze({code:'invalid_route_kind',index,value:route.kind??null}));
    if(!Array.isArray(route.position)||route.position.length!==2||!route.position.every(Number.isFinite))issues.push(Object.freeze({code:'invalid_route_position',index}));
    if(!Array.isArray(route.spawn)||route.spawn.length!==3||!route.spawn.every(Number.isFinite))issues.push(Object.freeze({code:'invalid_route_spawn',index}));
  });
  routes.forEach((route,index)=>{
    if(!route||route.to==='hub'||!known.has(route.from)||!known.has(route.to))return;
    if(!routes.some(candidate=>candidate?.from===route.to&&candidate?.to===route.from)){
      issues.push(Object.freeze({code:'missing_reverse_route',index,id:route.id??null}));
    }
  });
  return Object.freeze({ok:issues.length===0,issues:Object.freeze(issues)});
}

export function routesFrom(stageId){return WARP_ROUTES.filter(route=>route.from===stageId);}

export function routeById(routeId){return WARP_ROUTES.find(route=>route.id===routeId)||null;}

export function warpAvailability(progress,route,stageUnlockReason){
  if(!route)return {ok:false,reason:'unknown-route'};
  if(route.to==='hub')return {ok:true,reason:'hub-safe-zone'};
  const result=stageUnlockReason(progress,route.to);
  return result.ok?{ok:true,reason:'unlocked'}:{ok:false,reason:result.reason,requires:result.requires};
}

export function nearestRoute(routes,position,radius=3){
  let nearest=null,distance=Infinity;
  for(const route of routes){
    const dx=position.x-route.position[0],dz=position.z-route.position[1],distanceNow=Math.hypot(dx,dz);
    if(distanceNow<=radius&&distanceNow<distance){nearest=route;distance=distanceNow;}
  }
  return nearest?{route:nearest,distance}:{route:null,distance:Infinity};
}
