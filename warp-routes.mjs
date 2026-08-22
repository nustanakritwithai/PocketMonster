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
  {id:'storm-to-hub',from:'storm-field',to:'hub',label:'Ranch Hub',position:[0,-19],spawn:[0,0,-7],kind:'return'},
]);

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
