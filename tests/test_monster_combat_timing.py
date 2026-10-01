"""ตรวจเครื่องมือวัด ไม่ถือเป็นผลการต่อสู้จริง."""
import unittest
from monster_combat_timing import CombatTiming


class TimingTests(unittest.IsolatedAsyncioTestCase):
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
        intents = [e for e in probe.timeline if e['kind'] == 'socket-intent']
        self.assertEqual(len(intents), 1)
        self.assertEqual(intents[0]['sequence'], 9)
        self.assertNotIn('never-log-this', str(probe.summary()))

    async def test_pose_and_socket_lifecycle_are_bounded_without_payloads(self):
        probe = CombatTiming(reentry=True)
        probe.phase = 'approach'
        probe.sent({'type':'world-pos', 'x':1, 'z':2, 'token':'secret', 'username':'private'})
        self.assertEqual(probe.timeline[0]['kind'], 'socket-pose')
        for _ in range(300):
            probe.socket_event('close', 1)
        self.assertEqual(len(probe.socket_events), 256)
        self.assertNotIn('secret', str(probe.summary()))
        self.assertNotIn('private', str(probe.summary()))

    async def test_reentry_needs_two_separate_targeted_damage_windows(self):
        probe = CombatTiming(reentry=True)
        probe.phase = 'combat'
        probe.sent({'type':'world-pos', 'monsterIntents':[{'targetActorId':'monster:crab','sequence':1}]})
        probe.timeline[-1]['atMs'] = 1
        probe.phase = 'settle'
        probe.record('socket-hp', target='monster:crab', before=70, hp=58)
        probe.timeline[-1]['atMs'] = 2
        self.assertEqual(probe.summary()['reentryCaptureGate'], 'UNKNOWN')
        probe.phase = 'reentry'
        probe.sent({'type':'world-pos', 'monsterIntents':[{'targetActorId':'monster:crab','sequence':2}]})
        probe.timeline[-1]['atMs'] = 3
        probe.phase = 'settle'
        probe.record('socket-hp', target='monster:crab', before=58, hp=46)
        probe.timeline[-1]['atMs'] = 4
        self.assertEqual(probe.summary()['reentryCaptureGate'], 'SAT')
        probe.stop_reason = 'target-out-of-range'
        self.assertEqual(probe.summary()['reentryCaptureGate'], 'UNKNOWN')

    async def test_delayed_first_damage_does_not_prove_reentry(self):
        probe = CombatTiming(reentry=True)
        for phase, sequence in [('combat',1), ('reentry',2)]:
            probe.phase = phase
            probe.sent({'type':'world-pos','monsterIntents':[{'targetActorId':'monster:crab','sequence':sequence}]})
        probe.phase = 'settle'
        probe.record('socket-hp', target='monster:crab', before=70, hp=58)
        self.assertEqual(probe.summary()['reentryCaptureGate'], 'UNKNOWN')

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
