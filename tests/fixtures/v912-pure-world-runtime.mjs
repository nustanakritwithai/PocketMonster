import { defineWorldRuntimeLifecycle } from '../../world-runtime-lifecycle-v910.mjs';
import { defineWorldRuntimeFactory } from '../../world-runtime-import-purity-v912.mjs';

let creationCount = 0;

export const worldRuntimeFactory = defineWorldRuntimeFactory({
  runtimeId: 'v912-pure-fixture',
  createRuntime() {
    creationCount += 1;
    let state = 'created';
    return defineWorldRuntimeLifecycle({
      async prepare() { state = 'prepared'; },
      async mount() { state = 'mounted'; },
      async pause() { state = 'paused'; },
      async resume() { state = 'mounted'; },
      async unmount() { state = 'prepared'; },
      async dispose() { state = 'disposed'; },
      diagnostics() { return Object.freeze({ state }); },
    });
  },
});

export function fixtureCreationCount() {
  return creationCount;
}

export default worldRuntimeFactory;
