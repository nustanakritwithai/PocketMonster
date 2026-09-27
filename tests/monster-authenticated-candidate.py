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
        initializations = []
        response_tasks = set()
        async def read_state_metadata(response):
            if urlsplit(response.url).path != '/api/pirate/state' or response.status != 200:
                return
            try:
                data = await response.json()
                if response.request.method == 'POST':
                    initializations.append(True)
                if response.request.method == 'GET':
                    checkpoint = (data.get('persisted') or {}).get('player', {}).get('checkpoint')
                    state_reads.append({'revision': data.get('revision'), 'initialized': data.get('initialized'),
                                        'hash': hashlib.sha256(checkpoint.encode()).hexdigest() if isinstance(checkpoint, str) else None})
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
        def observe_page(opened_page):
            def observe_socket(socket):
                def received(payload):
                    nonlocal wild
                    try:
                        packet = json.loads(payload)
                        world = packet.get('payload', {})
                        if packet.get('type') == 'world-snapshot' and world.get('zone') == 'pirate-fruit':
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
            persisted = any(s['initialized'] is True and isinstance(s['revision'], int)
                            and s['revision'] >= saved['revision'] and s['hash'] == saved['hash'] for s in reloaded)
            initialized_again = len(initializations) != before_initializations
            EVIDENCE['saveReload'] = {'persistedMatch': persisted, 'initializedAgain': initialized_again}
            if not persisted or initialized_again:
                GATES['save-reload'] = 'VIOL'
                raise RuntimeError('saved-checkpoint-not-preserved-on-reload')
            GATES['save-reload'] = 'SAT'
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
            target = max(wild, key=lambda a: (a['maxHp'], -math.hypot(a['x'] - current['x'], a['z'] - current['z'])))
            EVIDENCE['damageSetup'] = {'wildCount': len(wild), 'targetMaxHp': target['maxHp'],
                                       'distance': round(math.hypot(target['x']-current['x'], target['z']-current['z']), 1)}
            await walk_to(target, 2.5)
            EVIDENCE['stage'] = 'natural-monster-damage'
            await scene.locator('#monsterSlot1Btn').click()
            if not await confirm("document.querySelector('#monsterThrowBtn')?.dataset.pirateIcon === 'ปา'"):
                raise RuntimeError('damage-setup-throw-not-ready')
            await scene.locator('#monsterThrowBtn').click()
            damaged = False
            dead = False
            for _ in range(150):
                vitals = await scene.evaluate("""(() => {
                    const slot = window.POCKETMONSTER_MONSTER_CONTROL_CONTROLLER.snapshot().slots[0];
                    return slot ? {hp:slot.hp, maxHp:slot.maxHp, fainted:slot.fainted} : null;
                })()""")
                if vitals and isinstance(vitals.get('hp'), (int, float)):
                    damaged = damaged or vitals['hp'] < vitals.get('maxHp', 0)
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
            # เรียก route เดียวกับ portal; ไม่รับรองการเดินชน portal จากขั้นนี้
            await game.evaluate("window.POCKETMONSTER_ONLINE_SHELL.navigate('pocket-monster', 'throw')")
            for _ in range(90):
                scene = next((f for f in game.frames if urlsplit(f.url).path == PREFIX + 'scene-v900.html'), None)
                if scene:
                    try:
                        if await scene.evaluate("document.body?.dataset.combinedWorld === 'pocket-monster' && Boolean(window.POCKETMONSTER_MONSTER_BAG)"):
                            break
                    except Exception:
                        pass
                await asyncio.sleep(0.5)
            if not scene:
                raise RuntimeError('farm-scene-unavailable')
            EVIDENCE['stage'] = 'walk-to-keeper'
            await walk_to({'x': 4, 'z': 3}, 2.7, 25)
            EVIDENCE['stage'] = 'npc-heal-ui'
            await scene.locator('#npcBtn').click(timeout=15000)
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
            EVIDENCE['stage'] = 'npc-heal-confirmed-render-reload-pending'
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
            brief = str(error).split('\n')[0]
            brief = re.sub(r'https?://\S+', '[url]', brief)
            brief = re.sub(r'[A-Za-z0-9_\-]{24,}', '[redacted]', brief)
            EVIDENCE['errorSummary'] = brief[:240]
        finally:
            if game and not game.is_closed():
                try:
                    EVIDENCE['finalWorld'] = await game.evaluate("window.POCKETMONSTER_WORLD_STATE?.()?.zone || null")
                    # เฉพาะ Guest ทดสอบ; ไม่เก็บ DOM, token, URL หรือข้อความ network
                    await game.screenshot(path=str(OUT / 'candidate-final.png'))
                except Exception:
                    pass
            await context.close()
            await browser.close()
            (OUT / 'result.json').write_text(json.dumps(EVIDENCE, ensure_ascii=False, indent=2), encoding='utf-8')
            print(json.dumps({'gates': GATES, 'errorType': EVIDENCE['errorType']}, ensure_ascii=False))
    # bootstrap probe ยังไม่รับรอง Recall/Recovery: UNKNOWN ห้ามนับ PASS
    return 0 if all(value == 'SAT' for value in GATES.values()) else 1

if __name__ == '__main__':
    raise SystemExit(asyncio.run(main()))
