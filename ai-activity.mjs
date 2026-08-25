const DEFAULTS={enabled:false,autoQuest:true,autoCare:true,autoLevel:false,autoSkills:true,intervalSeconds:12,hungerThreshold:55,energyThreshold:42,moodThreshold:48};
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const loadSettings=()=>{try{return{...DEFAULTS,...JSON.parse(localStorage.getItem('mlr-ai-activity')||'{}')}}catch{return{...DEFAULTS}}};

export function chooseAiActivity(monsters,settings=DEFAULTS){
  const list=(monsters||[]).filter(Boolean);
  if(!list.length)return{type:'IDLE',reason:'ยังไม่มีมอนสเตอร์'};
  const hungry=[...list].sort((a,b)=>(a.hunger??100)-(b.hunger??100))[0];
  if(settings.autoCare&&(hungry.hunger??100)<settings.hungerThreshold)return{type:'FEED',monsterId:hungry.instanceId,reason:`หิว ${Math.round(hungry.hunger??0)}`};
  const tired=[...list].sort((a,b)=>(a.energy??100)-(b.energy??100))[0];
  if(settings.autoCare&&(tired.energy??100)<settings.energyThreshold)return{type:'REST',monsterId:tired.instanceId,reason:`พลัง ${Math.round(tired.energy??0)}`};
  const sad=[...list].sort((a,b)=>(a.mood??100)-(b.mood??100))[0];
  if(settings.autoCare&&(sad.mood??100)<settings.moodThreshold)return{type:'PLAY',monsterId:sad.instanceId,reason:`อารมณ์ ${Math.round(sad.mood??0)}`};
  if(settings.autoLevel)return{type:'LEVEL',reason:'ทีมพร้อมออกล่าเก็บเลเวล'};
  if(settings.autoQuest)return{type:'QUEST',reason:'ทีมพร้อมทำกิจกรรม'};
  return{type:'IDLE',reason:'ทีมอยู่ในสภาพดี'};
}

export function initializeAiActivity({getMonsters,getInventory,feed,care,startQuest,isQuestRunning,levelStep,onMessage}){
  const settings=loadSettings();let busy=false,timer=0,lastActionAt=0;
  const ui=document.createElement('section');ui.id='aiActivityPanel';ui.innerHTML=`<button id="aiActivityToggle" title="AI ผู้ช่วยเล่น">🤖 AI กิจกรรม</button><div id="aiActivityBody" class="ai-hidden"><div class="ai-head"><b>🤖 AI ผู้ช่วยเล่น</b><button id="aiClose">×</button></div><label class="ai-switch"><input id="aiEnabled" type="checkbox"> เปิด AI อัตโนมัติ</label><div class="ai-options"><label><input id="aiCare" type="checkbox"> ดูแลมอนสเตอร์</label><label><input id="aiQuest" type="checkbox"> ทำเควส</label><label><input id="aiLevel" type="checkbox"> เก็บเลเวล/ตีมอน</label><label><input id="aiSkills" type="checkbox"> ใช้สกิลอัตโนมัติ</label></div><label>ตรวจทุก <select id="aiInterval"><option value="8">8 วินาที</option><option value="12">12 วินาที</option><option value="20">20 วินาที</option></select></label><div id="aiStatus">สถานะ: ปิด</div><div id="aiLog"></div><button id="aiRunNow">▶ ทำกิจกรรมตอนนี้</button></div>`;document.body.append(ui);
  const body=ui.querySelector('#aiActivityBody'),status=ui.querySelector('#aiStatus'),log=ui.querySelector('#aiLog'),enabled=ui.querySelector('#aiEnabled'),careBox=ui.querySelector('#aiCare'),questBox=ui.querySelector('#aiQuest'),levelBox=ui.querySelector('#aiLevel'),skillsBox=ui.querySelector('#aiSkills'),interval=ui.querySelector('#aiInterval');
  enabled.checked=settings.enabled;careBox.checked=settings.autoCare;questBox.checked=settings.autoQuest;levelBox.checked=settings.autoLevel;skillsBox.checked=settings.autoSkills;interval.value=String(settings.intervalSeconds);
  const save=()=>{settings.enabled=enabled.checked;settings.autoCare=careBox.checked;settings.autoQuest=questBox.checked;settings.autoLevel=levelBox.checked;settings.autoSkills=skillsBox.checked;settings.intervalSeconds=clamp(Number(interval.value)||12,8,60);localStorage.setItem('mlr-ai-activity',JSON.stringify(settings));status.textContent=settings.enabled?'สถานะ: กำลังเฝ้าดูทีม':'สถานะ: ปิด';};
  const write=(text)=>{const time=new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit',second:'2-digit'});log.innerHTML=`<div><time>${time}</time> ${text}</div>`+log.innerHTML;while(log.children.length>6)log.lastElementChild.remove();};
  async function runNow(){if(busy)return;busy=true;try{const action=chooseAiActivity(getMonsters?.()||[],settings);status.textContent=`สถานะ: ${action.reason}`;if(action.type==='FEED'){const inv=getInventory?.()||{},food=['healthy','monsterFood','basic'].find(x=>(inv[x]||0)>0);if(!food){write('อาหารหมด จึงยังไม่ให้อาหาร');return;}await feed(action.monsterId,food);write(`ให้อาหาร • ${action.reason}`);}else if(action.type==='REST'){care(action.monsterId,'rest');write(`พักผ่อน • ${action.reason}`);}else if(action.type==='PLAY'){care(action.monsterId,'play');write(`เล่นด้วย • ${action.reason}`);}else if(action.type==='LEVEL'){const result=await levelStep?.({useSkills:settings.autoSkills});write(result?.message||'เตรียมทีมออกล่าเก็บเลเวล');}else if(action.type==='QUEST'){if(isQuestRunning?.())write('เควสกำลังทำอยู่');else{await startQuest?.();write('เริ่มเควสอัตโนมัติ');}}else write(action.reason);lastActionAt=performance.now();onMessage?.(`🤖 AI: ${action.reason}`);}catch(e){status.textContent=`สถานะ: ${e?.message||'ทำกิจกรรมไม่สำเร็จ'}`;write(`ผิดพลาด: ${e?.message||e}`);}finally{busy=false;}}
  function tick(dt){timer+=dt;if(!settings.enabled||busy)return;if(timer>=settings.intervalSeconds){timer=0;runNow();}}
  ui.querySelector('#aiActivityToggle').onclick=()=>{const opening=body.classList.contains('ai-hidden');if(opening)dispatchEvent(new CustomEvent('monsterlife-panel-open',{detail:{panel:'aiActivity'}}));body.classList.toggle('ai-hidden');};addEventListener('monsterlife-panel-open',event=>{if(event.detail?.panel!=='aiActivity')body.classList.add('ai-hidden');});ui.querySelector('#aiClose').onclick=()=>body.classList.add('ai-hidden');ui.querySelector('#aiRunNow').onclick=runNow;for(const input of [enabled,careBox,questBox,levelBox,skillsBox,interval])input.onchange=save;save();
  return{tick,runNow,get enabled(){return settings.enabled},get lastActionAt(){return lastActionAt}};
}
