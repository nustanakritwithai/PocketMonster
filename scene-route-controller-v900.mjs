/**
 * In-document scene route controller.
 * Runtimes register mount/unmount handlers once; route changes never touch
 * iframe src or location.assign.
 */
export function createSceneRouteController({ initialRoute = null } = {}) {
  const runtimes = new Map();
  let active = initialRoute;
  let switching = false;

  function register(id, runtime) {
    if (!id || !runtime || typeof runtime.mount !== 'function' || typeof runtime.unmount !== 'function') {
      throw new TypeError('scene runtime requires mount/unmount');
    }
    runtimes.set(id, runtime);
    return () => runtimes.delete(id);
  }

  async function switchTo(id, route = {}) {
    if (switching || id === active) return false;
    const next = runtimes.get(id);
    if (!next) return false;
    switching = true;
    try {
      const previous = active ? runtimes.get(active) : null;
      await previous?.unmount?.();
      await next.mount(route);
      active = id;
      return true;
    } finally {
      switching = false;
    }
  }

  return Object.freeze({
    register,
    switchTo,
    diagnostics: () => Object.freeze({ active, switching, runtimeCount: runtimes.size }),
  });
}
