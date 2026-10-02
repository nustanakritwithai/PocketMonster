"""วัดข้อมูลแบบอ่านอย่างเดียว; เดินและปาผ่าน UI ไม่สร้าง presence writer เพิ่ม."""
import asyncio
import math
import re
from urllib.parse import urlsplit


def movement_input(dx, dz, yaw):
    distance = math.hypot(dx, dz)
    if distance < .0001:
        return 0, 0
    return ((dx*math.cos(yaw)-dz*math.sin(yaw))/distance,
            (dx*math.sin(yaw)+dz*math.cos(yaw))/distance)


class CombatTiming:
    def __init__(self, reentry=False):
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
        self.stop_reason = None
        self.reentry = reentry
        self.socket_events = []
        self.vitals = None
        self.life_baseline = None
        self.life_events = []
        self.life_interruption = None

    def observe_life(self, envelope):
        # อ่าน canonical vitals เท่านั้น ไม่เก็บ spawnId/ข้อมูลผู้เล่นและไม่เขียน HP
        def invalid():
            if self.life_baseline is not None:
                self.life_interruption = self.life_interruption or 'vitals-evidence-gap'

        def finite(value):
            return type(value) in (int, float) and math.isfinite(value)

        v = envelope.get('vitals')
        if not isinstance(v, dict) or v.get('contract') != 'pirate-vitals/1':
            invalid()
            return
        revision, hp, maximum, dead = (v.get(k) for k in ('revision', 'hp', 'maxHp', 'dead'))
        if (type(revision) is not int or revision < 0 or type(dead) is not bool
            or type(hp) not in (int, float) or type(maximum) not in (int, float)
            or not math.isfinite(hp) or not math.isfinite(maximum)
            or not 0 <= hp <= maximum or maximum <= 0 or dead != (hp <= 0)):
            invalid()
            return
        for value_key, max_key in (('guard', 'guardMax'), ('energy', 'maxEnergy'), ('mp', 'maxMp')):
            if not finite(v.get(value_key)) or not finite(v.get(max_key)) or not 0 <= v[value_key] <= v[max_key]:
                invalid()
                return
        if (type(v.get('guardBroken')) is not bool or any(not finite(v.get(k)) or v[k] < 0
            for k in ('serverTimeMs', 'hitstunUntil'))):
            invalid()
            return
        respawn = v.get('respawn')
        respawn_revision = respawn.get('atRevision') if isinstance(respawn, dict) else None
        if respawn is not None and (type(respawn_revision) is not int
            or not 1 <= respawn_revision <= revision
            or any(not isinstance(respawn.get(k), str) or not respawn[k] for k in ('spawnId', 'islandId'))
            or any(not finite(respawn.get(k)) for k in ('x', 'y', 'z', 'heading'))):
            invalid()
            return
        generation = envelope.get('generation')
        if type(generation) is not int or generation < 1:
            invalid()
            return
        if self.vitals and generation == self.vitals['generation'] and revision < self.vitals['revision']:
            return
        sample = {'phase': self.phase, 'revision': revision, 'hp': hp, 'dead': dead,
                  'respawnRevision': respawn_revision, 'generation': generation,
                  'atMs': round(asyncio.get_running_loop().time()*1000, 2)}
        self.vitals = sample
        if self.life_baseline is not None and self.phase not in ('setup', 'complete'):
            if len(self.life_events) < 3000:
                self.life_events.append(sample)
            else:
                self.life_interruption = self.life_interruption or 'evidence-cap'
            reason = ('authoritative-death' if dead else
                      'worker-generation-changed' if generation != self.life_baseline['generation'] else
                      'authoritative-respawn' if respawn_revision != self.life_baseline['respawnRevision'] else None)
            self.life_interruption = self.life_interruption or reason

    def require_same_life(self):
        if self.reentry and self.life_interruption:
            raise RuntimeError('timing-' + self.life_interruption)

    def socket_event(self, kind, connection):
        # ไม่เก็บ URL, token, error payload หรือชื่อผู้เล่น
        if kind not in ('open', 'close', 'error'):
            return
        if len(self.socket_events) < 256:
            self.socket_events.append({'kind': kind, 'connection': connection,
                'phase': self.phase, 'atMs': round(asyncio.get_running_loop().time()*1000, 2)})

    def record(self, kind, **values):
        if len(self.timeline) < 4000:
            self.timeline.append({'kind': kind, 'phase': self.phase,
                'atMs': round(asyncio.get_running_loop().time()*1000, 2), **values})

    def sent(self, packet):
        if packet.get('type') != 'world-pos':
            return
        if self.phase in ('approach', 'combat', 'retreat', 'reapproach', 'reentry', 'settle'):
            self.record('socket-pose', x=packet.get('x'), z=packet.get('z'),
                locomotion=packet.get('locomotion'), intentCount=len(packet.get('monsterIntents') or []))
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
        self.observe_life(envelope)
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
            diagnostics = await game.evaluate('''() => {
                const d=window.POCKETMONSTER_CHAT_RUNTIME?.diagnostics?.();
                return d ? {socketGeneration:d.socketGeneration,socketReadyState:d.socketReadyState,
                    reconnectPending:d.reconnectPending,worldConnected:d.worldConnected,
                    paused:d.paused,stopped:d.stopped,snapshots:d.worldPresence?.acceptedSnapshots} : null;
            }''')
            self.record('transport-state', observation=diagnostics)

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
            self.require_same_life()
            value = await native.evaluate('''() => {
                const c=window.__combat?.controller;
                const p=c?.position;
                const yaw=typeof c?.getCameraYaw==='function'?c.getCameraYaw():null;
                return p ? {x:p.x,z:p.z,hp:c.hp,cameraYaw:Number.isFinite(yaw)?yaw:null} : null;
            }''')
            if self.life_baseline is not None and value and type(value.get('hp')) in (int,float) and value['hp'] <= 0:
                self.life_interruption = self.life_interruption or 'native-death'
            self.require_same_life()
            return value

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
                    self.stop_reason = 'target-out-of-range'
                    self.record('scenario-stopped', reason=self.stop_reason)
                    return False
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
            return True

        async def wait_damage(name):
            # คงชื่อหน้าต่างโจมตีจนผลมาถึง ไม่เปลี่ยนเป็น settle ก่อน windup จบ
            # deadline นี้เพื่อเก็บหลักฐานเท่านั้น ไม่ใช่เกณฑ์ความลื่นหรือแก้ gameplay
            for _ in range(50):
                self.require_same_life()
                if any(e['kind']=='socket-hp' and e.get('target')==target_id
                    and isinstance(e.get('hp'), (int,float))
                    and isinstance(e.get('before'), (int,float)) and e['hp'] < e['before']
                    and e['phase']==name
                    and any(s['kind']=='socket-intent' and s.get('target')==target_id
                        and s['phase']==name and s['atMs'] < e['atMs'] for s in self.timeline)
                    for e in self.timeline):
                    return
                await asyncio.sleep(.1)
            self.stop_reason = name+'-damage-not-observed'
            self.record('scenario-stopped', reason=self.stop_reason)
            raise RuntimeError('timing-'+self.stop_reason)

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
            async def steer(current, dx, dz, duration):
                # จอยอิงมุมกล้องปัจจุบัน ไม่ใช้ basis ก่อนต่อสู้/respawn ตลอด scenario
                yaw = current.get('cameraYaw')
                if not isinstance(yaw, (int,float)):
                    yaw = math.atan2(-rz, rx)
                ix, iz = movement_input(dx, dz, yaw)
                await drag(ix, iz, duration)
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
                await steer(current, dx, dz, min(.5, max(.12, distance/8)))
            if not reached:
                raise RuntimeError('timing-target-not-reached')
            # มอนของQAถูกRecallแล้วจากขั้นก่อนหน้า ใช้ปุ่มเดิมตีเอง ไม่summonมอนช่วย
            if self.reentry:
                if not self.vitals or self.vitals['dead']:
                    raise RuntimeError('timing-alive-vitals-not-observed')
                self.life_baseline = dict(self.vitals)
                if await attack('combat', 1, .25):
                    await wait_damage('combat')
                    self.require_same_life()
                    # ไม่หยุดถ่ายภาพกลางต่อสู้: runner capture ใช้หลายวินาทีจนตัวละครตายก่อนถอย
                    # เก็บ trace ต่อเนื่องและภาพหลังจบ/หยุดแทน ไม่เปลี่ยนกฎหรือนาฬิกาของเกม
                    await phase('retreat')
                    escaped = False
                    for _ in range(16):
                        target = next((a for a in get_wild() if a['id']==target_id), None)
                        current = await pose()
                        if not target or not current:
                            raise RuntimeError('timing-reentry-target-or-pose-missing')
                        dx, dz = current['x']-target['x'], current['z']-target['z']
                        distance = math.hypot(dx, dz)
                        self.record('retreat-distance', distance=distance)
                        if distance >= 6:
                            escaped = True
                            break
                        if distance < .05:
                            dx, dz, distance = rx, rz, 1
                        await steer(current, dx, dz, .3)
                    if not escaped:
                        raise RuntimeError('timing-retreat-not-observed')
                    await phase('reapproach')
                    returned = False
                    for _ in range(90):
                        target = next((a for a in get_wild() if a['id']==target_id), None)
                        current = await pose()
                        if not target or not current:
                            raise RuntimeError('timing-reentry-target-or-pose-missing')
                        dx, dz = target['x']-current['x'], target['z']-current['z']
                        distance = math.hypot(dx, dz)
                        self.record('reapproach-distance', distance=distance)
                        if distance < 2.3:
                            returned = True
                            break
                        await steer(current, dx, dz, min(.3, max(.12, distance/8)))
                    if not returned:
                        raise RuntimeError('timing-reentry-not-reached')
                    if await attack('reentry', 1, .25):
                        await wait_damage('reentry')
            elif await attack('combat', 2, .25):
                await attack('rapid', 4, .12)
            await phase('settle')
            await asyncio.sleep(3)
            self.require_same_life()
            await phase('capture')
            await game.screenshot(path=str(out/'timing-combat.png'))
        except RuntimeError as error:
            code = str(error)
            self.stop_reason = code if re.fullmatch(r'timing-[a-z]+(?:-[a-z]+){1,12}', code) else 'scenario-interrupted'
            self.record('scenario-stopped', reason=self.stop_reason)
            raise
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
        def captured(attack_phase, response_phases):
            return any(event['kind'] == 'socket-hp'
                and isinstance(event.get('hp'), (int, float))
                and isinstance(event.get('before'), (int, float))
                and event['hp'] < event['before'] and event['phase'] in response_phases
                and any(sent['kind'] == 'socket-intent' and sent.get('target') == event.get('target')
                    and sent['phase'] == attack_phase and sent['atMs'] < event['atMs']
                    for sent in self.timeline) for event in self.timeline)
        # ต้องเห็น intent ไปยังมอนตัวเดียวกันก่อน HP authority ลด; HP ของตัวอื่นไม่นับ
        targeted_damage = any(
            event['kind'] == 'socket-hp' and event.get('hp', 0) < event.get('before', 0)
            and event['phase'] in ('combat', 'rapid', 'settle')
            and any(sent['kind'] == 'socket-intent' and sent.get('target') == event.get('target')
                    and sent['phase'] in ('combat', 'rapid') and sent['atMs'] < event['atMs']
                    for sent in self.timeline)
            for event in self.timeline)
        first_strike = captured('combat', ('combat', 'settle', 'retreat'))
        reentry = captured('reentry', ('reentry', 'settle'))
        reentry_sent = [e['atMs'] for e in self.timeline if e['kind']=='socket-intent' and e['phase']=='reentry']
        # ผลจากการตีครั้งแรกที่มาช้าหลังเริ่ม reentry ยังแยกไม่ได้ จึงห้ามนับเป็นหลักฐานรอบสอง
        first_results = [e['atMs'] for e in self.timeline if e['kind']=='socket-hp'
            and e['phase'] in ('combat', 'settle', 'retreat') and isinstance(e.get('hp'), (int,float))
            and isinstance(e.get('before'), (int,float)) and e['hp'] < e['before']]
        reentry_gate = 'SAT' if self.reentry and first_strike and reentry and not self.stop_reason \
            and reentry_sent and first_results and min(first_results) < min(reentry_sent) else 'UNKNOWN'
        # สองหน้าต่าง damage เป็นเพียง capture; ต้องมี vitals ทุกช่วงและไม่ตาย/เกิดใหม่ด้วย
        observed_phases = {e['phase'] for e in self.life_events}
        same_life = 'SAT' if reentry_gate == 'SAT' and self.life_baseline and not self.life_interruption \
            and {'combat', 'retreat', 'reapproach', 'reentry'} <= observed_phases else 'UNKNOWN'
        return {'scope':'runner-swiftshader-not-mobile-render-proof',
                'targetedDamageCaptured': targeted_damage,
                'reentryCaptureGate': reentry_gate,
                'sameLifeReentryGate': same_life,
                'lifeBaseline': self.life_baseline, 'lifeEvents': self.life_events,
                'lifeInterruption': self.life_interruption,
                'firstStrikeDamageCaptured': first_strike, 'reentryDamageCaptured': reentry,
                'socketLifecycle': self.socket_events,
                'stopReason': self.stop_reason,
                'rapidScenario': 'NOT_RUN' if self.reentry else 'UNKNOWN' if self.stop_reason else 'CAPTURED-not-acceptance',
                'profiles':self.profiles,
                'visualBatchingGate':'UNKNOWN', 'packets':self.samples, 'native':self.frames,
                'timeline':self.timeline, 'perIntentServerRejection':'UNKNOWN-no-ack-on-wire',
                'clockSamples':self.clock_samples,
                'combatHpChanges':sum(s['hpChanges'] for s in self.samples if s['phase']=='combat')}
