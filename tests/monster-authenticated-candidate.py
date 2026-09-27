"""ตรวจ candidate ใน browser ของ runner เท่านั้น ไม่ deploy และไม่จำลอง auth/HP."""
import asyncio
import hashlib
import json
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
         'damaged-monster-recovery': 'UNKNOWN'}
EVIDENCE = {'sha': os.environ.get('CANDIDATE_SHA'), 'gates': GATES,
            'scope': 'runner-browser-candidate-assets-live-guest-no-deploy',
            'http': [], 'assets': {}, 'visibleControls': [], 'errorType': None,
            'stage': 'start', 'networkFailures': []}
SAFE_PATHS = {'/api/auth/firebase/login', '/api/auth/launch-ticket',
              '/api/auth/launch-ticket/redeem', '/api/pirate/state',
              '/api/monsters/control-state', '/api/monsters/command',
              '/api/monsters/npc-recovery'}
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
                if path.endswith('/redeem') and response.status == 200:
                    GATES['launch-redeem'] = 'SAT'
        context.on('response', response_seen)
        def failed_request(request):
            host = urlsplit(request.url).hostname
            if host in {'157.85.96.139', 'www.gstatic.com', 'identitytoolkit.googleapis.com', 'pocketmonster-game.web.app'}:
                item = {'host': host, 'failure': request.failure}
                if item not in EVIDENCE['networkFailures']:
                    EVIDENCE['networkFailures'].append(item)
        context.on('requestfailed', failed_request)
        page = await context.new_page()
        try:
            EVIDENCE['stage'] = 'firebase-page'
            await page.goto('https://pocketmonster-game.web.app/', wait_until='domcontentloaded', timeout=45000)
            EVIDENCE['stage'] = 'firebase-listeners-ready'
            await page.wait_for_function('window.POCKETMONSTER_LOGIN_REQUIRED === true', timeout=45000)
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
                    try:
                        if await frame.evaluate("Boolean(window.POCKETMONSTER_MONSTER_CONTROL_CONTROLLER)"):
                            scene = frame
                            break
                    except Exception:
                        pass
                if scene:
                    break
                await asyncio.sleep(1)
            if not scene:
                raise RuntimeError('candidate-scene-controller-missing')
            GATES['candidate-scene'] = 'SAT'
            EVIDENCE['stage'] = 'scene-ready'
            # เก็บเฉพาะชื่อ element ที่กำหนด ไม่เก็บ DOM/account/session/URL ทั้งก้อน
            for selector in ['#monsterSlot1Btn', '#monsterThrowBtn', '#npcBtn', '#healAllBtn',
                             '[data-ranch-service="heal"]', '#mmorpgMonsterBagButton']:
                if await scene.locator(selector).count() and await scene.locator(selector).first.is_visible():
                    EVIDENCE['visibleControls'].append(selector)
            EVIDENCE['world'] = await scene.evaluate("document.body.dataset.combinedWorld || null")
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
            await context.close()
            await browser.close()
            (OUT / 'result.json').write_text(json.dumps(EVIDENCE, ensure_ascii=False, indent=2), encoding='utf-8')
            print(json.dumps({'gates': GATES, 'errorType': EVIDENCE['errorType']}, ensure_ascii=False))
    # bootstrap probe ยังไม่รับรอง Recall/Recovery: UNKNOWN ห้ามนับ PASS
    return 0 if all(GATES[k] == 'SAT' for k in ('firebase-login', 'launch-redeem', 'candidate-scene')) else 1

if __name__ == '__main__':
    raise SystemExit(asyncio.run(main()))
