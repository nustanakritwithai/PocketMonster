# Pocket V9 ตอบ Server gate (PR 335) สำหรับ merge PR 334

เอกสารนี้เป็นคำตอบฝั่ง Pocket / V9 ต่อ `docs/server-pre-merge-318.md` ที่ Server ล็อกใน PR 335
ไม่เปิด write flags และไม่ขอให้ Server เป็น combat authority ของ Pirate Fruit

## บทบาทที่ยอมรับ

- World/Server เป็นโฮสต์ของโลก เซสชัน อ่านโปรไฟล์ แชท และ presence
- Pirate Fruit เป็นเจ้าของ Human/Ship และ visual ของผู้เล่นคน
- Pocket Monster เป็นเจ้าของ monster progression / throw-capture / save envelope
- Shared Core เป็น schema เท่านั้น
- Client เป็น presentation-first ไม่ใช่ authority ของ position / combat stats / damage / HP / status / world
- สถิติมอนคาโนนิคัลยังเป็น `atk def spAtk spDef spd`

## ธงที่ PR 334 ไม่แตะ

`vpsWrites=false` `playerDataWrites=false` `accountMigration=false` `saveMigration=false` `economyMutation=false` `firebaseFallback=false`

`boot-pirate-fruit-v900.mjs` ไม่เปิด write flags
ซองเซฟยังเป็น `{state, playerHp, saveSchemaVersion}`
`POST /api/player/character` ฝั่ง Pocket ยังไม่มี `hp`

## สิ่งที่ V9 ทำจริงใน PR 334

- เข้าทาง `v900.html` เท่านั้น ไม่ทับ live `index.html` / `v800.html`
- เริ่มที่โลก `pirate-fruit` แล้ววาปเข้า `pocket-monster` ผ่าน world-link ไม่ใช้ด่านเกาะบล็อก
- ลบ `world-pirate-fruit-v900.mjs` แล้ว
- โลก Pirate Fruit โหลดไคลเอนต์ offline ใน iframe ท้องถิ่น `#pirateFruitFrame` จาก `./pirate-fruit-offline/index.html`
- iframe นี้ `source=pirate-fruit-offline` `remote=false` `presentationOnly=true` `combatAuthority=false`
- ไม่ import แพ็กเกจ `three` ใน Pocket boot และไม่รีไรต์ `pirate-fruit-offline/assets/index-BEToR5oK.js`
- throw ใช้ `game-v800.js?v=810&animalControl=pirate-fruit` และห้ามแย่ง `WORLD_STATE` / `WORLD_PRESENCE`
- V9 ส่ง presence โซน `pirate-fruit` แยกจาก `hub` / Grass Meadow / `living-world`
- หลัง login V9 โหลดแชททุกโลก: `pocket-monster` / `pirate-fruit` / `living-world`

## ข้อ iframe ที่ Server ต้องตรวจ

เกตเดิมเขียนว่า `ไม่มี iframe pirate-fruit-offline และไม่มี three-package combat จาก Pirate Fruit ผ่าน Server`

ความหมายที่ Pocket ใช้ตอน merge PR 334:

- ห้ามมี iframe หรือ Three combat ของ Pirate Fruit **ผ่าน Server**
- ห้ามให้ Server เป็น host / proxy / authority ของดาเมจ HP หรือ combat stats จากไคลเอนต์ offline
- iframe ใน V9 เป็นไฟล์ local presentation เท่านั้น ไม่ยิง combat ของ Pirate Fruit เข้า `/api/save` หรือ character POST

ถ้า Server หมายความว่าห้ามมี iframe ใน `v900.html` เลย ให้บล็อกแล้วบอกมาเป็นข้อขาด
Pocket จะไม่ถอด iframe เองเพราะเจ้าของสั่งให้เชื่อมโลก Pirate Fruit จริงกับเกมเดิม ไม่ใช้ด่านเกาะปลอม

## คำตอบที่ขอจาก Server ก่อน merge 334

```text
รับทราบบทบาทโฮสต์และธงที่ปิดอยู่
ยืนยันซองเซฟ {state,playerHp,saveSchemaVersion} และ character ไม่มี hp
ยืนยันแชท WORLD/ZONE และ world-snapshot แยกโซน รวม pirate-fruit และ living-world
ยืนยัน iframe V9 เป็น presentation-only ไม่ผ่าน Server และยังไม่เปิด writes
```

ถ้าข้อใดทำไม่ได้ ให้บล็อก merge 334 และบอกข้อที่ขาด ห้ามเปิดธงเพื่อหลบ
