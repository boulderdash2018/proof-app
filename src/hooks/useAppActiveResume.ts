import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

/**
 * Detects when the app comes back to the foreground after spending more
 * than `minBackgroundMs` in background. Calls `onResumeAfterIdle` once per
 * resume event. Mount this once at the root of the app.
 *
 * Why a threshold: a brief blur (e.g. opening a share sheet, switching to
 * another app for 2 s) shouldn't trigger a refresh — it would feel jumpy.
 * We only fire when the user has actually been away long enough that the
 * data on screen is plausibly stale.
 */
export function useAppActiveResume(
  onResumeAfterIdle: () => void,
  minBackgroundMs = 60_000,
) {
  const wentBackgroundAt = useRef<number | null>(null);
  const cb = useRef(onResumeAfterIdle);
  cb.current = onResumeAfterIdle;

  useEffect(() => {
    const handler = (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        wentBackgroundAt.current = Date.now();
        return;
      }
      if (next === 'active') {
        const since = wentBackgroundAt.current;
        wentBackgroundAt.current = null;
        if (since && Date.now() - since > minBackgroundMs) {
          cb.current();
        }
      }
    };
    const sub = AppState.addEventListener('change', handler);
    return () => sub.remove();
  }, [minBackgroundMs]);
}
