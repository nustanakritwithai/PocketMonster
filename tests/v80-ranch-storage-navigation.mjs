import assert from 'node:assert/strict';
import { attachCharacterUi, createCharacterUIController, persistableState } from '../character-ui-controller.mjs';

const state={collection:[],party:[null,null,null],storage:[],ranchActive:[],selectedSlot:0,currentZone:'hub'};
attachCharacterUi(state);
const ui=createCharacterUIController({getState:()=>state,getZone:()=>state.currentZone});

const blocked=ui.requestOpenRanchStorage({isNearNpc:false});
assert.equal(blocked.ok,false,'Storage requires the Keeper NPC');
assert.equal(blocked.reason,'npc-required');
assert.equal(blocked.reasonText,'กลับ Ranch Hub และเข้าใกล้ NPC ก่อน');
assert.equal(ui.snapshot().ranchPanel,null,'blocked entry must not open a panel');

const services=ui.requestOpenRanchServices({isNearNpc:true});
assert.equal(services.ok,true);
assert.equal(ui.snapshot().ranchPanel,'services');
assert.equal(ui.snapshot().characterPanel,'closed','Ranch navigation must not revive Character manager');

const storage=ui.requestOpenRanchStorage({isNearNpc:true});
assert.equal(storage.ok,true);
assert.equal(ui.snapshot().ranchPanel,'storage');
assert.equal(ui.backRanch().ranchPanel,'services','Back returns Storage to Ranch Services');
assert.equal(ui.backRanch().ranchPanel,null,'Back returns Ranch Services to World');

assert.equal(Object.hasOwn(persistableState(state),'ui'),false,'Ranch navigation must never enter saved gameplay state');
console.log('V8.2 Ranch Storage NPC navigation contract: PASS');
