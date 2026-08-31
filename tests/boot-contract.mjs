import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeJs as js } from './active-assets.mjs';
const unifiedControls=fs.readFileSync(new URL('../unified-mobile-controls-v900.mjs',import.meta.url),'utf8');
const requiredFunctions=['trainingNeed','levelUpInstance','applyLifeSimulation','feedMonster','setTraining','healAll','syncRanchVisuals','switchZone','updatePlayer','updateCamera'];
for(const fn of requiredFunctions){assert.ok(js.includes(`function ${fn}(`),`missing function ${fn}`);}
const requiredDecls=[
  "const ranchVisuals=new Map()",
  'const joy={x:0,y:0}',
  'const unifiedMobileControls=window.POCKETMONSTER_UNIFIED_MOBILE_CONTROLS',
];
for(const d of requiredDecls){assert.ok(js.includes(d),`missing declaration ${d}`);}
assert.ok(js.includes("unifiedMobileControls.registerAdapter('pocket-monster'"),
  'Pocket runtime must register with the shared mobile-input owner');
assert.ok(unifiedControls.includes("getElementById?.('joystick')")&&unifiedControls.includes("getElementById?.('cameraPad')"),
  'shared mobile-input owner must bind the joystick and camera surfaces');
assert.ok(js.includes("el('healAllBtn').onclick")&&js.includes('healAll'),'heal button not wired');
console.log('Active runtime boot contract: PASS');
