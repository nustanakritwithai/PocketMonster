# ส่งต่องาน Client — ความลื่นและเอฟเฟกต์ดาบ

Draft PR นี้หยุดการส่ง remote snapshot เก่าซ้ำทุก local pose ซึ่งทำให้ RemotePlayers รีเซ็ตความเร็ว เปลี่ยน sender เป็น 50 ms และรักษาการส่ง pose ระหว่างที่ visual queue ยังรอ envelope ที่ใช้ได้ ผล focused tests ผ่านก่อนเจ้าของสั่งย้ายงานหนักออกจาก VPS รอบส่ง PR ไม่ได้รัน build/Browser ซ้ำ

รับคู่กับ Server และ Pirate PR บน branch `codex/smooth-presence-basic-attack-20260906` เดียวกัน ลิงก์และ exact HEAD อยู่ในรายละเอียด PR ใช้คู่มือและสคริปต์เครื่องอื่นที่ `MonsterLifeServer/docs/handoffs/2026-09-06-smooth-sword/` เพื่อ clone โครงสร้าง QA ทั้งสามส่วน ห้ามรันงานหนักบน VPS

| สถานะ | งาน |
|---|---|
| ผ่านก่อนพัก | กลุ่ม test:v90:pirate-player, cadence fake timer/socket, lifecycle/unified-world และ renderer playback จำลอง |
| ต้องทำต่อ | ตรวจ integrated 20 Hz กับ Server รุ่นสุดท้าย; queue limits, reconnect, duplicate, zone cleanup; release tester และ smoke บนเครื่องอื่น |
| ดาบ | actual gameplay blade-trail ผ่านไปถึง C# peer snapshot แต่ Browser ผู้ชมยังไม่ยืนยันภาพ จึงยังไม่อ้างแก้รอยฟันสำเร็จ |
| ยังไม่จัด | artifact/cache/manifest ของ candidate และ live release acceptance |

รัน `npm ci` แล้ว `npm run test:v90:pirate-player` ใน checkout เครื่องอื่น โดย Server ต้องรองรับ 20 Hz ก่อนนำ Client นี้ขึ้นระบบ เพราะ limiter รุ่นเก่าไม่รองรับอัตรานี้ ระบุ HEAD และผลที่ผ่าน/ล้มลง PR แล้วแก้บน branch เดิม

สำหรับดาบให้ตรวจ receiver sanitizer → iframe RemotePlayers → visible Pocket overlay โดยใช้ accepted visual JSON จาก Server handoff เทียบกับ source rig และ local sword geometry จริง รวมเวลา events, source visibility, mesh transform และ cache ห้ามลดรายละเอียดผู้เล่นเพื่อแก้กระตุก

งานนี้ยังไม่ merge/deploy และไม่เปิด Save/Combat ไม่มี config/ข้อมูลผู้เล่นหรือไฟล์ลบใน PR
