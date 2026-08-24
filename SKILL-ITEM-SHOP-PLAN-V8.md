# SKILL ITEM SHOP PLAN V8 — ขาย `emberFruit` ในร้านค้าพ่อค้า

> แผนต่อยอดระบบ Skill Item: เพิ่ม `emberFruit` เป็นสินค้าที่ซื้อด้วย Gold ในเกม โดยการหักเงินและเพิ่มไอเทมต้องสำเร็จหรือยกเลิกพร้อมกัน

## สถานะและฐานอ้างอิง

- สถานะ: **IMPLEMENTED + FULL CI PASS** — visual browser sign-off ยังไม่ได้ทำใน Termux
- Working repository: `nustanakritwithai/PocketMonster`
- Base ที่ตรวจ: branch `codex/v89-skill-item-customization`, HEAD `e373d35`
- แผนต้นทางของระบบไอเทม: `SKILL-ITEM-CUSTOMIZATION-PLAN-V8.md`
- Source of truth: `/storage/emulated/0/Download/Monster_Life_RPG_Development_Plan_TH_v4_V7.0.6_Synced.docx`
- เอกสารประกอบด้าน economy: `/storage/emulated/0/Download/Monster_Life_RPG_Master_Development_Plan_Rebalanced_V8_Expanded.docx`
- Ring 0/Ring 1, Prototype Baseline V7.0.6, save gates และ architecture gates จากเอกสารหลักยังมีอำนาจเหนือแผนนี้
- Monster Life RPG เป็นคนละโครงการกับ Legend of Soul; ห้ามใช้ repository, owner lock, branch หรือ provenance ของ Legend of Soul กับงานนี้

### Implementation Record — 2026-08-24

- เพิ่ม `merchant-shop-catalog.mjs` และ `merchant-purchase.mjs` สำหรับ catalog validation, copy-on-write purchase, persist-first commit, replay guard และ receipt history
- เพิ่ม Gold wallet, migration `merchant-wallet-purchase-v15`, schema/instance version 15 และ idempotent legacy/current normalization
- เชื่อม `emberFruit` ราคา 600 Gold, Capture Ball bundle ×5 ราคา 200 และ Training Chow ราคา 150 เข้าร้านค้าจริง
- เพิ่ม deterministic stage Gold reward, HUD/merchant wallet UI และคง `emberFruit` เดิมของ legacy saves; new game เริ่มผลไฟ 1 ชิ้น
- ปิด free food faucet; Capture Ball emergency refill ทำงานเฉพาะ 0 → 5; Heal ยังฟรี; `hpPotion` ไม่ถูกแสดงขาย
- เพิ่ม `tests/v89-merchant-shop.mjs` และผูก `test:v89:merchant-shop` เข้า CI
- `npm run ci`: PASS; `npm run manifest`: PASS; `git diff --check`: PASS; `index.html`/`v800.html` parity: PASS

### เงื่อนไขก่อนเริ่ม implementation

Working tree ปัจจุบันมีงาน Skill Item ที่ยังไม่รวมเป็นฐานสะอาด การทำร้านค้าต้องเริ่มหลังจากงานนั้นผ่าน review/test และถูกจัดเป็นฐานที่ระบุได้ชัดเจนแล้ว เพื่อไม่ให้ shop, Skill Item และไฟล์อื่นที่ไม่เกี่ยวข้องปะปนใน commit เดียว

ไฟล์ `MONSTER-AI-PLAN-V8.md` เป็นงานอื่นและอยู่นอกขอบเขต ห้ามแก้หรือรวมโดยอัตโนมัติ

## Codex Design Verdict E0

คำว่า “มีขายในร้านค้า” ในแผนนี้หมายถึงการซื้อจริงในเศรษฐกิจ local prototype:

- ใช้ **Gold ซึ่งเป็น soft currency ในเกม**
- ซื้อสำเร็จแล้ว Gold ลด และ `inventory.emberFruit` เพิ่มใน transaction เดียว
- ซื้อไม่สำเร็จต้องไม่เสีย Gold และไม่ได้ไอเทม
- ไม่ใช้เงินจริง, payment gateway, gacha, premium currency หรือ IAP
- Gold และร้านค้า local ไม่ถือว่า cheat-proof ผู้เล่นที่แก้ local save เองยังเปลี่ยนค่าได้
- trusted/server-authoritative economy และ VPS reconciliation เป็นงานคนละเฟส ห้ามทำให้ local transaction แสร้งว่าเป็น server-trusted
- flow เดิมที่แสดงราคาแต่เพิ่มของฟรี **ไม่ผ่าน** ความหมายของ “ขาย” และต้องถูกแทนที่ ไม่ใช่คงไว้หลังปุ่มซื้อ

Verdict นี้ล็อก architecture สำหรับแผน ส่วนราคาและ reward curve ต้องผ่าน Balance Gate B1 ก่อนลง source

## Baseline Gap ที่ตรวจพบ

### ร้านค้าปัจจุบัน

- `game-v800.js` มี `MERCHANT_STOCK` สำหรับ `hpPotion`, `captureBalls`, `trainingChow`
- `renderMerchantShop()` เพิ่มจำนวนไอเทมทันทีด้วย `state.inventory[item.id] += 1`
- โค้ดไม่ตรวจหรือหักเงิน แม้ UI แสดงราคา
- callback แก้ live state ก่อน `saveGame(false)` จึงไม่รับประกัน rollback หาก persistence ล้มเหลว
- ไม่มี command id/replay guard; double tap อาจเพิ่มของหลายครั้ง
- `hpPotion` ไม่มี canonical key ใน normalized inventory ปัจจุบัน จึงไม่ควรขายต่อจนมี item/use contract ที่ตรวจสอบได้
- `refillFoodBtn` แจกอาหารทุกชนิดรวม `emberFruit +3` ได้ซ้ำไม่จำกัด และ `refillBallsBtn` เพิ่ม Capture Ball +5 ได้ซ้ำ จึงเป็น debug faucets ที่ทำให้สินค้ามีราคาแต่ไม่มีความหมายทาง economy

### Economy และ save ปัจจุบัน

- state/save schema ยังไม่มี wallet, Gold หรือ currency ledger
- schema ปัจจุบันที่ตรวจคือ version 14; รุ่น implementation ต้องใช้ **current schema + 1** ไม่ hardcode 15 หากฐานเปลี่ยนก่อนเริ่มงาน
- stage first-clear rewards ปัจจุบันเพิ่มทุก field เข้า `state.inventory` โดยตรง จึงห้ามใส่ `gold` ปนใน reward object เดิม
- `emberFruit` มี canonical inventory key และ Skill Item mapping ไป `SK_FIRE_01` แล้ว
- new game และ normalized legacy save มี `emberFruit: 2`; แผนร้านค้าจะไม่ลบของเดิมเพื่อหลีกเลี่ยง regression และ save incompatibility
- ระบบรักษาที่ Ranch/NPC ต้องยังฟรีตาม Ring 0/Ring 1
- capture safety floor ที่มีอยู่ต้องยังทำงาน และการซื้อของต้องไม่แก้จำนวน Capture Ball ทางอ้อม

### UI ปัจจุบัน

- merchant panel มีรายการสินค้าและปุ่มซื้อ แต่ไม่มียอด Gold
- footer ระบุว่าระบบเหรียญจริงจะเชื่อม server ภายหลัง ซึ่งไม่ตรงกับ local soft-currency scope ใหม่
- ไม่มีสถานะ insufficient funds, pending, persisted success หรือ persistence failure

## เป้าหมาย

1. `emberFruit` ปรากฏในร้านพ่อค้าเป็นสินค้าจริง
2. รายการสินค้าทั้งหมดที่ยังแสดงขายต้องผ่าน purchase domain เดียวกัน ห้ามมีบางรายการหัก Gold และบางรายการแจกฟรี
3. ซื้อสำเร็จหนึ่งครั้งต้องลด Gold ตามราคาที่ catalog ระบุและเพิ่มไอเทมตามจำนวนที่ระบุพอดี
4. validation, stale UI, double tap, เงินไม่พอ, inventory ผิดรูป หรือ local save ล้มเหลว ต้องไม่เปลี่ยน live state
5. wallet, replay guard และประวัติซื้อที่จำเป็นต้อง save/reload ได้อย่างปลอดภัย
6. ผู้เล่นนำ `emberFruit` ที่ซื้อไปใช้กับ flow Skill Item เดิม และใช้ `SK_FIRE_01` ใน combat ได้จริง
7. ราคาและแหล่ง Gold ต้องทำให้ไอเทมนี้เป็นตัวเลือกการปรับแต่ง ไม่ใช่ paywall ของ Raising Loop
8. ร้านค้าต้องใช้งานได้ทั้ง desktop และ mobile bottom sheet พร้อมข้อความภาษาไทยที่เข้าใจได้

## ไม่อยู่ในขอบเขต

-เงินจริง, Premium Currency, IAP, payment receipt หรือ marketplace ระหว่างผู้เล่น
- server-authoritative wallet, anti-cheat หรือ VPS settlement
- ระบบขายคืนสินค้า, trade, auction, gifting หรือ refund หลังซื้อสำเร็จ
- timed stock, daily reset, real-time clock หรือ rotating shop
- เปลี่ยนสูตร Heal, Capture, Training, Skill Item หรือ Combat
- เพิ่มผลของ `hpPotion` แบบเดาเอง
- ลด/ลบ `emberFruit` ที่ผู้เล่นเดิมมีอยู่
- ผูกการซื้อไอเทมกับมอนสเตอร์ตัวใดตัวหนึ่ง; inventory ยังคงเป็นของผู้เล่น
- เปลี่ยน `emberFruit` เป็นอาหาร Body/Mind

## Player Flow

```text
เริ่มเกมด้วย 300 Gold
→ เคลียร์ Grass Meadow ครั้งแรก รับ 300 Gold
→ เข้าใกล้พ่อค้า
→ เปิดร้านและเห็นยอด Gold
→ เลือก emberFruit ราคา 600 Gold
→ อ่านผล: เรียน Ember / SK_FIRE_01 ถาวร, Fire หรือ Normal Lv.5+
→ กดยืนยันซื้อ 1 ชิ้น
→ validate catalog + wallet + inventory + snapshot
→ สร้าง candidate state แบบ copy-on-write
→ persist local candidate สำเร็จ
→ publish live state
→ UI แสดง Gold ใหม่และ emberFruit +1
```

หลังจากนั้นผู้เล่นไป Character Manager เพื่อเลือกมอนสเตอร์/สล็อตและใช้ไอเทมผ่าน transaction ของ Skill Item เดิม การซื้อกับการกินเป็นคนละ transaction เพื่อให้ผู้เล่นซื้อเก็บไว้ได้

## Shop Catalog Contract

สร้าง catalog แยกจาก DOM และแยกจาก `SKILL_ITEM_CATALOG` เพราะ “สินค้าในร้าน” กับ “ผลของไอเทม” เป็นคนละความรับผิดชอบ:

```js
export const MERCHANT_OFFER_CATALOG = Object.freeze({
  'merchant:ember-fruit:v1': Object.freeze({
    offerId: 'merchant:ember-fruit:v1',
    merchantId: 'general-merchant',
    itemId: 'emberFruit',
    category: 'skillItem',
    quantity: 1,
    price: Object.freeze({ currencyId: 'gold', amount: 600 }),
    stockPolicy: Object.freeze({ kind: 'unlimited' }),
    requiresConfirmation: true,
    catalogVersion: 1,
    enabled: true,
  }),
});
```

### กฎ catalog

- `offerId` เป็น stable identity ของข้อเสนอ ห้ามใช้ชื่อแสดงผลหรือ array index
- `itemId` ต้องเป็น inventory key ที่ canonical และ resolve ได้จาก item/skill-item catalog
- `emberFruit` ต้องยัง map ไป `SK_FIRE_01`; shop ห้ามคัดลอก skill definition หรือ combat effect
- `quantity` และราคาเป็น integer บวก
- `currencyId` รุ่นแรกอนุญาตเพียง `gold`
- `catalogVersion` และราคาต้องถูก snapshot ในคำสั่งซื้อเพื่อป้องกัน stale UI
- offer ที่ไม่ผ่าน validation ต้องไม่ render และต้องรายงาน diagnostic
- Common `emberFruit` ใช้ stock แบบ unlimited โดยให้ Gold เป็น limiter; ไม่เพิ่ม timer/restock state
- ซื้อได้ครั้งละ 1 ชิ้นในรุ่นแรก เพื่อลด double-tap/quantity edge cases
- inventory stack ใช้เพดานเดียวกันทั้งเกม; ถ้ายังไม่มี canonical cap ให้กำหนด `99` และ reject ก่อนหัก Gold เมื่อเต็ม
- `hpPotion` ต้องถูกถอดจากรายการที่ซื้อได้หรือปิด `enabled` จนกว่าจะมี canonical inventory/use contract
- `captureBalls` และ `trainingChow` จะคงในร้านได้ก็ต่อเมื่อย้ายมาผ่าน transaction เดียวกัน ห้ามใช้ callback แจกฟรีเดิม

## Wallet Contract

เพิ่ม state ที่ serializable:

```js
wallet: {
  gold: 300,
}
```

Invariant:

- `wallet` เป็น plain object และ `gold` เป็น safe integer ตั้งแต่ 0 ขึ้นไป
- ห้ามเก็บ Gold ใน `inventory`
- UI อ่านยอดจาก state แต่ไม่มีสิทธิ์แก้ state โดยตรง
- domain transaction เท่านั้นที่หัก Gold
- Gold ที่แสดงต้องมาจาก state snapshot เดียวกับปุ่มซื้อ
- overflow, `NaN`, float, negative, string หรือ missing field ต้อง fail closed พร้อม diagnostic

### Migration seed

- new game เริ่มด้วย **300 Gold** เป็นค่าตั้งต้นเสนอสำหรับ prototype
- save รุ่นก่อน wallet migration และยังไม่มี wallet ได้รับ 300 Gold เพียงครั้งเดียว
- save ที่ระบุว่า migrate ผ่านแล้วแต่ wallet หาย/เสียหาย ห้ามแจก 300 ใหม่ซ้ำ; normalize เป็นค่าปลอดภัยและรายงาน diagnostic
- ค่าปลอดภัยสำหรับ current-schema wallet ที่หาย, ติดลบ, ไม่ใช่ integer หรือเกิน safe integer คือ `gold: 0`; ห้ามคำนวณยอดจาก purchase history ย้อนหลัง
- migration ต้อง idempotent: normalize/reload ซ้ำไม่เพิ่ม Gold

## Balance Gate B1

ค่าตั้งต้นเสนอให้ test ก่อน lock:

| รายการ | ราคา/รางวัลเสนอ | เหตุผล |
|---|---:|---|
| `captureBalls` ×5 | 200 Gold | เป็น convenience bundle; safety floor ยังแยกจากร้าน |
| `trainingChow` ×1 | 150 Gold | item ใช้แล้วหมดและไม่ให้สกิลถาวร |
| `emberFruit` ×1 | 600 Gold | ให้ความสามารถถาวร จึงแพงกว่า consumable พื้นฐาน |
| new/legacy migration seed | 300 Gold | ยังซื้อผลไม้ไม่ได้ทันที แต่รวมกับ first clear แรกแล้วซื้อได้หนึ่งชิ้น |
| first clear แต่ละ stage ที่ active | 300 Gold | รายได้ deterministic; ยังไม่เพิ่ม per-kill farming ก่อนมี telemetry |

ข้อกำหนด balance ก่อน Codex เปิด implementation:

- ผู้เล่นใหม่ซื้อ `emberFruit` ได้หนึ่งชิ้นหลังเคลียร์ `grass-meadow` ครั้งแรกโดยไม่ต้องจ่ายเงินจริง: seed 300 + first clear 300 = 600
- stage currency reward ต้องใช้ catalog/field แยก เช่น `STAGE_CURRENCY_REWARD_PROFILES`; ห้ามทำให้ `inventory.gold` เกิดขึ้น
- reward ครั้งแรกต้อง grant ได้ครั้งเดียวและ persist ด้วย transaction/recovery rule เดิมของ stage clear
- battle-farm Gold, sell loop และ quest Gold เป็น economy follow-up; ถ้าเพิ่มในงานนี้ต้องมี anti-inflation simulation แยกและ Codex ขยาย allowlist ก่อน
- Heal ที่ Ranch/NPC ยังคงราคา 0
- `refillBallsBtn` ต้องเป็น safety floor เท่านั้น: เมื่อเหลือ 0 จึงตั้งเป็น 5; ห้าม `+5` ซ้ำไม่จำกัดและห้ามหัก Gold
- ถอด `refillFoodBtn` และ handler ออกจาก production UI; เครื่องมือเติมของสำหรับนักพัฒนาถ้าต้องการให้ทำเป็นงานแยกที่มี explicit dev-build gate ห้ามแจก `emberFruit`/`trainingChow` ซ้ำไม่จำกัดใน build ปกติ
- ไม่มีด่านหรือ Raising Loop ใดบังคับให้ซื้อ `emberFruit`
- ผู้เล่นที่ไม่ซื้อยังเล่น/เคลียร์ได้ด้วยสกิลตามปกติ
- existing saves ต้องรักษาจำนวน `emberFruit` เดิมทุกค่า รวมผู้เล่นที่มี 2 ชิ้นขึ้นไป
- new game เปลี่ยน tutorial grant จาก `emberFruit: 2` เป็น `emberFruit: 1`; legacy save ที่มี field อยู่แล้วห้ามถูกลดหรือ reset
- legacy save ที่ไม่มี field `emberFruit` รับ tutorial seed 1 ครั้ง; current-schema save ที่ field หาย/เสียหายให้ fail closed เป็น 0 พร้อม diagnostic ไม่ reset เป็น 1 ทุก reload
- Ember Valley first clear ยังคงให้ `emberFruit +1` เป็น exploration/progression source ที่มีเพดานครั้งเดียว

ตัวเลข 600/300 เป็น proposed lock ไม่ใช่ข้ออ้างให้ hardcodeหลายจุด หลัง B1 ผ่าน ราคาและ seed ต้องอยู่ catalog/config จุดเดียวและ tests อ่านจากจุดนั้น ราคา `emberFruit` ให้ playtest bracket 450/600/750 แต่ baseline คือ 600 จนกว่าจะมีหลักฐานเปลี่ยน

## Purchase Transaction

แยก `merchant-shop-catalog.mjs` (ข้อมูล/validation ของ offer) ออกจาก `merchant-purchase.mjs` (resolve/apply/commit) เพื่อไม่ให้ DOM หรือ runtime เป็น authority ของราคา:

```text
resolveMerchantPurchase(command, state)
→ applyMerchantPurchase(operation, state) แบบ copy-on-write
→ persistCandidate(nextState)
→ publish nextState เมื่อ persist สำเร็จเท่านั้น
→ cloud sync แบบ follow-up ตาม adapter เดิม
```

### Command

```js
{
  commandId: 'shop:<timestamp>:<sequence>',
  merchantId: 'general-merchant',
  offerId: 'merchant:ember-fruit:v1',
  quantity: 1,
  expectedCatalogVersion: 1,
  expectedUnitPrice: 600,
  expectedCurrencyId: 'gold',
  expectedGoldBefore: 600,
  expectedItemQuantityBefore: 1,
  purchasedAt: 1787443200000,
}
```

### Validation order

1. state, wallet และ inventory มีรูปแบบถูกต้อง
2. `commandId` ถูกต้องและไม่เคย commit
3. merchant/offer มีอยู่ เปิดใช้งาน และ catalog contract ถูกต้อง
4. item key เป็น canonical และซื้อเก็บได้
5. quantity เท่ากับ 1
6. catalog version, currency และ unit price ตรงกับ snapshot จาก UI
7. Gold/item quantity ปัจจุบันตรงกับ expected snapshot; ไม่ตรงให้ตอบ `stale_state`
8. Gold เพียงพอ
9. stack หลังซื้อไม่เกิน cap
10. timestamp เป็น integer ที่ใช้บันทึก provenance ได้

### Atomic apply

เมื่อ validation ผ่านเท่านั้น:

- clone เฉพาะ state branches ที่เปลี่ยน
- `nextState.wallet.gold = goldBefore - totalPrice`
- `nextState.inventory[itemId] = itemQuantityBefore + 1`
- เพิ่ม `commandId` ใน bounded replay ledger
- เพิ่ม receipt ใน bounded purchase history
- ห้ามแก้ input/live state

### Persist-first commit boundary

- caller ส่ง `persistCandidate(nextState)` เข้า commit function
- persistence adapter ต้องคืน `{ ok: true, envelope }` เมื่อ `writeStoredSave()` สำเร็จ และคืน `{ ok: false, reason }` หรือ throw เมื่อไม่สำเร็จ; commit ห้ามถือว่า `false`, `null` หรือผลลัพธ์ไม่ตรง contract เป็น success
- ถ้า persist throw/return failure: คืน state เดิม, Gold เดิม, inventory เดิม และไม่ publish receipt
- ถ้า local persist สำเร็จ: publish candidate เป็น live stateครั้งเดียว แล้ว render ใหม่
- cloud save ทำหลัง local commit ตาม policy ปัจจุบัน; cloud failure ไม่ย้อน local purchase ที่ commit แล้ว แต่ต้องแจ้ง/queue ตาม sync adapter เดิม
- UI disable ปุ่มเฉพาะ transaction ที่กำลังทำ แต่ replay ledger ยังเป็นตัวป้องกันหลัก
- callback retry ด้วย `commandId` เดิมต้องไม่หักเงินหรือเพิ่มของซ้ำ

### Failure reasons ขั้นต่ำ

```text
invalid_state
invalid_command_id
duplicate_command
merchant_not_found
offer_not_found
offer_disabled
catalog_invalid
item_not_found
invalid_quantity
stale_catalog
stale_price
stale_state
insufficient_funds
inventory_full
invalid_operation
persistence_failed
```

ทุก failure ต้องคืนข้อมูลพอให้ UI แสดงเหตุผล แต่ห้ามคืน candidate ที่ caller เผลอ publish ได้

## Receipt, Replay และ Provenance

เพิ่ม state ที่จำกัดขนาด:

```js
merchantPurchaseCommandIds: [], // เก็บล่าสุดไม่เกิน 64
merchantPurchaseHistory: [],    // receipt ล่าสุดไม่เกิน 32
```

ตัวอย่าง receipt:

```js
{
  transactionVersion: 'merchant-purchase/v1',
  commandId: 'shop:...',
  merchantId: 'general-merchant',
  offerId: 'merchant:ember-fruit:v1',
  offerCatalogVersion: 1,
  itemId: 'emberFruit',
  quantity: 1,
  currencyId: 'gold',
  unitPrice: 600,
  totalPrice: 600,
  purchasedAt: 1787443200000,
}
```

กฎ:

- history เป็น diagnostic/provenance ของ local prototype ไม่ใช่หลักฐานการเงินจริง
- scalar inventory ไม่สามารถบอกได้ว่าผลไม้แต่ละลูกมาจาก reward หรือร้าน จึงห้ามสร้าง provenance รายชิ้นแบบเทียม
- เมื่อใช้ `emberFruit` สำเร็จ provenance ของสกิลยังมาจาก Skill Item transaction เดิม (`sourceKind: skillItem`, `sourceItemId: emberFruit`)
- normalization ต้อง deduplicate command ids, จำกัด history, drop receipt เสียหายพร้อม diagnostic และไม่แก้ยอด Gold จาก history ย้อนหลัง

## Save และ Migration

รุ่น implementation เพิ่ม schema จาก version ปัจจุบันขึ้น 1 และเพิ่ม migration id ที่ stable เช่น `merchant-wallet-purchase-v15` หากฐานยังอยู่ version 14 ตอนเริ่มจริง

สิ่งที่ต้อง normalize/persist:

- `wallet.gold`
- `merchantPurchaseCommandIds`
- `merchantPurchaseHistory`
- stage currency first-clear provenance หากเพิ่ม reward ใน scope

Migration rules:

- อ่าน source schema version ก่อน canonical normalization เพื่อแยก legacy migration กับ corrupted current save
- legacy save ที่ไม่มี wallet รับ seed เพียงครั้งเดียว
- legacy inventory เดิมและ Skill Item provenance ห้ามเปลี่ยน
- invalid wallet ต้องไม่ทำให้ load crash
- migration ซ้ำต้องได้ state เท่าเดิม
- save/backup ทั้งสองต้องใช้ schema เดียวกัน
- sanitization ห้าม persist UI pending state, selected button หรือ in-flight promise
- local write ยังคง backup-before-current ตาม save adapter เดิม
- โหลด save/migrate/validate ให้เสร็จก่อน render scene/shop

## Stage Gold Source

ห้ามนำ `gold` ไปใส่ใน `STAGE_REWARD_PROFILES` รูปแบบปัจจุบัน เพราะ `completeStageClear()` loop ทุก key เข้า inventory

แนวทางที่อนุญาต:

```js
stageRewards(stageId) => {
  inventory: { captureBalls: 5, ... },
  currencies: { gold: 250 },
}
```

หรือเพิ่ม resolver `stageCurrencyRewards(stageId)` แยก โดยทั้งสองแนวทางต้อง:

- preserve reward/item output เดิม
- apply item + Gold ใน candidate เดียว
- record first-clear reward envelope เดียว
- persist ก่อน publish หาก refactor stage clear transaction ใน scope
- recovery/reload ห้าม grant ซ้ำ
- UI แสดง Gold แยกจากชื่อ inventory item

หากการ refactor stage reward กว้างเกิน allowlist ให้ส่งเป็น follow-up economy task และใช้ migration/new-game seed เป็นแหล่ง Gold สำหรับ shop prototype ก่อน แต่ release gate ต้องบันทึกชัดว่า recurring economy ยังไม่เสร็จ

## Merchant UI

### Header

- แสดงยอดแบบ dynamic เช่น `Gold: 600` จาก wallet snapshot
- ระบุว่าเป็น “Gold ในเกม” ไม่ใช่เงินจริง
- เปลี่ยน footer เดิมที่พูดถึง “เหรียญจริง/เซิร์ฟเวอร์ภายหลัง” ให้ตรงกับ local prototype

### `emberFruit` card

แสดงข้อมูลอย่างน้อย:

- ชื่อ: ผลเพลิง (`emberFruit`)
- ผล: เรียน Ember (`SK_FIRE_01`) ถาวรเมื่อใช้สำเร็จ
- เงื่อนไขใช้: Fire หรือ Normal, Lv.5+
- จำนวนที่มีในกระเป๋า
- ราคา 600 Gold
- badge `Skill Item`
- ปุ่ม “ซื้อ 1”

### Interaction

- กดซื้อ Skill Item แล้วแสดง confirm ที่บอกราคาและยอดคงเหลือหลังซื้อ
- confirm เป็นการซื้อเข้ากระเป๋า ไม่ใช่การเลือกมอนสเตอร์หรือกินทันที
- insufficient funds/inventory full/offer changed ต้อง disable หรือ reject พร้อมข้อความไทย
- ระหว่าง commit ปุ่มเป็น pending และกดซ้ำไม่ได้
- success อัปเดต Gold, inventory quantity และข้อความ status โดยไม่ต้องปิดร้าน
- persistence failure แสดงว่า “ซื้อไม่สำเร็จ — Gold และไอเทมไม่เปลี่ยน”
- UI ห้ามเขียน `state.inventory` หรือ `state.wallet` โดยตรง
- ใช้ `aria-live` สำหรับผลการซื้อและมี accessible label ที่รวมชื่อ/ราคา
- touch target อย่างน้อย 48×48 CSS px และทดสอบ bottom sheet ที่ความกว้าง 360 px

## Runtime Integration Boundary

ร้านค้ารับผิดชอบเพียงการแลก Gold เป็น inventory item:

```text
Merchant Shop
  → wallet -600 / inventory.emberFruit +1
Character Manager
  → inventory.emberFruit -1 / monster learns SK_FIRE_01
Combat Adapter
  → reads canonical learned skill and executes it
```

- shop ห้ามเรียก `learnSkill()`, เลือกสล็อต หรือแก้ monster record
- Skill Item flow ห้ามรู้ราคา/merchant offer
- combat ห้ามรู้ wallet หรือ purchase history
- integration test เชื่อมสามขอบเขต แต่ production modules ยังแยกกัน

## Implementation Phases

### S0 — Ownership/Base Gate

- review และจัดฐาน Skill Item ให้ชัดเจน
- บันทึก HEAD/base และตรวจ dirty worktree
- Codex ยืนยัน exact allowlist และเปิด `OPEN SHOP-S1`
- lock proposed price/seed/reward curve ที่ Balance Gate B1

### S1 — Pure Catalog และ Purchase Domain

- เพิ่ม `merchant-shop-catalog.mjs` และ cross-validator กับ canonical item catalog
- เพิ่ม `merchant-purchase.mjs` สำหรับ transaction โดยไม่ผูก DOM
- เพิ่ม wallet invariant, resolver, copy-on-write apply และ persist-first commit
- เพิ่ม replay ledger/receipt normalization/diagnostics
- เขียน unit + mutation tests ก่อน wiring UI

### S2 — Save/Migration และ Reward Source

- increment schema current + 1
- เพิ่ม migration seed แบบ idempotent
- persist wallet/ledger/history
- เพิ่ม Grass Meadow first-clear +300 Gold และ flat +300 สำหรับ active stage reward profiles โดยไม่ปน inventory
- ทดสอบ current, legacy, backup และ corrupted saves

### S3 — Live Merchant Wiring

- แทน `MERCHANT_STOCK`/inline mutation ด้วย catalog resolver
- ย้ายสินค้าที่คงแสดงทั้งหมดเข้า transaction เดียวกัน
- ปิด `hpPotion` จนมี canonical contract
- ซ่อน/ปิด production food debug faucet และจำกัด Capture Ball refill เป็น safety floor 0 → 5
- publish live state หลัง local persist สำเร็จเท่านั้น
- เปลี่ยน copy/footer ให้ตรงกับ Gold ในเกม

### S4 — UI/Accessibility/Mobile

- เพิ่ม wallet display, item count, conditions, confirm/pending/result states
- sync `index.html` กับ `v800.html`
- browser smoke desktop/mobile และ keyboard/touch flow

### S5 — Integration/Acceptance

- golden path: ซื้อ → save/reload → กิน → เลือก S4 → save/reload → ใช้ Ember ใน combat
- full CI, manifest, HTML parity, diff check
- Codex review evidence และออก verdict; ห้าม deploy/push โดยอนุมาน

## Exact File Allowlist ที่เสนอ

Codex ต้องยืนยันอีกครั้งหลัง rebase/base review ก่อนเปิด source edit:

- `merchant-shop-catalog.mjs` — ใหม่; offer catalog/cross-validation
- `merchant-purchase.mjs` — ใหม่; transaction/replay/receipt diagnostics
- `content-catalog.mjs` — เฉพาะ new-game `emberFruit` tutorial grant และ item cross-validation ที่ B1 อนุมัติ
- `save-schema.mjs` — wallet, ledger/history, schema/migration
- `monster-instance.mjs` — เฉพาะ schema parity/migration หาก architecture ปัจจุบันบังคับ
- `stage-catalog.mjs` — เฉพาะ currency reward catalog/resolver ที่ B1 อนุมัติ
- `game-v800.js` — live adapter/render/event wiring และ stage reward adapter
- `index.html`
- `v800.html`
- `style-v800.css`
- `package.json` — test scripts เท่านั้น
- `tests/v89-merchant-shop-catalog.mjs`
- `tests/v89-merchant-purchase.mjs`
- `tests/v89-merchant-purchase-mutants.mjs`
- `tests/v89-merchant-save-migration.mjs`
- `tests/v89-merchant-live-wiring.mjs`
- `tests/v89-merchant-live-wiring-mutants.mjs`
- `tests/v89-merchant-ui.mjs`
- `tests/v89-shop-skill-item-golden-path.mjs`
- mechanical schema-version assertion updates เฉพาะเมื่อ test fail เพราะ parity bump:
  - `tests/p0-save-identity.mjs`
  - `tests/v80-character-ui-p1.mjs`
  - `tests/v80-character-ui-p2.mjs`
  - `tests/v80-character-ui-p3.mjs`
  - `tests/v81-catalog-save-migration.mjs`
  - `tests/v81-egg-transaction.mjs`
  - `tests/v81-monster-content-golden-path.mjs`
  - `tests/v81-passive-instance.mjs`
  - `tests/v81-passive-live-mutants.mjs`
  - `tests/v81-skill-save-migration.mjs`
  - `tests/v82-skill-items.mjs`
  - `tests/v83-monster-stat-exp-level60.mjs`
  - `tests/v83-monster-stat-exp-level60-mutants.mjs`
  - `tests/v83-monster-stat-save-migration.mjs`
  - `tests/v83-monster-stat-save-migration-mutants.mjs`
- parity-test edits ด้านบนต้องเปลี่ยนเฉพาะ expected schema/version fixtures และ review แยกจาก behavior
- `SKILL-ITEM-SHOP-PLAN-V8.md`

ไม่อนุญาตให้แก้ `skill-items.mjs`, combat formula, species/skill canonical catalogs หรือไฟล์ Monster AI เว้นแต่ integration test พบ blocker และ Codex ขยาย allowlistอย่างชัดเจน

## Test Plan

### Catalog tests

- `emberFruit` offer resolve ไป item ที่ canonical
- offer id ไม่ซ้ำ
- quantity/price/currency/catalogVersion ถูกต้อง
- unknown item, unknown currency, zero/negative/float price ถูก reject
- disabled/invalid offer ไม่ render
- `hpPotion` ไม่สามารถผ่าน catalog validator โดยไม่มี item contract

### Purchase domain tests

- 600 Gold + ซื้อ 600 → 0 Gold และ `emberFruit +1`
- input state ไม่ถูก mutate
- receipt และ command id เพิ่มครั้งเดียว
- เงินเท่าราคาซื้อได้และเหลือ 0
- เงินต่ำกว่าราคา 1 ถูก reject โดยทั้ง wallet/inventory คงเดิม
- inventory เต็มถูก reject ก่อน debit
- expected price/catalog/wallet/item snapshot stale ถูก reject
- command id ซ้ำไม่ debit/credit ซ้ำ
- quantity อื่นนอกจาก 1 ถูก reject
- persist throw/failure คืน state เดิม
- persist สำเร็จแล้ว caller publish candidate ได้ครั้งเดียว

### Save/migration tests

- new game wallet = 300
- schema ก่อน wallet migrate เป็น 300 เพียงครั้งเดียว
- migrate/normalize ซ้ำไม่แจก Gold ซ้ำ
- current-schema wallet หาย/เสียหายไม่รับ seed ใหม่แบบ exploit
- Gold 0 save/reload ยังคง 0 ไม่กลายเป็น default
- new game มี `emberFruit: 1`; legacy ที่มี quantity ใดต้องคงค่านั้น และ current-schema ที่ field หายต้องเป็น 0 + diagnostic ไม่รับ tutorial seed ซ้ำ
- history/ledger bounded, deduplicated และ malformed entries ถูก drop
- backup/current schema parity
- Skill Item acquisition provenance เดิมไม่เปลี่ยน

### Reward/balance tests

- stage Gold ไม่ปรากฏเป็น `inventory.gold`
- first-clear ให้ Gold ครั้งเดียว
- recovered/reloaded stage clear ไม่ให้ซ้ำ
- new game 300 + Grass first-clear 300 = 600 และซื้อ `emberFruit` ได้หนึ่งชิ้น
- active stage first-clear อื่นให้ 300 ต่อครั้งจนกว่าจะมี telemetry/งาน economy ใหม่
- free heal ไม่เปลี่ยน wallet
- capture safety floor ทำงานเฉพาะ 0 → 5, ไม่เปลี่ยน wallet และกดซ้ำแล้วไม่เพิ่ม
- production build ไม่มีปุ่มแจก `emberFruit`/`trainingChow` ซ้ำไม่จำกัด
- purchase simulation ไม่ทำให้ Gold ติดลบหรือ overflow

### UI/live wiring tests

- merchant render จาก catalog ไม่ใช่ hardcoded array ที่ mutate state
- UI มี wallet, price, inventory count และ Skill Item conditions
- ปุ่มทุก offer เรียก commit adapter เท่านั้น
- success render จาก persisted candidate
- failure ไม่เรียก publish และแสดงข้อความถูกต้อง
- double click/replayed callback commit ครั้งเดียว
- `index.html` และ `v800.html` parity
- ไม่มีข้อความ “เหรียญจริง” ที่ทำให้สับสนกับเงินจริง

### End-to-end golden path

```text
เริ่ม 300 Gold / emberFruit 1
→ เคลียร์ Grass Meadow ครั้งแรก
→ Gold 600 / emberFruit 1
→ ซื้อ offer 600
→ Gold 0 / emberFruit 2
→ reload
→ ใช้ emberFruit กับมอน Normal Lv.5+ ลง S4
→ emberFruit 1 / เรียน SK_FIRE_01 ถาวร
→ reload
→ ใช้ Ember ใน combat และ Uses ลดตาม canonical runtime
```

### Mutation tests ที่ต้อง kill

- แจก item โดยไม่หัก Gold
- หัก Gold แต่ไม่เพิ่ม item
- หัก Gold สองครั้ง
- เพิ่ม item สองครั้ง
- bypass insufficient funds
- เปลี่ยน `- price` เป็น `+ price`
- ใช้ราคาจาก DOM แทน catalog
- ตัด replay check
- mutate live state ก่อน persist
- กลืน persistence error แล้วแสดง success
- migration แจก starter Gold ทุก reload
- ใส่ Gold เข้า inventory
- UI callback กลับไปใช้ `state.inventory[item.id]++`

เสนอ test scripts:

```text
test:v89:merchant-shop-catalog
test:v89:merchant-purchase
test:v89:merchant-purchase:mutants
test:v89:merchant-save-migration
test:v89:merchant-live-wiring
test:v89:merchant-live-wiring:mutants
test:v89:merchant-ui
test:v89:shop-skill-item-golden-path
```

เลข suite ใช้ตาม convention ที่ยังว่าง ณ วัน implementation; ถ้าฐานเปลี่ยนให้เปลี่ยนชื่อโดยไม่เปลี่ยน acceptance coverage

## Acceptance Gates

### A0 — Authority/Base

- อ่านเอกสาร source of truth และแผน Skill Item แล้ว
- base commit/branch ชัดเจน ไม่มีการปน project หรือ unrelated work
- Codex เปิด ownership gate

### A1 — Catalog/Economy

- `emberFruit` มี stable offer และราคาอยู่จุดเดียว
- wallet/reward source ผ่าน B1
- ไม่มี real-money implication
- Heal ฟรีและ capture safety floor ไม่ถดถอย

### A2 — Atomicity

- success = Gold ลดตรงราคาและ item เพิ่มตรงจำนวน
- failure ทุกชนิด = Gold/item/live state ไม่เปลี่ยน
- persist-first และ replay guard ผ่าน unit/mutation tests

### A3 — Save/Migration

- current + legacy + corrupted + backup cases ผ่าน
- migration idempotent และไม่แจก Gold ซ้ำ
- schema parity ผ่าน

### A4 — Live UI

- ทุก offer ที่แสดงใช้ transaction เดียวกัน
- `emberFruit` แสดง effect/compatibility/price/count ถูกต้อง
- desktop/mobile/accessibility smoke ผ่าน
- HTML twins parity ผ่าน

### A5 — Cross-system Integration

- ซื้อ → reload → ใช้ → reload → combat ผ่าน
- การซื้อไม่แก้ monster; การใช้ไม่แก้ wallet; combat ไม่อ่าน shop
- full CI และ mutation suites ผ่าน

### A6 — Delivery

- `npm run ci`
- targeted shop suites
- `npm run manifest`
- `cmp -s index.html v800.html`
- `git diff --check`
- review diff เทียบ exact allowlist
- บันทึกข้อจำกัด visual smoke หาก environment ไม่มี browser จริง
- ไม่มี push, merge หรือ deploy จนผู้ใช้สั่ง

## Codex Ownership Gate

- **Codex เป็น implementation owner, reviewer และ final acceptance owner ของงานร้านค้านี้**
- Sub-agent ทำ read-only analysis/test review ได้ แต่ห้ามแก้ source เว้นแต่ Codex มอบ exact-file task
- สถานะเริ่มต้น: `SHOP-S0 PLAN READY / SOURCE EDIT CLOSED`
- การสั่ง “เขียนแผน” อนุญาตเฉพาะไฟล์แผนนี้ ไม่ถือเป็นคำสั่ง implementation
- ก่อนแก้ source Codex ต้องประกาศ `OPEN SHOP-S1` พร้อม base SHA, branch, price/seed lock และ file allowlist
- แต่ละ phase ต้องมี test evidence ก่อนเปิด phase ถัดไป
- หากต้องแก้นอก allowlist, เพิ่มเงินจริง/VPS, เปลี่ยน Heal หรือเปลี่ยน capture safety floor ให้หยุดและขอ owner decision
- Codex เท่านั้นที่ออก verdict `APPROVED`, `CHANGES REQUIRED` หรือ `BLOCKED`
- ห้ามตีความ automated DOM/CSS tests ว่าเป็น visual sign-off หากยังไม่ได้เปิดใน browser จริง

## Risks และ Mitigations

| ความเสี่ยง | การป้องกัน |
|---|---|
| ร้านค้าแจกฟรีแต่แสดงราคา | ลบ inline mutation และบังคับทุก offer ผ่าน purchase transaction |
| เงินหายเมื่อ save ล้มเหลว | copy-on-write + local persist ก่อน publish |
| double tap ซื้อซ้ำ | pending UI + bounded command replay ledger |
| แก้ราคาใน DOM | catalog เป็น authority และตรวจ expected price/version |
| migration แจกเงินทุก reload | original-version gate + idempotency tests |
| Gold ปน inventory | wallet contract + stage reward regression test |
| ขาย item ที่ใช้ไม่ได้ | catalog cross-validation; ปิด `hpPotion` |
| debug faucet ทำให้ราคาไร้ความหมาย | ปิด food refill ใน production และทำ ball refill เป็น safety floor เท่านั้น |
| permanent skill ทำลาย balance | ราคา 600, compatibility เดิม, optional path และ simulation B1 |
| ซื้อแล้วเรียนไม่ได้เพราะ duplicate/type/level | แสดง compatibility ชัด; การซื้อยังเป็น inventory choice และ Skill Item transaction ป้องกันการกินเสีย |
| local save ถูกแก้ | ระบุชัดว่า local prototype ไม่ cheat-proof; server economy แยกเฟส |
| scope ลามไปทั้ง economy | จำกัด source เป็น seed/first-clear; farm/sell/quest ต้องเปิดงานแยก |

## Definition of Done

งาน implementation จะถือว่าเสร็จเมื่อครบทุกข้อ:

- พ่อค้าแสดงและขาย `emberFruit` ด้วย Gold จริงในเกม
- ราคา authority จุดเดียวและ balance gate ผ่าน
- ไม่มี offer ที่ยังแจกฟรีหลังปุ่ม “ซื้อ”
- ไม่มี production faucet ที่แจกสินค้าร้านซ้ำไม่จำกัด
- transaction มี atomicity, replay protection และ persist-first
- wallet/save/migration/reward provenance ผ่าน tests รวม mutation
- ซื้อแล้วใช้ Skill Item ต่อจน cast `SK_FIRE_01` ได้ข้าม reload
- Heal ฟรี, capture safety floor และระบบเดิมไม่ถดถอย
- desktop/mobile visual smoke หรือบันทึก limitation ที่ตรงจริง
- full CI/manifest/parity/diff checks ผ่าน
- Codex ออก final acceptance และผู้ใช้เป็นผู้ตัดสินใจ push/deploy ต่อไป
