"""ตรวจ candidate ใน browser ของ runner เท่านั้น ไม่ deploy และไม่จำลอง auth/HP."""
import asyncio
import hashlib
import json
import math
import mimetypes
import os
import re
from pathlib import Path
from urllib.parse import unquote, urlsplit
from playwright.async_api import async_playwright

ROOT = Path('candidate-artifact/dist-pages').resolve()
OUT = Path('authenticated-candidate-evidence')
ORIGIN = 'https://nustanakritwithai.github.io'
PREFIX = '/PocketMonster/'
GATES = {'firebase-login': 'UNKNOWN', 'launch-redeem': 'UNKNOWN',
         'candidate-scene': 'UNKNOWN', 'throw-recall': 'UNKNOWN',
         'save-reload': 'UNKNOWN',
         'healed-bag-ui': 'UNKNOWN', 'revived-summon': 'UNKNOWN',
         'damaged-monster-recovery': 'UNKNOWN'}
EVIDENCE = {'sha': os.environ.get('CANDIDATE_SHA'), 'gates': GATES,
            'scope': 'runner-browser-candidate-assets-live-guest-no-deploy',
            'http': [], 'assets': {}, 'visibleControls': [], 'errorType': None,
            'stage': 'start', 'networkFailures': []}
SAFE_PATHS = {'/api/auth/firebase/login', '/api/auth/launch-ticket',
              '/api/auth/launch-ticket/redeem', '/api/pirate/state',
              '/api/monsters/control-state', '/api/monsters/command',
              '/api/monsters/recover', '/api/pirate/state/operation'}
CRITICAL = {'index.html', 'scene-v900.html', 'monster-control-scene-binding-v900.mjs',
            'unified-mobile-controls-v900.mjs', 'game-v800.js'}

async def main():
    if os.environ.get('GITHUB_ACTIONS') != 'true':
        raise SystemExit('โปรแกรมนี้อนุญาตเฉพาะ GitHub runner ไม่ใช่ VPS')
    OUT.mkdir(exist_ok=True)
    if not (ROOT / 'index.html').is_file():
        raise SystemExit('candidate artifact ขาด index.html')
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        context = await browser.new_context(viewport={'width': 960, 'height': 540},
                                            has_touch=True, device_scale_factor=1, service_workers='block')
        async def candidate(route):
            url = urlsplit(route.request.url)
            relative = unquote(url.path[len(PREFIX):]) or 'index.html'
            file = (ROOT / relative).resolve()
            if not file.is_relative_to(ROOT) or not file.is_file():
                await route.abort()
                return
            body = file.read_bytes()
            if relative in CRITICAL:
                EVIDENCE['assets'][relative] = hashlib.sha256(body).hexdigest()
            mime = 'text/javascript' if file.suffix in ('.js', '.mjs') else mimetypes.guess_type(str(file))[0]
            await route.fulfill(status=200, body=body, content_type=mime or 'application/octet-stream',
                                headers={'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*'})
        # เปลี่ยนเฉพาะ asset ภายใน browser นี้ ไม่ intercept คำตอบ API หรือ WebSocket
        await context.route(ORIGIN + PREFIX + '**', candidate)
        def response_seen(response):
            path = urlsplit(response.url).path
            if urlsplit(response.url).hostname == 'identitytoolkit.googleapis.com' and path.endswith('/accounts:signUp') and response.status == 200:
                GATES['firebase-login'] = 'SAT'
            if path in SAFE_PATHS:
                item = {'path': path, 'status': response.status}
                if item not in EVIDENCE['http']:
                    EVIDENCE['http'].append(item)
                if path == '/api/auth/firebase/login' and response.status == 200:
                    GATES['firebase-login'] = 'SAT'
                if path == '/api/pirate/state' and response.status >= 500:
                    GATES['candidate-scene'] = 'VIOL'
                if path.endswith('/redeem') and response.status == 200:
                    GATES['launch-redeem'] = 'SAT'
        context.on('response', response_seen)
        state_reads = []
        state_acks = []
        initializations = []
        response_tasks = set()
        async def read_state_metadata(response):
            path = urlsplit(response.url).path
            if path in SAFE_PATHS and response.status >= 400:
                try:
                    failure = await response.json()
                    code = failure.get('errorCode') or failure.get('code')
                    if isinstance(code, str) and re.fullmatch(r'[A-Z0-9_]{1,64}', code):
                        item = {'path': path, 'status': response.status, 'code': code}
                        if item not in EVIDENCE.setdefault('apiErrors', []):
                            EVIDENCE['apiErrors'].append(item)
                except Exception:
                    pass
            if path not in {'/api/pirate/state', '/api/pirate/state/operation'} or response.status != 200:
                return
            try:
                data = await response.json()
                if response.request.method == 'POST' and path == '/api/pirate/state':
                    initializations.append(True)
                checkpoint = (data.get('persisted') or {}).get('player', {}).get('checkpoint')
                metadata = {'revision': data.get('revision'), 'initialized': data.get('initialized'),
                            'hash': hashlib.sha256(checkpoint.encode()).hexdigest() if isinstance(checkpoint, str) else None}
                if response.request.method == 'GET':
                    state_reads.append(metadata)
                elif path == '/api/pirate/state/operation' and data.get('ok') is True:
                    state_acks.append(metadata)
            except Exception:
                pass
        def queue_state_metadata(response):
            task = asyncio.create_task(read_state_metadata(response))
            response_tasks.add(task)
            task.add_done_callback(response_tasks.discard)
        context.on('response', queue_state_metadata)
        def failed_request(request):
            host = urlsplit(request.url).hostname
            if host in {'157.85.96.139', 'www.gstatic.com', 'identitytoolkit.googleapis.com', 'pocketmonster-game.web.app'}:
                item = {'host': host, 'failure': request.failure}
                if item not in EVIDENCE['networkFailures']:
                    EVIDENCE['networkFailures'].append(item)
        context.on('requestfailed', failed_request)
        wild = []
        wire_counts = {'worldPoseSends': 0, 'worldSnapshots': 0}
        def observe_page(opened_page):
            def observe_socket(socket):
                def sent(payload):
                    try:
                        if json.loads(payload).get('type') == 'world-pos':
                            wire_counts['worldPoseSends'] += 1
                    except (ValueError, TypeError):
                        pass
                socket.on('framesent', sent)
                def received(payload):
                    nonlocal wild
                    try:
                        packet = json.loads(payload)
                        world = packet.get('payload', {})
                        if packet.get('type') == 'world-snapshot' and world.get('zone') == 'pirate-fruit':
                            wire_counts['worldSnapshots'] += 1
                            wild = [{'id': a['actorId'], 'x': a['pose']['x'], 'z': a['pose']['z'],
                                     'maxHp': a['authority']['hp']['max']}
                                    for a in world.get('actors', [])
                                    if a.get('kind') == 'monster' and a.get('actorId', '').startswith('monster:')
                                    and a.get('authority', {}).get('hp', {}).get('current', 0) > 0]
                    except (ValueError, KeyError, TypeError):
                        pass
                socket.on('framereceived', received)
            opened_page.on('websocket', observe_socket)
        # อ่าน socket ของเกมเท่านั้น ไม่เปิด socket/presence writer อีกตัว
        context.on('page', observe_page)
        page = await context.new_page()
        game = None
        try:
            EVIDENCE['stage'] = 'firebase-page'
            await page.goto('https://pocketmonster-game.web.app/', wait_until='domcontentloaded', timeout=45000)
            EVIDENCE['stage'] = 'firebase-listeners-ready'
            # รอ module/network โดยไม่ใช้ wait_for_function ซึ่ง compile ด้วย eval ขัด CSP
            await page.wait_for_load_state('networkidle', timeout=45000)
            EVIDENCE['stage'] = 'guest-click'
            await page.locator('#guestLoginBtn').click(timeout=30000)
            EVIDENCE['stage'] = 'launch-navigation'
            game = None
            for _ in range(90):
                for candidate_page in context.pages:
                    if candidate_page.url.startswith(ORIGIN + PREFIX):
                        game = candidate_page
                        break
                if game:
                    break
                await asyncio.sleep(1)
            if not game:
                raise RuntimeError('candidate-game-navigation-missing')
            EVIDENCE['stage'] = 'scene-controller'
            # รอ scene จาก boot จริง ไม่ใส่ token/localStorage หรือเรียกฟังก์ชันข้าม gate
            scene = None
            for _ in range(90):
                for frame in game.frames:
                    if urlsplit(frame.url).path != PREFIX + 'scene-v900.html':
                        continue
                    try:
                        if await frame.evaluate("document.body?.dataset?.combinedWorld === 'pirate-fruit' && Boolean(window.POCKETMONSTER_MONSTER_CONTROL_CONTROLLER)"):
                            scene = frame
                            break
                    except Exception:
                        pass
                if scene or GATES['candidate-scene'] == 'VIOL':
                    break
                await asyncio.sleep(1)
            if not scene:
                raise RuntimeError('candidate-scene-controller-missing')
            if GATES['candidate-scene'] == 'VIOL':
                raise RuntimeError('pirate-state-server-unavailable')
            # controller อย่างเดียวไม่ยืนยัน worker; ต้องมี authenticated state success ด้วย
            if not any(item['path'] == '/api/pirate/state' and item['status'] == 200 for item in EVIDENCE['http']):
                raise RuntimeError('pirate-state-success-not-observed')
            GATES['candidate-scene'] = 'SAT'
            await scene.evaluate("""async () => {
                const {sanitizePirateLocalPresence} = await import('./pirate-presence-bridge-v900.mjs?v=8');
                window.__qaPresenceCount = 0;
                window.addEventListener('message', event => {
                    if(event.data?.type !== 'pocketmonster:pirate-presence-v1') return;
                    window.__qaPresenceCount++;
                    const m=event.data;
                    const {actors,...noActors}=m;
                    const {monsterIntents,...noIntents}=m;
                    window.__qaLastPresence = {accepted:Boolean(sanitizePirateLocalPresence(m)),
                        withoutActors:Boolean(sanitizePirateLocalPresence(noActors)),
                        withoutIntents:Boolean(sanitizePirateLocalPresence(noIntents)),
                        actorCount:Array.isArray(actors)?actors.length:null,
                        intentCount:Array.isArray(monsterIntents)?monsterIntents.length:null,
                        originNull:event.origin==='null',
                        sourceMatches:event.source===document.querySelector('#pirateFruitFrame')?.contentWindow};
                });
            }""")
            EVIDENCE['stage'] = 'scene-ready'
            # เก็บเฉพาะชื่อ element ที่กำหนด ไม่เก็บ DOM/account/session/URL ทั้งก้อน
            for selector in ['#monsterSlot1Btn', '#monsterThrowBtn', '#npcBtn', '#healAllBtn',
                             '[data-ranch-service="heal"]', '#mmorpgMonsterBagButton']:
                if await scene.locator(selector).count() and await scene.locator(selector).first.is_visible():
                    EVIDENCE['visibleControls'].append(selector)
            EVIDENCE['world'] = await scene.evaluate("document.body.dataset.combinedWorld || null")
            EVIDENCE['stage'] = 'monster-bag-ui-open'
            await game.locator('[data-utility="monster-bag"]').click(timeout=15000)
            # การเปิดกระเป๋าจริงจะโหลด Pocket inventory runtime แบบ lazy
            for _ in range(90):
                if await scene.evaluate('Boolean(window.POCKETMONSTER_MONSTER_BAG)'):
                    break
                await asyncio.sleep(0.2)
            EVIDENCE['stage'] = 'guest-starter-setup'
            # เตรียม Guest ผ่านคำสั่งปกติของ server ไม่สร้าง HP/inventory ใน client
            # ขั้นนี้เป็น API setup ไม่ใช่การรับรอง onboarding UI
            setup = await scene.evaluate("""async () => {
                const bag = window.POCKETMONSTER_MONSTER_BAG;
                if (!bag) return { ok: false, code: 'BAG_RUNTIME_MISSING' };
                const claimed = await bag.claimStarter();
                if (!claimed.ok) return { ok: false, code: claimed.code };
                const owned = bag.snapshot().envelope?.state?.collection?.[0];
                if (!owned) return { ok: false, code: 'STARTER_READBACK_MISSING' };
                const placed = await bag.assignToSlot(owned.instanceId, 0);
                return { ok: placed.ok === true, code: placed.code || 'OK' };
            }""")
            EVIDENCE['guestSetup'] = 'server-starter-and-party-slot' if setup.get('ok') else 'unavailable'
            EVIDENCE['guestSetupCode'] = setup.get('code') if re.fullmatch(r'[A-Z0-9_]{1,64}', str(setup.get('code'))) else 'UNKNOWN'
            if not setup.get('ok'):
                raise RuntimeError('guest-starter-setup-unavailable')
            close_bag = scene.locator('#monsterFieldBagClose')
            # lazy runtime อาจพร้อมก่อน overlay เปิดเสร็จ ต้องรอปุ่มปิดจริง
            await close_bag.click(timeout=20000)
            await scene.locator('#monsterFieldBag').wait_for(state='hidden', timeout=10000)

            async def confirm(expression):
                for _ in range(60):
                    if await scene.evaluate(expression):
                        return True
                    await asyncio.sleep(0.2)
                return False

            EVIDENCE['stage'] = 'throw-ui'
            # bag fallback ทำให้ช่องพร้อมได้ก่อน canonical control-state; setup ต้องรอเซิร์ฟเวอร์จริง
            canonical_ready = False
            for _ in range(100):
                if await game.evaluate('window.POCKETMONSTER_MONSTER_STATE_PROVIDER?.snapshot().available === true'):
                    canonical_ready = True
                    break
                await asyncio.sleep(0.2)
            if not canonical_ready:
                raise RuntimeError('canonical-controls-not-ready-after-bag')
            if not await confirm('window.POCKETMONSTER_MONSTER_CONTROL_CONTROLLER.snapshot().slots[0]?.available === true'):
                raise RuntimeError('party-not-ready-after-bag-close')
            await scene.locator('#monsterSlot1Btn').click(timeout=15000)
            if not await confirm("document.querySelector('#monsterThrowBtn')?.dataset.pirateIcon === 'ปา'"):
                raise RuntimeError('throw-button-not-ready')
            await scene.locator('#monsterThrowBtn').click(timeout=15000)
            if not await confirm("""(() => {
                const s = window.POCKETMONSTER_MONSTER_CONTROL_CONTROLLER.snapshot();
                return !s.pending && s.slots.some(slot => slot?.active)
                    && document.querySelector('#monsterThrowBtn')?.dataset.pirateIcon === 'Recall';
            })()"""):
                GATES['throw-recall'] = 'VIOL'
                raise RuntimeError('summon-did-not-show-recall')
            EVIDENCE['stage'] = 'recall-ui'
            await scene.locator('#monsterThrowBtn').click(timeout=15000)
            if not await confirm("""(() => {
                const s = window.POCKETMONSTER_MONSTER_CONTROL_CONTROLLER.snapshot();
                return !s.pending && !s.slots.some(slot => slot?.active)
                    && document.querySelector('#monsterThrowBtn')?.hidden === true;
            })()"""):
                GATES['throw-recall'] = 'VIOL'
                raise RuntimeError('recall-not-confirmed')
            GATES['throw-recall'] = 'SAT'
            EVIDENCE['stage'] = 'save-operation'
            native = next((f for f in game.frames if urlsplit(f.url).path.endswith('/pirate-fruit-offline/index.html')), None)
            if not native:
                raise RuntimeError('native-save-frame-missing')
            saved = await native.evaluate("""async () => {
                const checkpoint = window.localStorage.getItem('pirate-fruit:save-v1');
                const api = window.POCKETMONSTER_PIRATE_OPERATIONS;
                if (typeof checkpoint !== 'string' || !api?.request) return {ok:false};
                const result = await api.request({type:'checkpoint', checkpoint});
                const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(checkpoint));
                return {ok:Number.isSafeInteger(result?.revision) && result.persisted?.player?.checkpoint === checkpoint,
                        revision:result?.revision,
                        hash:Array.from(new Uint8Array(digest), n=>n.toString(16).padStart(2,'0')).join('')};
            }""")
            if not saved.get('ok'):
                GATES['save-reload'] = 'VIOL'
                raise RuntimeError('normal-save-operation-not-confirmed')
            EVIDENCE['stage'] = 'reload-same-session'
            before_reads, before_initializations = len(state_reads), len(initializations)
            await game.reload(wait_until='domcontentloaded', timeout=45000)
            for _ in range(90):
                scene = next((f for f in game.frames if urlsplit(f.url).path == PREFIX + 'scene-v900.html'), None)
                if scene and len(state_reads) > before_reads:
                    try:
                        if await scene.evaluate('Boolean(window.POCKETMONSTER_MONSTER_CONTROL_CONTROLLER?.snapshot().available)'):
                            break
                    except Exception:
                        pass
                await asyncio.sleep(0.5)
            reloaded = state_reads[before_reads:]
            # รออ่าน ACK ที่ได้รับแล้วให้จบก่อนเทียบ ห้ามละทิ้ง gameplay fields เพื่อให้ผ่าน
            if response_tasks:
                await asyncio.gather(*tuple(response_tasks), return_exceptions=True)
            # รวม autosave ที่ ACK แล้วก่อน reload GET; ไม่ตัด worldTime/HP หรือ gameplay fields ทิ้ง
            persisted = False
            for s in reloaded:
                if s['initialized'] is not True or not isinstance(s['revision'], int) or s['revision'] < saved['revision']:
                    continue
                eligible = [a for a in state_acks if isinstance(a['revision'], int)
                            and saved['revision'] <= a['revision'] <= s['revision'] and a['hash']]
                expected = max(eligible, key=lambda a: a['revision']) if eligible else saved
                if s['hash'] == expected['hash']:
                    persisted = True
                    break
            initialized_again = len(initializations) != before_initializations
            EVIDENCE['saveReload'] = {'persistedMatch': persisted, 'initializedAgain': initialized_again,
                                      'readCount': len(reloaded), 'savedRevision': saved['revision'],
                                      'ackRevisions': [a['revision'] for a in state_acks],
                                      'readRevisions': [s['revision'] for s in reloaded]}
            if not persisted or initialized_again:
                GATES['save-reload'] = 'VIOL'
            else:
                GATES['save-reload'] = 'SAT'
            # Save ไม่ผ่านยังคง VIOL/exit1 แต่ไม่กันการเก็บหลักฐาน NPC ที่เป็นงานหลัก
            EVIDENCE['stage'] = 'walk-to-live-wild-monster'

            async def pose():
                return await game.evaluate('window.POCKETMONSTER_WORLD_STATE?.() || null')

            async def drag_move(x, z, duration):
                box = await scene.locator('#joystick').bounding_box()
                if not box:
                    raise RuntimeError('joystick-not-visible')
                px, py = box['x'] + 65, box['y'] + box['height'] - 65
                await game.mouse.move(px, py)
                await game.mouse.down()
                try:
                    await game.mouse.move(px + x * 42, py + z * 42)
                    await asyncio.sleep(duration)
                finally:
                    await game.mouse.up()

            async def walk_to(target, radius, attempts=120):
                # วัดแกนกล้องจาก input จริง ไม่เขียนตำแหน่ง/HP/presence ข้ามเกม
                before = await pose()
                await drag_move(1, 0, 0.5)
                after = await pose()
                dx, dz = after['x'] - before['x'], after['z'] - before['z']
                length = math.hypot(dx, dz)
                if length < 0.03:
                    raise RuntimeError('joystick-movement-not-observed')
                rx, rz = dx / length, dz / length
                for _ in range(attempts):
                    if target.get('id'):
                        target = next((a for a in wild if a['id'] == target['id']), target)
                    current = await pose()
                    dx, dz = target['x'] - current['x'], target['z'] - current['z']
                    distance = math.hypot(dx, dz)
                    if distance < radius:
                        return
                    await drag_move((dx * rx + dz * rz) / distance,
                                    (-dx * rz + dz * rx) / distance,
                                    min(0.5, max(0.12, distance / 8)))
                raise RuntimeError('movement-target-not-reached')

            current = await pose()
            if not current or not wild:
                raise RuntimeError('live-world-pose-unavailable')
            # spawn ID จาก shared/src/world/monsters.ts ของ worker eeec6e6:
            # อยู่เกาะเริ่มต้นนอก safe zone; ห้ามเลือก maxHP ทั้งโลกซึ่งอยู่อีกเกาะ
            target = next((a for a in wild if a['id'] == 'monster:starter-boss-north'), None)
            if not target:
                raise RuntimeError('starter-combat-target-unavailable')
            EVIDENCE['damageSetup'] = {'wildCount': len(wild), 'targetMaxHp': target['maxHp'],
                                       'distance': round(math.hypot(target['x']-current['x'], target['z']-current['z']), 1)}
            await walk_to(target, 2.5)
            EVIDENCE['stage'] = 'natural-monster-damage'
            baseline = await game.evaluate("""(() => {
                const s = window.POCKETMONSTER_MONSTER_STATE_PROVIDER?.snapshot();
                const p = s?.party?.slots?.[0];
                return s?.available && p && Number.isFinite(p.hp) ? {id:p.instanceId, hp:p.hp} : null;
            })()""")
            if not baseline or baseline['hp'] <= 0:
                raise RuntimeError('damage-baseline-unavailable')
            await scene.locator('#monsterSlot1Btn').click()
            if not await confirm("document.querySelector('#monsterThrowBtn')?.dataset.pirateIcon === 'ปา'"):
                raise RuntimeError('damage-setup-throw-not-ready')
            await scene.locator('#monsterThrowBtn').click()
            damaged = False
            dead = False
            for _ in range(150):
                vitals = await game.evaluate("""id => {
                    const state = window.POCKETMONSTER_MONSTER_STATE_PROVIDER?.snapshot();
                    const slot = state?.party?.slots?.find(p=>p?.instanceId===id);
                    return state?.available && slot ? {hp:slot.hp, maxHp:slot.maxHp, fainted:slot.fainted} : null;
                }""", baseline['id'])
                if vitals and isinstance(vitals.get('hp'), (int, float)):
                    damaged = damaged or vitals['hp'] < baseline['hp']
                    dead = vitals['hp'] == 0 and vitals.get('fainted') is True
                    if dead:
                        break
                await asyncio.sleep(0.2)
            EVIDENCE['naturalDamageObserved'] = damaged
            EVIDENCE['naturalDeathObserved'] = dead
            EVIDENCE['finalMonsterVitals'] = vitals
            if not damaged:
                raise RuntimeError('natural-damage-not-observed')
            EVIDENCE['stage'] = 'farm-route'
            # ใช้ scene warp event เดียวกับ portal; ไม่รับรองการเดินชน portal จากขั้นนี้
            await scene.evaluate("window.dispatchEvent(new CustomEvent('pocketmonster:world-warp-v1', {detail:{type:'pocketmonster:world-warp-v1',world:'pocket-monster',panel:'throw',source:'pirate-fruit-portal'}}))")
            farm_ready = False
            for _ in range(90):
                scene = next((f for f in game.frames if urlsplit(f.url).path == PREFIX + 'scene-v900.html'), None)
                if scene:
                    try:
                        if (await scene.evaluate("document.body?.dataset.combinedWorld === 'pocket-monster' && Boolean(window.POCKETMONSTER_MONSTER_BAG)")
                                and (await pose() or {}).get('zone') == 'hub'):
                            farm_ready = True
                            break
                    except Exception:
                        pass
                await asyncio.sleep(0.5)
            if not farm_ready:
                raise RuntimeError('farm-scene-unavailable')
            EVIDENCE['stage'] = 'walk-to-keeper'
            await walk_to({'x': 4, 'z': 3}, 2.7, 25)
            keeper_pose = await pose()
            EVIDENCE['keeperPose'] = {
                'heightPresent': isinstance(keeper_pose.get('y'), (int, float)),
                'heightAllowed': isinstance(keeper_pose.get('y'), (int, float)) and abs(keeper_pose['y']) <= 2,
                'nearKeeper': math.hypot(keeper_pose['x']-4, keeper_pose['z']-3) < 3.4,
            }
            EVIDENCE['stage'] = 'npc-heal-ui'
            await scene.locator('#npcBtn').wait_for(state='visible', timeout=15000)
            EVIDENCE['npcHitTest'] = await scene.evaluate("""() => {
                const b=document.querySelector('#npcBtn'), r=b.getBoundingClientRect();
                const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
                return {buttonHit:Boolean(hit?.closest('#npcBtn')),topId:hit?.id||null,
                        pointerEvents:getComputedStyle(b).pointerEvents,
                        parentPointerEvents:getComputedStyle(b.parentElement).pointerEvents};
            }""")
            box = await scene.locator('#npcBtn').bounding_box()
            if not box:
                raise RuntimeError('npc-button-not-visible')
            point = {'x': box['x']+box['width']/2, 'y': box['y']+box['height']/2}
            EVIDENCE['npcParentHit'] = await game.evaluate("p=>document.elementFromPoint(p.x,p.y)?.id||null", point)
            if not EVIDENCE['npcHitTest']['buttonHit'] or EVIDENCE['npcParentHit'] != 'onlineWorldSceneFrame':
                raise RuntimeError('npc-button-pointer-intercepted')
            # ปุ่มติดตามกล้องเคลื่อนได้; คลิกพิกัดจริงเมื่อ hit-test ยืนยัน ไม่ force/dispatch click
            await game.mouse.click(point['x'], point['y'])
            EVIDENCE['stage'] = 'npc-recovery-click'
            await scene.locator('[data-ranch-service="heal"]').click(timeout=15000)
            if not await confirm("""(() => {
                const provider = window.POCKETMONSTER_MONSTER_STATE_PROVIDER || window.parent.POCKETMONSTER_MONSTER_STATE_PROVIDER;
                const s = provider?.snapshot();
                const slot = s?.party?.slots?.[0];
                return slot && Number.isFinite(slot.hp) && slot.hp > 0 && slot.hp === slot.maxHp && slot.fainted === false;
            })()"""):
                GATES['damaged-monster-recovery'] = 'VIOL'
                raise RuntimeError('npc-heal-control-readback-not-healthy')
            if not any(i['path'] == '/api/monsters/recover' and i['status'] == 200 for i in EVIDENCE['http']):
                raise RuntimeError('npc-heal-ack-not-observed')
            GATES['damaged-monster-recovery'] = 'SAT'
            await scene.locator('[data-ranch-close]').click()
            EVIDENCE['stage'] = 'return-pirate-revive'
            await scene.evaluate("window.dispatchEvent(new CustomEvent('pocketmonster:world-warp-v1', {detail:{type:'pocketmonster:world-warp-v1',world:'pirate-fruit',panel:'human',source:'pocket-monster-ranch-portal'}}))")
            pirate_ready = False
            for _ in range(90):
                scene = next((f for f in game.frames if urlsplit(f.url).path == PREFIX + 'scene-v900.html'), None)
                if scene:
                    try:
                        if ((await pose() or {}).get('zone') == 'pirate-fruit'
                                and await scene.evaluate('window.POCKETMONSTER_MONSTER_CONTROL_CONTROLLER?.snapshot().slots[0]?.available === true')):
                            pirate_ready = True
                            break
                    except Exception:
                        pass
                await asyncio.sleep(0.5)
            if not pirate_ready:
                raise RuntimeError('revived-pirate-slot-not-ready')
            EVIDENCE['stage'] = 'healed-bag-ui'
            # กระเป๋าใต้ minimap เป็น UI ของ Pirate; storage ของ NPC เป็นคนละหน้าต่าง
            await game.locator('[data-utility="monster-bag"]').click(timeout=15000)
            await scene.locator('#monsterFieldBag').wait_for(state='visible', timeout=15000)
            if not await confirm("""(() => {
                const provider = window.POCKETMONSTER_MONSTER_STATE_PROVIDER || window.parent.POCKETMONSTER_MONSTER_STATE_PROVIDER;
                const slot = provider?.snapshot()?.party?.slots?.[0];
                const text = document.querySelector('#monsterFieldBagMeta')?.textContent || '';
                const match = text.replaceAll(',', '').match(/HP\\s+([0-9.]+)\\/([0-9.]+)/);
                return slot && match && Number(match[1])===slot.hp && Number(match[2])===slot.maxHp
                    && slot.hp>0 && slot.hp===slot.maxHp
                    && document.querySelector('#monsterFieldBagHpFill')?.style.width === '100%';
            })()"""):
                GATES['healed-bag-ui'] = 'VIOL'
                raise RuntimeError('healed-bag-ui-not-matching-authority')
            GATES['healed-bag-ui'] = 'SAT'
            await game.screenshot(path=str(OUT / 'healed-bag.png'))
            await scene.locator('#monsterFieldBagClose').click()
            EVIDENCE['stage'] = 'revived-summon-ui'
            await scene.locator('#monsterSlot1Btn').click()
            await scene.locator('#monsterThrowBtn').click()
            if not await confirm("""(() => {
                const state = window.POCKETMONSTER_MONSTER_CONTROL_CONTROLLER.snapshot();
                return !state.pending && state.slots[0]?.active && state.slots[0].hp > 0
                    && document.querySelector('#monsterThrowBtn')?.dataset.pirateIcon==='Recall';
            })()"""):
                GATES['revived-summon'] = 'VIOL'
                raise RuntimeError('revived-monster-not-active')
            GATES['revived-summon'] = 'SAT'
            await asyncio.sleep(2)
            await game.screenshot(path=str(OUT / 'revived-renderer-review.png'))
            EVIDENCE['rendererReview'] = 'UNKNOWN-requires-screenshot-inspection'
            EVIDENCE['stage'] = 'npc-recovery-and-resummon-confirmed'
            # ภาพใช้ตัดสิน layout; ปิดข้อความทั้งหมดเพื่อไม่เผยชื่อ Guest หรือข้อมูลผู้เล่น
            for frame in game.frames:
                try:
                    await frame.add_style_tag(content='* { color: transparent !important; text-shadow: none !important; }')
                except Exception:
                    pass
            await game.screenshot(path=str(OUT / 'candidate-scene-redacted.png'))
        except Exception as error:
            # ไม่เขียน Playwright exception string ซึ่งอาจมี launch URL/token
            EVIDENCE['errorType'] = type(error).__name__
            EVIDENCE['actionability'] = {key: key in str(error) for key in ('not stable', 'intercepts pointer events', 'not visible', 'not enabled')}
            brief = str(error).split('\n')[0]
            brief = re.sub(r'https?://\S+', '[url]', brief)
            brief = re.sub(r'[A-Za-z0-9_\-]{24,}', '[redacted]', brief)
            EVIDENCE['errorSummary'] = brief[:240]
            if type(error) is RuntimeError and re.fullmatch(r'[a-z]+(?:-[a-z]+){1,14}', str(error)):
                EVIDENCE['errorCode'] = str(error)
        finally:
            if game and not game.is_closed():
                try:
                    EVIDENCE['finalWorld'] = await game.evaluate("window.POCKETMONSTER_WORLD_STATE?.()?.zone || null")
                    EVIDENCE['presenceDiagnostics'] = await game.evaluate("""() => {
                        const d=window.POCKETMONSTER_ONLINE_SHELL?.diagnostics?.();
                        const s=window.POCKETMONSTER_MONSTER_STATE_PROVIDER?.snapshot();
                        const c=window.POCKETMONSTER_MONSTER_CONTROL_CONTROLLER?.snapshot();
                        const code=c?.lastFailure?.code;
                        const chat=window.POCKETMONSTER_CHAT_RUNTIME?.diagnostics?.();
                        return {ready:d?.scenePresenceReady,reason:d?.readinessReason,zone:d?.activeZone,
                            acceptedSnapshots:d?.acceptedSnapshots,
                            socketReadyState:chat?.socketReadyState,worldPulseActive:chat?.worldPulseActive,
                            chatPaused:chat?.paused,chatStopped:chat?.stopped,
                            bootState:d?.sceneBootState,controlAvailable:s?.available,pending:c?.pending,
                            failure:/^[A-Z0-9_]{1,64}$/.test(code||'')?code:null};
                    }""")
                    for final_frame in game.frames:
                        if urlsplit(final_frame.url).path == PREFIX+'scene-v900.html':
                            EVIDENCE['scenePresenceDiagnostics'] = await final_frame.evaluate("""() => ({
                                activePose:Boolean(window.POCKETMONSTER_SCENE_PRESENCE?.state()),
                                rawPose:Boolean(window.POCKETMONSTER_WORLD_STATE?.()),
                                rawStateType:typeof window.POCKETMONSTER_WORLD_STATE,
                                lifecycleActive:window.POCKETMONSTER_SCENE_LIFECYCLE?.diagnostics?.()?.active,
                                nativeMessages:window.__qaPresenceCount??null,
                                lastNativeMessage:window.__qaLastPresence??null,
                                nativeReady:window.POCKETMONSTER_PIRATE_PRESENCE_QUEUE_DIAGNOSTICS?.()?.frameReady??null,
                                prewarming:window.POCKETMONSTER_SCENE_PREWARM===true
                            })""")
                    # เฉพาะ Guest ทดสอบ; ไม่เก็บ DOM, token, URL หรือข้อความ network
                    await game.screenshot(path=str(OUT / 'candidate-final.png'))
                except Exception:
                    pass
            await context.close()
            await browser.close()
            EVIDENCE['wireCounts'] = wire_counts
            (OUT / 'result.json').write_text(json.dumps(EVIDENCE, ensure_ascii=False, indent=2), encoding='utf-8')
            print(json.dumps({'gates': GATES, 'errorType': EVIDENCE['errorType']}, ensure_ascii=False))
    # bootstrap probe ยังไม่รับรอง Recall/Recovery: UNKNOWN ห้ามนับ PASS
    return 0 if all(value == 'SAT' for value in GATES.values()) else 1

if __name__ == '__main__':
    raise SystemExit(asyncio.run(main()))
