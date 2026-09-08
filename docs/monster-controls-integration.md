# การเชื่อมแผงมอนสเตอร์ทุกฉาก — งานแรก

ปุ่มมอนสเตอร์ใหม่เชื่อมกับ controller กลางของ parent แล้ว ปาครั้งแรกคงแผงตัวละคร หลัง snapshot ยืนยัน active กดซ้ำสลับสกิลมอนสเตอร์/ตัวละคร การสลับไม่ส่ง summon/recall และไม่เปลี่ยนเจ้าของการเดิน

## สิ่งที่ทดสอบแล้ว

- ปุ่ม scene → controller จริง → command adapter จริง → ตัวรับคำสั่งทดสอบ
- ACK มาก่อน snapshot, กดรัว, คำสั่งซ้ำ, timeout/retry, reset ระหว่างรอผล
- ปุ่ม skill1 ส่ง instanceId/skillId ของมอนสเตอร์ แล้วสลับกลับคำสั่งสกิลตัวละคร
- ชุด HUD/mobile/roster/lifecycle/party adapter เดิม

ผลเหล่านี้ไม่ใช่การตรวจเกมออนไลน์จริงหรือ Browser สองผู้เล่น

## จุดเชื่อม backend ที่ยังขาด

ใน Server candidate ที่ตรวจพบ `MonsterAuthorityIntent` มี actor/target/generation/actionSequence/intentId แต่ไม่มี owned summon ที่รับ instanceId และไม่มี skillId จึงยังไม่ได้ผูก endpoint หรือ WebSocket message ใหม่จากการเดา

งานนี้เพิ่มจุดเชื่อม Client ภายในต่อไปนี้เพื่อให้ผู้ทำ backend ต่อเส้นทางจริง ไม่ใช่การประกาศว่า API เหล่านี้มีอยู่บน Server แล้ว:

- `window.POCKETMONSTER_MONSTER_COMMAND_TRANSPORT.send(command)` ต้องส่งผ่าน authenticated transport เดิมและคืน ACK `{ok, commandId, accepted?, code?}` ไม่คืน state ที่ Client สร้างเอง
- คำสั่งกลาง `{contract:'owned-monster-command/v1', kind:'summon'|'skill', commandId, instanceId, zone, targetPoint?, skillId?, targetActorId?}`; summon ต้องมี targetPoint
- `window.POCKETMONSTER_MONSTER_CONTROL_STATE` รับ projection ที่ผ่านการยืนยันจากเซิร์ฟเวอร์: `party`, `actors`, `skills`
- party ใช้รูปแบบ HUD slots เดิมพร้อม instanceId; actors สำหรับ owned control ต้องผูก instanceId กับ owner ที่ยืนยันแล้วและมี `{instanceId, zone, active}`; ห้ามส่ง ambient actors ทั้งหมดเข้ามาโดยไม่มีการตรวจเจ้าของ
- skills เป็นรายการ loadout ตาม instanceId: `{skillId, label?, cooldownRemaining?, disabledReason?}`
- เมื่อ projection เปลี่ยน dispatch `pocketmonster:monster-control-state` เพื่อให้ controller.sync(); ต้องล้างข้อมูลนี้เมื่อเปลี่ยนบัญชีและจัด revision/generation ก่อนเผยแพร่

ปัจจุบันยังไม่มี production producer ของ transport/state สองส่วนนี้ใน PR ดังนั้นการปา/สกิลออนไลน์ยังใช้งานไม่ครบ เมื่อไม่มี provider จะคืน `SERVER_INGRESS_UNAVAILABLE` และไม่คำนวณ HP/damage ออฟไลน์แทน

## ขั้นถัดไปก่อนพร้อมใช้งานจริง

1. ผูก owned-monster identity/party/loadout ที่เซิร์ฟเวอร์มีอยู่กับ command ingress และ snapshot projection ข้างต้น โดยตรวจเจ้าของ ฉาก คูลดาวน์ จำนวนที่เรียกได้ และ idempotency
2. ผูก transport/state producer ของ Client ให้ครบ พร้อม snapshot revision และ session/scene generation; ไม่ย้าย local authority จากเกมเดิมเข้ามา
3. ตรวจสกิลตามชนิดเป้าหมายจริง รวม skill ที่ต้องเลือกตัว เป้าหมายพื้นที่ และการจัดคิวร่วมกับ AI
4. build/Browser QA บน CI หรือเครื่องอื่น ตรวจภาพทุกฉากและสองผู้เล่นจริง จากนั้น release tester/patch gates ตามโครงการ

ฐาน PR นี้คือ Client `56a22a5` จาก PR538 ซึ่งยังเปิดอยู่ตอนเริ่มงาน ไม่ใช่หลักฐานว่า source นี้เผยแพร่แล้ว ห้าม merge/deploy ขณะ backend dependencies และ Browser acceptance ยังไม่ผ่าน
