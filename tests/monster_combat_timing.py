"""วัดข้อมูลแบบอ่านอย่างเดียว; เดินและปาผ่าน UI ไม่สร้าง presence writer เพิ่ม."""
import asyncio
import math
import re
from urllib.parse import urlsplit


COMBAT_ROUTING_FIELDS = frozenset(name.casefold() for name in (
    'schemaVersion', 'intentId', 'combatId', 'actionSequence', 'actorEntityId', 'targetEntityId',
    'combatRulesVersion', 'calculationVersion', 'actionId', 'actionDefinitionVersion',
    'worldSnapshotTick', 'actorStateVersion', 'targetStateVersion', 'actorStatusStateVersion',
    'targetStatusStateVersion', 'actorProfileFingerprint', 'targetProfileFingerprint',
    'actorStatusFingerprint', 'targetStatusFingerprint', 'actionFingerprint',
    'worldSnapshotFingerprint', 'rngVersion', 'rngTicketId', 'rngTicketStateVersion',
    'rngStreamFingerprint', 'predictedResultFingerprint', 'predictedCommitFingerprint',
    'envelopeFingerprint'))


def wire_shape(packet):
    # รูปทรงJSONเป็นตัวเลขเท่านั้น เพื่อเทียบขอบเขตparser ไม่ใช่ผลclassify/acceptจากServer
    depth, visited = 0, 0
    stack = [(packet, 1)] if isinstance(packet, (dict, list)) else []
    while stack and visited < 1024:
        value, level = stack.pop()
        visited += 1
        depth = max(depth, level)
        if level >= 9:
            return {'jsonDepthCapped9': 9, 'shapeStatus': 'CAPTURED-depth-at-least-9',
                    'rootCombatFieldCount': sum(k.casefold() in COMBAT_ROUTING_FIELDS for k in packet) if isinstance(packet, dict) else None}
        children = value.values() if isinstance(value, dict) else value
        stack.extend((v, level+1) for v in children if isinstance(v, (dict, list)))
    return {'jsonDepthCapped9': depth if not stack else None,
            'shapeStatus': 'CAPTURED-numeric-shape-not-server-classification' if not stack else 'UNKNOWN-node-bound',
            'rootCombatFieldCount': sum(k.casefold() in COMBAT_ROUTING_FIELDS for k in packet) if isinstance(packet, dict) else None}


def attack_geometry(pose, target):
    # คำนวณข้อเท็จจริงเพื่อQAเท่านั้น ไม่เขียนheading/positionหรือเปลี่ยนกรวยของเกม
    if not isinstance(pose, dict) or not isinstance(target, dict):
        return None
    values = [pose.get('x'), pose.get('z'), pose.get('heading'), target.get('x'), target.get('z')]
    if any(type(v) not in (int, float) or not math.isfinite(v) for v in values):
        return None
    x, z, heading, tx, tz = values
    dx, dz = tx-x, tz-z
    distance = math.hypot(dx, dz)
    return {'distance': distance,
            'facingDot': (dx*math.sin(heading)+dz*math.cos(heading))/distance if distance >= .001 else None}


def observe_socket_lifecycle(timing, socket, read_diagnostics=None, page_socket_ordinal=None):
    # อ่าน lifecycle ของsocketเกมเดิม ไม่เปิดconnectionหรือเก็บURL/ข้อความerror
    if timing is None:
        return
    try:
        address = urlsplit(socket.url)
    except ValueError:
        return
    if address.scheme not in ('ws', 'wss') or address.path != '/ws/chat':
        return
    alias = timing.new_socket_alias()
    if alias is None:
        return
    def capture(coroutine):
        task = asyncio.create_task(coroutine)
        timing.socket_tasks.add(task)
        task.add_done_callback(timing.socket_tasks.discard)
    def closed(*_):
        event = timing.socket_event('close', alias)
        if event is not None and read_diagnostics is not None:
            capture(timing.capture_socket_close(event, read_diagnostics))
    socket.on('close', closed)
    socket.on('socketerror', lambda *_: timing.socket_event('error', alias))
    # created หมายถึงobserverเห็นsocket ไม่ใช่หลักฐานว่าhandshake/authสำเร็จ
    event = timing.socket_event('created', alias)
    if event is not None and read_diagnostics is not None:
        capture(timing.capture_socket_generation(event, read_diagnostics, page_socket_ordinal))
    return alias


# ใช้เฉพาะQAบนrunner: ส่งคืนผลเดิม/exceptionเดิม ไม่อ่านGLSL/tokenหรือแก้shader
GPU_PROBE_SCRIPT = r"""() => {
    const p=window.__qaCombatTiming;
    p.gpuCalls=[]; p.gpuStatus='UNKNOWN-no-context'; p.gpuWrappers=[];
    p.parentPosts=[]; p.postStatus='UNKNOWN-unavailable';
    const canvas=document.querySelector('#app > canvas');
    const gl=canvas?.getContext('webgl2');
    p.drawWrappers=[]; p.gpuDrawStatus='UNKNOWN-no-scene-hooks';
    p.portalWarmupVariants=[]; const portalVariantSeen=new WeakSet();
    // ตำแหน่งparameterของbuiltin basicตรงThree r178; คืนเฉพาะตัวเลข/booleanที่อนุญาต
    // ไม่คืนcacheKeyดิบหรือcustomProgramCacheKeyท้ายข้อความ และไม่เรียกGPUเพิ่ม
    const shaderParameters=program=>{
        const parts=typeof program?.cacheKey==='string'?program.cacheKey.split(','):[];
        if(parts[0]!=='basic'||!['highp','mediump','lowp'].includes(parts[1])||parts.length<53) return null;
        const fields={envMapMode:3,envMapCubeUVHeight:4,mapUv:5,alphaMapUv:6,lightMapUv:7,
            aoMapUv:8,bumpMapUv:9,normalMapUv:10,displacementMapUv:11,emissiveMapUv:12,
            metalnessMapUv:13,roughnessMapUv:14,anisotropyMapUv:15,clearcoatMapUv:16,
            clearcoatNormalMapUv:17,clearcoatRoughnessMapUv:18,iridescenceMapUv:19,
            iridescenceThicknessMapUv:20,sheenColorMapUv:21,sheenRoughnessMapUv:22,
            specularMapUv:23,specularColorMapUv:24,specularIntensityMapUv:25,
            transmissionMapUv:26,thicknessMapUv:27,combine:28,
            fogExp2:29,sizeAttenuation:30,morphTargetsCount:31,morphAttributeCount:32,
            dirLights:33,pointLights:34,spotLights:35,spotLightMaps:36,hemiLights:37,
            rectLights:38,dirShadows:39,pointShadows:40,spotShadows:41,
            spotShadowsWithMaps:42,lightProbes:43,shadowMapType:44,toneMapping:45,
            clippingPlanes:46,clipIntersection:47,depthPacking:48,flags1:49,flags2:50};
        const spaces=new Set(['srgb','srgb-linear','display-p3','display-p3-linear']);
        const values={programId:Number.isSafeInteger(program.id)?program.id:null,
            usedTimes:Number.isSafeInteger(program.usedTimes)?program.usedTimes:null,
            precision:parts[1],outputSpace:spaces.has(parts[2])?parts[2]:'other',
            rendererSpace:spaces.has(parts[51])?parts[51]:'other'};
        for(const [name,index] of Object.entries(fields)) {
            const raw=parts[index],n=/^-?\d{1,10}$/.test(raw)?Number(raw):null;
            values[name]=raw==='true'?true:raw==='false'?false:Number.isSafeInteger(n)?n:null;
        }
        return values;
    };
    // เก็บreferenceเฉพาะระหว่างdraw ไม่สร้างmetadataหลายพันครั้งต่อเฟรม
    // สรุปเมื่อมีGPUcallจริงเท่านั้น; geometry/ancestorใช้รายการอนุญาต ไม่ส่งname/uuid
    const types=new Set(['MeshBasicMaterial','MeshStandardMaterial','MeshPhysicalMaterial',
        'SpriteMaterial','LineBasicMaterial','ShaderMaterial','MeshDepthMaterial','MeshDistanceMaterial']);
    const geometries=new Set(['TorusGeometry','CircleGeometry','PlaneGeometry','BoxGeometry',
        'SphereGeometry','RingGeometry','IcosahedronGeometry','BufferGeometry']);
    const describeDraw=()=>{
        const m=p.drawMaterial,o=p.drawObject,g=p.drawGeometry;
        if(!m) return null;
        let source='other',ancestor=o;
        for(let depth=0;ancestor&&depth<12;depth++,ancestor=ancestor.parent) {
            if(ancestor.name==='pocket-monster-world-portal'||ancestor.name==='living-world-portal') {
                source='world-portal'; break;
            }
            if(typeof ancestor.name==='string'&&ancestor.name.startsWith('effect:')) source='combat-effect';
        }
        return {pass:p.drawPass,type:types.has(m.type)?m.type:'other',
            toneMapped:m.toneMapped===true,fog:m.fog===true,map:!!m.map,
            vertexColors:m.vertexColors===true,transparent:m.transparent===true,
            side:Number.isSafeInteger(m.side)?m.side:null,
            geometry:geometries.has(g?.type)?g.type:'other',source,
            instanced:o?.isInstancedMesh===true,batched:o?.isBatchedMesh===true,
            skinned:o?.isSkinnedMesh===true,morph:!!g?.morphAttributes?.position,
            alphaTest:Number.isFinite(m.alphaTest)?m.alphaTest:null,alphaHash:m.alphaHash===true,
            depthTest:m.depthTest===true,depthWrite:m.depthWrite===true};
    };
    // effectsของPlayerCombatอาจเป็นScopedVisualEffects; sceneเป็นฉากจริงจากconstructor
    let proto=Object.getPrototypeOf(window.__combat?.scene??{});
    while(proto && !Object.hasOwn(proto,'onBeforeRender')) proto=Object.getPrototypeOf(proto);
    if(proto) {
        for(const [beforeName,afterName,index,pass] of [
            ['onBeforeRender','onAfterRender',4,'color'],
            ['onBeforeShadow','onAfterShadow',5,'shadow']]) {
            const before=proto[beforeName],after=proto[afterName];
            if(typeof before!=='function'||typeof after!=='function') continue;
            const wrappedBefore=function(...args) {
                p.drawMaterial=args[index]??null; p.drawObject=this;
                p.drawGeometry=args[index-1]??null; p.drawPass=pass; p.drawRenderer=args[0];
                if(p.active&&pass==='color'&&!portalVariantSeen.has(this)
                    &&p.drawMaterial?.type==='MeshBasicMaterial'&&!p.drawMaterial.transparent
                    &&describeDraw()?.source==='world-portal'&&p.portalWarmupVariants.length<4) {
                    portalVariantSeen.add(this);
                    const properties=p.drawRenderer?.properties;
                    const programs=properties?.has?.(p.drawMaterial)?properties.get(p.drawMaterial).programs:null;
                    p.portalWarmupVariants.push({phase:p.phase,at:performance.now(),
                        parameters:programs?[...programs.values()].slice(0,12).map(shaderParameters):[]});
                }
                try { return before.apply(this,args); }
                catch(error) {
                    p.drawMaterial=null; p.drawObject=null; p.drawGeometry=null; p.drawPass=null;
                    p.drawRenderer=null;
                    throw error;
                }
            };
            const wrappedAfter=function(...args) {
                try { return after.apply(this,args); }
                finally { p.drawMaterial=null; p.drawObject=null; p.drawGeometry=null; p.drawPass=null; p.drawRenderer=null; }
            };
            proto[beforeName]=wrappedBefore; proto[afterName]=wrappedAfter;
            p.drawWrappers.push({proto,beforeName,afterName,before,after,wrappedBefore,wrappedAfter});
        }
        if(p.drawWrappers.length===2) p.gpuDrawStatus='CAPTURED-color-and-shadow-variant';
    }
    if(gl) {
        const ids=new WeakMap(); let nextId=0;
        const id=value=>{
            if(!value || typeof value!=='object') return null;
            if(!ids.has(value)) ids.set(value,++nextId);
            return ids.get(value);
        };
        for(const method of ['linkProgram','deleteProgram','getProgramInfoLog','getShaderInfoLog']) {
            const original=gl[method];
            if(typeof original!=='function') continue;
            const wrapped=function(...args) {
                const at=performance.now();
                try { return original.apply(this,args); }
                finally {
                    const durationMs=performance.now()-at;
                    if(p.active && p.gpuCalls.length<400)
                        p.gpuCalls.push({phase:p.phase,method,object:id(args[0]),at,
                            durationMs,material:describeDraw(),
                            shaderParameters:method==='getProgramInfoLog'
                                ?shaderParameters(p.drawRenderer?.info?.programs?.find(program=>program.program===args[0])):null});
                }
            };
            gl[method]=wrapped;
            p.gpuWrappers.push({gl,method,original,wrapped});
        }
        p.gpuStatus='CAPTURED-numeric-calls-not-mobile-proof';
    }
    try {
        const host=window.parent, original=host.postMessage;
        const wrapped=function(message,...args) {
            if(p.active && message?.type==='pocketmonster:pirate-presence-v1'
                && Array.isArray(message.monsterIntents) && message.monsterIntents.length
                && p.parentPosts.length<400)
                p.parentPosts.push({phase:p.phase,at:performance.now(),
                    count:message.monsterIntents.length,
                    sequences:message.monsterIntents.slice(0,32).map(i=>i.sequence)
                        .filter(Number.isSafeInteger)});
            return original.call(this,message,...args);
        };
        host.postMessage=wrapped;
        p.parentPostWrapper={host,original,wrapped};
        p.postStatus='CAPTURED-sender-not-receive-or-ack';
    } catch { p.postStatus='UNKNOWN-unavailable'; }
}"""


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
        self.stop_reason = None
        self.socket_lifecycle = []
        self.socket_status = 'UNKNOWN-not-observed'
        self.socket_truncated = False
        self.socket_tasks = set()
        self.socket_serial = 0
        self.socket_generations = {}
        self.wire_sends = []
        self.wire_truncated = False
        self.inbound = {}
        self.inbound_frames = 0
        self.inbound_truncated = False

    def new_socket_alias(self):
        if self.phase == 'complete':
            return
        if self.socket_serial >= 400:
            self.socket_truncated = True
            return
        self.socket_serial += 1
        return self.socket_serial

    def socket_event(self, kind, socket_alias=None):
        if kind not in ('created', 'close', 'error') or self.phase == 'complete':
            return
        self.socket_status = 'CAPTURED-socket-events-not-connection-acceptance'
        if len(self.socket_lifecycle) >= 400:
            self.socket_truncated = True
            return
        event = {'kind': kind, 'phase': self.phase,
            'atMs': round(asyncio.get_running_loop().time()*1000, 2)}
        if type(socket_alias) is int and 1 <= socket_alias <= self.socket_serial:
            event['socketAlias'] = socket_alias
        self.socket_lifecycle.append(event)
        return event

    async def capture_socket_generation(self, event, reader, page_socket_ordinal):
        event['generationStatus'] = 'UNKNOWN-not-matched'
        if type(page_socket_ordinal) is not int or page_socket_ordinal < 1:
            return
        try:
            data = await asyncio.wait_for(reader(), timeout=2)
            if (not isinstance(data, dict) or type(data.get('socketCreates')) is not int
                    or data['socketCreates'] != page_socket_ordinal):
                return
            generation = data.get('socketGeneration')
            if type(generation) is not int or not 1 <= generation <= 1_000_000:
                return
            # ผูกเฉพาะsocketที่เพิ่งสร้างตรงordinalของpage ไม่เดาว่าaliasเท่ากับgeneration
            self.socket_generations[event['socketAlias']] = generation
            event['generation'] = generation
            event['generationStatus'] = 'CAPTURED-runtime-generation-not-auth-acceptance'
        except Exception:
            pass

    async def capture_socket_close(self, event, reader):
        event['detailStatus'] = 'UNKNOWN-not-read'
        try:
            data = await asyncio.wait_for(reader(), timeout=2)
            close = data.get('lastSocketClose') if isinstance(data, dict) else None
            if not isinstance(close, dict):
                return
            code, category, generation = close.get('code'), close.get('category'), close.get('generation')
            if not (type(code) is int and 1000 <= code <= 4999
                    and category in ('auth-rejected', 'rate-limited', 'policy', 'abnormal', 'normal',
                                     'going-away', 'try-later', 'unknown', 'other')
                    and type(generation) is int and 1 <= generation <= 1_000_000):
                event['detailStatus'] = 'UNKNOWN-malformed-close-diagnostics'
                return
            expected = self.socket_generations.get(event.get('socketAlias'))
            if expected is None:
                event['detailStatus'] = 'UNKNOWN-generation-not-captured'
                return
            if generation != expected:
                event['detailStatus'] = 'UNKNOWN-generation-mismatch'
                return
            event.update(code=code, category=category, closeGeneration=generation)
            if type(data.get('reconnectDelayMs')) is int and data['reconnectDelayMs'] in (200, 400, 800, 1600, 3200, 5000):
                event['reconnectDelayMs'] = data['reconnectDelayMs']
            event['detailStatus'] = 'CAPTURED-safe-close-diagnostics-not-root-cause'
        except Exception:
            pass

    async def flush_socket_events(self):
        if self.socket_tasks:
            await asyncio.gather(*list(self.socket_tasks), return_exceptions=True)

    async def finish_socket_observation(self):
        # ปิดหน้าต่างก่อนteardown และรอdiagnosticsที่ค้าง แม้scenarioล้มก่อนtiming.run
        self.phase = 'complete'
        await self.flush_socket_events()
        return self.summary()

    def wire_summary(self):
        rows = []
        for alias in range(1, self.socket_serial+1):
            sends = [e for e in self.wire_sends if e['socketAlias'] == alias]
            row = {'socketAlias': alias, 'sends': len(sends),
                   'world': sum(e['type'] == 'world-pos' for e in sends),
                   'combatPrediction': sum(e['type'] == 'combat-prediction' for e in sends),
                   'otherControl': sum(e['type'] == 'other-control' for e in sends),
                   'unknownFrames': sum(e['type'] == 'unknown-frame' for e in sends)}
            for name, events in (
                    ('worldPeak10s', [e for e in sends if e['type'] == 'world-pos']),
                    ('controlCandidatePeak10s', [e for e in sends if e['type'] in ('combat-prediction', 'other-control')])):
                left, peak = 0, 0
                for right, event in enumerate(events):
                    while events[left]['atMs'] <= event['atMs']-10000:
                        left += 1
                    peak = max(peak, right-left+1)
                row[name] = peak
            rows.append(row)
        return {'status': 'CAPTURED-client-callback-not-server-arrival' if self.socket_serial else 'UNKNOWN-not-observed',
                'windowMs': 10000, 'serverArrivalGate': 'UNKNOWN',
                'sockets': rows, 'sends': self.wire_sends, 'truncated': self.wire_truncated}

    def received_size(self, socket_alias, frame_bytes, is_world, message_count=None):
        # เก็บเฉพาะขนาด/จำนวน ไม่เก็บ packet หรือ identity; callback ไม่ใช่เวลาเริ่มส่งของ Server
        if self.phase == 'complete' or type(socket_alias) is not int or not 1 <= socket_alias <= self.socket_serial:
            return
        if self.inbound_frames >= 5000:
            self.inbound_truncated = True
            return
        self.inbound_frames += 1
        phase = self.phase if self.phase in ('setup', 'idle', 'settle', 'approach', 'combat', 'rapid', 'tail') else 'other'
        key = (socket_alias, phase)
        now = asyncio.get_running_loop().time()*1000
        row = self.inbound.setdefault(key, {'socketAlias':socket_alias, 'phase':phase,
            'frames':0, 'worldSnapshots':0, 'measuredWorldSnapshots':0,
            'totalFrameBytes':0, 'totalWorldBytes':0, 'maxFrameBytes':0,
            'maxMessageCount':None, 'unknownByteFrames':0,
            'firstAtMs':round(now, 2), 'lastAtMs':round(now, 2), 'maxGapMs':0})
        row['frames'] += 1
        row['maxGapMs'] = max(row['maxGapMs'], round(now-row['lastAtMs'], 2))
        row['lastAtMs'] = round(now, 2)
        if is_world is True:
            row['worldSnapshots'] += 1
            if type(message_count) is int and 0 <= message_count <= 512:
                row['maxMessageCount'] = max(row['maxMessageCount'] or 0, message_count)
        if type(frame_bytes) is int and 0 <= frame_bytes <= 16_777_216:
            row['totalFrameBytes'] += frame_bytes
            row['maxFrameBytes'] = max(row['maxFrameBytes'], frame_bytes)
            if is_world is True:
                row['totalWorldBytes'] += frame_bytes
                row['measuredWorldSnapshots'] += 1
        else:
            row['unknownByteFrames'] += 1

    def inbound_summary(self):
        rows = []
        for row in self.inbound.values():
            count = row['measuredWorldSnapshots']
            rows.append({**row, 'meanWorldFrameBytes':round(row['totalWorldBytes']/count, 2) if count else None})
        return {'status':'CAPTURED-runner-callback-not-server-send' if self.inbound_frames else 'UNKNOWN-not-observed',
                'serverSendWaitGate':'UNKNOWN', 'frames':self.inbound_frames,
                'truncated':self.inbound_truncated, 'socketsByPhase':rows}

    def record(self, kind, **values):
        if len(self.timeline) < 4000:
            self.timeline.append({'kind': kind, 'phase': self.phase,
                'atMs': round(asyncio.get_running_loop().time()*1000, 2), **values})

    def sent(self, packet, socket_alias=None, frame_bytes=None):
        if self.phase == 'complete':
            return
        if type(socket_alias) is int and 1 <= socket_alias <= self.socket_serial:
            kind = 'unknown-frame' if not isinstance(packet, dict) else 'world-pos' if packet.get('type') == 'world-pos' else (
                'combat-prediction' if isinstance(packet, dict) and packet.get('schemaVersion') == 'combat-prediction-envelope/v9.1'
                else 'other-control')
            if len(self.wire_sends) < 5000:
                self.wire_sends.append({'socketAlias': socket_alias, 'type': kind, 'phase': self.phase,
                    'atMs': round(asyncio.get_running_loop().time()*1000, 2),
                    'frameBytes': frame_bytes if type(frame_bytes) is int and 0 <= frame_bytes <= 1_048_576 else None,
                    **wire_shape(packet)})
            else:
                self.wire_truncated = True
        if not isinstance(packet, dict):
            return
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

    async def profile_interval(self, cdp, name, operation):
        # วัดรอบUIเดิม ไม่เพิ่มการตี/ย้ายตัวละคร และไม่บันทึกrawprofileหรือURL
        before = await cdp.send('Performance.getMetrics')
        await cdp.send('Profiler.start')
        try:
            return await operation()
        finally:
            result = await cdp.send('Profiler.stop')
            after = await cdp.send('Performance.getMetrics')
            a = {m['name']: m['value'] for m in before['metrics']}
            b = {m['name']: m['value'] for m in after['metrics']}
            self.profiles[name] = {'cpu': self.cpu_summary(result['profile']),
                'metrics': {key: b.get(key, 0)-a.get(key, 0) for key in
                            ('ScriptDuration', 'TaskDuration', 'LayoutDuration', 'RecalcStyleDuration')}}

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
            const p = window.__qaCombatTiming = {phase:'idle', frames:[], messages:[], hits:[], inputs:[],
                longTasks:[],longTaskStatus:'UNKNOWN-unsupported',active:true};
            // longtaskเก็บเฉพาะตัวเลข; phaseคือช่วงที่observerได้รับ ไม่เดาว่าทั้งtaskอยู่phaseนั้น
            try {
                if(PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
                    p.longTaskObserver=new PerformanceObserver(list=>{
                        if(!p.active) return;
                        for(const entry of list.getEntries()) {
                            if(p.longTasks.length>=400) break;
                            if(Number.isFinite(entry.startTime)&&Number.isFinite(entry.duration))
                                p.longTasks.push({phaseAtObservation:p.phase,at:entry.startTime,
                                    durationMs:entry.duration,observedAtMs:performance.now()});
                        }
                    });
                    p.longTaskObserver.observe({type:'longtask',buffered:false});
                    p.longTaskStatus='CAPTURED-not-mobile-proof';
                }
            } catch { p.longTaskStatus='UNKNOWN-observer-unavailable'; }
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
        await native.evaluate(GPU_PROBE_SCRIPT)
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
            await self.profile_interval(cdp, name, lambda: asyncio.sleep(seconds))

        async def pose():
            return await native.evaluate('''() => {
                const c=window.__combat?.controller,p=c?.position;
                return p ? {x:p.x,z:p.z,heading:c.heading} : null;
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
                geometry = None
                for _ in range(8):
                    current = await pose()
                    target = next((a for a in get_wild() if a['id']==target_id), None)
                    geometry = attack_geometry(current, target)
                    if not geometry or geometry['distance'] >= 2.6:
                        self.stop_reason = 'target-out-of-range'
                        break
                    if geometry['facingDot'] is None:
                        self.stop_reason = 'target-too-close-to-aim'
                        break
                    if geometry['facingDot'] >= .75:
                        break
                    # หันผ่านจอยเดิมด้วยการเดินสั้น ๆ แล้วอ่านทั้งpose/targetใหม่
                    # ไม่forceheading ไม่autotarget ไม่ขยายrangeหรือกรวย120องศาของเกม
                    dx, dz, distance = target['x']-current['x'], target['z']-current['z'], geometry['distance']
                    await drag(.25*(dx*rx+dz*rz)/distance, .25*(-dx*rz+dz*rx)/distance, .15)
                else:
                    self.stop_reason = 'target-not-facing'
                if self.stop_reason:
                    self.record('scenario-stopped', reason=self.stop_reason)
                    return False
                self.record('input-before', x=current.get('x') if current else None,
                    z=current.get('z') if current else None,
                    distance=geometry['distance'], facingDot=geometry['facingDot'])
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
            async def combat_sequence():
                if await attack('combat', 2, .25):
                    await attack('rapid', 4, .12)
            await self.profile_interval(cdp, 'combat-and-rapid', combat_sequence)
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
                p.active=false; p.longTaskObserver?.disconnect();
                window.removeEventListener('message',p.listener);
                document.removeEventListener('pointerdown',p.pointer,true);
                document.removeEventListener('pointerup',p.pointer,true);
                if(window.__combat?.onSharedMonsterAttack===p.observedHit)
                    window.__combat.onSharedMonsterAttack=p.originalHit;
                for(const w of p.gpuWrappers||[])
                    if(w.gl[w.method]===w.wrapped) w.gl[w.method]=w.original;
                for(const d of p.drawWrappers||[]) {
                    if(d.proto[d.beforeName]===d.wrappedBefore) d.proto[d.beforeName]=d.before;
                    if(d.proto[d.afterName]===d.wrappedAfter) d.proto[d.afterName]=d.after;
                }
                const w=p.parentPostWrapper;
                if(w && w.host.postMessage===w.wrapped) w.host.postMessage=w.original;
                return {frames:p.frames,messages:p.messages,hits:p.hits,inputs:p.inputs,
                    longTasks:p.longTasks,longTaskStatus:p.longTaskStatus,
                    gpuCalls:p.gpuCalls,gpuStatus:p.gpuStatus,
                    gpuDrawStatus:p.gpuDrawStatus,
                    portalWarmupVariants:p.portalWarmupVariants,
                    parentPosts:p.parentPosts,postStatus:p.postStatus};
            }""")
            await game.screenshot(path=str(out/'timing-final.png'))
            await self.flush_socket_events()

    def summary(self):
        # ต้องเห็น intent ไปยังมอนตัวเดียวกันก่อน HP authority ลด; HP ของตัวอื่นไม่นับ
        targeted_damage = any(
            event['kind'] == 'socket-hp' and event.get('hp', 0) < event.get('before', 0)
            and event['phase'] in ('combat', 'rapid', 'settle')
            and any(sent['kind'] == 'socket-intent' and sent.get('target') == event.get('target')
                    and sent['phase'] in ('combat', 'rapid') and sent['atMs'] < event['atMs']
                    for sent in self.timeline)
            for event in self.timeline)
        return {'scope':'runner-swiftshader-not-mobile-render-proof',
                'targetedDamageCaptured': targeted_damage,
                'stopReason': self.stop_reason,
                'rapidScenario': 'UNKNOWN' if self.stop_reason else 'CAPTURED-not-acceptance',
                'profiles':self.profiles,
                'cpuScope':'runner-main-target-cdp-not-mobile-proof',
                'visualBatchingGate':'UNKNOWN', 'packets':self.samples, 'native':self.frames,
                'timeline':self.timeline, 'perIntentServerRejection':'UNKNOWN-no-ack-on-wire',
                'clockSamples':self.clock_samples,
                'socketLifecycleStatus':self.socket_status,
                'socketLifecycle':self.socket_lifecycle,
                'socketLifecycleTruncated':self.socket_truncated,
                'wireObservation':self.wire_summary(),
                'inboundObservation':self.inbound_summary(),
                'combatHpChanges':sum(s['hpChanges'] for s in self.samples if s['phase']=='combat')}
