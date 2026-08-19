import { useCallback, useEffect, useRef } from 'react';
import { useConfirm } from '@reporter/ui';

export interface UseUnsavedGuardOptions {
  /** Whether the form currently has unsaved edits. */
  isDirty: boolean;
  /** Whether the guard is active (e.g. the modal is open). */
  enabled?: boolean;
  /** The real close/cancel handler to run once it's safe to discard. */
  onClose: () => void;
}

export interface UseUnsavedGuardResult {
  /**
   * Wrapped close handler. When the form is dirty it asks the user to confirm
   * discarding first and only closes if they accept; otherwise it closes right away.
   */
  requestClose: () => Promise<void>;
}

/**
 * Discard-confirm guard for create modals (records that don't exist yet). Wraps
 * the close handler so a dirty form prompts "Discard changes?" before closing,
 * and installs a `beforeunload` net while the modal is open and dirty so a
 * tab-close / reload warns too.
 */
export function useUnsavedGuard({
  isDirty,
  enabled = true,
  onClose,
}: UseUnsavedGuardOptions): UseUnsavedGuardResult {
  const confirm = useConfirm();
  const dirtyRef = useRef(isDirty);
  const enabledRef = useRef(enabled);
  const onCloseRef = useRef(onClose);
  dirtyRef.current = isDirty;
  enabledRef.current = enabled;
  onCloseRef.current = onClose;

  const requestClose = useCallback(async () => {
    if (enabledRef.current && dirtyRef.current) {
      const ok = await confirm({
        title: 'Discard changes?',
        message: 'You have unsaved changes. Close this form and discard them?',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        danger: true,
      });
      if (!ok) return;
    }
    onCloseRef.current();
  }, [confirm]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (enabledRef.current && dirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  return { requestClose };
}
