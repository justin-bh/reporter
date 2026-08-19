import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@reporter/ui';

/**
 * Lifecycle of an autosaving form:
 *  - `idle`    — clean; matches the last-saved server value.
 *  - `unsaved` — dirty (edited, or invalid so it can't save yet); a save is
 *                either scheduled behind the debounce or blocked by validation.
 *  - `saving`  — a save request is in flight.
 *  - `saved`   — the last save succeeded and nothing has changed since.
 *  - `error`   — the last save failed; the edit is kept so the user can retry.
 */
export type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';

export interface UseAutosaveOptions<T> {
  /** Current form state. */
  value: T;
  /** Last-saved server value; `undefined` until the record has loaded. */
  baseline: T | undefined;
  /** Gate: when it returns false the form is dirty but never saves. */
  isValid: (v: T) => boolean;
  /** Performs the persist (wrap the existing TanStack mutation). */
  save: (v: T) => Promise<void>;
  /** Debounce before an autosave fires, in ms. */
  delay?: number;
}

export interface UseAutosaveResult {
  status: SaveStatus;
  /** Cancel the pending debounce and save immediately (blur / unmount). */
  flush: () => Promise<void>;
}

/** JSON deep-equality — sufficient for the plain form-state objects we store. */
function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Debounced autosave for edit-in-place detail forms. Compares `value` against the
 * last-saved `baseline`; when they differ and `isValid(value)` passes it schedules
 * a `save` after `delay`. An invalid dirty form parks at `unsaved` and never saves,
 * leaving the page to surface the inline validation error. A `beforeunload` net
 * warns while a save is pending or in flight, and any pending save is flushed on
 * unmount so an in-progress edit survives navigation.
 */
export function useAutosave<T>({
  value,
  baseline,
  isValid,
  save,
  delay = 800,
}: UseAutosaveOptions<T>): UseAutosaveResult {
  const toast = useToast();
  const [status, setStatus] = useState<SaveStatus>('idle');

  // Refs so the debounce timer and unmount flush always see the latest inputs
  // without re-arming effects on every keystroke.
  const valueRef = useRef(value);
  const baselineRef = useRef(baseline);
  const isValidRef = useRef(isValid);
  const saveRef = useRef(save);
  const statusRef = useRef(status);
  const delayRef = useRef(delay);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards a save so two overlapping requests (e.g. debounce + blur flush) don't race.
  const inFlight = useRef(false);
  // Stable indirection so `schedule` and `runSave` can reference each other
  // without a circular useCallback dependency or a stale closure.
  const runSaveRef = useRef<() => Promise<void>>(async () => {});
  const scheduleRef = useRef<() => void>(() => {});

  valueRef.current = value;
  baselineRef.current = baseline;
  isValidRef.current = isValid;
  saveRef.current = save;
  statusRef.current = status;
  delayRef.current = delay;

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const schedule = useCallback(() => {
    clearTimer();
    timer.current = setTimeout(() => {
      void runSaveRef.current();
    }, delayRef.current);
  }, [clearTimer]);
  scheduleRef.current = schedule;

  const runSave = useCallback(async () => {
    clearTimer();
    if (inFlight.current) return;
    const next = valueRef.current;
    // Nothing to do if we're already clean or the value is invalid.
    if (deepEqual(next, baselineRef.current) || !isValidRef.current(next)) return;
    inFlight.current = true;
    setStatus('saving');
    try {
      await saveRef.current(next);
      inFlight.current = false;
      // If the user edited again while the request was in flight the value is now
      // dirty against what we just saved — stay `unsaved` and reschedule instead of
      // flashing a misleading `saved`. Otherwise settle to `saved` + breadcrumb.
      if (!deepEqual(valueRef.current, next)) {
        setStatus('unsaved');
        scheduleRef.current();
      } else {
        setStatus('saved');
        toast.success('Saved');
      }
    } catch (err) {
      inFlight.current = false;
      setStatus('error');
      toast.error(err instanceof Error ? err.message : 'Could not save');
    }
  }, [clearTimer, toast]);
  runSaveRef.current = runSave;

  const flush = useCallback(async () => {
    clearTimer();
    await runSaveRef.current();
  }, [clearTimer]);

  // React to value/baseline changes: decide whether to schedule a save. Only
  // value/baseline are real deps — the validator, timer helper, and scheduler are
  // read through refs so an inline `isValid` prop doesn't re-arm the debounce on
  // every render (which would keep pushing the save out and never fire it).
  useEffect(() => {
    if (baseline === undefined) return; // record not loaded yet
    if (inFlight.current) return; // a save is running; it will reconcile on completion
    if (deepEqual(value, baseline)) {
      // Clean again. Preserve a freshly-shown `saved` breadcrumb; otherwise idle.
      clearTimer();
      setStatus((s) => (s === 'saved' ? 'saved' : 'idle'));
      return;
    }
    // Dirty. Invalid → park at `unsaved`, no save. Valid → schedule the debounce.
    setStatus('unsaved');
    if (isValidRef.current(value)) scheduleRef.current();
    else clearTimer();
  }, [value, baseline, clearTimer]);

  // Warn on tab-close / reload while there are unsaved or in-flight changes.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (statusRef.current === 'unsaved' || statusRef.current === 'saving') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Flush any pending save on unmount so navigating away doesn't drop an edit.
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        void runSaveRef.current();
      }
    };
  }, []);

  return { status, flush };
}
