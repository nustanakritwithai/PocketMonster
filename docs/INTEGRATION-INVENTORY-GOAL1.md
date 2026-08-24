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

## Server contract ที่ยืนยันแล้ว (PR #288 review)

- `GET /api/health`: `200` พร้อม `status: ready` หรือ `503` พร้อม `status: not_ready`
- `GET /api/version`: `apiVersion: 1.1`, `minimumClientVersion: 8.3.0`, `saveSchemaVersion: 1`
- `deployedRelease` ต้องมี `version`, `commitSha`, `builtAtUtc`
- request ใช้ `X-Request-Id`; response ใช้ `X-API-Version`
- maintenance ใช้ boolean จาก `MONSTERLIFE_MAINTENANCE`

## Remaining Server confirmation gaps

`Test-ServerRelease.ps1` ยังอ้าง `status=healthy` และ field `database` ซึ่งไม่ตรงกับ
implementation ที่ยืนยันว่าใช้ `ready/not_ready`; Server owner ต้องเลือก contract เดียวกัน
ก่อน approve. หาก `commitSha` เป็น `unavailable` client จะถือ release เป็น unverified
และไม่ผ่าน compatibility gate. ยังไม่มีการเปิด player-data writes หรือ migration

## Rollback / security

- ลบหรือแทนที่ `runtime-config.json` ได้โดยไม่ rebuild client; ค่า default ยังคง Firebase-only
- manifest ไม่รับ secrets และ write policy ถูกบังคับเป็น false ใน runtime
- health/version timeout, malformed response และ incompatible version เปิด Firebase fallback
- การเปลี่ยน auth, save migration, economy, realtime หรือ production deployment อยู่นอก Goal 1
