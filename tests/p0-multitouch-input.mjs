import assert from 'node:assert/strict';
import { activeCss, activeJs } from './active-assets.mjs';

function assertMultitouchContract(js,css){
  assert.match(css,/\.action\{touch-action:none;user-select:none;-webkit-user-select:none\}/,'action controls must opt out of browser multi-touch gestures');
  assert.match(js,/function bindActionPress\(button,handler\)/);
  for(const binding of [
    "bindActionPress(el('summonBtn'),summonThrow)",
    "bindActionPress(el('recallBtn'),()=>recall(true))",
    "bindActionPress(el('skill1Btn'),()=>dispatchSkill(0))",
    "bindActionPress(el('skill2Btn'),()=>dispatchSkill(1))",
    "bindActionPress(el('skill3Btn'),()=>dispatchSkill(2))",
    "bindActionPress(el('skill4Btn'),()=>dispatchSkill(3))",
  ]) assert.ok(js.includes(binding),`pointerdown action binding missing: ${binding}`);
  assert.match(js,/captureBtn\.addEventListener\('pointerdown'/);
  assert.match(js,/captureBtn\.addEventListener\('pointerup'/);
  assert.match(js,/capturePointerId=event\.pointerId/);
  assert.doesNotMatch(js,/el\('(summonBtn|skill1Btn|skill2Btn|skill3Btn|skill4Btn)'\)\.onclick/,'mobile actions must not depend on compatibility click while another pointer is held');
}

function mutate(source,needle,replacement,label){
  assert.ok(source.includes(needle),`${label}: mutation target drifted`);
  return source.replace(needle,replacement);
}

function expectKilled(label,js,css){
  let killed=false;
  try{assertMultitouchContract(js,css);}catch{killed=true;}
  assert.equal(killed,true,`${label}: multitouch regression survived the mutant`);
}

assertMultitouchContract(activeJs,activeCss);
expectKilled(
  'browser-gesture-reclaims-action-touch',
  activeJs,
  mutate(activeCss,'.action{touch-action:none;user-select:none;-webkit-user-select:none}', '.action{touch-action:manipulation;user-select:none;-webkit-user-select:none}','browser-gesture-reclaims-action-touch'),
);
expectKilled(
  'skill-reverts-to-compatibility-click',
  mutate(activeJs,"bindActionPress(el('skill1Btn'),()=>dispatchSkill(0))","el('skill1Btn').onclick=()=>dispatchSkill(0)",'skill-reverts-to-compatibility-click'),
  activeCss,
);
expectKilled(
  'capture-loses-independent-pointerdown',
  mutate(activeJs,"captureBtn.addEventListener('pointerdown'","captureBtn.addEventListener('click'",'capture-loses-independent-pointerdown'),
  activeCss,
);

console.log('P0 multitouch input regression: PASS (3/3 mutants killed)');
