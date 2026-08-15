import assert from 'node:assert/strict';
import { activeHtml as html, activeJs as js } from './active-assets.mjs';
const must=(needle,msg)=>assert.ok(js.includes(needle),msg||`missing ${needle}`);

// Ring 0 / Ring 1 static contract guards
assert.ok(!html.includes('id="attackBtn"'),'player attack button must not be a primary damage source');
assert.ok(!js.includes('function playerAttack'),'player direct attack implementation must stay removed');
must('RANCH_ACTIVE_MAX=6','Ranch rendered cap must remain 6');
must("targetType:'enemy'"); must("targetType:'area'"); must("targetType:'self'");
must("if(activeSummon){msg('ต้อง Recall มอนของเราก่อนเข้าสู่ Capture Aim')",'capture must be blocked while owned monster is active');
must('state.inventory.captureBalls--','a real throw attempt must consume a ball');
must("capturePolicy==='disabled'",'boss capture policy must support disabled');
must("capturePolicy==='elite'",'elite capture policy must use central policy');
must('BALANCE.eliteCaptureModifier','elite capture modifier must be data/config driven');
must('resetWild(w)','wild encounter reset must exist');
must('inst.fainted=true','Fainted state must exist');
must('faintActive()','Fainted auto recall path must exist');
must("a.bond<50||b.bond<50",'breeding requires Bond >= 50');
must('genderCompatible(a,b)','breeding requires gender compatibility');
must('return spById[holder.speciesId]','offspring defaults to egg-holder species');
must('BREEDING_RECIPES=[]','hybrids must be explicit recipes');
must('if(!confirm(`Evolution ย้อนกลับไม่ได้','evolution must confirm irreversibility');
must("hub:{label:'Ranch Hub'"); must("grassland:{label:'Green Meadow'"); must("cave:{label:'Echo Cave'");
const expected=['flameling','mossbun','voltkit','aquapuff','frostowl','ironbug','emberdrake','voidhorn'];
for(const id of expected) must(`id:'${id}'`,`missing vertical slice species ${id}`);
const typeLine=js.match(/const TYPES=\[(.*?)\];/s)?.[1]||'';
assert.equal((typeLine.match(/'/g)||[]).length/2,18,'type baseline must contain 18 types');
console.log('Active Ring 0 + Ring 1 static regression: PASS');
