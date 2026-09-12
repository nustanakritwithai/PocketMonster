/** เชื่อม canonical bag ใน scene iframe กับ control-state provider ของ Pirate shell */
export function createPirateMonsterInventorySync({ bagProvider, controlProvider, isPirate = () => true } = {}) {
  if (!bagProvider || typeof bagProvider.subscribe !== 'function') {
    throw new TypeError('Pirate inventory sync requires the scene monster bag provider');
  }
  if (!controlProvider || typeof controlProvider.refresh !== 'function') {
    throw new TypeError('Pirate inventory sync requires the shell monster provider');
  }
  let disposed = false;
  let lastRevision = -1;
  let pending = null;
  let dirty = false;
  const refreshShell = () => {
    if (disposed) return;
    if (pending) { dirty = true; return; }
    dirty = false;
    pending = Promise.resolve(controlProvider.refresh({ afterPending: true }));
    const finish = () => { pending = null; if (dirty && !disposed && isPirate()) refreshShell(); };
    pending.then(finish, finish);
    return pending;
  };
  const onBagSnapshot = snapshot => {
    const revision = Number(snapshot?.revision);
    if (!isPirate() || snapshot?.available !== true || !Number.isSafeInteger(revision) || revision <= lastRevision) return;
    lastRevision = revision;
    void refreshShell();
  };
  const unsubscribe = bagProvider.subscribe(onBagSnapshot);
  return Object.freeze({
    dispose() {
      if (disposed) return;
      disposed = true;
      try { unsubscribe?.(); } catch {}
      pending = null;
    },
  });
}
