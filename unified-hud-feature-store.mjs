/**
 * Unified HUD Task 4/5 — bounded feature store.
 *
 * Every HUD feature (chat, quest, party, ...) publishes immutable,
 * revision-ordered snapshots through this store. Publishing is dirty-checked
 * on the semantic payload (revision excluded) so identical state cannot bump
 * the revision or notify subscribers. reset() returns the feature to its
 * unavailable shape when the owning world is torn down, so the Dock never
 * renders stale state.
 */

function snapshotKey(snapshot) {
  try {
    const { revision, ...rest } = snapshot;
    void revision;
    return JSON.stringify(rest);
  } catch {
    return '';
  }
}

/**
 * normalize(input, revision) must return a frozen snapshot for the feature,
 * mapping undefined/null input to the feature's unavailable shape.
 */
export function createHudFeatureStore(normalize) {
  if (typeof normalize !== 'function') {
    throw new TypeError('createHudFeatureStore requires a normalize(input, revision) function');
  }
  let revision = 0;
  let current = normalize(undefined, revision);
  let lastKey = snapshotKey(current);
  const subscribers = new Set();

  function snapshot() {
    return current;
  }

  function notify() {
    for (const listener of [...subscribers]) {
      try { listener(current); } catch {}
    }
  }

  function publish(input) {
    const next = normalize(input, revision + 1);
    const key = snapshotKey(next);
    if (key === lastKey) return current;
    revision += 1;
    lastKey = key;
    current = next;
    notify();
    return current;
  }

  function reset() {
    return publish(undefined);
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return null;
    subscribers.add(listener);
    try { listener(current); } catch {}
    return () => { subscribers.delete(listener); };
  }

  return Object.freeze({
    subscribe,
    snapshot,
    publish,
    reset,
    diagnostics: () => Object.freeze({
      revision,
      subscribers: subscribers.size,
      available: current?.available === true,
    }),
  });
}
