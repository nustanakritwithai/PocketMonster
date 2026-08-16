# Monster Life RPG V8.0.0 — Progression Core live loop

เวอร์ชันเล่นได้จริงของแผน V7.1–V8.0: สูตรสเตท, การเลี้ยง, ต่อสู้, อาหาร 6 หมวด, สกิล candidate/mutation, อุปกรณ์คลัง, วิวัฒนาการหลายสาขา, อีเวนต์, ผสมพันธุ์ และ CR Debug Panel

เปิดโดยตรง: `http://127.0.0.1:8081/v800.html`  
GitHub Pages ใช้ `index.html` ซึ่งต้องเหมือน `v800.html` ทุกไบต์

## สิ่งที่ต่อเข้า live loop ใน V8.0.0

- `content-catalog.mjs` — ข้อมูลอาหาร / ของ / personality / skill / สาขาอีโวล แยกจาก runtime
- `live-progression.mjs` — อะแดปเตอร์สูตรที่เทสได้ (สเตท, ดาเมจ+crit, จับมอน, EXP, เทรนที่ Ranch)
- `refreshStats` ใช้ Combat Rating + training / nutrition / equipment / gene / evo / condition
- ดาเมจใช้ `defenseMitigation` + mastery + derived crit
- จับมอนใช้สูตร capture ของ V7.1 — Boss / `capturePolicy: disabled` = 0
- อาหารครบ 6 หมวด: Daily / Favorite / Training / Nutrition / Skill / Evolution
- Skill candidate (Flame Bite) และ Mutation เมื่อ Master
- คลังอุปกรณ์ + preview CR/DPS/EHP ก่อนใส่
- Flare Slime: Form Lv.2 แล้วเลือก Flame Wolf หรือ Magma Bear จาก Raising Profile
- Raising Event โผล่ตอนเลี้ยงที่ Ranch; personality มีผลต่อเทรน
- CR Debug Panel แยก Base / Level / Training / Gene / Evolution / Equipment / Condition
- Save ผ่าน `normalizeSavedState` + `migrateState`

## ไฟล์เวอร์ชัน

- Active entry: `index.html` = `v800.html`
- Runtime: `game-v800.js?v=800`
- Styles: `style-v800.css?v=800`
- `ASSET_REVISION = '800'` • `APP_VERSION = '8.0.0'` • save schema 8

## เทสต์

```bash
npm test
npm run ci
npm run sim
```

ชุด `v80-live-wiring.mjs` และ `v80-master-plan.mjs` ตรวจว่าเกมเรียกโมดูล V7.x จริงและคอนเทนต์ตามแผนแม่บทครบแกน Vertical Slice
