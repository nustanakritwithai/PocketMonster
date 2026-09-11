import * as pirateFruitThree from './assets/vendor-three-RYo9rfeI.js';
import { threeFromPirateFruitVendor } from '../asset-presentation/pirate-fruit-client-bridge.mjs?v=5';
import { hookPirateFruitPbrGround } from '../asset-presentation/pirate-fruit-pbr-ground.mjs?v=2';

const pirateFruitThreeKit = threeFromPirateFruitVendor(pirateFruitThree);
hookPirateFruitPbrGround({ THREE: pirateFruitThreeKit });
