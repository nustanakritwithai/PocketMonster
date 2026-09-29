"""วัดข้อมูลแบบอ่านอย่างเดียว; เดินและปาผ่าน UI ไม่สร้าง presence writer เพิ่ม."""
import asyncio
import math
import re
from urllib.parse import urlsplit


class CombatTiming:
    def __init__(self):
        self.phase = 'setup'
        self.samples = []
        self.frames = []
        self.last = None
        self.seen = set()
        self.hp = {}
        self.profiles = {}

    def receive(self, world):
        now = asyncio.get_running_loop().time() * 1000
        envelope = world.get('pirateWorld') or {}
        fresh = 0
        for msg in envelope.get('messages', []):
            key = (envelope.get('generation'), msg.get('seq'))
            if key not in self.seen:
                self.seen.add(key)
                fresh += 1
        if len(self.seen) > 8192:
            self.seen.clear()
        changes = 0
        for actor in world.get('actors', []):
            key = actor.get('actorId')
            value = actor.get('authority', {}).get('hp', {}).get('current')
            if key in self.hp and self.hp[key] != value:
                changes += 1
            self.hp[key] = value
        if self.phase not in ('setup', 'complete') and len(self.samples) < 3000:
            self.samples.append({'phase': self.phase, 'gapMs': round(now-self.last, 2) if self.last else None,
                                 'sequence': envelope.get('sequence'), 'freshMessages': fresh,
                                 'hpChanges': changes})
        self.last = now

    @staticmethod
    def cpu_summary(profile):
        # เก็บเวลาและชื่อฟังก์ชันเท่านั้น ไม่เก็บ raw profile/URL/ชื่อผู้เล่น
        nodes = {n['id']: n for n in profile.get('nodes', [])}
        totals = {}
        for sample, delta in zip(profile.get('samples', []), profile.get('timeDeltas', [])):
            frame = nodes.get(sample, {}).get('callFrame', {})
            name = re.sub(r'[^\w.$<>(): -]', '_', frame.get('functionName', ''))[:80]
            path = urlsplit(frame.get('url', '')).path.rsplit('/', 1)[-1]
            asset = path if re.fullmatch(r'[\w.-]{1,100}\.(?:m?js)', path) else 'runtime'
            key = (asset, name, frame.get('lineNumber', -1), frame.get('columnNumber', -1))
            totals[key] = totals.get(key, 0) + delta
        return [{'asset': k[0], 'function': k[1], 'line': k[2], 'column': k[3], 'selfMs': round(v/1000, 2)}
                for k, v in sorted(totals.items(), key=lambda item: item[1], reverse=True)[:40]]

    async def run(self, game, scene, get_wild, out):
        native = next((f for f in game.frames if urlsplit(f.url).path.endswith('/pirate-fruit-offline/index.html')), None)
        if not native:
            raise RuntimeError('timing-native-frame-missing')
        # เก็บเฉพาะตัวเลข ไม่เก็บ URL/token/payload; ไม่แทนที่ WebSocket หรือ handler เกม
        await native.evaluate("""() => {
            const p = window.__qaCombatTiming = {phase:'idle', frames:[], messages:[], active:true};
            const seen = new Set();
            let pendingEvents=0, oldestEvent=null;
            let last=performance.now();
            const frame=now=>{
                if(!p.active) return;
                if(p.frames.length<5000) p.frames.push({phase:p.phase,gapMs:now-last,
                    eventsSinceFrame:pendingEvents,eventWaitMs:oldestEvent===null?0:performance.now()-oldestEvent});
                pendingEvents=0; oldestEvent=null;
                last=now; requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
            p.listener=e=>{
                const w=e.data?.payload?.pirateWorld;
                if(w) for(const m of w.messages||[]) {
                    const key=w.generation+':'+m.seq;
                    if(seen.has(key)) continue;
                    seen.add(key);
                    if(m.type==='world-monster-attack'||m.type==='world-monster-delta') {
                        pendingEvents++; oldestEvent??=performance.now();
                    }
                }
                if(seen.size>8192) seen.clear();
                if(w && p.messages.length<3000) p.messages.push({phase:p.phase,
                    at:performance.now(),sequence:w.sequence,count:w.messages?.length||0});
            };
            window.addEventListener('message',p.listener);
        }""")
        async def phase(name):
            self.phase = name
            await native.evaluate('(name)=>{window.__qaCombatTiming.phase=name}', name)

        cdp = await game.context.new_cdp_session(game)
        await cdp.send('Profiler.enable')
        await cdp.send('Performance.enable')
        async def measure(name, seconds):
            await phase(name)
            before = await cdp.send('Performance.getMetrics')
            await cdp.send('Profiler.start')
            try:
                await asyncio.sleep(seconds)
            finally:
                result = await cdp.send('Profiler.stop')
                after = await cdp.send('Performance.getMetrics')
                a = {m['name']: m['value'] for m in before['metrics']}
                b = {m['name']: m['value'] for m in after['metrics']}
                self.profiles[name] = {'cpu': self.cpu_summary(result['profile']),
                    'metrics': {key: b.get(key, 0)-a.get(key, 0) for key in
                                ('ScriptDuration', 'TaskDuration', 'LayoutDuration', 'RecalcStyleDuration')}}

        async def pose():
            return await game.evaluate('window.POCKETMONSTER_WORLD_STATE?.() || null')

        async def confirm(expression):
            # evaluate ผ่าน DevTools โดยตรง ไม่ใช้ wait_for_function ที่ eval ชน CSP
            for _ in range(60):
                if await scene.evaluate(expression):
                    return
                await asyncio.sleep(.25)
            raise RuntimeError('timing-primary-state-not-confirmed')

        async def drag(x, z, duration):
            box = await scene.locator('#joystick').bounding_box()
            if not box:
                raise RuntimeError('timing-joystick-not-visible')
            px, py = box['x']+65, box['y']+box['height']-65
            await game.mouse.move(px, py)
            await game.mouse.down()
            try:
                await game.mouse.move(px+x*42, py+z*42)
                await asyncio.sleep(duration)
            finally:
                await game.mouse.up()

        try:
            await measure('idle', 5)
            await phase('capture')
            await game.screenshot(path=str(out/'timing-idle.png'))
            await phase('approach')
            before = await pose()
            await drag(1, 0, .5)
            after = await pose()
            if not before or not after:
                raise RuntimeError('timing-pose-unavailable')
            dx, dz = after['x']-before['x'], after['z']-before['z']
            length = math.hypot(dx, dz)
            if length < .03:
                raise RuntimeError('timing-joystick-movement-not-observed')
            rx, rz = dx/length, dz/length
            reached = False
            for _ in range(90):
                target = next((a for a in get_wild() if a['id']=='monster:starter-boss-north'), None)
                if not target:
                    raise RuntimeError('timing-live-target-missing')
                current = await pose()
                dx, dz = target['x']-current['x'], target['z']-current['z']
                distance = math.hypot(dx, dz)
                if distance < 3:
                    reached = True
                    break
                await drag((dx*rx+dz*rz)/distance, (-dx*rz+dz*rx)/distance,
                           min(.5, max(.12, distance/8)))
            if not reached:
                raise RuntimeError('timing-target-not-reached')
            await scene.locator('#monsterSlot1Btn').click(timeout=15000)
            await confirm("document.querySelector('#captureBtn')?.getAttribute('aria-label') === 'ปามอนสเตอร์'")
            await scene.locator('#captureBtn').click(timeout=15000)
            await confirm("window.POCKETMONSTER_MONSTER_CONTROL_CONTROLLER.snapshot().slots.some(s=>s?.active)")
            await measure('combat', 15)
            await phase('capture')
            await game.screenshot(path=str(out/'timing-combat.png'))
        finally:
            # จบหน้าต่างเดียวกันก่อน teardown/screenshot เพื่อไม่เพิ่ม packet หลังหยุด native probe
            self.phase = 'complete'
            await cdp.detach()
            self.frames = await native.evaluate("""() => {
                const p=window.__qaCombatTiming;
                p.active=false; window.removeEventListener('message',p.listener);
                return {frames:p.frames,messages:p.messages};
            }""")
            await game.screenshot(path=str(out/'timing-final.png'))

    def summary(self):
        return {'scope':'runner-swiftshader-not-mobile-render-proof',
                'profiles':self.profiles,
                'visualBatchingGate':'UNKNOWN', 'packets':self.samples, 'native':self.frames,
                'combatHpChanges':sum(s['hpChanges'] for s in self.samples if s['phase']=='combat')}
