import { useEffect, useState } from 'react';

// Keeps the screen on while cooking. The browser drops the lock whenever the
// tab is hidden, so it's asked for again when the tab comes back.
export type WakeState = 'on' | 'off' | 'unsupported';

export function useWakeLock(enabled: boolean): WakeState {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const [state, setState] = useState<WakeState>(supported ? 'off' : 'unsupported');

  useEffect(() => {
    if (!supported || !enabled) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void lock.release();
          return;
        }
        setState('on');
        lock.addEventListener('release', () => !cancelled && setState('off'));
      } catch {
        setState('off'); // e.g. battery saver
      }
    };
    const onVisible = () => document.visibilityState === 'visible' && void request();

    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, [supported, enabled]);

  return state;
}
