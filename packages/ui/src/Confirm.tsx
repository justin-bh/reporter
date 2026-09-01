import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Modal } from './Modal.js';
import { Button } from './Button.js';

/** Which action the user chose. `alt` is the optional third button. */
export type ConfirmOutcome = 'confirm' | 'alt' | 'cancel';

export interface ConfirmOptions {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * Optional third action, rendered between Cancel and Confirm. Enables the
   * three-way "Save / Discard / Keep editing" prompt via `useConfirmChoice`.
   */
  altLabel?: string;
  /** Style the confirm button as destructive. */
  danger?: boolean;
  /** Style the alt button as destructive. */
  altDanger?: boolean;
}

type ConfirmChoiceFn = (options: ConfirmOptions) => Promise<ConfirmOutcome>;

const ConfirmContext = createContext<ConfirmChoiceFn | null>(null);

/**
 * Provides a themed, promise-based confirm dialog so destructive actions
 * confirm consistently across the app (no native window.confirm). Supports an
 * optional third action so callers can offer "Save / Discard / Keep editing".
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(v: ConfirmOutcome) => void>(null);

  const confirm = useCallback<ConfirmChoiceFn>((opts) => {
    setOptions(opts);
    return new Promise<ConfirmOutcome>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (value: ConfirmOutcome) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={options !== null}
        onClose={() => settle('cancel')}
        title={options?.title ?? 'Are you sure?'}
        footer={
          <>
            <Button variant="ghost" onClick={() => settle('cancel')}>
              {options?.cancelLabel ?? 'Cancel'}
            </Button>
            {options?.altLabel && (
              <Button
                variant={options.altDanger ? 'danger' : 'ghost'}
                onClick={() => settle('alt')}
              >
                {options.altLabel}
              </Button>
            )}
            <Button
              variant={options?.danger ? 'danger' : 'primary'}
              onClick={() => settle('confirm')}
            >
              {options?.confirmLabel ?? 'Confirm'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-text">{options?.message}</p>
      </Modal>
    </ConfirmContext.Provider>
  );
}

/**
 * Two-way confirm: resolves `true` only when the primary (confirm) action is
 * chosen. Cancel — and the optional alt action — resolve `false`.
 */
export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const choose = useConfirmChoice();
  return useCallback((options: ConfirmOptions) => choose(options).then((o) => o === 'confirm'), [
    choose,
  ]);
}

/**
 * Three-way confirm: resolves which of `confirm` / `alt` / `cancel` the user
 * chose. Use with `altLabel` to offer a third action (e.g. Save / Discard /
 * Keep editing).
 */
export function useConfirmChoice(): ConfirmChoiceFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirmChoice must be used within a <ConfirmProvider>');
  return ctx;
}
