import assert from 'node:assert/strict';
import fs from 'node:fs';

const runtimeSource=fs.readFileSync(new URL('../performance-runtime.mjs',import.meta.url),'utf8');
const lifecycleSource=fs.readFileSync(new URL('../scene-resource-lifecycle.mjs',import.meta.url),'utf8');
let serial=0;

function mutate(source,needle,replacement,label){
  assert.ok(source.includes(needle),`${label}: mutation target drifted`);
  return source.replace(needle,replacement);
}

async function importMutant(source,label){
  const encoded=Buffer.from(`${source}\n//# sourceURL=${label}-${++serial}.mjs`).toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

async function expectKilled(label,source,probe){
  const module=await importMutant(source,label);
  let killed=false;
  try{await probe(module);}catch{killed=true;}
  assert.equal(killed,true,`${label}: regression probe survived the mutant`);
}

await expectKilled(
  'shared-cache-bypass',
  mutate(runtimeSource,'if (store.has(key)) return store.get(key);','if (false && store.has(key)) return store.get(key);','shared-cache-bypass'),
  module=>{
    const cache=module.createSharedResourceCache();
    const first=cache.geometry('same',()=>({userData:{}}));
    const second=cache.geometry('same',()=>({userData:{}}));
    assert.equal(first,second);
  },
);

await expectKilled(
  'pool-overflow-off-by-one',
  mutate(runtimeSource,'if (free.length < maxSize) {','if (free.length <= maxSize) {','pool-overflow-off-by-one'),
  module=>{
    const pool=module.createObjectPool({maxSize:1,create:()=>({})});
    const first=pool.acquire(),second=pool.acquire();
    pool.release(first);pool.release(second);
    assert.equal(pool.stats().free,1);
  },
);

await expectKilled(
  'quality-dpr-uncapped',
  mutate(runtimeSource,"maxDpr: 1.5, antialias: true","maxDpr: 3, antialias: true",'quality-dpr-uncapped'),
  module=>assert.ok(module.selectQualityProfile({deviceMemory:8,hardwareConcurrency:8}).maxDpr<=1.5),
);

await expectKilled(
  'engaged-ai-replays-throttled-backlog',
  mutate(
    runtimeSource,
    `if (force) {
        elapsedById.set(id, 0);
        return Math.min(maxStep, frameDt);
      }`,
    `if (force) {
        const elapsed = (elapsedById.get(id) ?? 0) + frameDt;
        elapsedById.set(id, 0);
        return Math.min(maxStep, elapsed);
      }`,
    'engaged-ai-replays-throttled-backlog',
  ),
  module=>{
    const scheduler=module.createDistanceTickScheduler();
    assert.equal(scheduler.advance('wild',100,.2),0);
    assert.equal(scheduler.advance('wild',100,.02,true),.02);
  },
);
await expectKilled(
  'egg-countdown-enables-early',
  mutate(runtimeSource,'Math.ceil((target - current) / 1000)','Math.floor((target - current) / 1000)','egg-countdown-enables-early'),
  module=>assert.equal(module.remainingCountdownSeconds(1001,1000),1),
);
await expectKilled(
  'egg-countdown-refresh-skipped',
  mutate(runtimeSource,'Number.isInteger(eggCount) && eggCount > 0','Number.isInteger(eggCount) && eggCount < 0','egg-countdown-refresh-skipped'),
  module=>assert.equal(module.shouldRefreshEggCountdown(true,1),true),
);


await expectKilled(
  'dirty-gate-renders-clean-state',
  mutate(runtimeSource,'if (!dirty || now - lastConsumedAt < minIntervalMs) return false;','if (now - lastConsumedAt < minIntervalMs) return false;','dirty-gate-renders-clean-state'),
  module=>assert.equal(module.createDirtyGate({initial:false}).consume(0),false),
);

await expectKilled(
  'shared-geometry-disposed-per-object',
  mutate(lifecycleSource,"node?.geometry?.userData?.shared !== true && disposeOnce(node?.geometry)","disposeOnce(node?.geometry)",'shared-geometry-disposed-per-object'),
  module=>{
    const geometry={userData:{shared:true},calls:0,dispose(){this.calls++;}};
    module.disposeObject3D({geometry});
    assert.equal(geometry.calls,0);
  },
);

console.log('P0 performance mutation checks: PASS (8/8 killed)');
