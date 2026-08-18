import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';
const requiredFunctions=['trainingNeed','levelUpInstance','applyLifeSimulation','feedMonster','setTraining','healAll','syncRanchVisuals','switchZone','updatePlayer','updateCamera'];
for(const fn of requiredFunctions){assert.ok(js.includes(`function ${fn}(`),`missing function ${fn}`);}
const requiredDecls=["const ranchVisuals=new Map()","const joyEl=el('joystick')","const cameraPad=el('cameraPad')"];
for(const d of requiredDecls){assert.ok(js.includes(d),`missing declaration ${d}`);}
assert.ok(js.includes("el('healAllBtn').onclick")&&js.includes('healAll'),'heal button not wired');
console.log('Active runtime boot contract: PASS');
