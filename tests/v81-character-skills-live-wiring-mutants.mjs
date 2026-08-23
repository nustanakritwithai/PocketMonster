import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertCharacterSkillsLiveWiring } from './v81-character-skills-live-wiring.mjs';

const root = new URL('../', import.meta.url);
const original = Object.freeze({
  source: fs.readFileSync(new URL('game-v800.js', root), 'utf8'),
  css: fs.readFileSync(new URL('style-v800.css', root), 'utf8'),
});

function mutate(field, before, after) {
  const value = original[field];
  assert.ok(value.includes(before), `${field} mutation target drifted: ${before}`);
  return Object.freeze({ ...original, [field]: value.replace(before, after) });
}

function mutateSeries(field, replacements) {
  let value = original[field];
  for (const [before, after] of replacements) {
    assert.ok(value.includes(before), `${field} mutation target drifted: ${before}`);
    value = value.replaceAll(before, after);
  }
  return Object.freeze({ ...original, [field]: value });
}

const mutants = [
  ['remove S4 card', mutate('source', "for(const slot of ['s1','s2','s3','s4'])", "for(const slot of ['s1','s2','s3'])")],
  ['fold Basic AI away', mutate('source', "[['basicAI','Basic AI'],['passive','Passive'],['evolutionTrait','Evolution Trait']]", "[['passive','Passive'],['evolutionTrait','Evolution Trait']]")],
  ['route to legacy pane', mutate('source', "if(targetPanel===el('characterInfoBody')){", "if(targetPanel===el('skillsPanel')){")],
  ['use stale selected monster', mutate(
    'source',
    "const presentation=focusedCharacterPresentation();\n    const inst=presentation.id?getInst(presentation.id):null;\n    renderFocusedSkillLoadoutV2(panel,inst,presentation);",
    "const presentation=focusedCharacterPresentation();\n    const inst=getInst(state.skillsSelectedId);\n    renderFocusedSkillLoadoutV2(panel,inst,presentation);",
  )],
  ['fall through into legacy renderer', mutate(
    'source',
    'renderFocusedSkillLoadoutV2(panel,inst,presentation);\n    return;',
    'renderFocusedSkillLoadoutV2(panel,inst,presentation);',
  )],
  ['read legacy moves', mutate('source', 'const model=createCharacterSkillsViewModel(inst,{', 'getMonsterSkills(inst);\n  const model=createCharacterSkillsViewModel(inst,{')],
  ['read active combat cooldown', mutate('source', 'const model=createCharacterSkillsViewModel(inst,{', 'activeSummon?.skillCds;\n  const model=createCharacterSkillsViewModel(inst,{')],
  ['coerce hostile species id', mutate(
    'source',
    "const evolutionContext=typeof instanceContext?.speciesId==='string'",
    'const evolutionContext=instanceContext?.speciesId!=null',
  )],
  ['inject markup', mutate('source', 'if(node.textContent!==text)node.textContent=text;', 'node.innerHTML=text;')],
  ['rebuild stable tree', mutate('source', 'if(cached?.root?.parentNode===panel)return cached;', 'if(false)return cached;')],
  ['skip S4 update', mutate('source', 'for(const row of model.manualSlots)updateCharacterSkillsManualCard', 'for(const row of model.manualSlots.slice(0,3))updateCharacterSkillsManualCard')],
  ['show max as CurrentUses', mutate('source', 'setCharacterSkillsText(card.resources,`Uses ${row.usesText} • CD ${row.cooldownText}`);', 'setCharacterSkillsText(card.resources,`Uses ${row.maxUses}/${row.maxUses} • CD ${row.cooldownText}`);')],
  ['hide workbook LIGHT identity', mutate(
    'source',
    "const typeText=row.sourceType?`${row.sourceType}${row.runtimeType&&row.runtimeType!==row.sourceType?` / runtime ${row.runtimeType}`:''}`:'—';",
    "const typeText=row.runtimeType||'—';",
  )],
  ['drop card aria label', mutate('source', "card.root.setAttribute('aria-label',row.accessibilityLabelTH);", "card.root.setAttribute('title',row.accessibilityLabelTH);")],
  ['drop tab aria selected', mutate('source', "btn.setAttribute('aria-selected',String(selected));", "btn.setAttribute('data-selected',String(selected));")],
  ['drop roving tabindex', mutate('source', 'btn.tabIndex=selected?0:-1;', 'btn.tabIndex=0;')],
  ['drop keyboard navigation', mutate('source', 'btn.onkeydown=event=>{', 'btn.removedKeydown=event=>{')],
  ['reverse keyboard navigation', mutate('source', "if(key==='ArrowRight'||key==='ArrowDown')return tabs[(current+1)%tabs.length];", "if(key==='ArrowRight'||key==='ArrowDown')return tabs[(current-1+tabs.length)%tabs.length];")],
  ['focus without activating keyboard tab', mutate('source', 'setFullCharacterInfoTab(next.dataset.characterTab);', 'setFullCharacterInfoTab(btn.dataset.characterTab);')],
  ['allow pointer click duplicate', mutate('source', "if(source==='click'&&pointerGenerated){", "if(false){")],
  ['collapse pointer dedupe across buttons', mutateSeries('source', [
    ['characterInfoTabActivationGuard.get(button)', 'characterInfoTabActivationGuard.get(characterInfoTabActivationGuard)'],
    ['characterInfoTabActivationGuard.set(button,', 'characterInfoTabActivationGuard.set(characterInfoTabActivationGuard,'],
    ['characterInfoTabActivationGuard.delete(button)', 'characterInfoTabActivationGuard.delete(characterInfoTabActivationGuard)'],
  ])],
  ['bypass pointer guard', mutate('source', "if(!shouldActivateFullCharacterInfoTab(tab,'pointerup',event.timeStamp))return;", "if(false)return;")],
  ['bypass pointer origin gate', mutate('source', 'if(!finishFullCharacterInfoTabPointer(event,tab))return;', 'if(!tab)return;')],
  ['allow right-button pointer fallback', mutate(
    'source',
    "if(!tab||!Number.isInteger(pointerId)||event?.isPrimary===false||event?.button!==0)return false;",
    "if(!tab||!Number.isInteger(pointerId)||event?.isPrimary===false||false)return false;",
  )],
  ['allow secondary pointer fallback', mutate(
    'source',
    "if(!tab||!Number.isInteger(pointerId)||event?.isPrimary===false||event?.button!==0)return false;",
    "if(!tab||!Number.isInteger(pointerId)||false||event?.button!==0)return false;",
  )],
  ['allow drag activation', mutate('source', 'if((x-start.x)**2+(y-start.y)**2>limit**2){', 'if(false){')],
  ['allow drag compatibility click', mutate(
    'source',
    'suppressFullCharacterInfoTabClick(start.tab,Number.isFinite(event?.timeStamp)?event.timeStamp:0);',
    'void start.tab;',
  )],
  ['ignore pointer cancel', mutate('source', 'return characterInfoTabPointerStarts.delete(event?.pointerId);', 'return false;')],
  ['drop documented main symbol', mutate('source', 'setCharacterSkillsText(card.mainIcon,row.documentedMainSymbol);', "setCharacterSkillsText(card.mainIcon,'');")],
  ['drop type symbol', mutate('source', 'setCharacterSkillsText(card.typeIcon,row.typeSymbol);', "setCharacterSkillsText(card.typeIcon,'');")],
  ['drop category marker', mutate('source', 'setCharacterSkillsText(card.categoryIcon,row.categoryMarker);', "setCharacterSkillsText(card.categoryIcon,'');")],
  ['drop effect overlay', mutate('source', 'setCharacterSkillsText(card.effectIcon,row.effectOverlay);', "setCharacterSkillsText(card.effectIcon,'');")],
  ['erase visible state label', mutate('source', 'setCharacterSkillsText(card.state,row.state);', "setCharacterSkillsText(card.state,'');")],
  ['erase visible category', mutate(
    'source',
    "setCharacterSkillsText(card.meta,row.equipped?`${typeText} • ${row.category} • ${row.targetType} • ระยะ ${row.rangeText}${coverage}`:(row.reason||'ยังไม่มีสกิลในสล็อตนี้'));",
    "setCharacterSkillsText(card.meta,row.equipped?`${typeText} • — • ${row.targetType} • ระยะ ${row.rangeText}${coverage}`:(row.reason||'ยังไม่มีสกิลในสล็อตนี้'));",
  )],
  ['erase visible target', mutate(
    'source',
    "setCharacterSkillsText(card.meta,row.equipped?`${typeText} • ${row.category} • ${row.targetType} • ระยะ ${row.rangeText}${coverage}`:(row.reason||'ยังไม่มีสกิลในสล็อตนี้'));",
    "setCharacterSkillsText(card.meta,row.equipped?`${typeText} • ${row.category} • — • ระยะ ${row.rangeText}${coverage}`:(row.reason||'ยังไม่มีสกิลในสล็อตนี้'));",
  )],
  ['erase mastery projection', mutate(
    'source',
    "setCharacterSkillsText(card.mastery,row.equipped?`Mastery ${row.masteryRank} • EXP ${row.masteryExp}${mutation}`:'Mastery —');",
    "setCharacterSkillsText(card.mastery,'Mastery —');",
  )],
  ['erase mutation projection', mutate('source', "const mutation=row.mutationId?` • Mutation ${row.mutationId}`:'';", "const mutation='';")],
  ['truncate manual accessibility', mutate(
    'source',
    "card.root.setAttribute('aria-label',row.accessibilityLabelTH);",
    "card.root.setAttribute('aria-label',row.label);",
  )],
  ['lie about Basic AI Uses', mutate(
    'source',
    'setCharacterSkillsText(card.detail,`Power ${row.power} • CD ${row.cooldownSec}s • ${row.usesText}`);',
    "setCharacterSkillsText(card.detail,`Power ${row.power} • CD ${row.cooldownSec}s • Consumes 1 Use`);",
  )],
  ['remove responsive min-width', mutate('css', '.character-info-body .character-skills-a37{min-width:0', '.character-info-body .character-skills-a37{')],
  ['remove wrapping guard', mutate('css', 'overflow-wrap:anywhere', 'overflow-wrap:normal')],
  ['erase No Uses state', mutate('css', '.character-info-body .character-skill-slot-card.is-no-uses', '.character-info-body .character-skill-slot-card.removed-no-uses')],
  ['erase invalid state', mutate('css', '.character-info-body .character-skill-slot-card.is-invalid', '.character-info-body .character-skill-slot-card.removed-invalid')],
  ['add fixed right-tab height', mutate('css', '.character-info-body .character-skills-a37{min-width:0;', '.character-info-body .character-skills-a37{min-width:0;height:400px;')],
];

let killed = 0;
for (const [name, candidate] of mutants) {
  try {
    assertCharacterSkillsLiveWiring(candidate.source, candidate.css);
  } catch {
    killed += 1;
    continue;
  }
  assert.fail(`${name} mutant survived`);
}

assert.equal(killed, mutants.length);
console.log(`V8.1 A37 Character Skills live-wiring mutants: PASS (${killed}/${mutants.length} killed)`);
