"""Real Studio producer + real sandboxed Pirate client; no fabricated package.
Run after building .ci-studio-source/_site and installing pinned Three r169.
Only the isolated test entry bypasses the unrelated authenticated online shell.
"""
import functools
import http.server
import json
import mimetypes
import os
from pathlib import Path
import threading
from urllib.parse import unquote, urlparse
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'studio-browser-evidence'
OUT.mkdir(exist_ok=True)
ENTRY = ROOT / 'studio-browser-entry.html'
ENTRY.write_text('''<!doctype html><meta charset="utf-8"><style>
html,body,#game{margin:0;width:100%;height:100%;overflow:hidden}iframe{border:0;width:100%;height:100%}
</style><div id="game"></div><div id="startupStatus"></div>
<script type="module">import './boot-pirate-fruit-v900.mjs';</script>''')

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
report = {'commit': os.environ.get('GITHUB_SHA'), 'scope': 'isolated real Pirate boot + pinned real Studio producer', 'errors': [], 'console': []}
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width': 960, 'height': 540}, is_mobile=True, has_touch=True, device_scale_factor=1)
        studio = ROOT / '.ci-studio-source' / '_site'
        three = Path('/tmp/studio-browser/node_modules/three')
        def assets(route):
            u = urlparse(route.request.url)
            if u.hostname == 'nustanakritwithai.github.io' and u.path.startswith('/3JS-player-block-asset-engine-/'):
                rel = unquote(u.path[len('/3JS-player-block-asset-engine-/'):]) or 'index.html'
                source = studio / rel
            elif u.hostname == 'cdn.jsdelivr.net' and u.path.startswith('/npm/three@0.169.0/'):
                source = three / unquote(u.path[len('/npm/three@0.169.0/'):])
            else:
                route.continue_()
                return
            if source.is_file():
                mime = 'text/javascript' if source.suffix in ('.js', '.mjs') else mimetypes.guess_type(str(source))[0] or 'application/octet-stream'
                route.fulfill(path=str(source), content_type=mime, headers={'Access-Control-Allow-Origin': '*'})
            else:
                route.fulfill(status=404, body='Test asset missing: ' + str(source))
        context.route('**/*', assets)
        page = context.new_page()
        page.on('pageerror', lambda e: report['errors'].append(str(e)))
        page.on('console', lambda m: report['console'].append({'type': m.type, 'text': m.text[:1500]}) if m.type in ('error', 'warning') else None)
        page.goto(base + '/studio-browser-entry.html', wait_until='domcontentloaded')
        page.wait_for_timeout(35000)
        report['parent'] = page.evaluate('({delivery:window.POCKETMONSTER_STUDIO_CHARACTER_BRIDGE_DIAGNOSTICS?.(),relay:window.POCKETMONSTER_PIRATE_PRESENCE_QUEUE_DIAGNOSTICS?.()})')
        child = next((f for f in page.frames if '/pirate-fruit-offline/' in f.url), None)
        if child:
            report['child'] = child.evaluate('({hook:window.POCKETMONSTER_PIRATE_FRUIT_BRIDGE_HOOK,bridge:window.POCKETMONSTER_PIRATE_FRUIT_BRIDGE,studio:window.POCKETMONSTER_PIRATE_STUDIO_CHARACTER,body:document.body.innerText.slice(0,1500)})')
        page.screenshot(path=str(OUT / 'pirate-studio.png'))
        # Independently export the actual producer so validation can be diagnosed.
        producer = context.new_page()
        producer.on('pageerror', lambda e: report['errors'].append('producer: ' + str(e)))
        producer.goto('https://nustanakritwithai.github.io/3JS-player-block-asset-engine-/', wait_until='domcontentloaded')
        try:
            producer.wait_for_function('window.__CPS_BOOT_OK__ && window.POCKET_STUDIO_CHARACTER_BRIDGE', timeout=30000)
            package = producer.evaluate('window.POCKET_STUDIO_CHARACTER_BRIDGE.buildPackage({})')
            (OUT / 'actual-studio-package.json').write_text(json.dumps(package))
            report['producer'] = {'stats': package.get('sceneGraph', {}).get('stats'), 'bindings': list(package.get('rig', {}).get('jointBindings', {}))}
        except Exception as error:
            report['producerError'] = str(error)
        (OUT / 'report.json').write_text(json.dumps(report, indent=2))
        print(json.dumps(report, indent=2), flush=True)
        assert report.get('child', {}).get('bridge', {}).get('studioPlayers') == 1, 'Actual Pirate client did not attach Studio player'
        assert not report['errors'], 'Runtime exceptions during real browser render'
        browser.close()
finally:
    (OUT / 'report.json').write_text(json.dumps(report, indent=2))
    server.shutdown()
    ENTRY.unlink(missing_ok=True)
