# งานสำหรับเอเจนทดสอบนอก VPS — มอนวาร์ป, Recall, NPC Recovery

## เป้าหมายและคำสั่งล่าสุดของเจ้าของ

เจ้าของยืนยันว่าโจมตีมอนป่าได้แล้ว แต่ปามอนแล้วปุ่มไม่เปลี่ยนเป็น Recall, กดรักษาแล้วสถานะไม่เปลี่ยน และระหว่างต่อสู้ HP/ตัวเลขดาเมจเปลี่ยนแต่ภาพมอน/ตำแหน่งวาร์ป

คงรอบส่งโลกของ Server **50 ms (0.05 วินาที)** เดิม ไม่เปลี่ยนทุก timer เป็น200ms และไม่แก้ simulation/cooldown/save/auth เพื่อกลบอาการภาพ เอเจนนี้ทำงานบนเครื่องนอก VPS เท่านั้น

ผลที่ต้องส่งคือหลักฐานแยก **target จาก Server กระโดด**, **renderer กระโดด**, **เฟรมตก**, **packet/command ล่าช้า** แล้วแพตช์เฉพาะ domain ที่พิสูจน์ได้ ไม่ประกาศหายจาก CI หรือภาพนิ่ง

## Source of Truth / baseline

ตรวจ GitHub และ runtime ใหม่ก่อนเริ่ม ตัวเลขนี้เป็นจุดอ้างอิง ณ ส่งงาน ไม่ใช่สถานะถาวร

| ระบบ | SHA อ้างอิง |
|---|---|
| PocketMonster production หลัง #635 | `f2f2c86a1aa4012f571e1d36f8819c8f526fca8c` |
| MonsterLifeServer artifact ที่ติดตั้งหลัง #48 | `ec9e0c292bb94ece876191c4e82e0e008220d757` |
| MonsterLifeServer merge #48 | `32af8cf198dbb91dd3ed53f4cf69d6afd113947c` |
| Pirate-fruit- renderer baseline หลัง #172 | `09afc8e796c3005fdf9dd6fdf2976bb3eba073b7` |

Repos: `nustanakritwithai/PocketMonster`, `nustanakritwithai/Pirate-fruit-`, `nustanakritwithai/MonsterLifeServer`

Pocket candidate branch: **`codex/monster-recall-recovery-feedback-20260928`**. Resolve PR head SHA จาก GitHub แล้วบันทึกในผลทุกชุด; ถ้าสาขายังไม่เผยแพร่หรือยังไม่ตรงหัว PR ให้หยุดเฉพาะ candidate gate เป็น UNKNOWN ไม่ยืม main มารายงานว่า candidate ผ่าน

Candidate ประกอบด้วย:

- ปุ่มเฉพาะ `monsterThrowBtn` เปลี่ยนปา→Recall ตาม canonical active/capability; `captureBtn` คงโจมตี ห้ามทำให้โจมตีหาย
- NPC อ่าน inventory revision สดก่อนคำสั่งใหม่; retry ที่ไม่รู้ผลยังใช้ command ID/revision เดิม; read-back กระเป๋าและ control-state หลัง ACK ทำขนาน
- Direct runtime ต่อ callback read-back ของ Recall
- control-state candidate poll200ms + WS HP-change invalidation ใช้ limiterร่วม200ms/single-flight; ไม่ใช่การเปลี่ยน Server50ms และไม่ใช่การรับรอง latency200ms
- ไม่ repaint HUD เมื่อ payload เท่าเดิม; cache chain ใหม่; ยังไม่มีแพตช์ native renderer แก้วาร์ป

ก่อนทดสอบตรวจ diff จริงอีกครั้ง หาก candidate เปลี่ยนจากรายการนี้ให้บันทึกความต่าง ห้ามเปิด flags เพื่อทำให้ผ่าน

## ขอบเขตอำนาจ / สิ่งห้ามทำ

- รัน build, unit, browser, capture และ profiling บนเครื่องเอเจน/CI เท่านั้น ไม่ลง dependency หรือเปิด browser บน VPS
- ใช้ Guest QA เฉพาะที่ได้รับอนุญาต ไม่ใช้บัญชีผู้เล่นจริง ไม่แก้ HP/SQL โดยตรงให้ตายหรือฟื้น
- อนุญาตตรวจ production แบบบัญชี QA จำนวนจำกัด; concurrencyหนึ่งบัญชีต่อ scenario ไม่ stress/load-test production
- ห้าม merge/deploy/restart/kill process/migrate SQL/restore DB/เปลี่ยน flags บน production
- คง `vpsWrites`, `playerDataWrites`, generic `Combat.Enabled` ตามค่าจริง ห้ามเปิดเพื่อผ่านเกต
- ไม่เก็บ token/password/Authorization/Cookie/launch ticket/ข้อมูลส่วนตัวลง log, URL, HAR, screenshot หรือ artifact; เก็บเฉพาะ metadata ที่อนุญาต ใช้ alias แทน account/actor ของผู้ใช้
- Client และ renderer เป็น intent/presentation เท่านั้น Server เป็นเจ้าของ HP, active state, damage, inventory และ revision
- HTTP ACK ไม่ใช่หลักฐาน Recall/Recovery สำเร็จ ต้องอ่าน authoritative state กลับ

## ขั้น A — เตรียมและตรวจ candidate

1. อ่าน AGENTS.md ของแต่ละ checkout, บันทึก branch/head/status ห้าม reset งานผู้อื่น
2. อ่าน `package.json`, CI workflows และ lockfile; ใช้ Node ตาม CI ติดตั้งด้วย lockfileบนเครื่องทดสอบ
3. รัน focused Pocket tests ต่อไปนี้ แล้วรัน CI ที่เกี่ยวข้องบน runner:

```text
node tests/v90-unified-mobile-controls.mjs
node tests/v90-pirate-throw-failure-visible.mjs
node tests/v90-monster-control-controller.mjs
node tests/v90-monster-recall-races.mjs
node tests/v90-monster-command-http-provider.mjs
node tests/monster-controls-direct-runtime.mjs
node tests/monster-control-realtime-refresh.mjs
node tests/v90-npc-online-recovery.mjs
node tests/monster-bag-state-provider.mjs
node tests/pirate-monster-bag-vitals.mjs
node --experimental-vm-modules tests/v90-unified-shell-runtime.mjs
node --experimental-vm-modules tests/v90-unified-scene-runtime.mjs
```

4. สร้าง preview จาก exact head ตาม `scripts/build-github-pages.mjs`/workflow อย่าใช้ artifact รุ่นก่อน หาก preview origin เข้า authenticated Server ไม่ได้ให้ใช้ stagingที่อนุญาตหรือรายงาน UNKNOWN; ห้ามขยาย CORS/redirect allowlist production เอง
5. ทดสอบทั้ง mobile viewportและมือถือจริงเมื่อมี; บันทึก OS/browser/device, resolution, DPR, quality preset, exact asset hashes และรอบแรก/หลังreload

## ขั้น B — จำลองอาการและเก็บหลักฐานช่วงเวลาเดียวกัน

แต่ละรอบ baseline/candidate ใช้จุดเกิด กล้อง ชนิดมอน จำนวนผู้เล่น และ qualityเหมือนกัน แยกทดสอบ **มอนป่า** กับ **มอนที่ผู้เล่นปาออก** อย่าอนุมานว่าทั้งสองใช้ rendererเดียวกัน

1. เดินตามมอน/ให้มอนวิ่งเข้าหาโดยไม่โจมตี 15–30วินาที
2. โจมตีธรรมดาให้ HPลด พร้อมท่าตี/เลขดาเมจ 15–30วินาที
3. ปามอนให้สู้มอนป่า แล้วเดินรอบเป้าหมายและเปลี่ยนทิศกล้อง
4. ทำซ้ำใน networkปกติ ก่อนใช้ network jitterจำลองบนเครื่องQA; ผลจำลองห้ามอ้างว่า productionเกิดเหตุเดียวกัน
5. เก็บ video และ browser Performance trace ช่วงเดียวกัน โดยไม่แสดงข้อมูลลับ

Telemetry ที่ต้องเก็บแบบจำกัด/opt-in ไม่ logทุกpacketลงconsole:

| ชั้น | ข้อมูลที่ต้องใช้แยกสาเหตุ |
|---|---|
| Input/command | monotonicเวลาปุ่ม, command enqueue/send, ACK, authoritative read-back; ใช้ alias command ID |
| Transport | ระยะห่างsnapshotที่รับ, generation/sequence, payloadขนาด, RTT; ห้ามนำ server UTC ลบ client monotonic โดยตรง |
| Target | actor alias, target XYZ/headingจากsnapshot, source route original-world/owned, delta targetต่อsnapshot |
| Render | render XYZ/headingต่อเฟรม, deltaต่อเฟรม, actor create/remove/resetพร้อมสาเหตุ |
| Frame | frame time p50/p95/max, long task, GC, draw calls/trianglesเมื่อมี, number of fixed substeps |
| Combat | action sequence/id แบบalias, เวลาเริ่ม/รีเซ็ตท่า, authoritative HP revision, เวลาแสดงเลขdamage |

เก็บอย่างน้อย5วินาทีก่อนและหลังเหตุวาร์ป ชี้ frame/timestamp ในวิดีโอที่ตรงกับ telemetry ระบุขนาดการกระโดดเป็นหน่วยโลก ห้ามสรุปว่า interpolationเสียจากภาพนิ่งอย่างเดียว

## ขั้น C — จุด source ที่ต้องแยกพิสูจน์

### Pirate-fruit-

- `client/src/monster/SharedMonsterClient.ts`: `applySnapshot`, `upsert`, `applyDelta`, `applyActors`, `update`, `applyAttack`
- `client/src/monster/PocketOwnedMonsterRenderer.ts`: `setActors`, `update`, `ownedMonsterActionKey`, `ownedMonsterActionMotion`
- `client/src/realtime/PocketMonsterParentPresence.ts`: `applySnapshot`, original-world envelope dispatch
- `client/src/main.ts`: `onMonsterActors`, `onOriginalWorldMessages`, generation/session resets, message dedupe
- `client/src/engine/Game.ts`: fixed-step loopและrender cadence

ข้อเท็จจริงที่อ่านพบ แต่ **ไม่ใช่ causal proof**:

- owned renderer lerpตำแหน่ง แต่ assign headingตรงทุกupdate และ action motionอิง headingใหม่ อาจต้องวัดการเปลี่ยนทิศระหว่าง lunge
- สูตร owned lerp `min(1,dt*12)` ไม่พอจะฟันธง frame hitch เพราะ Gameเรียก updatable ด้วย fixedDt1/60 ไม่ใช่ raw frameDt
- `Game` ทำหลาย fixed substepsก่อนrenderเมื่อframeตก ต้องตรวจframe timeจริง
- main มี `pirateOriginalWorldClaimed` guard แล้ว ห้ามแก้โดยสมมติว่า ambientใช้สองauthorityพร้อมกัน
- ตรวจการremove/recreateจาก snapshotที่ขาดactor, generation/zoneเปลี่ยน และการเล่นท่าซ้ำจากsequenceก่อนเพิ่ม smoothing

### PocketMonster / Server

- Pocket `chat-runtime.mjs`: ส่งตำแหน่ง50ms; `online-world-bridge-v900.mjs`, `pirate-presence-bridge-v900.mjs`: snapshot forwarding
- Server `GameHttpServer.cs`: presence/snapshot50ms, `GameHttpServer.PirateOriginal.cs`, `PirateOriginalWorldBridge.cs`: worker RPC/capture/persistence
- เคยพบ worker timeoutทำให้world unavailable แม้health ready; currentNPC patchไม่ได้แก้สาเหตุนี้ หากพบซ้ำให้ส่ง safe code/timestampและหยุดscenario ไม่restartเพื่อกลบหลักฐาน

ถ้า targetต่อเนื่องแต่renderกระโดด: แก้ presentation interpolation/lifecycleในNative พร้อม deterministic regression test

ถ้า targetกระโดดตั้งแต่Server: ส่ง exact snapshot sequence/deltaและsourceให้Server ownerตรวจ ห้ามsmoothเพื่อซ่อน authority bug

ถ้าเฟรมตกแต่target/render algorithmต่อเนื่อง: แยกCPU/GPU/DOM/GC ด้วยtrace ไม่เปลี่ยน tickของServerหรือหักรายละเอียดผู้เล่นเพื่อให้เลขFPSดูดี

## ขั้น D — Acceptance ที่ต้องเห็นใน browserจริง

| Gate | เงื่อนไข SAT |
|---|---|
| Attack regression | ปุ่มโจมตีปกติยังใช้งานได้ทั้งก่อน/หลังปามอน, server HPลด |
| Throw→Recall | เตรียมมอน→ปา→ACK→canonical active→ปุ่มเดิมแสดง Recall; touch/keyboardส่งครั้งเดียว |
| Recall | คลิก→pending→ACK→read-back inactive→ปุ่มกลับสถานะถูกต้อง ไม่ค้าง pending/ไม่ทำซ้ำ |
| Switch | เตรียมอีกตัวขณะมีactive→สลับได้เมื่อcapabilityอนุญาต; ไม่แย่งปุ่มโจมตี/boat |
| Death/recovery | มอนตายจริง HP0→ข้ามแมพNPC→รักษา→read-back HP>0/fainted=false→แถบ/กระเป๋า/rendererตรงกัน→ปาใหม่ได้ |
| Stale revision | เล่นPirateจนrevisionต่างจากcachedbag แล้วรักษา; requestใช้เลขอ่านสด ไม่409ซ้ำตลอด |
| Races | เปลี่ยนฉาก/logoutระหว่างcommand/read-back, จำลองตอบกลับสลับลำดับ: ห้ามcommitข้อมูลเก่าหรือหลอกว่าhealสำเร็จ |
| Visual continuity | baselineจับวาร์ปได้และcandidateลดเหตุเดียวกันจากtrace/video โดยไม่เปลี่ยนHP,target,hit timing หรือซ่อนactor |
| Runtime safety | ไม่มีunhandled error/duplicatecommand/secondHPwriter; cache/assetsตรงheadและflagsเดิม |

## ผลส่งกลับ

ส่งตาราง **SAT / VIOL / UNKNOWN** ทุกเกต พร้อม exact repo/SHA, file/function, reproduction, expected/actual, owner, ลิงก์CIและหลักฐาน sanitized

ไฟล์แนะนำ: `summary.md`, `results.json`, `reproduction.md`, `timings.csv`, baseline/candidate videoและtrace, `SHA256SUMS` เก็บใน private artifactที่เข้าถึงได้ตามสิทธิ์ ไม่แนบ raw HAR ที่มี session

ถ้าจะทำแพตช์ให้เปิด Draft PR แยก Native/Server/Pocketตามเจ้าของปัญหา ใส่testที่ล้มก่อนแก้และผ่านหลังแก้ Rootตรวจintegration/cache/rollbackก่อนmerge ไม่มีProduction PASSจนauthenticatedbrowserflowผ่านจริง
