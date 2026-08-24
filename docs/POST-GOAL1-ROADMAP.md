# Post-Goal 1 roadmap

เอกสารนี้เป็นแผนงานถัดไปหลัง Goal 1 และไม่อนุญาตให้เริ่ม implementation จนกว่า
PR #288 จะผ่าน review/approve และ Server owner ยืนยัน contract ที่ใช้งานจริง

## Gate 0 — ปิด Goal 1

- ยืนยัน `GET /api/health` (`ready`, `not_ready`, maintenance semantics)
- ยืนยัน `GET /api/version` (API `1.1`, client minimum `8.3.0`, save schema `1`)
- ยืนยัน `X-Request-Id` และ `X-API-Version` ของแต่ละ response
- ยืนยัน `deployedRelease` พร้อม SHA hex 40 ตัวและ timestamp
- ผ่าน `npm run ci`

## Goal 2 — Staging read-only adapter

1. เปิดเฉพาะ `vpsEnabled` + `vpsReads` ใน staging manifest
2. ใช้ `server-sync.mjs` เป็น integration boundary เดียว
3. เพิ่ม telemetry แบบไม่เก็บข้อมูลผู้เล่น: request ID, latency, gate state, release metadata
4. ทดสอบ ready, maintenance, not-ready, timeout, malformed และ incompatible version
5. ยืนยัน Firebase fallback และ rollback ด้วยการปิด manifest flag

ข้อห้าม: ยังไม่เปิด account linking, save reads/writes, migration, realtime หรือ economy mutation

## Goal 3 — Account linking design review

- ออกแบบ one-time link token, expiry, replay protection และ audit trail
- กำหนด consent/error/rollback flow
- ทำ contract tests กับ Server ก่อนเขียน adapter
- ยังไม่ย้ายหรือแก้บัญชีจริง

## Goal 4 — Save migration rehearsal

- Server-side import job เท่านั้น
- snapshot, idempotency key, validation และ reconciliation report
- dry-run กับ staging fixtures
- กำหนด rollback และ conflict policy
- ยังไม่เปิด autosave cutover

## Goal 5 — Domain-by-domain cutover

ลำดับที่เสนอ: profile/account → inventory → progression → economy → realtime

ทุก domain ต้องผ่าน staging acceptance, observability, reconciliation และ rollback gate
ก่อนเปิด domain ถัดไป โดย Firebase ยังเป็น fallback จนกว่าจะปิด migration window

## Explicit non-goals

เอกสารนี้ไม่อนุมัติการแก้ production/VPS, Firebase shutdown, player-data writes,
account/save migration หรือ economy mutation และไม่แทนที่ Server owner approval
