import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeHtml, activeJs as js, activeCss as css, rootUrl } from './active-assets.mjs';

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

assert.match(js,/import \{ skillButtonIconContract \} from '\.\/skill-icon-runtime\.mjs'/);
assert.match(js,/import \{ enemyAreaIconProfile \} from '\.\/skill-area-icon-profile\.mjs'/);

const kindFn=extractFn(js,'skillIconKind');
assert.match(kindFn,/skillButtonIconContract\(skill\?\.skillId\)/);
assert.match(kindFn,/return contract\.mainKind/);

const iconFn=extractFn(js,'getSkillIcon');
assert.match(iconFn,/enemyAreaIconProfile\(skill\?\.skillId\)/);
assert.match(iconFn,/areaProfile\?\.compositeCacheKey\|\|contract\?\.cacheKey\|\|kind/);
assert.match(iconFn,/case'enemy'/);
assert.match(iconFn,/case'area'/);
assert.match(iconFn,/case'groundpoint'/);
assert.match(iconFn,/case'heal'/);
assert.match(iconFn,/case'shield'/);
assert.match(iconFn,/case'buff'/);
assert.match(iconFn,/drawAreaSkillIcon\(ctx,areaProfile\)/);
assert.match(iconFn,/drawSkillSemanticLayers\(ctx,contract\)/);
assert.doesNotMatch(iconFn,/executeEquippedSkillCommand|currentUses\s*[-+]=|skillCds\s*\[/);

const layersFn=extractFn(js,'drawSkillSemanticLayers');
assert.match(layersFn,/contract\.typeSymbol/);
assert.match(layersFn,/contract\.categoryMarker/);
assert.match(layersFn,/contract\.effectOverlay/);
assert.match(layersFn,/contract\.critMarker/);

const resourceFn=extractFn(js,'syncSkillButtonResourceUi');
assert.match(resourceFn,/skill\.currentUses/);
assert.match(resourceFn,/skill\.maxUses/);
assert.match(resourceFn,/remaining\.toFixed\(1\)/);
assert.match(resourceFn,/setClassTokenIfChanged\(cooldown,'hidden',remaining<=0\)/);
assert.doesNotMatch(resourceFn,/\.remove\(/,'resource overlays must be reused, not churned each frame');

const renderFn=extractFn(js,'renderCombatPresentation');
assert.match(renderFn,/getSkillIcon\(skill\)/);
assert.match(renderFn,/applyButtonIcon\(button,iconUrl,'86%'\)/);
assert.match(renderFn,/syncSkillButtonResourceUi\(button,skill,activeSummon\?\.skillCds\?\.\[index\]\|\|0\)/);
assert.match(renderFn,/iconContract\.accessibilityLabelTH/);

assert.match(css,/\.action\.skill \.uses-overlay\{/);
assert.match(css,/\.action\.skill \.cd-overlay\{[^}]*z-index:4/);
assert.match(css,/\.action\.skill\.no-uses \.uses-overlay\{/);
assert.match(css,/\.skill4\{[^}]*width:58px[^}]*height:58px/,'desktop S4 remains above 48px touch minimum');
assert.match(css,/@media\(max-width:700px\)[\s\S]*\.skill4\{[^}]*width:52px[^}]*height:52px/,'mobile S4 remains above 48px touch minimum');

const mirrorHtml=fs.readFileSync(new URL('v800.html',rootUrl),'utf8');
assert.equal(activeHtml,mirrorHtml,'active HTML entries remain byte-identical');

console.log('V8.8 live skill icon HUD: PASS (S1-S4 + Uses/Cooldown + Android touch size)');
