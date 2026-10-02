"""ตรวจเครื่องมือวัด ไม่ถือเป็นผลการต่อสู้จริง."""
import unittest
import asyncio
from monster_combat_timing import CombatTiming, GPU_PROBE_SCRIPT, observe_socket_lifecycle, attack_geometry


class FakeCDP:
    def __init__(self):
        self.calls = []
        self.metrics_count = 0

    async def send(self, command):
        self.calls.append(command)
        if command == 'Performance.getMetrics':
            self.metrics_count += 1
            return {'metrics': [{'name': 'ScriptDuration', 'value': self.metrics_count}]}
        if command == 'Profiler.stop':
            return {'profile': {'nodes': [{'id': 1, 'callFrame': {
                'functionName': 'attackUpdate',
                'url': 'https://invalid.example/index-CrbfA8Ln.js?token=never-log-this',
                'lineNumber': 12, 'columnNumber': 34}}],
                'samples': [1], 'timeDeltas': [2500]}}
        return {}


class TimingTests(unittest.IsolatedAsyncioTestCase):
    async def test_close_diagnostics_only_return_safe_allowlisted_fields(self):
        probe = CombatTiming()
        probe.phase = 'combat'
        alias = probe.new_socket_alias()
        probe.socket_generations[alias] = 1
        event = probe.socket_event('close', alias)

        async def reader():
            return {'lastSocketClose': {'code':1006,'category':'abnormal','generation':1,
                    'reason':'never-log-this','url':'https://invalid.example'},
                    'reconnectDelayMs':200,'token':'never-log-this'}

        await probe.capture_socket_close(event, reader)
        self.assertEqual(event['code'], 1006)
        self.assertEqual(event['closeGeneration'], 1)
        self.assertEqual(event['reconnectDelayMs'], 200)
        self.assertNotIn('never-log-this', str(probe.summary()))
        self.assertNotIn('invalid.example', str(probe.summary()))

    async def test_malformed_close_details_never_claim_capture(self):
        for close in ({}, {'code':1006}, {'code':True,'category':'abnormal','generation':1},
                      {'code':1006,'category':'never-log-this','generation':1},
                      {'code':1006,'category':'abnormal','generation':'1'}):
            probe = CombatTiming()
            alias = probe.new_socket_alias()
            probe.socket_generations[alias] = 1
            event = probe.socket_event('close', alias)
            async def reader():
                return {'lastSocketClose':close}
            await probe.capture_socket_close(event, reader)
            self.assertEqual(event['detailStatus'], 'UNKNOWN-malformed-close-diagnostics')
            self.assertNotIn('code', event)
            self.assertNotIn('never-log-this', str(probe.summary()))

    async def test_late_close_reader_does_not_attribute_new_generation(self):
        probe = CombatTiming()
        alias = probe.new_socket_alias()
        probe.socket_generations[alias] = 1
        event = probe.socket_event('close', alias)
        async def reader():
            return {'lastSocketClose':{'code':1008,'category':'rate-limited','generation':2},
                    'reconnectDelayMs':5000}
        await probe.capture_socket_close(event, reader)
        self.assertEqual(event['detailStatus'], 'UNKNOWN-generation-mismatch')
        self.assertNotIn('code', event)
        self.assertNotIn('closeGeneration', event)

    async def test_unmatched_creation_generation_stays_unknown(self):
        probe = CombatTiming()
        alias = probe.new_socket_alias()
        event = probe.socket_event('created', alias)
        async def reader():
            return {'socketGeneration':2,'socketCreates':2}
        await probe.capture_socket_generation(event, reader, 1)
        self.assertEqual(event['generationStatus'], 'UNKNOWN-not-matched')
        close = probe.socket_event('close', alias)
        async def closed_reader():
            return {'lastSocketClose':{'code':1006,'category':'abnormal','generation':2}}
        await probe.capture_socket_close(close, closed_reader)
        self.assertEqual(close['detailStatus'], 'UNKNOWN-generation-not-captured')

    async def test_failure_finalization_flushes_queued_close_and_excludes_teardown(self):
        probe = CombatTiming()
        alias = probe.new_socket_alias()
        probe.socket_generations[alias] = 7
        event = probe.socket_event('close', alias)
        async def reader():
            await asyncio.sleep(0)
            return {'lastSocketClose':{'code':1008,'category':'rate-limited','generation':7},
                    'reconnectDelayMs':5000}
        task = asyncio.create_task(probe.capture_socket_close(event, reader))
        probe.socket_tasks.add(task)
        summary = await probe.finish_socket_observation()
        self.assertTrue(task.done())
        self.assertEqual(summary['socketLifecycle'][0]['code'], 1008)
        probe.socket_event('close', alias)
        probe.sent({'type':'world-pos'}, alias)
        self.assertEqual(len(probe.socket_lifecycle), 1)
        self.assertEqual(probe.wire_sends, [])

    async def test_socket_aliases_are_local_and_created_generation_is_not_alias(self):
        class FakeSocket:
            url = 'wss://invalid.example/ws/chat?token=never-log-this'
            def __init__(self):
                self.handlers = {}
            def on(self, event, handler):
                self.handlers[event] = handler
        probe = CombatTiming()
        socket = FakeSocket()
        async def reader():
            return {'socketGeneration':7,'socketCreates':1,
                    'lastSocketClose':{'code':1006,'category':'abnormal','generation':7}}
        alias = observe_socket_lifecycle(probe, socket, reader, 1)
        await probe.flush_socket_events()
        self.assertEqual(alias, 1)
        self.assertEqual(probe.socket_generations[alias], 7)
        socket.handlers['close'](socket)
        await probe.flush_socket_events()
        self.assertEqual(probe.socket_lifecycle[-1]['closeGeneration'], 7)
        self.assertNotIn('never-log-this', str(probe.summary()))

    async def test_wire_observer_only_keeps_type_time_and_local_socket_alias(self):
        probe = CombatTiming()
        alias = probe.new_socket_alias()
        for packet in ({'type':'world-pos','token':'never-log-this'},
                       {'schemaVersion':'combat-prediction-envelope/v9.1','playerId':'private-player'},
                       {'type':'private-player','url':'https://invalid.example'}, None, []):
            probe.sent(packet, alias)
        wire = probe.summary()['wireObservation']
        self.assertEqual([e['type'] for e in wire['sends']],
                         ['world-pos','combat-prediction','other-control','unknown-frame','unknown-frame'])
        self.assertEqual(wire['sockets'][0]['world'], 1)
        self.assertEqual(wire['sockets'][0]['combatPrediction'], 1)
        self.assertEqual(wire['sockets'][0]['otherControl'], 1)
        self.assertEqual(wire['sockets'][0]['unknownFrames'], 2)
        self.assertEqual(wire['serverArrivalGate'], 'UNKNOWN')
        for value in ('never-log-this','private-player','invalid.example'):
            self.assertNotIn(value, str(wire))

    async def test_wire_peak_window_is_per_socket_and_has_same_open_left_boundary(self):
        probe = CombatTiming()
        a, b = probe.new_socket_alias(), probe.new_socket_alias()
        probe.wire_sends = [{'socketAlias':a,'type':'world-pos','phase':'setup','atMs':i*40}
                            for i in range(241)]
        probe.wire_sends += [{'socketAlias':b,'type':'world-pos','phase':'setup','atMs':0},
                            {'socketAlias':b,'type':'world-pos','phase':'setup','atMs':10000}]
        probe.wire_sends += [{'socketAlias':a,'type':'combat-prediction','phase':'setup','atMs':i}
                            for i in range(120)]
        first, second = probe.summary()['wireObservation']['sockets']
        self.assertEqual(first['worldPeak10s'], 241)
        self.assertEqual(first['controlCandidatePeak10s'], 120)
        self.assertEqual(second['worldPeak10s'], 1)

    async def test_wire_storage_is_bounded_and_unassociated_socket_is_unknown(self):
        probe = CombatTiming()
        probe.sent({'token':'never-log-this'}, 1)
        self.assertEqual(probe.summary()['wireObservation']['status'], 'UNKNOWN-not-observed')
        alias = probe.new_socket_alias()
        for _ in range(5010):
            probe.sent({'type':'world-pos'}, alias)
        self.assertEqual(len(probe.wire_sends), 5000)
        self.assertTrue(probe.summary()['wireObservation']['truncated'])

    async def test_attack_geometry_distinguishes_behind_from_within_range(self):
        before = {'x':0,'z':0,'heading':0}
        behind = attack_geometry(before, {'x':0,'z':-.5})
        front = attack_geometry(before, {'x':0,'z':.5})
        self.assertEqual(behind['distance'], .5)
        self.assertEqual(behind['facingDot'], -1)
        self.assertEqual(front['facingDot'], 1)
        self.assertEqual(before, {'x':0,'z':0,'heading':0})

    async def test_unavailable_aim_is_unknown_not_forward(self):
        self.assertIsNone(attack_geometry({'x':0,'z':0}, {'x':0,'z':1}))
        self.assertIsNone(attack_geometry({'x':0,'z':0,'heading':float('nan')}, {'x':0,'z':1}))
        self.assertIsNone(attack_geometry({'x':True,'z':0,'heading':0}, {'x':0,'z':1}))
        geometry = attack_geometry({'x':0,'z':0,'heading':0}, {'x':0,'z':0})
        self.assertEqual(geometry['distance'], 0)
        self.assertIsNone(geometry['facingDot'])

    async def test_close_diagnostics_failure_remains_unknown_and_keeps_close(self):
        probe = CombatTiming()
        event = probe.socket_event('close')

        async def reader():
            raise RuntimeError('never-log-this')

        await probe.capture_socket_close(event, reader)
        self.assertEqual(event['kind'], 'close')
        self.assertEqual(event['detailStatus'], 'UNKNOWN-not-read')
        self.assertNotIn('never-log-this', str(probe.summary()))

    async def test_unobserved_socket_is_unknown_not_zero_faults(self):
        probe = CombatTiming()
        self.assertEqual(probe.summary()['socketLifecycleStatus'], 'UNKNOWN-not-observed')
        self.assertEqual(probe.summary()['socketLifecycle'], [])

    async def test_existing_socket_observer_filters_path_and_drops_sensitive_arguments(self):
        class FakeSocket:
            def __init__(self, url):
                self.url = url
                self.handlers = {}

            def on(self, event, handler):
                self.handlers[event] = handler

        probe = CombatTiming()
        other = FakeSocket('wss://invalid.example/other?token=never-log-this')
        observe_socket_lifecycle(probe, other)
        self.assertEqual(other.handlers, {})
        socket = FakeSocket('wss://invalid.example/ws/chat?token=never-log-this')
        observe_socket_lifecycle(probe, socket)
        self.assertEqual(set(socket.handlers), {'close', 'socketerror'})
        probe.phase = 'combat'
        socket.handlers['socketerror']('private-player never-log-this')
        socket.handlers['close'](socket)
        self.assertEqual([e['kind'] for e in probe.summary()['socketLifecycle']],
                         ['created', 'error', 'close'])
        self.assertNotIn('never-log-this', str(probe.summary()))
        self.assertNotIn('invalid.example', str(probe.summary()))
        self.assertNotIn('private-player', str(probe.summary()))
        self.assertEqual(probe.summary()['socketLifecycleStatus'],
                         'CAPTURED-socket-events-not-connection-acceptance')

    async def test_socket_probe_is_bounded_and_ignores_teardown_and_unknown_events(self):
        probe = CombatTiming()
        probe.socket_event('untrusted-private-text')
        self.assertEqual(probe.summary()['socketLifecycleStatus'], 'UNKNOWN-not-observed')
        probe.phase = 'combat'
        for _ in range(401):
            probe.socket_event('error')
        self.assertEqual(len(probe.socket_lifecycle), 400)
        self.assertTrue(probe.summary()['socketLifecycleTruncated'])
        probe.phase = 'complete'
        before = list(probe.socket_lifecycle)
        probe.socket_event('close')
        self.assertEqual(probe.socket_lifecycle, before)

    async def test_material_probe_uses_real_scene_not_scoped_effects_and_tracks_shadow(self):
        self.assertIn('window.__combat?.scene', GPU_PROBE_SCRIPT)
        self.assertNotIn('window.__combat?.effects?.scene', GPU_PROBE_SCRIPT)
        self.assertIn("['onBeforeRender','onAfterRender',4,'color']", GPU_PROBE_SCRIPT)
        self.assertIn("['onBeforeShadow','onAfterShadow',5,'shadow']", GPU_PROBE_SCRIPT)
        self.assertIn('CAPTURED-color-and-shadow-variant', GPU_PROBE_SCRIPT)

    async def test_draw_metadata_is_only_described_on_gpu_call_and_redacts_names(self):
        self.assertIn('p.drawMaterial=args[index]??null; p.drawObject=this', GPU_PROBE_SCRIPT)
        self.assertIn('durationMs,material:describeDraw()', GPU_PROBE_SCRIPT)
        self.assertIn("source='world-portal'", GPU_PROBE_SCRIPT)
        self.assertIn('geometries.has(g?.type)', GPU_PROBE_SCRIPT)
        self.assertIn('o?.isInstancedMesh===true', GPU_PROBE_SCRIPT)
        self.assertIn('o?.isBatchedMesh===true', GPU_PROBE_SCRIPT)
        self.assertIn('depth<12', GPU_PROBE_SCRIPT)
        self.assertNotIn('name:ancestor.name', GPU_PROBE_SCRIPT)
        self.assertNotIn('uuid:', GPU_PROBE_SCRIPT)

    async def test_builtin_shader_parameters_are_bounded_and_never_return_raw_cache_key(self):
        self.assertIn("parts[0]!=='basic'", GPU_PROBE_SCRIPT)
        self.assertIn('properties?.has?.(p.drawMaterial)', GPU_PROBE_SCRIPT)
        self.assertIn('p.portalWarmupVariants.length<4', GPU_PROBE_SCRIPT)
        self.assertIn('slice(0,12).map(shaderParameters)', GPU_PROBE_SCRIPT)
        self.assertIn('pointLights:34', GPU_PROBE_SCRIPT)
        self.assertIn('spaces.has(parts[2])', GPU_PROBE_SCRIPT)
        self.assertIn('spaces.has(parts[51])', GPU_PROBE_SCRIPT)
        self.assertIn('Number.isSafeInteger(program.usedTimes)', GPU_PROBE_SCRIPT)
        self.assertIn("method==='getProgramInfoLog'", GPU_PROBE_SCRIPT)
        self.assertNotIn('cacheKey:program.cacheKey', GPU_PROBE_SCRIPT)

    async def test_gpu_probe_is_bounded_numeric_and_does_not_change_shader_inputs(self):
        self.assertIn('p.gpuCalls.length<400', GPU_PROBE_SCRIPT)
        self.assertIn('p.parentPosts.length<400', GPU_PROBE_SCRIPT)
        self.assertIn('original.apply(this,args)', GPU_PROBE_SCRIPT)
        self.assertIn('original.call(this,message,...args)', GPU_PROBE_SCRIPT)
        self.assertIn('finally', GPU_PROBE_SCRIPT)
        for forbidden in ['getShaderSource', 'shaderSource', 'checkShaderErrors',
                          'deleteShader', 'createShader', 'token', 'getError']:
            self.assertNotIn(forbidden, GPU_PROBE_SCRIPT)

    async def test_profile_measures_existing_operation_once_and_redacts_url(self):
        probe, cdp = CombatTiming(), FakeCDP()
        calls = []

        async def operation():
            calls.append('existing-ui-sequence')
            self.assertEqual(cdp.calls[-1], 'Profiler.start')
            return True

        self.assertTrue(await probe.profile_interval(cdp, 'combat-and-rapid', operation))
        self.assertEqual(calls, ['existing-ui-sequence'])
        self.assertEqual(cdp.calls, ['Performance.getMetrics', 'Profiler.start',
                                    'Profiler.stop', 'Performance.getMetrics'])
        profile = probe.summary()['profiles']['combat-and-rapid']
        self.assertEqual(profile['metrics']['ScriptDuration'], 1)
        self.assertEqual(profile['cpu'][0]['selfMs'], 2.5)
        self.assertEqual(profile['cpu'][0]['asset'], 'index-CrbfA8Ln.js')
        self.assertNotIn('never-log-this', str(probe.summary()))
        self.assertNotIn('invalid.example', str(probe.summary()))
        self.assertEqual(probe.summary()['visualBatchingGate'], 'UNKNOWN')

    async def test_failed_scenario_stops_profiler_without_changing_failure(self):
        probe, cdp = CombatTiming(), FakeCDP()

        async def operation():
            raise RuntimeError('timing-original-scenario-error')

        with self.assertRaisesRegex(RuntimeError, 'timing-original-scenario-error'):
            await probe.profile_interval(cdp, 'combat-and-rapid', operation)
        self.assertIn('Profiler.stop', cdp.calls)
        self.assertIn('combat-and-rapid', probe.profiles)

    async def test_capture_requires_damage_to_target_after_intent(self):
        probe = CombatTiming()
        probe.phase = 'combat'
        probe.record('socket-hp', target='monster:crab', before=70, hp=58)
        probe.timeline[-1]['atMs'] = 1
        self.assertFalse(probe.summary()['targetedDamageCaptured'])
        probe.sent({'type': 'world-pos', 'monsterIntents': [{'sequence': 1, 'targetActorId': 'monster:crab'}]})
        probe.timeline[-1]['atMs'] = 2
        probe.record('socket-hp', target='monster:other', before=70, hp=58)
        probe.timeline[-1]['atMs'] = 3
        self.assertFalse(probe.summary()['targetedDamageCaptured'])
        probe.record('socket-hp', target='monster:crab', before=58, hp=46)
        probe.timeline[-1]['atMs'] = 4
        self.assertTrue(probe.summary()['targetedDamageCaptured'])

    async def test_out_of_range_does_not_claim_rapid_acceptance(self):
        probe = CombatTiming()
        probe.stop_reason = 'target-out-of-range'
        self.assertEqual(probe.summary()['rapidScenario'], 'UNKNOWN')

    async def test_attack_probe_records_intent_not_tokens_or_other_players(self):
        probe = CombatTiming()
        probe.phase = 'combat'
        probe.sent({'token': 'never-log-this'})
        probe.sent({'type': 'world-pos', 'x': 1, 'z': 2, 'token': 'never-log-this',
                    'monsterIntents': [{'sequence': 9, 'targetActorId': 'monster:starter-crab-1', 'category': 'style'}]})
        self.assertEqual(len(probe.timeline), 1)
        self.assertEqual(probe.timeline[0]['sequence'], 9)
        self.assertNotIn('never-log-this', str(probe.summary()))

    async def test_replayed_history_is_not_fresh_damage(self):
        probe = CombatTiming()
        probe.phase = 'combat'
        world = {'pirateWorld': {'generation': 1, 'sequence': 1, 'messages': [{'seq': 1}]},
                 'actors': [{'actorId': 'qa-only', 'authority': {'hp': {'current': 100}}}]}
        probe.receive(world)
        probe.receive(world)
        world['actors'][0]['authority']['hp']['current'] = 80
        probe.receive(world)
        self.assertEqual([s['freshMessages'] for s in probe.samples], [1, 0, 0])
        self.assertEqual(probe.summary()['combatHpChanges'], 1)
        self.assertEqual(probe.summary()['visualBatchingGate'], 'UNKNOWN')

    async def test_storage_is_bounded_and_has_no_player_identifiers(self):
        probe = CombatTiming()
        probe.phase = 'idle'
        for _ in range(3100):
            probe.receive({'actors': [{'actorId': 'secret-player', 'authority': {'hp': {'current': 10}}}]})
        self.assertEqual(len(probe.samples), 3000)
        self.assertNotIn('secret-player', str(probe.summary()))


if __name__ == '__main__':
    unittest.main()
