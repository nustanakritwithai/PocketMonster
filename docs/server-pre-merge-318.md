# คำแนะนำถึง Server ก่อน merge PR 318

เอกสารนี้พูดกับ World/Server เจ้าของโฮสต์ ไม่ใช่ Pocket client และไม่ใช่ Pirate Fruit combat authority

อย่า merge จนกว่า Server จะยืนยันรายการด้านล่างแล้ว และอย่าเปิด write flags เพื่อให้ PR นี้ผ่าน

## บทบาทที่ล็อกแล้ว

- World/Server เป็นโฮสต์ของโลก เซสชัน อ่านโปรไฟล์ แชท และ presence
- Pirate Fruit เป็นเจ้าของ Human/Ship และ visual ของผู้เล่นคน
- Pocket Monster เป็นเจ้าของ monster progression / throw-capture / save envelope ของเกมมอน
- Shared Core เป็น schema เท่านั้น ห้ามย้าย damage, HP, status หรือตำแหน่งไปให้ client เป็น authority
- Client เป็น presentation-first: ไม่ใช่เจ้าของ position, combat stats, damage, HP, status หรือ world
- สถิติต่อสู้คาโนนิคัลของมอนคือ `atk`, `def`, `spAtk`, `spDef`, `spd` ห้ามใส่ชุด Pirate Fruit ลง character หรือ save

## ธงที่ต้องคงตอน merge

```text
vpsEnabled=true
vpsReads=true
vpsWrites=false
playerDataWrites=false
accountMigration=false
saveMigration=false
economyMutation=false
firebaseFallback=false
```

- ถ้า auth/profile bridge พัง Client ต้องเป็น `offline` ไม่ใช่ Firebase fallback
- `firebaseAuthBridge`, `accountLinking` และ `profileReads` เปิดได้เฉพาะอ่าน ไม่ใช่ใบอนุญาตเขียนเซฟ
- `apiVersion` คง `1.1`
- `saveSchemaVersion` คง `1`
- `minimumClientVersion` ต้องไม่สูงกว่า `8.3.0` จนกว่า client นี้จะเข้าไม่ได้
- `/api/health` ต้องมี `status=ready`
- `/api/version` ต้องมี `deployedRelease.version`, `commitSha` เป็น 40 hex, `builtAtUtc` และ `saveSchemaVersion=1`
- ห้ามบังคับเปิด `vpsWrites` หรือ `playerDataWrites` ใน runtime-config ของ client ตอน merge PR นี้

## ตัวละครที่ Server ต้องรับและต้องทิ้ง

- Host character API ของคนคือ `pirate-fruit` ไม่ใช่ `Pocket blocky-bighead`
- `characterId` ที่ถูกต้องคือ `character.human.pirate-fruit.v1`
- ค่า identity ที่ถูกต้องคือ:

```text
characterSystem=pirate-fruit
appearanceId=appearance.human.player-orange.v1
assetForm=pirate-fruit
visualContract=presentation-only
```

- `POST /api/player/character` รับได้เฉพาะ `name` และอัตลักษณ์ presentation ด้านบน
- ห้ามเก็บหรือ echo ฟิลด์เหล่านี้จาก character body:

```text
hp atk def spAtk spDef spd vitality combat blade ranged fruitPower mastery mana coins capture save
```

- ถ้า client ส่ง `hp` ใน character POST ให้ปฏิเสธหรือตัดทิ้ง และห้ามเขียนทับ `playerHp` ของ save
- NPC Keeper ฝั่ง Pocket ยังเป็น `character.human.blocky-bighead.v1`
- ห้ามบังคับผู้เล่นเป็น bighead และห้ามบังคับ Keeper เป็น pirate
- `writeArmed` ของ client ยังเป็น `false` จนกว่าจะมีใบอนุญาตเขียนแยก
- `savePirateHostedCharacter` จะ skip ด้วยเหตุ `player-data-writes-disabled` ซึ่งถือว่าถูกต้อง

## ซองเซฟที่ Server ต้องคง

ซองคาโนนิคัลมีเพียง:

```json
{"state":{},"playerHp":100,"saveSchemaVersion":1}
```

- `GET/POST /api/save` ใช้ `playerHp` ไม่ใช้ `hp` ระดับซอง
- `X-Save-Revision` และ `X-Game-Version=8.4.0` ต้องทำงานตามเดิม
- `STATE_CONFLICT` HTTP 409 ต้องคืน `serverRevision`
- ห้ามใส่ Pirate Fruit combat, ship หรือ `fruitPower` ลง `save.state`
- ห้ามให้ living-world หรือ pirate island เป็น authority ของ damage หรือ HP

## แชทและผู้เล่นในโซนเดียวกัน

- REST: `GET /api/chat/messages?after=&channel=WORLD|ZONE`
- REST: `POST /api/chat/send` body `{message,channel}`
- WebSocket: `wss://<host>/ws/chat`
- frame แรกจาก client คือ `{token}`
- client ส่ง `{type:"world-pos",zone,x,z,dir}` ประมาณทุก 250ms
- Server broadcast `{type:"world-snapshot",payload:{zone,players:[{id,x,z,name}]}}` เฉพาะผู้เล่นในโซนเดียวกัน
- Server ส่ง `{type:"chat"}` เมื่อมีข้อความใหม่ เพื่อให้ client ดึง REST
- โซนเกมเดิม เช่น `hub`, `grassland`, `grass-meadow` ต้องไม่ปะปนกับ `pirate-fruit` หรือ `living-world`
- overlay ต้องทิ้ง payload เมื่อ `payload.zone` ไม่เท่ากับโซนท้องถิ่น
- มาร์กเกอร์คนละโซนห้ามโผล่
- instance throw ของ Pirate Fruit ใช้ `game-v800.js?v=810&animalControl=pirate-fruit`
- instance throw ห้ามแย่ง `WORLD_STATE` / `WORLD_PRESENCE` จากเกาะ
- แชทและ presence ห้ามเปิด `vpsWrites` / `playerDataWrites`

## สิ่งที่ merge แล้ว client จะยิงเข้า Server

- live V8.4 เข้าทาง `index.html` = `v800.html`
- PR นี้ห้ามเพิ่ม redirect จาก `v800.html` จนทำให้ entry เดิมเปลี่ยน
- ผู้เล่น live เป็น Pirate Fruit presentation มีแชทมุมบนขวา
- V9 เข้าทาง `v900.html` เท่านั้น
- หลัง login V9 โหลดแชทสำหรับ `pocket-monster`, `pirate-fruit` และ `living-world`
- โลกกลางเป็น presentation อย่างเดียว ยังไม่ใช่ combat authority

## สิ่งที่ Server ต้องตรวจก่อนอนุญาต merge

- health/version ผ่านเกต API 1.1 และ `saveSchemaVersion=1` โดยไม่เปิด writes
- แลก Firebase identity แล้วยังอ่าน profile ได้ และถ้าพลาดต้องเป็น `offline` ไม่ใช่ guest fallback
- character POST ที่มีฟิลด์ต้องห้ามถูกตัดหรือรอ `writes-disabled` และไม่เก็บ HP/สถิติของโจรสลัด
- `world-pos` ของ `hub` ไม่ปะปนกับ `pirate-fruit` หรือ `living-world`
- channel `WORLD` และ `ZONE` แยกข้อความได้
- ข้อความยาวเกิน 160 ต้องถูกตัดหรือปฏิเสธ
- animal-control throw ไม่สร้าง session โลกซ้ำและไม่เขียนเซฟซ้อน
- ไม่มี iframe `pirate-fruit-offline` และไม่มี Three/Pirate Fruit combat package ผ่าน Server

## สิ่งที่ห้ามทำตอน merge

- ห้ามเปิด `vpsWrites`, `playerDataWrites`, `saveMigration` หรือ `economyMutation`
- ห้ามตั้ง `firebaseFallback=true`
- ห้ามทำให้ V9 เป็น live entry ของระบบที่ยังใช้ `index.html`/V8.4 โดยไม่ได้ประกาศเปลี่ยน entry อย่างชัดเจน
- ห้าม rewrite `pirate-fruit-offline`
- ห้ามคัดลอก Pirate Fruit combat stats เข้า Pocket schema
- ห้ามให้ client เป็นเจ้าของตำแหน่งหรือ damage

## คำตอบที่ Server ควรส่งกลับก่อน merge

```text
รับทราบบทบาทโฮสต์และธงที่ปิดอยู่
ยืนยันซองเซฟ {state,playerHp,saveSchemaVersion} และ character ไม่มี hp
ยืนยันแชท WORLD/ZONE และ world-snapshot แยกโซน รวม pirate-fruit และ living-world
ยืนยัน online-only และพร้อมรีวิวโดยยังไม่เปิด writes
```

ถ้าข้อใดทำไม่ได้ ให้บล็อก merge และบอกข้อที่ขาด ห้ามเปิดธงเพื่อหลบ

ยังไม่ merge รอ Server ตอบตามหัวข้อท้ายเอกสารนี้ก่อน
