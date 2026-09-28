"""ตรวจเครื่องมือวัด ไม่ถือเป็นผลการต่อสู้จริง."""
import unittest
from monster_combat_timing import CombatTiming


class TimingTests(unittest.IsolatedAsyncioTestCase):
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
