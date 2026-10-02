"""ตรวจลำดับ QA resize ด้วย protocol fixture ไม่เปิด browser บน VPS."""
import unittest
from combat_browser_viewport import resize_combat_viewport


class WindowFixture:
    def __init__(self, state):
        self.state = state
        self.calls = []
        self.context = self
        self.fail_resize = False

    async def new_cdp_session(self, page):
        return self

    async def send(self, method, params=None):
        self.calls.append((method, params))
        if method == 'Browser.getWindowForTarget':
            return {'windowId': 7, 'bounds': {'windowState': self.state}}
        if method == 'Browser.setWindowBounds':
            self.state = params['bounds']['windowState']

    async def set_viewport_size(self, viewport):
        self.calls.append(('resize', viewport))
        if self.state != 'normal':
            raise RuntimeError('restore window before resize')
        if self.fail_resize:
            raise RuntimeError('real resize failure must remain visible')

    async def detach(self):
        self.calls.append(('detach', None))


class ViewportTests(unittest.IsolatedAsyncioTestCase):
    async def test_baseline_fails_and_candidate_restores_first(self):
        for state in ('minimized', 'maximized', 'fullscreen'):
            with self.subTest(state=state):
                page = WindowFixture(state)
                viewport = {'width': 640, 'height': 360}
                with self.assertRaisesRegex(RuntimeError, 'restore window'):
                    await page.set_viewport_size(viewport)
                page.calls.clear()
                self.assertTrue(await resize_combat_viewport(page, viewport))
                self.assertEqual([call[0] for call in page.calls], [
                    'Browser.getWindowForTarget', 'Browser.setWindowBounds', 'resize', 'detach'])
                self.assertEqual(page.calls[1][1]['bounds'], {'windowState': 'normal'})

    async def test_normal_window_does_not_restore_or_change_game_state(self):
        page = WindowFixture('normal')
        self.assertFalse(await resize_combat_viewport(page, {'width': 640, 'height': 360}))
        self.assertEqual([call[0] for call in page.calls], [
            'Browser.getWindowForTarget', 'resize', 'detach'])

    async def test_error_is_not_swallowed_and_session_detaches(self):
        page = WindowFixture('fullscreen')
        page.fail_resize = True
        with self.assertRaisesRegex(RuntimeError, 'real resize failure'):
            await resize_combat_viewport(page, {'width': 640, 'height': 360})
        self.assertEqual(page.calls[-1][0], 'detach')


if __name__ == '__main__':
    unittest.main()
