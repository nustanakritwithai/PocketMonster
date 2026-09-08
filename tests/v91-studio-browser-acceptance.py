"""Actual Studio + sandboxed Pirate in isolated V9 DOM/CSP.
Mobile emulation, not authenticated production or physical Android QA.
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
template = re.sub(r'<script\b[^>]*>[\s\S]*?</script>', '', (ROOT / 'v900.html').read_text(), flags=re.I)
# Isolated fixture has no online auth handler. Production code is unchanged.
template = template.replace('class="account-gate"', 'class="account-gate hidden"')
template = template.replace('<body>', '<body data-control-panel="human" data-combined-world="pirate-fruit">')
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
report = {'commit': os.environ.get('GITHUB_SHA'), 'engineCommit': os.environ.get('STUDIO_ENGINE_SHA'),
          'scope': 'isolated actual V9 controls/CSP + Pirate route + exact Studio producer; mobile emulation only',
          'errors': [], 'console': [], 'actionEvidence': {}}
try:
    with sync_playwright() as p:
        launch = {'headless': True, 'args': ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']}
        if os.environ.get('CHROMIUM_EXECUTABLE'):
            launch['executable_path'] = os.environ['CHROMIUM_EXECUTABLE']
        browser = p.chromium.launch(**launch)
        context = browser.new_context(viewport={'width': 960, 'height': 540}, is_mobile=True, has_touch=True,
                                      device_scale_factor=1, record_video_dir=str(OUT / 'video'), record_video_size={'width': 960, 'height': 540})
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
                route.abort()  # No real gameplay/save/account backend traffic.
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
        producer = context.new_page()
        producer.on('pageerror', lambda e: report['errors'].append('producer: ' + str(e)))
        producer.goto('https://nustanakritwithai.github.io/3JS-player-block-asset-engine-/', wait_until='domcontentloaded')
        producer.wait_for_function('window.__CPS_BOOT_OK__ && window.POCKET_STUDIO_CHARACTER_BRIDGE', timeout=30000)
        package_text = producer.evaluate('JSON.stringify(window.POCKET_STUDIO_CHARACTER_BRIDGE.buildPackage({}))')
        (OUT / 'actual-studio-package.json').write_text(package_text)
        package = json.loads(package_text)
        report['producer'] = {'stats': package.get('sceneGraph', {}).get('stats'), 'animationCount': len(package.get('animations', [])),
                              'motionVersion': package.get('motionPack', {}).get('version'), 'textures': len(package.get('renderProfile', {}).get('textures', []))}
        assert report['producer']['motionVersion'] == '1.1.0'
        assert report['producer']['textures'] > 0, 'Actual cold producer must declare selected PBR sources'
        producer.close()
        def child_frame():
            return next((f for f in page.frames if '/pirate-fruit-offline/' in f.url), None)
        def snapshot():
            child = child_frame()
            return {'parent': page.evaluate('({delivery:window.POCKETMONSTER_STUDIO_CHARACTER_BRIDGE_DIAGNOSTICS?.(),relay:window.POCKETMONSTER_PIRATE_PRESENCE_QUEUE_DIAGNOSTICS?.()})'),
                    'child': child.evaluate('({bridge:window.POCKETMONSTER_PIRATE_FRUIT_BRIDGE,studio:window.POCKETMONSTER_PIRATE_STUDIO_CHARACTER,position:window.__combat?.controller?.position,heading:window.__combat?.controller?.heading,move:window.__combat?.controller?.moveState,combat:window.__combat?.combatState})') if child else None}
        def actor():
            return child_frame().evaluate('window.POCKETMONSTER_PIRATE_FRUIT_BRIDGE?.studioPlayer')
        def samples(count=20):
            values = []
            for _ in range(count):
                page.wait_for_timeout(120)
                values.append(actor())
            return values
        def has_motion(values, actions):
            matching = [v for v in values if v and v.get('animation', {}).get('action') in actions]
            return len(matching) >= 2 and any(v['animation'].get('changedJoints', 0) > 0 for v in matching)
        page.goto(base + '/studio-browser-entry.html', wait_until='domcontentloaded')
        page.wait_for_timeout(12000)
        child = child_frame()
        assert child is not None, 'Active Pirate iframe missing'
        child.wait_for_function('window.POCKETMONSTER_PIRATE_FRUIT_BRIDGE?.studioPlayer?.renderFrames > 3', timeout=25000)
        child.wait_for_function('window.POCKETMONSTER_PIRATE_FRUIT_BRIDGE?.studioPlayer?.renderProfile?.assigned > 0', timeout=25000)
        report['initial'] = snapshot()
        assert report['initial']['child']['bridge']['studioPlayer']['renderProfile']['failed'] == []
        page.screenshot(path=str(OUT / 'pirate-studio.png'))
        before = snapshot()
        zone = page.locator('#joystick').bounding_box()
        assert zone, 'Actual mobile joystick zone missing'
        x, y = zone['x'] + zone['width'] * .3, zone['y'] + zone['height'] * .6
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x + 55, y, steps=5)
        walking = samples()
        page.screenshot(path=str(OUT / 'pirate-studio-walking.png'))
        page.mouse.up()
        report['actionEvidence']['locomotion'] = walking
        assert has_motion(walking, ['walk', 'run', 'sprint']), 'World movement alone is insufficient: walking must change Studio joints DURING input'
        page.wait_for_timeout(1500)
        after = snapshot()
        report['movement'] = {'before': before, 'after': after}
        b, a = before['child']['bridge']['studioPlayer'], after['child']['bridge']['studioPlayer']
        assert a['updates'] > b['updates'] and a['renderFrames'] > b['renderFrames']
        bp, ap = before['child']['position'], after['child']['position']
        report['moved'] = (ap['x']-bp['x'])**2 + (ap['z']-bp['z'])**2 > .0001
        assert report['moved']
        assert after['child']['bridge']['studioPlayers'] == 1
        assert after['parent']['relay']['studioState'] == 'studio-character'
        assert after['child']['studio']['state'] == 'attached'
        assert page.locator('iframe[title="Pocket Monster Character Studio bridge"]').count() == 0
        page.screenshot(path=str(OUT / 'pirate-studio-moved.png'))
        # These legacy DOM IDs are Pirate attack/dash/jump, NOT capture/summon.
        for button_id, label, expected in [('captureBtn', 'attack', ['attack']), ('recallBtn', 'jump', ['jump', 'fall', 'land'])]:
            box = page.locator('#' + button_id).bounding_box()
            assert box, 'Missing real input ' + button_id
            page.mouse.move(box['x']+box['width']/2, box['y']+box['height']/2)
            page.mouse.down()
            values = samples(15)
            page.mouse.up()
            values.extend(samples(10))
            report['actionEvidence'][label] = values
            page.screenshot(path=str(OUT / ('pirate-studio-' + label + '.png')))
            assert has_motion(values, expected), 'Actual ' + label + ' input did not produce changing Studio joints'
            page.wait_for_timeout(1000)
        report['reachabilityLimits'] = ['Capture/summon/monster-command: checked as authored native-vendor playback separately, not Pirate input',
                                         'Physical Android/authenticated production and final Studio IK/weight solver parity not established']
        page.reload(wait_until='domcontentloaded')
        page.wait_for_timeout(12000)
        child_frame().wait_for_function('window.POCKETMONSTER_PIRATE_FRUIT_BRIDGE?.studioPlayer?.renderProfile?.assigned > 0', timeout=25000)
        report['reload'] = snapshot()
        reload_actor = report['reload']['child']['bridge']['studioPlayer']
        assert report['reload']['child']['bridge']['studioPlayers'] == 1 and reload_actor['renderFrames'] > 3
        assert reload_actor['renderProfile']['assigned'] == report['initial']['child']['bridge']['studioPlayer']['renderProfile']['assigned'], 'Cold/warm texture assignments must match'
        assert reload_actor['renderProfile']['failed'] == []
        block_studio = True
        page.reload(wait_until='domcontentloaded')
        page.wait_for_timeout(35000)
        report['fallback'] = snapshot()
        assert report['fallback']['parent']['relay']['studioState'] == 'fallback'
        assert report['fallback']['child']['bridge']['playerVisualSource'] == 'pirate-fruit'
        assert report['fallback']['child']['bridge']['studioPlayers'] == 0
        page.screenshot(path=str(OUT / 'pirate-fallback.png'))
        assert not report['errors'], 'Unhandled page exceptions'
        report['passed'] = True
        context.close()
        browser.close()
finally:
    print(json.dumps(report, indent=2), flush=True)
    (OUT / 'report.json').write_text(json.dumps(report, indent=2))
    server.shutdown()
    ENTRY.unlink(missing_ok=True)
    ENTRY_MODULE.unlink(missing_ok=True)
