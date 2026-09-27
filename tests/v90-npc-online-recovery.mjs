import assert from 'node:assert/strict';
import fs from 'node:fs';
import { recoverMonsters } from '../server-sync.mjs';

const game = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const sync = fs.readFileSync(new URL('../server-sync.mjs', import.meta.url), 'utf8');

// หลังข้ามจาก Pirate เซิร์ฟเวอร์ห้ามคงความสูงเก่าเพราะ Pocket ไม่ส่ง y
const poseSource = game.match(/window\.POCKETMONSTER_WORLD_STATE=\(\)=>\(\{[^\n]+\}\);/)?.[0];
assert.ok(poseSource, 'ต้องพบตัวส่งพิกัด Pocket จริง');
const poseWindow = {};
new Function('window', 'state', 'player', poseSource)(poseWindow,
  {currentZone:'hub'}, {position:{x:4,y:0,z:3},rotation:{y:1}});
assert.equal(poseWindow.POCKETMONSTER_WORLD_STATE().y, 0, 'Pocket ต้องส่งความสูงจริงแทนการปล่อยให้ Server ใช้ความสูง Pirate เก่า');

assert.match(sync, /export async function recoverMonsters/);
assert.match(sync, /'\/api\/monsters\/recover'/);
assert.match(sync, /commandId, expectedRevision/);

const requests = [];
const fakeFetch = async (url, init) => {
  requests.push({ url: String(url), init });
  return { ok: true, status: 200, json: async () => ({ ok: true, success: true, revision: 8, message: 'healed' }) };
};
const response = await recoverMonsters({ apiBaseUrl: 'https://server.example/', apiVersion: 'v1' }, 'session-token', 'keeper-heal-test', 7, { fetchImpl: fakeFetch });
assert.equal(response.ok, true);
assert.equal(requests.length, 1);
assert.equal(new URL(requests[0].url).pathname, '/api/monsters/recover');
assert.deepEqual(JSON.parse(requests[0].init.body), { commandId: 'keeper-heal-test', expectedRevision: 7 });
assert.equal(requests[0].init.headers.Authorization, 'Bearer session-token');
await assert.rejects(
  () => recoverMonsters({ apiBaseUrl: 'https://server.example/', apiVersion: 'v1' }, 'session-token', 'keeper-heal-rejected', 8, {
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ok: false, success: false, code: 'NPC_TOO_FAR', message: 'too far' }) }),
  }),
  error => error.code === 'NPC_TOO_FAR',
  'HTTP 200 with success:false must reject as a failed recovery',
);

const heal = game.match(/async function healAll\(\)\{[\s\S]*?\n\}/)?.[0] || '';
assert.match(heal, /assertRanchOperation\(\{allowOnline:true\}\)/);
assert.match(heal, /requestRecoverMonsters\(runtimeConfig,authProfileBridge\.sessionToken,request\.commandId,request\.expectedRevision\)/);
assert.match(heal, /result\?\.ok!==true\|\|result\?\.success!==true/);
assert.match(heal, /monsterBagStateProvider\.refresh\(\{afterPending:true\}\)/, 'post-ACK bag read must follow any pre-mutation GET');
assert.match(heal, /provider\?\.refresh\?\.\(\{afterPending:true\}\)/, 'NPC recovery awaits canonical Pirate control-state');
assert.match(heal, /await Promise\.all/, 'post-ACK reads run concurrently');
assert.match(heal, /RECOVERY_CONTROL_READBACK_FAILED/);
assert.match(heal, /CONTROL_STATE_STILL_DEAD/);
assert.match(heal, /error\?\.phase==='readback'/, 'server rejection and accepted-but-unverified recovery have separate messages');
assert.match(heal, /if\(keeperRecoveryPending\)return/);
assert.match(heal, /keeperRecoveryRetryRequest\|\|\{commandId:'keeper-heal-'/);
assert.match(heal, /if\(request.expectedRevision===null\)/);
assert.match(heal, /if\(!error\?\.status&&!request\.acknowledged\)keeperRecoveryRetryRequest=request/);
assert.match(heal, /if\(hasOnlineMonsterSession\)/);
assert.match(heal, /recoverSkillUses\(state\.collection/);
assert.match(game, /function assertRanchOperation\(\{allowOnline=false\}=\{\}\)/);
assert.match(game, /if\(hasOnlineMonsterSession\)\{[\s\S]*?if\(!allowOnline\)/);
assert.match(game, /el\('healAllBtn'\)\.onclick/);

console.log('v90-npc-online-recovery: PASS');

// เรียกฟังก์ชัน NPC ตัวจริงด้วย dependency จำลอง ไม่แก้พลัง local ในทางออนไลน์
const source=game.slice(game.indexOf('let keeperRecoveryCommandSequence='),game.indexOf('const ranchVisuals='));
function fixture(send, options={}) {
  const log=[]; const messages=[]; const snapshot={available:true,revision:7}; let near=true; let reads=0;
  globalThis.window={POCKETMONSTER_MONSTER_STATE_PROVIDER:{refresh:async()=>{log.push('control-refresh');return options.controlResult||{ok:true,state:{party:{available:true,slots:[{instanceId:'owned:a',hp:100,fainted:false}]}}};}}};
  const deps={assertRanchOperation:()=>near,hasOnlineMonsterSession:true,serverPlayerDataActive:false,
    monsterBagStateProvider:{snapshot:()=>snapshot,refresh:async()=>{log.push('refresh');reads++;if(options.freshRevision!==undefined)snapshot.revision=options.freshRevision;return reads===1?(options.beforeResult||{ok:true}):(options.bagRead?.()||options.bagResult||{ok:true});}},
    runtimeConfig:{},authProfileBridge:{sessionToken:'test'},requestRecoverMonsters:send,
    msg:value=>messages.push(value),playSFX:()=>{},renderAll:()=>log.push('render'),renderManager:()=>{},
    saveGame:()=>{throw new Error('online recovery must not save local HP');}};
  const heal=new Function(...Object.keys(deps),source+';return healAll;')(...Object.values(deps));
  return {heal,log,messages,snapshot,setNear:value=>{near=value;}};
}
let finish;const sent=[];
const f=fixture((...args)=>{sent.push(args);return new Promise(resolve=>{finish=resolve;});});
const one=f.heal(); await f.heal(); assert.equal(sent.length,1,'double click has one request');
finish({ok:true,success:true});await one;assert.deepEqual(f.log,['refresh','refresh','control-refresh','render']);
f.setNear(false);await f.heal();assert.equal(sent.length,1,'away from NPC does not send');
const retries=[];let attempt=0;
const r=fixture(async(...args)=>{retries.push(args);if(++attempt===1)throw new TypeError('network lost');return {ok:true,success:true};});
await r.heal();r.snapshot.revision=9;await r.heal();
assert.equal(retries[0][2],retries[1][2]);assert.equal(retries[1][3],7,'retry preserves original revision');
const rejected=fixture(async()=>{throw Object.assign(new Error('NPC_REQUIRED'),{status:409,code:'NPC_REQUIRED'});});
await rejected.heal();assert.deepEqual(rejected.log,['refresh'],'rejection performs only preflight read, no healed presentation');
assert.match(rejected.messages[0],/NPC Recovery ไม่สำเร็จ • NPC_REQUIRED/);
const declined=fixture(async()=>({ok:false,success:false,code:'NPC_TOO_FAR'}));
await declined.heal();assert.match(declined.messages[0],/NPC Recovery ไม่สำเร็จ • NPC_TOO_FAR/);
assert.deepEqual(declined.log,['refresh'],'a server rejection does not proceed to readback or heal UI');
const failedReadback=fixture(async()=>({ok:true,success:true}),{bagResult:{ok:false,code:'INVENTORY_UNAVAILABLE'}});
await failedReadback.heal();assert.deepEqual(failedReadback.log,['refresh','refresh','control-refresh']);
assert.match(failedReadback.messages[0],/รับการรักษาแล้ว แต่ยืนยันสถานะล่าสุดไม่ได้ • INVENTORY_UNAVAILABLE/);
assert.equal(failedReadback.log.includes('render'),false,'accepted mutation with failed readback must not show healed success');
const stillDead=fixture(async()=>({ok:true,success:true}),{controlResult:{ok:true,state:{party:{available:true,slots:[{instanceId:'owned:a',hp:0,fainted:true}]}}}});
await stillDead.heal();assert.deepEqual(stillDead.log,['refresh','refresh','control-refresh']);
assert.match(stillDead.messages[0],/CONTROL_STATE_STILL_DEAD/);
assert.equal(stillDead.log.includes('render'),false,'bag HP cannot override a canonical dead slot');
const deadActor=fixture(async()=>({ok:true,success:true}),{controlResult:{ok:true,state:{party:{available:true,slots:[{instanceId:'owned:a',hp:100,fainted:false}]},actors:[{instanceId:'owned:a',hp:0,fainted:true}]}}});
await deadActor.heal();assert.match(deadActor.messages[0],/CONTROL_STATE_STILL_DEAD/);
assert.equal(deadActor.log.includes('render'),false,'dead canonical actor cannot be hidden by a full party/save projection');
const missingVitals=fixture(async()=>({ok:true,success:true}),{controlResult:{ok:true,state:{party:{available:true,slots:[{instanceId:'owned:a'}]},actors:[]}}});
await missingVitals.heal();
assert.equal(missingVitals.log.includes('render'),false,'hub readback without authoritative HP must not claim recovery success');
assert.match(missingVitals.messages[0],/CONTROL_STATE_VITALS_UNAVAILABLE/);
console.log('Actual NPC heal flow: PASS, general player writes remain disabled');

// กระเป๋า available ไม่รับประกันว่า revision ยังตรงกับ Pirate operation ล่าสุด
const freshSent=[];
const fresh=fixture(async(...args)=>{freshSent.push(args);return {ok:true,success:true};},{freshRevision:19});
await fresh.heal();
assert.equal(freshSent[0][3],19,'NPC sends newly read revision, not cached revision 7');
const conflictIds=[];let conflictCount=0;
const conflict=fixture(async(...args)=>{conflictIds.push(args[2]);if(++conflictCount===1)throw Object.assign(new Error('conflict'),{status:409,code:'STATE_CONFLICT'});return {ok:true,success:true};});
await conflict.heal();await conflict.heal();
assert.notEqual(conflictIds[0],conflictIds[1],'explicit rejection allows a new user command; no automatic replay');
assert.equal(conflict.log.filter(item=>item==='refresh').length,3,'second click re-reads revision before sending');
const notReady=fixture(async()=>{throw new Error('must not send');},{beforeResult:{ok:false,code:'INVENTORY_UNAVAILABLE'}});
await notReady.heal();assert.deepEqual(notReady.log,['refresh']);
assert.match(notReady.messages[0],/NPC Recovery ไม่สำเร็จ/);

let releaseBag;
const parallel=fixture(async()=>({ok:true,success:true}),{bagRead:()=>new Promise(resolve=>{releaseBag=resolve;})});
const parallelWork=parallel.heal();
for(let i=0;i<12;i++)await Promise.resolve();
assert.ok(parallel.log.includes('control-refresh'),'control HP GET starts without waiting for bag network response');
assert.ok(!parallel.log.includes('render'),'success still waits for both authoritative readbacks');
releaseBag({ok:true});await parallelWork;
assert.ok(parallel.log.includes('render'));
