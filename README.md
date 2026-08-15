# Monster Life RPG V7.0.7 — P0 Stability Fix

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

เปิดโดยตรง: `http://127.0.0.1:8081/v707.html`
