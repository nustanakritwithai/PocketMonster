"""ตรวจเครื่องมือวัด ไม่ถือเป็นผลการต่อสู้จริง."""
import unittest
from monster_combat_timing import CombatTiming


class TimingTests(unittest.IsolatedAsyncioTestCase):
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
