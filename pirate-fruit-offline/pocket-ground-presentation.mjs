import * as pirateFruitThree from './assets/vendor-three-RYo9rfeI.js';
import { threeFromPirateFruitVendor } from '../asset-presentation/pirate-fruit-client-bridge.mjs?v=5';
import { hookPirateFruitPbrGround } from '../asset-presentation/pirate-fruit-pbr-ground.mjs?v=1';

const pirateFruitThreeKit = threeFromPirateFruitVendor(pirateFruitThree);
hookPirateFruitPbrGround({ THREE: pirateFruitThreeKit });
