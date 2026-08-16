# Monster Life RPG V8.0.0 — Progression Core live loop

เวอร์ชันเล่นได้จริงของแผน V7.1–V8.0: สูตรสเตท, การเลี้ยง, ต่อสู้, อาหาร/ดูแล, สกิล, อุปกรณ์, วิวัฒนาการ, อีเวนต์ และผสมพันธุ์ ถูกต่อเข้ากับลูปเกม ไม่ใช่แค่โมดูลแยกหรือป้ายเวอร์ชัน

เปิดโดยตรง: `http://127.0.0.1:8081/v800.html`  
GitHub Pages ใช้ `index.html` ซึ่งต้องเหมือน `v800.html` ทุกไบต์

## สิ่งที่ต่อเข้า live loop ใน V8.0.0

- `live-progression.mjs` — อะแดปเตอร์สูตรที่เทสได้ (สเตท, ดาเมจ, จับมอน, EXP ตามเลเวล, เทรนที่ Ranch)
- `refreshStats` ใช้ Combat Rating + training / nutrition / equipment / gene / evo / condition
- ดาเมจใช้ `defenseMitigation` + mastery ของสกิลที่เรียนรู้แล้ว
- จับมอนใช้สูตร capture ของ V7.1 — Boss / `capturePolicy: disabled` = 0
- ชนะวายร้ายให้ Growth/Training ผ่าน `resolveBattleGrowth` แล้วรีเฟรชสเตท
- การ์ดมอนมี Care (พัก/เล่น), Equipment 3 ช่องเริ่มต้น, และบรรทัด ATK breakdown
- Evolution ใช้ `evaluateEvolution` + `commitEvolution` (ย้อนกลับไม่ได้)
- Breeding ใช้ `breed` / `createEgg` — ลูกได้ Gene/Aptitude จากพ่อแม่ ไม่ได้ Training
- Raising Event โผล่ตอนเลี้ยงที่ Ranch (`#raisingEventBanner`)
- Save ผ่าน `normalizeSavedState` + `migrateState` และเติม `growthExp` ให้เลเวลไม่ยุบตอนโหลด

## ไฟล์เวอร์ชัน

- Active entry: `index.html` = `v800.html`
- Runtime: `game-v800.js?v=800`
- Styles: `style-v800.css?v=800`
- `ASSET_REVISION = '800'` • `APP_VERSION = '8.0.0'` • save schema 8

สแนปช็อตเก่า (`v710.html`, `game-v710.js`, …) คงไว้เป็นประวัติ ไม่ใช่ entry ที่เล่น

## เทสต์

```bash
npm test
npm run ci
npm run sim
```

ชุด `v80-live-wiring.mjs` ตรวจทั้งอะแดปเตอร์สูตรและสัญญาว่า `game-v800.js` เรียกโมดูล V7.x จริง
