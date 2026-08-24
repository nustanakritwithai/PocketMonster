# Goal 1 integration inventory

สถานะเอกสารนี้เป็น read-only inventory ของ client และ contract ที่ต้องรอ Server ยืนยัน
ไม่มี endpoint จริง, secret หรือข้อมูลระบุตัว VPS อยู่ใน repository

| Domain | Client source of truth | ปัจจุบัน | Goal 1 boundary |
| --- | --- | --- | --- |
| Auth | `firebase-auth-ui.mjs`, `game-v800.js` | Firebase login ก่อนสร้าง runtime | คง Firebase เป็น fallback; ยังไม่ย้ายบัญชี |
| Save read/write | `firebase-game-sync.mjs`, `game-v800.js` | Firestore `players/{uid}/saves/current` | ไม่เปิด VPS player-data writes หรือ migration |
| Runtime config | `runtime-config.mjs`, `runtime-config.json` | build defaults + same-origin manifest | อนุญาตเฉพาะ URL/version/flag ที่ validate แล้ว |
| Health/version | `server-sync.mjs` | disabled เมื่อ flags เป็นค่าเริ่มต้น | GET health + version เท่านั้น เมื่อ Server ส่ง contract จริง |
| Realtime | ไม่มี VPS adapter ใน Goal 1 | Firebase/client เดิม | ยังไม่เปลี่ยน transport |
| Economy | game runtime และ local save | client เดิม | mutation flag ถูกบังคับปิด |

## Server confirmation gaps

ก่อนเปิด Goal ถัดไป Server ต้องยืนยันจาก source/config จริง: health path และ response schema,
version path และ response schema, API version policy, minimum client version policy,
save schema compatibility, maintenance semantics, correlation/request-id convention,
และ deployment release identifier. จนกว่าจะยืนยัน ช่องว่างเหล่านี้ถือเป็น `pending`;
client จะไม่เดา endpoint เพิ่มและจะไม่เขียนข้อมูลผู้เล่น

## Rollback / security

- ลบหรือแทนที่ `runtime-config.json` ได้โดยไม่ rebuild client; ค่า default ยังคง Firebase-only
- manifest ไม่รับ secrets และ write policy ถูกบังคับเป็น false ใน runtime
- health/version timeout, malformed response และ incompatible version เปิด Firebase fallback
- การเปลี่ยน auth, save migration, economy, realtime หรือ production deployment อยู่นอก Goal 1
