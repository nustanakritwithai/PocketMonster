# ระบบปาและสั่งมอนสเตอร์ผ่านเซิร์ฟเวอร์

## พฤติกรรม

1. กดช่องมอนสเตอร์ที่ยังไม่ออกมา ส่ง summon โดยใช้ instanceId ของทีมที่เซิร์ฟเวอร์ยืนยัน
2. เมื่อเซิร์ฟเวอร์ยืนยัน มอนสเตอร์เริ่ม Basic AI และแผงยังเป็นสกิลตัวละคร
3. กดช่องเดิมสลับไปแผงมอนสเตอร์ กดอีกครั้งสลับกลับ การสลับไม่ส่ง summon/recall และไม่แย่งปุ่มเดิน
4. คำสั่งสกิลส่ง skillId ของ loadout มอนสเตอร์ เซิร์ฟเวอร์ตรวจเจ้าของ ฉาก เป้าหมาย คูลดาวน์ และจำนวนครั้ง
5. เปลี่ยนฉากล้างคำสั่งค้างและเริ่มอ่านสถานะใหม่ มอนสเตอร์ใน server runtime ย้ายตามตำแหน่งเจ้าของที่ยอมรับแล้ว

## เส้นทางจริง

- GET /api/monsters/control-state?zone=... ใช้ Bearer session และ X-API-Version
- POST /api/monsters/command ใช้ contract owned-monster-command/v1 พร้อม commandId, instanceId, zone, kind, targetPoint และ skillId ตามชนิดคำสั่ง
- ACK: {ok, accepted, code, commandId}; active และ loadout มาจาก state API
- server world-snapshot ส่ง actorId ขึ้นต้น owned: พร้อม ownerId, exact asset ID, pose, animation และ monster-authority/1
- Client ใช้ monster-command-http-provider-v900.mjs จริง ไม่มี transport/state global ที่ต้องตั้งเอง
- game-v800 และ living-world รับ owned actor ของตนเองจากเซิร์ฟเวอร์; Pirate ต้องใช้ source candidate renderer ใหม่ตามรายงานทีม

## การออกแบบและขอบเขต

ใช้ปุ่มและความสามารถแสดงผลเดิมผ่าน controller กลาง ส่วนเซิร์ฟเวอร์เพิ่ม owner ของสถานะ summon/AI เพราะ candidate เดิมไม่มี owned command ingress ใช้ CentralCombatSimulator และ CombatRulesV91 ร่วมกันสำหรับ auto/manual ไม่รับ HP/damage จาก client

Canonical reader อ่าน collection + party placements, catalog stats 36 forms, learned skill slots และ basic policy เดิม: ระยะ1.35m, cooldown0.9s, power15 ส่วน runtime หาเป้าหมาย9m คงเป้าหมาย12m และใช้สูตรความเร็วเดิม

สถานะ active, คูลดาวน์ และ HP ต่อสู้อยู่ใน process ของ server รุ่นนี้ ย้ายตามฉากได้; ผลต่อสู้และรางวัลยังไม่ถูก persist ลง SQL และยังไม่มี reward settlement ในเส้นทางนี้ ศัตรูที่มี target profile ในชุดนี้คือ Pirate central catalog24ชนิด; แผนที่อื่นแสดงและควบคุม owned actor ได้ แต่ต้องมี authoritative target profile จึงโจมตีศัตรูในฉากนั้นได้

เคารพ `OwnedMonsterEnabled` ร่วมกับ `Combat.Enabled`, `CommitEnabled` และ `ShadowMode` ตาม runtime policy: เมื่อ gate ที่เกี่ยวข้องปิด คำสั่งจะ fail-closed และไม่ commit ความเสียหาย; artifact นี้ไม่เปลี่ยน production flags อัตโนมัติ
### สถานะ runtime และขอบเขตการเปิดใช้งาน

- `OwnedMonsterEnabled` เป็น feature flag แยกต่างหาก ค่าเริ่มต้น `false`; การมีโค้ดหรือ artifact นี้ไม่เปิดใช้งานเอง
- `Combat.Enabled`, `CommitEnabled` และ `ShadowMode` ของ generic combat/player ยังคงปิดตาม runtime configuration เดิม
- HP ต่อสู้และรางวัลยังอยู่ใน server process และยังไม่ persist ลง SQL; Client ห้ามส่งผล HP/damage เพื่อให้ Server เชื่อถือ
- เส้นทาง enemy → player HP authority ยังไม่มีใน candidate นี้ จึงไม่อ้างว่า auto AI หรือสกิลมอนสเตอร์ทำความเสียหายผู้เล่นได้ครบทุกฉาก
- CI artifact และ focused tests เป็นหลักฐานการรวมโค้ดเท่านั้น ยังไม่ใช่หลักฐาน deploy หรือ Browser user acceptance

## หลักฐานและขั้นรับรุ่น

| รายการ | ผล |
|---|---|
| npm run check และ focused controls/provider/HUD | PASS |
| OwnedMonsterWorldHarness | PASS: summon, replay/concurrency, owner, actual HP, cooldown, empty ground, 7 zones, disconnect |
| OwnedMonsterCanonicalHarness | PASS: stored schema, stages/assets, basic, loadout และ legacy compatibility |
| Pirate focused renderer | PASS 5 tests และ strict focused TypeScript |
| release preflight / health / version | PASS เฉพาะรุ่นเดิมที่เปิดใช้งานอยู่ ไม่ใช่การรับรอง candidate |
| full build / nested Pirate bundle / Browser สองผู้เล่น | ต้องทำบน CI หรือเครื่องอื่นตาม PROJECT_MEMORY.md |
| deploy / SQL / เปลี่ยน flags | ยังไม่ได้ทำ |

เวอร์ชัน client/server ยังคงตรงกัน8.4.0 ต้องสร้าง nested Pirate bundle จาก candidateใหม่ก่อน build:pages; build:pages จะสร้าง manifestตาม content และรวม HTTPproviderใหม่ ห้ามนำ manifestหรือbinaryรุ่นเดิมมาอ้างเป็น candidateที่ผ่านแล้ว
