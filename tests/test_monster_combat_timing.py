"""ตรวจเครื่องมือวัด ไม่ถือเป็นผลการต่อสู้จริง."""
import unittest
from monster_combat_timing import CombatTiming, GPU_PROBE_SCRIPT


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
