import assert from 'node:assert/strict';
import { activeJs as originalJs, activeCss as css } from './active-assets.mjs';

function extractFn(source,name) {
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,`missing ${name}`);
  const brace=source.indexOf('{',start);
  let depth=0;
  for(let index=brace;index<source.length;index++){
    if(source[index]==='{')depth+=1;
    else if(source[index]==='}'&&--depth===0)return source.slice(start,index+1);
  }
  assert.fail(`unclosed ${name}`);
}

function contract(js){
  const kind=extractFn(js,'skillIconKind'),icon=extractFn(js,'getSkillIcon');
  const layers=extractFn(js,'drawSkillSemanticLayers'),resource=extractFn(js,'syncSkillButtonResourceUi');
  const render=extractFn(js,'renderCombatPresentation');
  assert.match(kind,/return contract\.mainKind/);
  assert.match(icon,/enemyAreaIconProfile\(skill\?\.skillId\)/);
  assert.match(icon,/areaProfile\?\.compositeCacheKey\|\|contract\?\.cacheKey\|\|kind/);
  assert.match(icon,/case'groundpoint'/);
  assert.match(icon,/drawAreaSkillIcon\(ctx,areaProfile\)/);
  assert.match(icon,/drawSkillSemanticLayers\(ctx,contract\)/);
  assert.match(layers,/contract\.typeSymbol/);
  assert.match(layers,/contract\.categoryMarker/);
  assert.match(layers,/contract\.effectOverlay/);
  assert.match(resource,/skill\.currentUses/);
  assert.match(resource,/skill\.maxUses/);
  assert.match(resource,/remaining\.toFixed\(1\)/);
  assert.match(resource,/setClassTokenIfChanged\(cooldown,'hidden',remaining<=0\)/);
  assert.doesNotMatch(resource,/\.remove\(/);
  assert.match(render,/syncSkillButtonResourceUi\(button,skill,activeSummon\?\.skillCds\?\.\[index\]\|\|0\)/);
  assert.match(render,/iconContract\.accessibilityLabelTH/);
}

contract(originalJs);
const mutants=[
  ['collapse exact contract kind','return contract.mainKind;',"return 'enemy';"],
  ['remove elemental area profile','enemyAreaIconProfile(skill?.skillId)','null'],
  ['cache only by role','areaProfile?.compositeCacheKey||contract?.cacheKey||kind','kind'],
  ['erase GroundPoint branch',"case'groundpoint':","case'area-fallback':"],
  ['erase elemental area drawing','drawAreaSkillIcon(ctx,areaProfile);','drawAreaSkillIcon(ctx,null);'],
  ['erase semantic layers','drawSkillSemanticLayers(ctx,contract);','drawSkillSemanticLayers(ctx,null);'],
  ['erase category layer','contract.categoryMarker','contract.typeSymbol'],
  ['erase effect layer','contract.effectOverlay','contract.typeSymbol'],
  ['show only maximum Uses','Number.isFinite(skill?.currentUses)?skill.currentUses:0','Number.isFinite(skill?.maxUses)?skill.maxUses:0'],
  ['remove live resource sync','syncSkillButtonResourceUi(button,skill,activeSummon?.skillCds?.[index]||0);',''],
];

let killed=0;
for(const [name,before,after] of mutants){
  const js=originalJs.replace(before,after);
  assert.notEqual(js,originalJs,`${name} mutation must alter source`);
  try{contract(js);}catch{killed+=1;continue;}
  assert.fail(`${name} mutant survived`);
}
assert.equal(killed,mutants.length);
assert.match(css,/\.action\.skill \.uses-overlay\{/);
console.log(`V8.8 live skill icon HUD mutants: PASS (${killed}/${mutants.length} killed)`);
