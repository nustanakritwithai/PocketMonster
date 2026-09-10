"""Fail the real-browser gate if Pirate Fighting Style wraps are not following Studio hands."""
import json
from pathlib import Path

report_path = Path(__file__).resolve().parents[1] / 'studio-browser-evidence' / 'report.json'
report = json.loads(report_path.read_text(encoding='utf-8'))

initial_actor = report.get('initial', {}).get('child', {}).get('bridge', {}).get('studioPlayer') or {}
initial_animation = initial_actor.get('animation') or {}
initial_synced = int(initial_animation.get('legacyHandEquipmentSynced') or 0)
assert initial_synced >= 2, f'Expected both Fighting Style hand wraps synced in real browser, got {initial_synced}'

locomotion = report.get('actionEvidence', {}).get('locomotion') or []
locomotion_synced = [int(((sample or {}).get('animation') or {}).get('legacyHandEquipmentSynced') or 0) for sample in locomotion]
assert locomotion_synced and max(locomotion_synced) >= 2, 'Fighting Style wraps lost Studio hand sockets during locomotion'
assert min(locomotion_synced[-5:] or [0]) >= 2, 'Fighting Style wraps did not remain synced at the end of locomotion sampling'

reload_actor = report.get('reload', {}).get('child', {}).get('bridge', {}).get('studioPlayer') or {}
reload_synced = int((reload_actor.get('animation') or {}).get('legacyHandEquipmentSynced') or 0)
assert reload_synced >= 2, f'Fighting Style wraps did not recover after reload, got {reload_synced}'

print('V9.1 real-browser Fighting Style wrap socket evidence passed', {
    'initial': initial_synced,
    'locomotionMax': max(locomotion_synced),
    'reload': reload_synced,
})
