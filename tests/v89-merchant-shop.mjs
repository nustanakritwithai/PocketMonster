import assert from 'node:assert/strict';
import { MERCHANT_OFFER_CATALOG, MERCHANT_OFFER_IDS, validateMerchantCatalog } from '../merchant-shop-catalog.mjs';
import { commitMerchantPurchase, MERCHANT_PURCHASE_REASONS } from '../merchant-purchase.mjs';
import { SAVE_SCHEMA_VERSION, normalizeSavedState, sanitizeStateForPersistence } from '../save-schema.mjs';

assert.equal(validateMerchantCatalog().ok, true, 'merchant catalog is valid');
assert.equal(MERCHANT_OFFER_CATALOG[MERCHANT_OFFER_IDS.EMBER_FRUIT].price.amount, 600);
assert.equal(MERCHANT_OFFER_CATALOG[MERCHANT_OFFER_IDS.EMBER_FRUIT].itemId, 'emberFruit');

const source = {
  wallet: { gold: 600 },
  inventory: { emberFruit: 1 },
  merchantPurchaseCommandIds: [],
  merchantPurchaseHistory: [],
};
const command = {
  commandId: 'merchant-test:success',
  offerId: MERCHANT_OFFER_IDS.EMBER_FRUIT,
  quantity: 1,
  expectedCatalogVersion: 1,
  expectedUnitPrice: 600,
  expectedCurrencyId: 'gold',
  expectedGoldBefore: 600,
  expectedItemQuantityBefore: 1,
  purchasedAt: 1,
};
let persisted = null;
const success = commitMerchantPurchase({
  state: source,
  command,
  persistCandidate(nextState) {
    persisted = nextState;
    return { ok: true, envelope: { state: nextState } };
  },
});
assert.equal(success.ok, true);
assert.equal(success.nextState.wallet.gold, 0);
assert.equal(success.nextState.inventory.emberFruit, 2);
assert.equal(source.wallet.gold, 600, 'source wallet remains immutable');
assert.equal(source.inventory.emberFruit, 1, 'source inventory remains immutable');
assert.equal(persisted.merchantPurchaseHistory.length, 1);

const insufficient = commitMerchantPurchase({
  state: { ...source, wallet: { gold: 599 } },
  command: { ...command, commandId: 'merchant-test:poor', expectedGoldBefore: 599 },
  persistCandidate() { throw new Error('must not persist'); },
});
assert.equal(insufficient.ok, false);
assert.equal(insufficient.reason, MERCHANT_PURCHASE_REASONS.INSUFFICIENT_FUNDS);

const bundle = commitMerchantPurchase({
  state: { wallet: { gold: 200 }, inventory: { captureBalls: 0 }, merchantPurchaseCommandIds: [], merchantPurchaseHistory: [] },
  command: {
    commandId: 'merchant-test:bundle', offerId: MERCHANT_OFFER_IDS.CAPTURE_BALLS, quantity: 1,
    expectedCatalogVersion: 1, expectedUnitPrice: 200, expectedCurrencyId: 'gold',
    expectedGoldBefore: 200, expectedItemQuantityBefore: 0, purchasedAt: 2,
  },
  persistCandidate(nextState) { return { ok: true, envelope: { state: nextState } }; },
});
assert.equal(bundle.ok, true);
assert.equal(bundle.nextState.wallet.gold, 0);
assert.equal(bundle.nextState.inventory.captureBalls, 5);

const persistenceFailure = commitMerchantPurchase({
  state: source,
  command: { ...command, commandId: 'merchant-test:save-failure' },
  persistCandidate() { return { ok: false, reason: 'storage_full' }; },
});
assert.equal(persistenceFailure.ok, false);
assert.equal(persistenceFailure.reason, MERCHANT_PURCHASE_REASONS.PERSISTENCE_FAILED);

const replay = commitMerchantPurchase({
  state: success.nextState,
  command,
  persistCandidate() { throw new Error('replay must not persist'); },
});
assert.equal(replay.ok, false);
assert.equal(replay.reason, MERCHANT_PURCHASE_REASONS.DUPLICATE_COMMAND);

const legacy = normalizeSavedState({ saveVersion: 14, inventory: { emberFruit: 2 } });
assert.equal(legacy.saveVersion, SAVE_SCHEMA_VERSION);
assert.equal(legacy.wallet.gold, 300);
assert.equal(legacy.inventory.emberFruit, 2);
const currentMissing = normalizeSavedState({ saveVersion: SAVE_SCHEMA_VERSION, inventory: {} });
assert.equal(currentMissing.wallet.gold, 0);
assert.equal(currentMissing.inventory.emberFruit, 0);
const fresh = normalizeSavedState({});
assert.equal(fresh.wallet.gold, 300);
assert.equal(fresh.inventory.emberFruit, 1);
assert.equal(sanitizeStateForPersistence(success.nextState).merchantPurchaseHistory.length, 1);

console.log('V8.10 merchant shop: PASS (catalog + atomic purchase + migration)');
