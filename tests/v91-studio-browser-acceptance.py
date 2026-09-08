"""Actual Studio + sandboxed Pirate client in isolated V9 DOM/CSP.
No production credentials, online saves or fabricated character package.
"""
import functools
import http.server
import json
import mimetypes
import os
from pathlib import Path
import re
import threading
from urllib.parse import unquote, urlparse
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'studio-browser-evidence'
OUT.mkdir(exist_ok=True)
ENTRY = ROOT / 'studio-browser-entry.html'
ENTRY_MODULE = ROOT / 'studio-browser-entry.mjs'
# Keep production controls/styles/CSP. This offline fixture has no login handler;
# hide its static login overlay, not any production authorization mechanism.
template = re.sub(r'<script\b[^>]*>[\s\S]*?</script>', '', (ROOT / 'v900.html').read_text(), flags=re.I)
template = template.replace('class="account-gate"', 'class="account-gate hidden"')
template = template.replace('<body>', '<body data-control-panel="human" data-combined-world="pirate-fruit">')
# The online shell normally activates the selected world's real input adapter.
ENTRY_MODULE.write_text("import './boot-pirate-fruit-v900.mjs';\nwindow.POCKETMONSTER_UNIFIED_MOBILE_CONTROLS.activate('pirate-fruit');\n")
ENTRY.write_text(template.replace('</body>', '<script type="module" src="./studio-browser-entry.mjs"></script></body>'))

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, *_):
        pass

server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
report = {'commit': os.environ.get('GITHUB_SHA'), 'scope': 'isolated real V9 controls/CSP + Pirate boot + pinned actual Studio; mobile emulation, not authenticated production', 'errors': [], 'console': []}
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width': 960, 'height': 540}, is_mobile=True, has_touch=True, device_scale_factor=1)
        studio = ROOT / '.ci-studio-source' / '_site'
        three = Path('/tmp/studio-browser/node_modules/three')
        block_studio = False
        def assets(route):
            u = urlparse(route.request.url)
            if u.hostname == 'nustanakritwithai.github.io' and u.path.startswith('/3JS-player-block-asset-engine-/'):
                if block_studio:
                    route.abort()
                    return
                rel = unquote(u.path[len('/3JS-player-block-asset-engine-/'):]) or 'index.html'
                source = studio / rel
            elif u.hostname == 'cdn.jsdelivr.net' and u.path.startswith('/npm/three@0.169.0/'):
                source = three / unquote(u.path[len('/npm/three@0.169.0/'):])
            elif u.hostname == '127.0.0.1':
                route.continue_()
                return
            else:
                route.abort()  # Never contact an actual gameplay/save backend.
                return
            if source.is_file():
                mime = 'text/javascript' if source.suffix in ('.js', '.mjs') else mimetypes.guess_type(str(source))[0] or 'application/octet-stream'
                route.fulfill(path=str(source), content_type=mime, headers={'Access-Control-Allow-Origin': '*'})
            else:
                route.fulfill(status=404, body='Test asset missing: ' + str(source))
        context.route('**/*', assets)
        page = context.new_page()
        page.on('pageerror', lambda e: report['errors'].append(str(e)) if len(report['errors']) < 100 else None)
        page.on('console', lambda m: report['console'].append({'type': m.type, 'text': m.text[:1500]}) if m.type in ('error', 'warning') and len(report['console']) < 100 else None)
        # Export independently first so a failed render still leaves the actual input.
        producer = context.new_page()
        producer.goto('https://nustanakritwithai.github.io/3JS-player-block-asset-engine-/', wait_until='domcontentloaded')
        producer.wait_for_function('window.__CPS_BOOT_OK__ && window.POCKET_STUDIO_CHARACTER_BRIDGE', timeout=30000)
        package_text = producer.evaluate('JSON.stringify(window.POCKET_STUDIO_CHARACTER_BRIDGE.buildPackage({}))')
        (OUT / 'actual-studio-package.json').write_text(package_text)
        package = json.loads(package_text)
        report['producer'] = {'stats': package.get('sceneGraph', {}).get('stats'), 'animationCount': len(package.get('animations', []))}
        producer.close()
        def child_frame():
            return next((f for f in page.frames if '/pirate-fruit-offline/' in f.url), None)
        def snapshot():
            child = child_frame()
            return {'parent': page.evaluate('({delivery:window.POCKETMONSTER_STUDIO_CHARACTER_BRIDGE_DIAGNOSTICS?.(),relay:window.POCKETMONSTER_PIRATE_PRESENCE_QUEUE_DIAGNOSTICS?.()})'),
                    'child': child.evaluate('({bridge:window.POCKETMONSTER_PIRATE_FRUIT_BRIDGE,studio:window.POCKETMONSTER_PIRATE_STUDIO_CHARACTER,position:window.__combat?.controller?.position,heading:window.__combat?.controller?.heading})') if child else None}
        page.goto(base + '/studio-browser-entry.html', wait_until='domcontentloaded')
        page.wait_for_timeout(15000)
        report['initial'] = snapshot()
        page.screenshot(path=str(OUT / 'pirate-studio.png'))
        child = child_frame()
        assert child is not None, 'Active Pirate iframe missing'
        child.wait_for_function('window.POCKETMONSTER_PIRATE_FRUIT_BRIDGE?.studioPlayer?.renderFrames > 3', timeout=20000)
        before = snapshot()
        # The stick graphic is hidden until touch-down. Drag its real input zone.
        zone = page.locator('#joystick').bounding_box()
        assert zone, 'Actual mobile joystick input zone missing'
        x, y = zone['x'] + zone['width'] * 0.3, zone['y'] + zone['height'] * 0.6
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x + 55, y, steps=5)
        page.wait_for_timeout(2000)
        page.mouse.up()
        page.wait_for_timeout(1500)
        after = snapshot()
        report['movement'] = {'before': before, 'after': after}
        b = before['child']['bridge']['studioPlayer']
        a = after['child']['bridge']['studioPlayer']
        assert a['updates'] > b['updates'] and a['renderFrames'] > b['renderFrames'], 'Render loop stopped after replacement'
        bp, ap = before['child']['position'], after['child']['position']
        report['moved'] = (ap['x']-bp['x'])**2 + (ap['z']-bp['z'])**2 > 0.0001
        assert report['moved'], 'Mobile movement did not reach original gameplay controller'
        assert after['child']['bridge']['studioPlayers'] == 1
        assert after['parent']['relay']['studioState'] == 'studio-character'
        assert after['child']['studio']['state'] == 'attached'
        assert page.locator('iframe[title="Pocket Monster Character Studio bridge"]').count() == 0
        page.screenshot(path=str(OUT / 'pirate-studio-moved.png'))
        page.reload(wait_until='domcontentloaded')
        page.wait_for_timeout(15000)
        report['reload'] = snapshot()
        assert report['reload']['child']['bridge']['studioPlayers'] == 1, 'Reload lost or duplicated Studio'
        assert report['reload']['child']['bridge']['studioPlayer']['renderFrames'] > 3
        # Fresh load with delivery unavailable must not claim Studio success.
        block_studio = True
        page.reload(wait_until='domcontentloaded')
        page.wait_for_timeout(35000)
        report['fallback'] = snapshot()
        assert report['fallback']['parent']['relay']['studioState'] == 'fallback'
        assert report['fallback']['child']['bridge']['playerVisualSource'] == 'pirate-fruit'
        assert report['fallback']['child']['bridge']['studioPlayers'] == 0
        page.screenshot(path=str(OUT / 'pirate-fallback.png'))
        assert not report['errors'], 'Unhandled runtime exceptions'
        report['passed'] = True
        browser.close()
finally:
    print(json.dumps(report, indent=2), flush=True)
    (OUT / 'report.json').write_text(json.dumps(report, indent=2))
    server.shutdown()
    ENTRY.unlink(missing_ok=True)
    ENTRY_MODULE.unlink(missing_ok=True)
