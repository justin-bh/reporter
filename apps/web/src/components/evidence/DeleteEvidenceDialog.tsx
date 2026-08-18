import { useEffect, useState } from 'react';
import { Button, Modal } from '@reporter/ui';

export type DeleteEvidenceMode = 'cascade' | 'orphan';

/**
 * Confirm deletion of a piece of evidence. When it has comments (linked
 * evidence) the operator chooses their fate: keep them as top-level evidence
 * (orphan) or delete them along with the parent (cascade).
 */
export function DeleteEvidenceDialog({
  open,
  onClose,
  commentCount,
  pending,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  commentCount: number;
  pending?: boolean;
  onConfirm: (mode: DeleteEvidenceMode) => void;
}) {
  const hasComments = commentCount > 0;
  const [mode, setMode] = useState<DeleteEvidenceMode>('orphan');

  // Default back to the non-destructive choice each time the dialog opens.
  useEffect(() => {
    if (open) setMode('orphan');
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Delete evidence"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={pending}
            onClick={() => onConfirm(hasComments ? mode : 'orphan')}
          >
            Delete
          </Button>
        </>
      }
    >
      {hasComments ? (
        <div className="flex flex-col gap-3 text-sm text-text">
          <p>
            This evidence has {commentCount} {commentCount === 1 ? 'comment' : 'comments'} (linked
            evidence). Choose what happens to {commentCount === 1 ? 'it' : 'them'} — this can’t be
            undone.
          </p>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="delete-evidence-mode"
              checked={mode === 'orphan'}
              onChange={() => setMode('orphan')}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Keep as top-level evidence</span>
              <span className="block text-muted">
                The comments stay in the engagement, no longer linked to this item.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="delete-evidence-mode"
              checked={mode === 'cascade'}
              onChange={() => setMode('cascade')}
              className="mt-1"
            />
            <span>
              <span className="font-medium text-danger">Delete the comments too</span>
              <span className="block text-muted">
                Permanently removes this evidence and all of its comments.
              </span>
            </span>
          </label>
        </div>
      ) : (
        <p className="text-sm text-text">Delete this evidence? This cannot be undone.</p>
      )}
    </Modal>
  );
}
