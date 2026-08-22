function hasProgressRecord(bucket,key){
  return Boolean(bucket&&typeof bucket==='object'&&bucket[key]);
}

export function resolveStageObjective({zoneId,zone,stageProgress,starterJourney,eliteProgress,bossProgress}={}){
  const stageId=zone?.stageId||zoneId;
  const speciesId=zone?.progressionBossSpeciesId||null;
  if(!stageId||!speciesId)return {phase:'free-explore',encounter:null,speciesId:null,complete:false};
  if(Array.isArray(stageProgress?.cleared)&&stageProgress.cleared.includes(stageId)){
    return {phase:'stage-cleared',encounter:null,speciesId:null,complete:true};
  }
  if(stageId==='grass-meadow'&&!starterJourney?.grassMeadow?.captured){
    return {phase:'capture-starter',encounter:null,speciesId:null,complete:false};
  }
  const key=`${stageId}:${speciesId}`;
  if(!hasProgressRecord(eliteProgress?.defeated,key)){
    return {phase:'defeat-elite',encounter:'elite',speciesId,complete:false};
  }
  if(!hasProgressRecord(bossProgress?.defeated,key)){
    return {phase:'defeat-boss',encounter:'boss',speciesId,complete:false};
  }
  return {phase:'stage-clear-pending',encounter:null,speciesId:null,complete:false};
}
