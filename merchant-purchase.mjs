import { merchantOfferById, validateMerchantOffer } from './merchant-shop-catalog.mjs';

export const MERCHANT_PURCHASE_VERSION = 'merchant-purchase/v1';
export const MERCHANT_PURCHASE_COMMAND_LIMIT = 64;
export const MERCHANT_PURCHASE_HISTORY_LIMIT = 32;
export const MERCHANT_INVENTORY_STACK_CAP = 99;

export const MERCHANT_PURCHASE_REASONS = Object.freeze({
  INVALID_STATE: 'invalid_state',
  INVALID_COMMAND_ID: 'invalid_command_id',
  DUPLICATE_COMMAND: 'duplicate_command',
  MERCHANT_NOT_FOUND: 'merchant_not_found',
  OFFER_NOT_FOUND: 'offer_not_found',
  OFFER_DISABLED: 'offer_disabled',
  CATALOG_INVALID: 'catalog_invalid',
  ITEM_NOT_FOUND: 'item_not_found',
  INVALID_QUANTITY: 'invalid_quantity',
  STALE_CATALOG: 'stale_catalog',
  STALE_PRICE: 'stale_price',
  STALE_STATE: 'stale_state',
  INSUFFICIENT_FUNDS: 'insufficient_funds',
  INVENTORY_FULL: 'inventory_full',
  INVALID_OPERATION: 'invalid_operation',
  PERSISTENCE_FAILED: 'persistence_failed',
});

function result(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function validRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function normalizedCommandId(value) {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  return id.length > 0 && id.length <= 128 ? id : null;
}

function validGold(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function normalizeIds(value, limit = MERCHANT_PURCHASE_COMMAND_LIMIT) {
  const seen = new Set();
  const reversed = [];
  for (let i = (Array.isArray(value) ? value.length : 0) - 1; i >= 0 && reversed.length < limit; i -= 1) {
    const id = normalizedCommandId(value[i]);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    reversed.push(id);
  }
  return reversed.reverse();
}

export function normalizeMerchantPurchaseCommandIds(value) {
  return normalizeIds(value);
}

export function normalizeMerchantPurchaseHistory(value) {
  const source = Array.isArray(value) ? value : [];
  const resultRows = [];
  const seen = new Set();
  for (let i = source.length - 1; i >= 0 && resultRows.length < MERCHANT_PURCHASE_HISTORY_LIMIT; i -= 1) {
    const row = validRecord(source[i]);
    const id = normalizedCommandId(row?.commandId);
    if (!row || !id || seen.has(id)) continue;
    if (row.transactionVersion !== MERCHANT_PURCHASE_VERSION
      || typeof row.offerId !== 'string'
      || typeof row.itemId !== 'string'
      || !Number.isSafeInteger(row.quantity) || row.quantity <= 0
      || row.currencyId !== 'gold'
      || !Number.isSafeInteger(row.unitPrice) || row.unitPrice <= 0
      || !Number.isSafeInteger(row.totalPrice) || row.totalPrice <= 0
      || !Number.isSafeInteger(row.catalogVersion) || row.catalogVersion < 1
      || !Number.isSafeInteger(row.purchasedAt) || row.purchasedAt < 0) continue;
    seen.add(id);
    resultRows.push(Object.freeze({ ...row, commandId: id }));
  }
  return resultRows.reverse();
}

function operationMatches(resolved, operation) {
  const expected = resolved.operation;
  return operation?.version === expected.version
    && operation.commandId === expected.commandId
    && operation.offerId === expected.offerId
    && operation.itemId === expected.itemId
    && operation.quantity === expected.quantity
    && operation.grantQuantity === expected.grantQuantity
    && operation.currencyId === expected.currencyId
    && operation.unitPrice === expected.unitPrice
    && operation.totalPrice === expected.totalPrice
    && operation.goldBefore === expected.goldBefore
    && operation.itemQuantityBefore === expected.itemQuantityBefore
    && operation.catalogVersion === expected.catalogVersion
    && operation.purchasedAt === expected.purchasedAt;
}

export function resolveMerchantPurchase({ state, offerId, quantity = 1, commandId, expectedCatalogVersion, expectedUnitPrice, expectedCurrencyId, expectedGoldBefore, expectedItemQuantityBefore, purchasedAt = Date.now() } = {}) {
  const source = validRecord(state);
  if (!source || !validRecord(source.wallet) || !validRecord(source.inventory)) return result(false, MERCHANT_PURCHASE_REASONS.INVALID_STATE);
  const normalizedId = normalizedCommandId(commandId);
  if (!normalizedId) return result(false, MERCHANT_PURCHASE_REASONS.INVALID_COMMAND_ID);
  const commandIds = normalizeMerchantPurchaseCommandIds(source.merchantPurchaseCommandIds);
  if (commandIds.includes(normalizedId)) return result(false, MERCHANT_PURCHASE_REASONS.DUPLICATE_COMMAND, { commandId: normalizedId });
  const offer = merchantOfferById(offerId);
  if (!offer) return result(false, MERCHANT_PURCHASE_REASONS.OFFER_NOT_FOUND, { offerId: offerId ?? null });
  if (offer.merchantId !== 'general-merchant') return result(false, MERCHANT_PURCHASE_REASONS.MERCHANT_NOT_FOUND, { merchantId: offer.merchantId });
  if (offer.enabled !== true) return result(false, MERCHANT_PURCHASE_REASONS.OFFER_DISABLED, { offerId });
  if (!validateMerchantOffer(offer, { requireEnabled: true }).ok) return result(false, MERCHANT_PURCHASE_REASONS.CATALOG_INVALID, { offerId });
  if (quantity !== 1) return result(false, MERCHANT_PURCHASE_REASONS.INVALID_QUANTITY, { quantity });
  if (expectedCatalogVersion !== offer.catalogVersion) return result(false, MERCHANT_PURCHASE_REASONS.STALE_CATALOG, { expectedCatalogVersion, catalogVersion: offer.catalogVersion });
  if (expectedUnitPrice !== offer.price.amount) return result(false, MERCHANT_PURCHASE_REASONS.STALE_PRICE, { expectedUnitPrice, unitPrice: offer.price.amount });
  if (expectedCurrencyId !== offer.price.currencyId) return result(false, MERCHANT_PURCHASE_REASONS.STALE_PRICE, { expectedCurrencyId, currencyId: offer.price.currencyId });
  const goldBefore = source.wallet.gold;
  const itemQuantityBefore = source.inventory[offer.itemId];
  if (!validGold(goldBefore) || !Number.isSafeInteger(itemQuantityBefore) || itemQuantityBefore < 0) return result(false, MERCHANT_PURCHASE_REASONS.INVALID_STATE);
  if (expectedGoldBefore !== goldBefore || expectedItemQuantityBefore !== itemQuantityBefore) return result(false, MERCHANT_PURCHASE_REASONS.STALE_STATE);
  if (goldBefore < offer.price.amount) return result(false, MERCHANT_PURCHASE_REASONS.INSUFFICIENT_FUNDS, { gold: goldBefore, required: offer.price.amount });
  if (itemQuantityBefore > MERCHANT_INVENTORY_STACK_CAP - offer.quantity) return result(false, MERCHANT_PURCHASE_REASONS.INVENTORY_FULL);
  if (!Number.isSafeInteger(purchasedAt) || purchasedAt < 0) return result(false, MERCHANT_PURCHASE_REASONS.INVALID_STATE, { field: 'purchasedAt' });
  const operation = Object.freeze({
    version: MERCHANT_PURCHASE_VERSION,
    commandId: normalizedId,
    offerId: offer.offerId,
    itemId: offer.itemId,
    quantity: 1,
    grantQuantity: offer.quantity,
    currencyId: offer.price.currencyId,
    unitPrice: offer.price.amount,
    totalPrice: offer.price.amount,
    goldBefore,
    itemQuantityBefore,
    catalogVersion: offer.catalogVersion,
    purchasedAt,
  });
  return result(true, null, { offer, operation });
}

export function applyMerchantPurchase({ state, operation } = {}) {
  if (!validRecord(operation) || operation.version !== MERCHANT_PURCHASE_VERSION) return result(false, MERCHANT_PURCHASE_REASONS.INVALID_OPERATION);
  const resolved = resolveMerchantPurchase({
    state,
    offerId: operation.offerId,
    quantity: operation.quantity,
    commandId: operation.commandId,
    expectedCatalogVersion: operation.catalogVersion,
    expectedUnitPrice: operation.unitPrice,
    expectedCurrencyId: operation.currencyId,
    expectedGoldBefore: operation.goldBefore,
    expectedItemQuantityBefore: operation.itemQuantityBefore,
    purchasedAt: operation.purchasedAt,
  });
  if (!resolved.ok) return resolved;
  if (!operationMatches(resolved, operation)) return result(false, MERCHANT_PURCHASE_REASONS.STALE_STATE);
  const nextState = {
    ...state,
    wallet: { ...state.wallet, gold: operation.goldBefore - operation.totalPrice },
    inventory: { ...state.inventory, [operation.itemId]: operation.itemQuantityBefore + operation.grantQuantity },
    merchantPurchaseCommandIds: normalizeMerchantPurchaseCommandIds([
      ...normalizeMerchantPurchaseCommandIds(state.merchantPurchaseCommandIds),
      operation.commandId,
    ]),
    merchantPurchaseHistory: normalizeMerchantPurchaseHistory([
      ...normalizeMerchantPurchaseHistory(state.merchantPurchaseHistory),
      {
        transactionVersion: MERCHANT_PURCHASE_VERSION,
        commandId: operation.commandId,
        merchantId: resolved.offer.merchantId,
        offerId: operation.offerId,
        itemId: operation.itemId,
        quantity: operation.grantQuantity,
        currencyId: operation.currencyId,
        unitPrice: operation.unitPrice,
        totalPrice: operation.totalPrice,
        catalogVersion: operation.catalogVersion,
        purchasedAt: operation.purchasedAt,
      },
    ]),
  };
  return result(true, null, { nextState, operation, receipt: nextState.merchantPurchaseHistory.at(-1), purchased: operation.grantQuantity });
}

export function commitMerchantPurchase({ state, command, persistCandidate } = {}) {
  if (typeof persistCandidate !== 'function') return result(false, MERCHANT_PURCHASE_REASONS.INVALID_STATE);
  const resolved = resolveMerchantPurchase({ state, ...command });
  if (!resolved.ok) return result(false, resolved.reason, { stage: 'resolve', ...resolved });
  const applied = applyMerchantPurchase({ state, operation: resolved.operation });
  if (!applied.ok) return result(false, applied.reason, { stage: 'apply', ...applied });
  let persisted;
  try {
    persisted = persistCandidate(applied.nextState, applied);
    if (!persisted || persisted.ok !== true) throw new Error('persistence_adapter_rejected');
  } catch (error) {
    return result(false, MERCHANT_PURCHASE_REASONS.PERSISTENCE_FAILED, {
      stage: 'persist', errorName: error?.name ?? 'Error', commandId: resolved.operation.commandId,
    });
  }
  return result(true, null, { stage: 'persisted', ...applied, persisted });
}

export function merchantPurchaseDiagnostics(state = {}) {
  const issues = [];
  if (!validRecord(state.wallet) || !validGold(state.wallet.gold)) issues.push(Object.freeze({ code: 'invalid_wallet' }));
  for (const id of normalizeMerchantPurchaseCommandIds(state.merchantPurchaseCommandIds)) {
    if (!id) issues.push(Object.freeze({ code: 'invalid_command_id' }));
  }
  return Object.freeze(issues);
}
