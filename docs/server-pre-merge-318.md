# คำแนะนำถึง Server ก่อน merge PR 318
เอกสารนี้พูดกับ World/Server เจ้าของโฮสต์ ไม่ใช่ Pocket client และไม่ใช่ Pirate Fruit combat authority
อย่า merge จนกว่า Server จะยืนยันรายการด้านล่างแล้ว และอย่าเปิด write flags เพื่อให้ PR นี้ผ่าน
## บทบาทที่ล็อกแล้ว
World/Server เป็นโฮสต์ของโลก เซสชัน อ่านโปรไฟล์ แชท และ presence
Pirate Fruit เป็นเจ้าของ Human/Ship และ visual ของผู้เล่นคน
Pocket Monster เป็นเจ้าของ monster progression / throw-capture / save envelope ของเกมมอน
Shared Core เป็น schema เท่านั้น ห้ามย้ายดาเมจ HP สเตตัส หรือตำแหน่งไปให้ client เป็น authority
Client เป็น presentation-first: ไม่ใช่เจ้าของ position / combat stats / damage / HP / status / world
สถิติต่อสู้คาโนนิคัลของมอนคือ atk def spAtk spDef spd ห้ามใส่ชุด Pirate Fruit ลง character หรือ save
## ธงที่ต้องคงตอน merge
vpsEnabled=true vpsReads=true
vpsWrites=false playerDataWrites=false accountMigration=false saveMigration=false economyMutation=false
firebaseFallback=false ถ้า auth/profile bridge พัง คลายเอนต์ต้องเป็น offline ไม่ใช่ fallback ออฟไลน์ปลอม
firebaseAuthBridge / accountLinking / profileReads เปิดได้เฉพาะอ่าน ไม่ใช่ใบอนุญาตเขียนเซฟ
apiVersion คง 1.1 saveSchemaVersion คง 1 minimumClientVersion ไม่สูงกว่า 8.3.0 จน client นี้เข้าไม่ได้
/api/health ต้อง status=ready และ /api/version ต้องมี deployedRelease.version + commitSha 40 hex + builtAtUtc และ saveSchemaVersion=1
อย่าบังคับเปิด vpsWrites หรือ playerDataWrites ใน runtime-config ของ client ตอน merge PR นี้
## ตัวละครที่ Server ต้องรับและต้องทิ้ง
โฮสต์ character API ของคนคือ pirate-fruit ไม่ใช่ Pocket blocky-bighead
characterId ที่ถูกต้องคือ character.human.pirate-fruit.v1
characterSystem=pirate-fruit appearanceId=appearance.human.player-orange.v1 assetForm=pirate-fruit visualContract=presentation-only
POST /api/player/character รับได้แค่ name + อัตลักษณ์พรีเซนต์ด้านบน
ห้ามเก็บและห้าม echo ฟิลด์เหล่านี้จาก character body: hp atk def spAtk spDef spd vitality combat blade ranged fruitPower mastery mana coins capture save
ถ้า client ส่ง hp ใน character POST ให้ปฏิเสธหรือตัดทิ้ง อย่าเขียนทับ playerHp ของเซฟ
NPC keeper ฝั่ง Pocket ยังเป็น character.human.blocky-bighead.v1 อย่าบังคับให้ผู้เล่นกลายเป็น bighead และอย่าบังคับให้ keeper เป็น pirate
writeArmed ของ client ยังเป็น false จนกว่าจะมีใบอนุญาตเขียนแยก savePirateHostedCharacter จะ skipped ด้วยเหตุ player-data-writes-disabled ซึ่งถูกต้อง
## ซองเซฟที่ Server ต้องคง
ซองคาโนนิคัลมีแค่ {state, playerHp, saveSchemaVersion}
GET/POST /api/save ใช้ playerHp ไม่ใช้ hp ระดับซอง
X-Save-Revision และ X-Game-Version=8.4.0 ต้องทำงานตามเดิม STATE_CONFLICT 409 ต้องคืน serverRevision
อย่าใส่ Pirate Fruit combat/ship/fruitPower ลง save.state
อย่าให้ living-world หรือ pirate island เป็น authority ของดาเมจหรือ HP
## แชทและผู้เล่นในโซนเดียวกัน
REST: GET /api/chat/messages?after=&channel=WORLD|ZONE และ POST /api/chat/send body {message,channel}
WebSocket: wss://<host>/ws/chat เฟรมแรกจาก client คือ {token}
client ส่ง {type:"world-pos", zone, x, z, dir} ประมาณทุก 250ms
Server ต้อง broadcast {type:"world-snapshot", payload:{zone, players:[{id,x,z,name}]}} เฉพาะผู้เล่นในโซนเดียวกัน
Server ส่ง {type:"chat"} เมื่อมีข้อความใหม่เพื่อให้ client ดึง REST
โซนที่ต้องไม่ปะปนกัน: โซนเกมเดิมเช่น hub grassland grass-meadow และโซน V9 คือ pirate-fruit กับ living-world
overlay ของเกมกรอง payload.zone !== โซนท้องถิ่นแล้วทิ้ง มาร์กเกอร์คนละโซนห้ามโผล่
อินสแตนซ์ throw ของ Pirate Fruit ใช้ game-v800.js?v=810&animalControl=pirate-fruit ห้ามให้ overlay นี้แย่ง WORLD_STATE / WORLD_PRESENCE จากเกาะ
แชทและ presence ห้ามเปิด vpsWrites / playerDataWrites
## สิ่งที่ merge แล้ว client จะยิงเข้า Server
live V8.4 เข้าทาง index.html = v800.html ไม่มี redirect ของ v800.html ใน PR นี้
ผู้เล่น live เป็น pirate-fruit presentation มีแชทมุมบนขวา และส่ง world-pos ของโซน Ranch/stage ตาม state.currentZone
V9 เข้าทาง v900.html เท่านั้น ห้ามย้าย V9 ไปทับ live
หลัง login V9 โหลดแชททุกโลก: pocket-monster / pirate-fruit / living-world
โลกกลางเป็นพรีเซนต์อย่างเดียว ยังไม่ใช่ combat authority
## สิ่งที่ Server ต้องตรวจก่อนอนุญาต merge
health/version ผ่านเกต 1.1 และ saveSchemaVersion=1 โดยไม่ต้องเปิด writes
แลก Firebase identity แล้วยังอ่าน profile ได้ และถ้าพลาดต้องได้ offline ไม่ใช่ guest fallback
character POST ที่ไม่มีฟิลด์ต้องห้ามถูกตัดหรือรอ writes-disabled ไม่เก็บ hp/atk ของโจรสลัด
world-pos ของ zone=hub ไม่ปะปนกับ zone=pirate-fruit หรือ zone=living-world
channel WORLD และ ZONE แยกข้อความได้ และข้อความยาวเกิน 160 ถูกตัดหรือปฏิเสธ
animal-control throw ไม่สร้างเซสชันโลกซ้ำและไม่เขียนเซฟซ้อน
ไม่มี iframe pirate-fruit-offline และไม่มี three-package combat จาก Pirate Fruit ผ่าน Server
## สิ่งที่ห้ามทำตอน merge
ห้ามเปิด vpsWrites playerDataWrites saveMigration economyMutation
ห้ามตั้ง firebaseFallback=true
ห้ามบังคับ redirect v800.html จน index.html ไม่เท่า v800.html ใน PR นี้
ห้ามทำให้ V9 เป็น live entry
ห้ามรีไรต์ pirate-fruit-offline หรือคัดลอก Pirate Fruit combat stats เข้า Pocket schema
ห้ามให้ client เป็นเจ้าของตำแหน่งหรือดาเมจ
## คำตอบที่ Server ควรส่งกลับก่อน merge
รับทราบบทบาทโฮสต์และธงที่ปิดอยู่
ยืนยันซองเซฟ {state,playerHp,saveSchemaVersion} และ character ไม่มี hp
ยืนยันแชท WORLD/ZONE และ world-snapshot แยกโซน รวม pirate-fruit และ living-world
ยืนยัน online-only และพร้อมรีวิวโดยยังไม่เปิด writes
ถ้าข้อใดทำไม่ได้ ให้บล็อก merge และบอกข้อที่ขาด ห้ามเปิดธงเพื่อหลบ
