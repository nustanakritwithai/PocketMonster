import assert from 'node:assert/strict';
import { createMonsterHttpProvider } from '../monster-command-http-provider-v900.mjs';

let time=0, reads=0, hp=100, release=null;
const provider=createMonsterHttpProvider({
  config:{apiBaseUrl:'https://fixture.invalid',apiVersion:'1.1'},sessionToken:'fixture',
  getZone:()=> 'pirate-fruit',now:()=>time,
  fetchImpl:async()=>{
    reads++;
    if(reads>1)await new Promise(resolve=>{release=resolve;});
    return {ok:true,json:async()=>({ok:true,monsterControl:{party:[{instanceId:'mine',hp,maxHp:100}],
      actors:[{actorId:'owned:mine',instanceId:'mine',zone:'pirate-fruit',generation:2,active:hp>0,hp,maxHp:100}]}})};
  },
});
const packet=(health,extra={})=>({zone:'pirate-fruit',actors:[{actorId:'owned:mine',zone:'pirate-fruit',generation:2,
  authority:{generation:2,hp:{current:health,max:100}},...extra}]});
await provider.refresh();
assert.equal(provider.observeWorldSnapshot(packet(100)),false,'unchanged HP causes no HTTP');
assert.equal(provider.observeWorldSnapshot(packet(90,{actorId:'owned:other'})),false,'other player ignored');
assert.equal(provider.observeWorldSnapshot(packet(90,{generation:1})),false,'stale generation ignored');
assert.equal(provider.observeWorldSnapshot({...packet(90),zone:'hub'}),false,'other zone ignored');
time=200;
assert.equal(provider.observeWorldSnapshot(packet(90)),true,'HP notification starts a read at 200ms, without waiting for 2-second poll');
assert.equal(reads,2);
assert.equal(provider.snapshot().actors[0].hp,100,'WS signal must not directly mutate canonical HP');
assert.equal(provider.observeWorldSnapshot(packet(80)),false,'in-flight requests coalesce');
hp=90;release();await provider.refresh();
assert.equal(provider.snapshot().actors[0].hp,90,'only authenticated GET supplies new HP');
time=399;
assert.equal(provider.observeWorldSnapshot(packet(80)),false,'bounded five refreshes per second');
time=400;
assert.equal(provider.observeWorldSnapshot(packet(80)),true);
hp=80;release();await provider.refresh();
assert.equal(reads,3);
provider.dispose();
assert.equal(provider.observeWorldSnapshot(packet(0)),false,'disposed scene cannot request state');
console.log('Monster WS-triggered canonical readback: PASS');

// ตรวจ cadence โดยใช้ clock จำลอง ไม่ยิง load test ใส่ VPS
const realSetInterval=globalThis.setInterval,realClearInterval=globalThis.clearInterval;
let intervalMs, tick, pollReads=0, updates=0, pollTime=0;
const polling=createMonsterHttpProvider({config:{apiBaseUrl:'https://fixture.invalid'},sessionToken:'fixture',
  getZone:()=> 'hub',pollMs:200,now:()=>pollTime,fetchImpl:async()=>{
    pollReads++;return {ok:true,json:async()=>({ok:true,monsterControl:{party:[],actors:[],revision:1}})};
  }});
try {
  globalThis.setInterval=(fn,ms)=>{tick=fn;intervalMs=ms;return 1;};
  globalThis.clearInterval=()=>{};
  polling.subscribe(()=>updates++);
  polling.start();assert.equal(intervalMs,200);
  tick();await polling.refresh();
  assert.equal(pollReads,1,'timer and foreground reads share a pending GET');
  const afterFirst=updates;
  pollTime=200;
  tick();await polling.refresh();
  assert.equal(pollReads,2);
  assert.equal(updates,afterFirst,'unchanged data does not repaint HUD at 5Hz');
} finally {
  polling.dispose();globalThis.setInterval=realSetInterval;globalThis.clearInterval=realClearInterval;
}
console.log('200ms single-flight polling and unchanged-HUD suppression: PASS');

// จำลอง response ที่อ่าน body เสร็จช้า แม้ transport ได้รับ abort ตอนเปลี่ยนฉากแล้ว
for (const oldOk of [true, false]) {
  let finishOld, count=0, notifications=0;
  const race=createMonsterHttpProvider({config:{apiBaseUrl:'https://fixture.invalid'},sessionToken:'fixture',
    getZone:()=> 'hub',fetchImpl:async()=>{
      if (++count===1) return {ok:oldOk,json:()=>new Promise(resolve=>{finishOld=resolve;})};
      return {ok:true,json:async()=>({ok:true,monsterControl:{party:[{instanceId:'healed',hp:100,maxHp:100}],
        actors:[],capabilities:{recall:true},revision:22}})};
    }});
  try {
    race.subscribe(()=>notifications++);
    const oldRead=race.refresh();
    await Promise.resolve();
    assert.equal(typeof finishOld,'function');
    race.reset();
    assert.equal((await race.refresh()).ok,true);
    const fresh=race.snapshot(), afterFresh=notifications;
    finishOld({ok:oldOk,monsterControl:{party:[],actors:[],revision:1}});
    assert.equal((await oldRead).code,'STALE_SCENE');
    assert.strictEqual(race.snapshot(),fresh,'response ก่อน reset ห้ามล้าง state ใหม่');
    assert.equal(notifications,afterFresh,'response เก่าห้ามทำให้ HUD กะพริบ unavailable');
    assert.equal(race.snapshot().party.slots[0].hp,100);
  } finally { race.dispose(); }
}
console.log('Stale response after reset preserves fresh canonical state: PASS');
