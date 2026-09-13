import assert from 'node:assert/strict';
import fs from 'node:fs';
import { recoverMonsters } from '../server-sync.mjs';

const game = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const sync = fs.readFileSync(new URL('../server-sync.mjs', import.meta.url), 'utf8');

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
assert.match(heal, /await monsterBagStateProvider\.refresh\(\)/);
assert.match(heal, /if\(keeperRecoveryPending\)return/);
assert.match(heal, /keeperRecoveryRetryRequest\|\|\{commandId:'keeper-heal-'/);
assert.match(heal, /if\(!snapshot\.available\)/);
assert.match(heal, /if\(!error\?\.status&&!request\.acknowledged\)keeperRecoveryRetryRequest=request/);
assert.match(heal, /if\(hasOnlineMonsterSession\)/);
assert.match(heal, /recoverSkillUses\(state\.collection/);
assert.match(game, /function assertRanchOperation\(\{allowOnline=false\}=\{\}\)/);
assert.match(game, /if\(hasOnlineMonsterSession\)\{[\s\S]*?if\(!allowOnline\)/);
assert.match(game, /el\('healAllBtn'\)\.onclick/);

console.log('v90-npc-online-recovery: PASS');

// เรียกฟังก์ชัน NPC ตัวจริงด้วย dependency จำลอง ไม่แก้พลัง local ในทางออนไลน์
const source=game.slice(game.indexOf('let keeperRecoveryCommandSequence='),game.indexOf('const ranchVisuals='));
function fixture(send) {
  const log=[]; const snapshot={available:true,revision:7}; let near=true;
  const deps={assertRanchOperation:()=>near,hasOnlineMonsterSession:true,serverPlayerDataActive:false,
    monsterBagStateProvider:{snapshot:()=>snapshot,refresh:async()=>{log.push('refresh');return {ok:true};}},
    runtimeConfig:{},authProfileBridge:{sessionToken:'test'},requestRecoverMonsters:send,
    msg:()=>{},playSFX:()=>{},renderAll:()=>log.push('render'),renderManager:()=>{},
    saveGame:()=>{throw new Error('online recovery must not save local HP');}};
  const heal=new Function(...Object.keys(deps),source+';return healAll;')(...Object.values(deps));
  return {heal,log,snapshot,setNear:value=>{near=value;}};
}
let finish;const sent=[];
const f=fixture((...args)=>{sent.push(args);return new Promise(resolve=>{finish=resolve;});});
const one=f.heal(); await f.heal(); assert.equal(sent.length,1,'double click has one request');
finish({ok:true,success:true});await one;assert.deepEqual(f.log,['refresh','render']);
f.setNear(false);await f.heal();assert.equal(sent.length,1,'away from NPC does not send');
const retries=[];let attempt=0;
const r=fixture(async(...args)=>{retries.push(args);if(++attempt===1)throw new TypeError('network lost');return {ok:true,success:true};});
await r.heal();r.snapshot.revision=9;await r.heal();
assert.equal(retries[0][2],retries[1][2]);assert.equal(retries[1][3],7,'retry preserves original revision');
const rejected=fixture(async()=>{throw Object.assign(new Error('NPC_REQUIRED'),{status:409,code:'NPC_REQUIRED'});});
await rejected.heal();assert.deepEqual(rejected.log,[],'rejection changes no local state');
console.log('Actual NPC heal flow: PASS, general player writes remain disabled');
