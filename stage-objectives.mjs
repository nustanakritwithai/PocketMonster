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
  if(hasProgressRecord(bossProgress?.defeated,key)){
    return {phase:'stage-clear-pending',encounter:null,speciesId:null,complete:false};
  }
  if(!hasProgressRecord(eliteProgress?.defeated,key)){
    return {phase:'defeat-elite',encounter:'elite',speciesId,complete:false};
  }
  return {phase:'defeat-boss',encounter:'boss',speciesId,complete:false};
}

export function requiresStageClearReconciliation(objective){
  return objective?.phase==='stage-clear-pending';
}

export function runStageClearReconciliation({objective,stageId,completeStageClear}={}){
  if(!requiresStageClearReconciliation(objective)||!stageId||typeof completeStageClear!=='function')return false;
  completeStageClear(stageId);
  return true;
}

export function stageObjectiveTracker(objective,{stageId,stageName='',monsterName=''}={}){
  const phase=objective?.phase||'free-explore';
  const name=monsterName||'มอนด่าน';
  const grass=stageId==='grass-meadow';
  const raw=phase==='free-explore'?[]:grass?[
    {id:'capture-starter',mark:'1/3',label:'จับมอนสเตอร์ 1 ตัว • Recall คู่หูก่อนใช้ Capture Ball'},
    {id:'defeat-elite',mark:'2/3',label:`ปราบ ELITE ${name} ที่ปรากฏในด่าน`},
    {id:'defeat-boss',mark:'3/3',label:`ปราบ BOSS ${name} เพื่อเปิดจุดวาปด่านถัดไป`},
  ]:[
    {id:'defeat-elite',mark:'1/2',label:`ปราบ ELITE ${name} ที่ปรากฏในด่าน`},
    {id:'defeat-boss',mark:'2/2',label:`ปราบ BOSS ${name} เพื่อเปิดจุดวาปด่านถัดไป`},
  ];
  const current=raw.findIndex(step=>step.id===phase);
  const finished=phase==='stage-cleared'||phase==='stage-clear-pending';
  return Object.freeze({
    title:stageName||'เควส',
    status:phase==='stage-clear-pending'?`กำลังบันทึกผลการเคลียร์ ${stageName}`:
      phase==='stage-cleared'?`เคลียร์ ${stageName} แล้ว • จุดวาปด่านถัดไปเปิดแล้ว`:
      phase==='free-explore'?'สำรวจพื้นที่และเตรียมทีมสำหรับด่านถัดไป':'',
    steps:Object.freeze(raw.map((step,index)=>Object.freeze({
      ...step,
      state:finished||(current>=0&&index<current)?'done':index===current?'current':'todo',
    }))),
  });
}
