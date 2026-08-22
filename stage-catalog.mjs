export const STAGE_TYPES=Object.freeze([
  'Grass','Bug','Fire','Water','Electric','Ice','Rock','Ground','Flying','Poison',
  'Psychic','Ghost','Dark','Steel','Dragon','Fairy','Fighting','Normal',
]);

const stage=(id,displayName,biomeId,primaryTypes,secondaryTypes,recommendedLevel,unlockRule,status='planned')=>({
  id,displayName,biomeId,primaryTypes,secondaryTypes,recommendedLevel,unlockRule,
  encounterTableId:`encounter-${id}-v1`,eliteEncounterId:`elite-${id}-v1`,bossEncounterId:`boss-${id}-v1`,
  environmentProfileId:`environment-${biomeId}-v1`,rewardProfileId:`stage-${id}-v1`,
  clearConditions:[{type:'defeatBoss'}],capturePolicy:'normal-wild-only',mapLayoutId:`map-${id}-v1`,version:1,status,
});

export const STAGE_CATALOG=Object.freeze([
  stage('grass-meadow','Grass Meadow','grass-meadow',['Grass'],['Bug','Normal'],{min:1,max:5},{type:'hub'},'active'),
  stage('ember-valley','Ember Valley','volcanic-valley',['Fire'],['Rock','Ground'],{min:4,max:7},{type:'clearStage',stageId:'grass-meadow'}),
  stage('misty-lake','Misty Lake','misty-lake',['Water'],['Grass','Flying'],{min:5,max:8},{type:'clearStage',stageId:'ember-valley'}),
  stage('storm-field','Storm Field','storm-field',['Electric'],['Flying','Steel'],{min:6,max:10},{type:'clearStage',stageId:'misty-lake'}),
  stage('frozen-pass','Frozen Pass','frozen-pass',['Ice'],['Flying','Water'],{min:10,max:14},{type:'clearSet',setId:'set-1'}),
  stage('rocky-canyon','Rocky Canyon','rocky-canyon',['Rock'],['Ground','Fighting'],{min:12,max:16},{type:'clearStage',stageId:'frozen-pass'}),
  stage('sky-ruins','Sky Ruins','sky-ruins',['Flying'],['Electric','Psychic'],{min:14,max:18},{type:'clearStage',stageId:'rocky-canyon'}),
  stage('poison-marsh','Poison Marsh','poison-marsh',['Poison'],['Grass','Bug'],{min:16,max:20},{type:'clearStage',stageId:'sky-ruins'}),
  stage('dream-shrine','Dream Shrine','dream-shrine',['Psychic'],['Fairy','Normal'],{min:20,max:24},{type:'clearSet',setId:'set-2'}),
  stage('haunted-woods','Haunted Woods','haunted-woods',['Ghost'],['Dark','Poison'],{min:22,max:26},{type:'clearStage',stageId:'dream-shrine'}),
  stage('shadow-city','Shadow City','shadow-city',['Dark'],['Poison','Fighting'],{min:24,max:28},{type:'clearStage',stageId:'haunted-woods'}),
  stage('steel-factory','Steel Factory','steel-factory',['Steel'],['Electric','Rock'],{min:26,max:30},{type:'clearStage',stageId:'shadow-city'}),
  stage('dragon-crater','Dragon Crater','dragon-crater',['Dragon'],['Fire','Rock'],{min:30,max:35},{type:'clearSet',setId:'set-3'}),
  stage('fairy-garden','Fairy Garden','fairy-garden',['Fairy'],['Grass','Psychic'],{min:32,max:36},{type:'clearStage',stageId:'dragon-crater'}),
  stage('combat-colosseum','Combat Colosseum','combat-colosseum',['Fighting'],['Normal','Steel'],{min:34,max:38},{type:'clearStage',stageId:'fairy-garden'}),
  stage('normal-wildlands','Normal Wildlands','normal-wildlands',['Normal'],STAGE_TYPES.filter(type=>type!=='Normal'),{min:38,max:42},{type:'clearStage',stageId:'combat-colosseum'}),
]);

export const STAGE_BY_ID=Object.freeze(Object.fromEntries(STAGE_CATALOG.map(definition=>[definition.id,definition])));

export function createStageProgress(){
  return {version:1,unlocked:['grass-meadow'],cleared:[],bossClears:{},eliteClears:{},firstClearRewards:{},bestTimes:{},elementDiscovery:{}};
}

export function normalizeStageProgress(progress){
  const defaults=createStageProgress();
  if(!progress||typeof progress!=='object')return defaults;
  return {
    version:1,
    unlocked:Array.from(new Set(['grass-meadow',...(Array.isArray(progress.unlocked)?progress.unlocked:[])])).filter(id=>STAGE_BY_ID[id]),
    cleared:Array.from(new Set(Array.isArray(progress.cleared)?progress.cleared:[])).filter(id=>STAGE_BY_ID[id]),
    bossClears:{...(progress.bossClears||{})},eliteClears:{...(progress.eliteClears||{})},
    firstClearRewards:{...(progress.firstClearRewards||{})},bestTimes:{...(progress.bestTimes||{})},elementDiscovery:{...(progress.elementDiscovery||{})},
  };
}

export function stageUnlockReason(progress,stageId){
  const definition=STAGE_BY_ID[stageId];
  if(!definition)return {ok:false,reason:'unknown-stage'};
  const current=normalizeStageProgress(progress);
  if(current.unlocked.includes(stageId))return {ok:true,reason:'unlocked'};
  const rule=definition.unlockRule||{};
  if(rule.type==='hub')return {ok:true,reason:'hub'};
  if(rule.type==='clearStage')return {ok:current.cleared.includes(rule.stageId),reason:current.cleared.includes(rule.stageId)?'prerequisite-cleared':'requires-stage-clear',requires:rule.stageId};
  if(rule.type==='clearSet')return {ok:false,reason:'requires-set-clear',requires:rule.setId};
  return {ok:false,reason:'locked'};
}

export function recordStageClear(progress,stageId,{bestTime=null}={}){
  const next=normalizeStageProgress(progress),definition=STAGE_BY_ID[stageId];
  if(!definition)return next;
  if(!next.cleared.includes(stageId))next.cleared.push(stageId);
  if(Number.isFinite(bestTime)&&(!Number.isFinite(next.bestTimes[stageId])||bestTime<next.bestTimes[stageId]))next.bestTimes[stageId]=bestTime;
  const nextStage=STAGE_CATALOG.find(candidate=>candidate.unlockRule?.type==='clearStage'&&candidate.unlockRule.stageId===stageId);
  if(nextStage&&!next.unlocked.includes(nextStage.id))next.unlocked.push(nextStage.id);
  return next;
}
