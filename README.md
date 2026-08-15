# Monster Life RPG V7.1.0 — Balance Foundation

แก้ runtime crash: `Cannot read properties of undefined (reading 'clone')`

สาเหตุที่ป้องกันในรอบนี้:
- Wild AI อาจเข้าสู่ wander update ก่อนมี direction vector
- VFX / floating text / projectile บางเส้นทางอาจรับ position ที่ไม่พร้อม

สิ่งที่แก้:
- สร้าง direction vector ให้ Wild ทุกตัวตั้งแต่ spawn
- guard direction ทุก frame ก่อน movement
- เพิ่ม `safeVec3()` สำหรับ VFX / UI world projection
- guard projectile ที่ start/end ไม่สมบูรณ์
- runtime error จะแสดงตำแหน่ง stack เพิ่มใน overlay หากมี error ใหม่

เปิดโดยตรง: `http://127.0.0.1:8081/v710.html`

## V7.1.0 — Balance Foundation

เพิ่มเลเยอร์ balance แบบ data-driven + deterministic (ตามแผน Master Development Plan §R23) โดยไม่เปลี่ยน gameplay pacing เดิม:

- `balance-config.mjs` — ค่ากลางทั้งหมด (EXP curve, training capacity, gene, defense, caps, capture, power budget)
- `balance-formulas.mjs` — สูตร deterministic (EXP/level, training gain, core stat, defense mitigation, capture chance)
- `combat-rating.mjs` + `balance-sim.mjs` — CR calculator + simulator (`npm run sim`) เทียบ same-level builds
- Unit tests: `npm test` (รวมชุด `balance-*`), ดู CR debug panel ด้วย `npm run sim`

เอนจิน balance ถูก bundle เข้ากับเกม (`window.MLRPG_BALANCE`) พร้อมใช้สำหรับ tooling/telemetry; การต่อสูตรเข้ากับ live loop เป็นสเต็ปถัดไปตาม roadmap
