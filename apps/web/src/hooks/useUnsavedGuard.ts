import { useCallback, useEffect, useRef } from 'react';
import { useConfirm, useConfirmChoice } from '@reporter/ui';

export interface UseUnsavedGuardOptions {
  /** Whether the form currently has unsaved edits. */
  isDirty: boolean;
  /** Whether the guard is active (e.g. the modal is open). */
  enabled?: boolean;
  /** The real close/cancel handler to run once it's safe to discard. */
  onClose: () => void;
  /**
   * Optional submit handler. When provided (and `canSave` is true) the discard
   * prompt gains a third "Save" action, so an operator who closed the form by
   * accident — including a click outside a scrolled-away modal — can still save.
   * It should close the form itself on success and keep it open on failure.
   */
  onSave?: () => void | Promise<void>;
  /** Whether the form is currently in a submittable state (gates the Save action). */
  canSave?: boolean;
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
  onSave,
  canSave = false,
}: UseUnsavedGuardOptions): UseUnsavedGuardResult {
  const confirm = useConfirm();
  const confirmChoice = useConfirmChoice();
  const dirtyRef = useRef(isDirty);
  const enabledRef = useRef(enabled);
  const onCloseRef = useRef(onClose);
  const onSaveRef = useRef(onSave);
  const canSaveRef = useRef(canSave);
  dirtyRef.current = isDirty;
  enabledRef.current = enabled;
  onCloseRef.current = onClose;
  onSaveRef.current = onSave;
  canSaveRef.current = canSave;

  const requestClose = useCallback(async () => {
    if (enabledRef.current && dirtyRef.current) {
      const save = onSaveRef.current;
      // When the form can actually be saved, offer Save alongside Discard so the
      // operator never has to abandon work just to get out of a mis-clicked close.
      if (save && canSaveRef.current) {
        const outcome = await confirmChoice({
          title: 'Save your changes?',
          message: 'You have unsaved changes. Save them, discard them, or keep editing?',
          confirmLabel: 'Save',
          altLabel: 'Discard',
          altDanger: true,
          cancelLabel: 'Keep editing',
        });
        if (outcome === 'cancel') return;
        if (outcome === 'alt') {
          onCloseRef.current();
          return;
        }
        // 'confirm' → Save. onSave owns closing on success and staying open on error.
        await save();
        return;
      }
      // No submittable form to save — fall back to the plain discard confirm.
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
  }, [confirm, confirmChoice]);

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
