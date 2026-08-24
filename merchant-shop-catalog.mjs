import { FOOD_CATALOG, SKILL_ITEM_CATALOG, foodById, skillItemById } from './content-catalog.mjs';

export const MERCHANT_CATALOG_VERSION = 1;
export const MERCHANT_ID = 'general-merchant';
export const MERCHANT_OFFER_IDS = Object.freeze({
  EMBER_FRUIT: 'merchant:ember-fruit:v1',
  CAPTURE_BALLS: 'merchant:capture-balls:v1',
  TRAINING_CHOW: 'merchant:training-chow:v1',
});

export const MERCHANT_OFFER_CATALOG = Object.freeze({
  [MERCHANT_OFFER_IDS.EMBER_FRUIT]: Object.freeze({
    offerId: MERCHANT_OFFER_IDS.EMBER_FRUIT,
    merchantId: MERCHANT_ID,
    itemId: 'emberFruit',
    category: 'skillItem',
    quantity: 1,
    price: Object.freeze({ currencyId: 'gold', amount: 600 }),
    stockPolicy: Object.freeze({ kind: 'unlimited' }),
    requiresConfirmation: true,
    catalogVersion: MERCHANT_CATALOG_VERSION,
    enabled: true,
    icon: '🍎',
    name: 'ผลไฟ',
    note: 'เรียน Ember (SK_FIRE_01) ถาวร • Fire/Normal Lv.5+',
  }),
  [MERCHANT_OFFER_IDS.CAPTURE_BALLS]: Object.freeze({
    offerId: MERCHANT_OFFER_IDS.CAPTURE_BALLS,
    merchantId: MERCHANT_ID,
    itemId: 'captureBalls',
    category: 'item',
    quantity: 5,
    price: Object.freeze({ currencyId: 'gold', amount: 200 }),
    stockPolicy: Object.freeze({ kind: 'unlimited' }),
    requiresConfirmation: false,
    catalogVersion: MERCHANT_CATALOG_VERSION,
    enabled: true,
    icon: '🔴',
    name: 'ลูกแก้วจับมอน ×5',
    note: 'เพิ่มโอกาสจับมอนสเตอร์',
  }),
  [MERCHANT_OFFER_IDS.TRAINING_CHOW]: Object.freeze({
    offerId: MERCHANT_OFFER_IDS.TRAINING_CHOW,
    merchantId: MERCHANT_ID,
    itemId: 'trainingChow',
    category: 'food',
    quantity: 1,
    price: Object.freeze({ currencyId: 'gold', amount: 150 }),
    stockPolicy: Object.freeze({ kind: 'unlimited' }),
    requiresConfirmation: false,
    catalogVersion: MERCHANT_CATALOG_VERSION,
    enabled: true,
    icon: '🍖',
    name: 'อาหารบำรุง',
    note: 'ใช้ดูแลและฝึกมอนสเตอร์',
  }),
});

const knownCurrencyIds = new Set(['gold']);
const knownInventoryIds = new Set([
  'captureBalls',
  ...Object.keys(FOOD_CATALOG),
]);

function validPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export function merchantOfferById(offerId) {
  return typeof offerId === 'string' ? MERCHANT_OFFER_CATALOG[offerId] ?? null : null;
}

export function validateMerchantOffer(offer, { requireEnabled = false } = {}) {
  const issues = [];
  if (!offer || typeof offer !== 'object' || Array.isArray(offer)) {
    return Object.freeze({ ok: false, issues: Object.freeze(['invalid_offer']) });
  }
  if (typeof offer.offerId !== 'string' || offer.offerId.length === 0) issues.push('invalid_offer_id');
  if (offer.merchantId !== MERCHANT_ID) issues.push('invalid_merchant');
  if (!knownInventoryIds.has(offer.itemId)) issues.push('unknown_item');
  if (!validPositiveInteger(offer.quantity)) issues.push('invalid_quantity');
  if (!offer.price || !knownCurrencyIds.has(offer.price.currencyId)) issues.push('unknown_currency');
  if (!offer.price || !validPositiveInteger(offer.price.amount)) issues.push('invalid_price');
  if (!Number.isSafeInteger(offer.catalogVersion) || offer.catalogVersion < 1) issues.push('invalid_catalog_version');
  if (!offer.stockPolicy || offer.stockPolicy.kind !== 'unlimited') issues.push('unsupported_stock_policy');
  if (requireEnabled && offer.enabled !== true) issues.push('offer_disabled');
  if (offer.category === 'skillItem') {
    const item = skillItemById(offer.itemId);
    if (!item || item.category !== 'skillItem') issues.push('skill_item_contract_missing');
  } else if (offer.category === 'food') {
    if (!foodById(offer.itemId)) issues.push('food_contract_missing');
  }
  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });
}

export function validateMerchantCatalog() {
  const issues = [];
  const seen = new Set();
  for (const offer of Object.values(MERCHANT_OFFER_CATALOG)) {
    if (seen.has(offer.offerId)) issues.push({ code: 'duplicate_offer_id', offerId: offer.offerId });
    seen.add(offer.offerId);
    const result = validateMerchantOffer(offer);
    for (const issue of result.issues) issues.push({ code: issue, offerId: offer.offerId });
  }
  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });
}

export function merchantOffers() {
  return Object.values(MERCHANT_OFFER_CATALOG).filter(offer => offer.enabled === true);
}
