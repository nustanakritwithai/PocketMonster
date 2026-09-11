const INSTALL_MARK = Symbol.for('pocketmonster.release-bound-scene-src.v1');

function releaseToken(value) {
  const token = String(value || '').trim();
  return token && token.length <= 160 ? token : null;
}

export function installReleaseBoundSceneFrames({
  release,
  windowLike = globalThis.window,
} = {}) {
  const token = releaseToken(release);
  const IFrame = windowLike?.HTMLIFrameElement;
  const prototype = IFrame?.prototype;
  if (!token || !prototype) return false;
  if (prototype[INSTALL_MARK] === token) return true;

  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'src');
  if (!descriptor?.get || !descriptor?.set || descriptor.configurable !== true) return false;

  Object.defineProperty(prototype, 'src', {
    ...descriptor,
    get() {
      return descriptor.get.call(this);
    },
    set(value) {
      let next = value;
      try {
        const url = new URL(String(value), windowLike.location?.href);
        if (url.pathname.endsWith('/scene-v900.html')) {
          url.searchParams.set('release', token);
          next = url.href;
        }
      } catch {}
      return descriptor.set.call(this, next);
    },
  });
  Object.defineProperty(prototype, INSTALL_MARK, {
    configurable: true,
    value: token,
  });
  return true;
}
