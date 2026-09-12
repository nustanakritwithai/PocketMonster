import { createMonsterHttpProvider } from './monster-command-http-provider-v900.mjs';
import { createMonsterCommandAdapter } from './monster-command-adapter.mjs';
import { createMonsterControlController } from './monster-control-controller-v900.mjs';
import { bindMonsterControlScene, monsterThrowAimFromPose } from './monster-control-scene-binding-v900.mjs';

// หน้าเกมโดยตรงต้องมีตัวควบคุมด้วย ส่วนฉากฝังให้ shell เป็นเจ้าของต่อไป
export function mountDirectMonsterControls({ windowLike, config, sessionToken }) {
  if (windowLike.POCKETMONSTER_SCENE_EMBEDDED || !sessionToken || windowLike.POCKETMONSTER_MONSTER_CONTROL_CONTROLLER) return null;
  const pose = () => windowLike.POCKETMONSTER_WORLD_STATE?.();
  const getZone = () => pose()?.zone || '';
  const provider = createMonsterHttpProvider({ config, sessionToken, getZone, pollMs: 2000 });
  const commands = createMonsterCommandAdapter({ getZone, send: command => provider.send(command) });
  const controller = createMonsterControlController({ commands, getZone,
    getParty: () => provider.snapshot().party,
    getCapabilities: () => provider.snapshot().capabilities,
    getConfirmedActors: () => provider.snapshot().actors,
    getSkills: id => provider.snapshot().skills?.[id] || [],
    getAim: () => monsterThrowAimFromPose(pose())?.targetPoint || null,
  });
  windowLike.POCKETMONSTER_MONSTER_STATE_PROVIDER = provider;
  const unsubscribe = provider.subscribe(() => controller.sync());
  const unbind = bindMonsterControlScene({ sceneWindow: windowLike, controller });
  void provider.refresh();
  provider.start();
  const dispose = () => { unbind(); unsubscribe(); provider.dispose(); windowLike.removeEventListener('pagehide', dispose); };
  windowLike.addEventListener('pagehide', dispose, { once: true });
  return { provider, controller, dispose };
}
