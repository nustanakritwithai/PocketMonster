"""ปรับเฉพาะหน้าต่าง browser QA ก่อนวัด combat ไม่แก้เวลา/HP/โหมดเกม."""


async def resize_combat_viewport(page, viewport):
    session = await page.context.new_cdp_session(page)
    try:
        window = await session.send('Browser.getWindowForTarget')
        state = window['bounds'].get('windowState', 'normal')
        restored = state in ('minimized', 'maximized', 'fullscreen')
        if restored:
            # คืนสถานะหน้าต่างก่อนส่งขนาด: CDP ไม่อนุญาต resize state เหล่านี้พร้อมกัน
            await session.send('Browser.setWindowBounds', {
                'windowId': window['windowId'], 'bounds': {'windowState': 'normal'},
            })
        await page.set_viewport_size(viewport)
        return restored
    finally:
        await session.detach()
