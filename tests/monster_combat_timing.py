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
        self.timeline = []
        self.attack_sequence = 0
        self.clock_samples = []

    def record(self, kind, **values):
        if len(self.timeline) < 4000:
            self.timeline.append({'kind': kind, 'phase': self.phase,
                'atMs': round(asyncio.get_running_loop().time()*1000, 2), **values})

    def sent(self, packet):
        if packet.get('type') != 'world-pos':
            return
        for intent in packet.get('monsterIntents') or []:
            self.attack_sequence += 1
            target = intent.get('targetActorId', '')
            self.record('socket-intent', number=self.attack_sequence,
                sequence=intent.get('sequence'), targeted=target.startswith('monster:'),
                target=target if re.fullmatch(r'monster:[a-z0-9-]{1,70}', target) else None,
                category=intent.get('category'), x=packet.get('x'), z=packet.get('z'))

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
                if isinstance(key, str) and re.fullmatch(r'monster:[a-z0-9-]{1,70}', key):
                    self.record('socket-hp', target=key, before=self.hp[key], hp=value,
                                sequence=envelope.get('sequence'))
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
        target_id = 'monster:starter-crab-1'
        natives = [f for f in game.frames if urlsplit(f.url).path.endswith('/pirate-fruit-offline/index.html')]
        native = None
        for frame in natives:
            if await (await frame.frame_element()).is_visible():
                native = frame
                break
        if not native:
            raise RuntimeError('timing-native-frame-missing')
        # เก็บเฉพาะตัวเลข ไม่เก็บ URL/token/payload; ไม่แทนที่ WebSocket หรือ handler เกม
        await native.evaluate("""() => {
            const p = window.__qaCombatTiming = {phase:'idle', frames:[], messages:[], hits:[], inputs:[], active:true};
            const combat=window.__combat;
            p.pointer=e=>{
                if(e.target?.closest?.('.tc-attack') && p.inputs.length<400)
                    p.inputs.push({phase:p.phase,at:performance.now(),type:e.type,
                        state:combat?.state,timer:combat?.swing?.timer??null});
            };
            document.addEventListener('pointerdown',p.pointer,true);
            document.addEventListener('pointerup',p.pointer,true);
            p.originalHit=combat?.onSharedMonsterAttack;
            if(typeof p.originalHit==='function') {
                p.observedHit=function(info) {
                    if(p.hits.length<400) p.hits.push({phase:p.phase,at:performance.now(),
                        x:info.origin?.x,z:info.origin?.z,range:info.range,
                        forwardX:info.forwardX,forwardZ:info.forwardZ,kind:info.kind,
                        targets:(window.__sharedMonsterActors?.()||[]).filter(a=>a.actorId?.startsWith('monster:'))
                            .map(a=>({id:a.actorId,x:a.pose?.x,z:a.pose?.z})).slice(0,24)});
                    return p.originalHit.apply(this,arguments);
                };
                combat.onSharedMonsterAttack=p.observedHit;
            }
            const seen = new Set();
            let pendingEvents=0, oldestEvent=null;
            let last=performance.now();
            const frame=now=>{
                if(!p.active) return;
                if(p.frames.length<5000) p.frames.push({phase:p.phase,gapMs:now-last,
                    at:now,state:window.__combat?.state,timer:combat?.swing?.timer??null,
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
                    at:performance.now(),sequence:w.sequence,count:w.messages?.length||0,
                    hp:(e.data?.payload?.actors||[]).filter(a=>a.actorId?.startsWith('monster:'))
                        .map(a=>({id:a.actorId,hp:a.authority?.hp?.current})).slice(0,24)});
            };
            window.addEventListener('message',p.listener);
        }""")
        async def phase(name):
            self.phase = name
            before = asyncio.get_running_loop().time()*1000
            clock = await native.evaluate('(name)=>{window.__qaCombatTiming.phase=name;return performance.now()}', name)
            after = asyncio.get_running_loop().time()*1000
            self.clock_samples.append({'phase':name,'nativeMs':clock,'hostBeforeMs':before,'hostAfterMs':after})

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
            return await native.evaluate('''() => {
                const p=window.__combat?.controller?.position;
                return p ? {x:p.x,z:p.z} : null;
            }''')

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

        async def attack(name, count, delay):
            await phase(name)
            for _ in range(count):
                current = await pose()
                target = next((a for a in get_wild() if a['id']==target_id), None)
                if not target or not current or math.hypot(target['x']-current['x'], target['z']-current['z']) >= 2.6:
                    raise RuntimeError('timing-attack-target-out-of-range')
                self.record('input-before', x=current.get('x') if current else None,
                    z=current.get('z') if current else None,
                    distance=math.hypot(target['x']-current['x'],target['z']-current['z']) if target and current else None)
                button = scene.locator('#captureBtn')
                state = await button.evaluate('''b => ({disabled:b.disabled,
                    ariaDisabled:b.getAttribute('aria-disabled'),reason:b.getAttribute('data-reason')})''')
                self.record('button-state', **state)
                box = await button.bounding_box()
                if not box or state['disabled']:
                    raise RuntimeError('timing-attack-actually-disabled')
                # คลิกพิกัดจริง ไม่ลบdisabled ไม่force และไม่เรียกcombat APIแทนผู้เล่น
                await game.mouse.click(box['x']+box['width']/2, box['y']+box['height']/2, delay=100)
                self.record('input-after')
                await asyncio.sleep(delay)

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
                target = next((a for a in get_wild() if a['id']==target_id), None)
                if not target:
                    raise RuntimeError('timing-live-target-missing')
                current = await pose()
                dx, dz = target['x']-current['x'], target['z']-current['z']
                distance = math.hypot(dx, dz)
                # เริ่มวัดก่อนเสียเวลาตีอยู่นอกระยะ; อ่าน pose ใหม่ทุกครั้งหลัง await
                if distance < 2.3:
                    reached = True
                    break
                await drag((dx*rx+dz*rz)/distance, (-dx*rz+dz*rx)/distance,
                           min(.5, max(.12, distance/8)))
            if not reached:
                raise RuntimeError('timing-target-not-reached')
            # มอนของQAถูกRecallแล้วจากขั้นก่อนหน้า ใช้ปุ่มเดิมตีเอง ไม่summonมอนช่วย
            await attack('combat', 2, .25)
            await attack('rapid', 4, .12)
            await phase('settle')
            await asyncio.sleep(3)
            await phase('capture')
            await game.screenshot(path=str(out/'timing-combat.png'))
        finally:
            # จบหน้าต่างเดียวกันก่อน teardown/screenshot เพื่อไม่เพิ่ม packet หลังหยุด native probe
            self.phase = 'complete'
            await cdp.detach()
            self.frames = await native.evaluate("""() => {
                const p=window.__qaCombatTiming;
                p.active=false; window.removeEventListener('message',p.listener);
                document.removeEventListener('pointerdown',p.pointer,true);
                document.removeEventListener('pointerup',p.pointer,true);
                if(window.__combat?.onSharedMonsterAttack===p.observedHit)
                    window.__combat.onSharedMonsterAttack=p.originalHit;
                return {frames:p.frames,messages:p.messages,hits:p.hits,inputs:p.inputs};
            }""")
            await game.screenshot(path=str(out/'timing-final.png'))

    def summary(self):
        return {'scope':'runner-swiftshader-not-mobile-render-proof',
                'profiles':self.profiles,
                'visualBatchingGate':'UNKNOWN', 'packets':self.samples, 'native':self.frames,
                'timeline':self.timeline, 'perIntentServerRejection':'UNKNOWN-no-ack-on-wire',
                'clockSamples':self.clock_samples,
                'combatHpChanges':sum(s['hpChanges'] for s in self.samples if s['phase']=='combat')}
