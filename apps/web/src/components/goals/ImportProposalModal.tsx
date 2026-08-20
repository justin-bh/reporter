import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Badge, Button, Checkbox, EmptyState, Field, Input, Modal, Select, useToast } from '@reporter/ui';
import {
  isRetestTitle,
  proposalToImportDraft,
  type ImportDraft,
  type ImportTarget,
} from '@reporter/shared';
import { useImportProposal } from '../../api/hooks.js';

type Mode = 'merge' | 'replace';

/**
 * Import a proposal JSON into the engagement's goals tree. The file is parsed and
 * mapped to an editable draft (targets/activities/goals) which the user can trim
 * (remove targets/activities/goals, add goals) before confirming. Toggles control
 * whether metadata is applied and whether existing targets are merged or replaced.
 */
export function ImportProposalModal({
  slug,
  open,
  onClose,
}: {
  slug: string;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const importProposal = useImportProposal(slug);
  const fileInput = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [raw, setRaw] = useState<unknown>(undefined);
  const [fileName, setFileName] = useState('');
  const [mode, setMode] = useState<Mode>('merge');
  const [applyMetadata, setApplyMetadata] = useState(true);

  useEffect(() => {
    if (!open) {
      setDraft(null);
      setRaw(undefined);
      setFileName('');
      setMode('merge');
      setApplyMetadata(true);
    }
  }, [open]);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      toast.error('That file is not valid JSON');
      return;
    }
    try {
      const mapped = proposalToImportDraft(parsed);
      setDraft(mapped);
      setRaw(parsed);
      setFileName(file.name);
    } catch {
      toast.error('Couldn’t read that proposal file');
    }
  }

  const targetCount = draft?.targets.length ?? 0;
  const activityCount =
    draft?.targets.reduce((sum, t) => sum + t.activities.length, 0) ?? 0;
  const goalCount =
    draft?.targets.reduce(
      (sum, t) => sum + t.activities.reduce((s, a) => s + a.goals.length, 0),
      0,
    ) ?? 0;

  function updateTargets(next: ImportTarget[]) {
    if (draft) setDraft({ ...draft, targets: next });
  }

  function removeTarget(ti: number) {
    if (!draft) return;
    updateTargets(draft.targets.filter((_, i) => i !== ti));
  }

  function removeActivity(ti: number, ai: number) {
    if (!draft) return;
    const targets = draft.targets.map((t, i) =>
      i === ti ? { ...t, activities: t.activities.filter((_, j) => j !== ai) } : t,
    );
    updateTargets(targets);
  }

  function removeGoal(ti: number, ai: number, gi: number) {
    if (!draft) return;
    const targets = draft.targets.map((t, i) =>
      i === ti
        ? {
            ...t,
            activities: t.activities.map((a, j) =>
              j === ai ? { ...a, goals: a.goals.filter((_, k) => k !== gi) } : a,
            ),
          }
        : t,
    );
    updateTargets(targets);
  }

  function addGoal(ti: number, ai: number, title: string) {
    if (!draft) return;
    const trimmed = title.trim();
    if (!trimmed) return;
    const targets = draft.targets.map((t, i) =>
      i === ti
        ? {
            ...t,
            activities: t.activities.map((a, j) =>
              j === ai
                ? { ...a, goals: [...a.goals, { title: trimmed, isRetest: isRetestTitle(trimmed) }] }
                : a,
            ),
          }
        : t,
    );
    updateTargets(targets);
  }

  async function confirm() {
    if (!draft) return;
    try {
      const r = await importProposal.mutateAsync({
        draft,
        mode,
        applyMetadata,
        rawProposal: raw,
      });
      toast.success(
        `Imported ${r.targetsCreated} target${r.targetsCreated === 1 ? '' : 's'}, ` +
          `${r.activitiesCreated} activit${r.activitiesCreated === 1 ? 'y' : 'ies'}, ` +
          `${r.goalsCreated} goal${r.goalsCreated === 1 ? '' : 's'}` +
          (r.metadataApplied ? ' · metadata applied' : ''),
      );
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import proposal"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={importProposal.isPending}>
            Cancel
          </Button>
          <Button
            onClick={confirm}
            loading={importProposal.isPending}
            disabled={!draft || targetCount === 0}
          >
            Import {targetCount > 0 ? `${targetCount} target${targetCount === 1 ? '' : 's'}` : ''}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={onFile}
        />

        {!draft ? (
          <EmptyState
            title="Choose a proposal file"
            description="Select a proposal JSON export. Its devices, interfaces, and sub-items become Targets, Activities, and Goals you can trim before importing."
            action={<Button onClick={() => fileInput.current?.click()}>Choose file…</Button>}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-text">{fileName}</span>
              <Badge tone="neutral">{targetCount} targets</Badge>
              <Badge tone="neutral">{activityCount} activities</Badge>
              <Badge tone="neutral">{goalCount} goals</Badge>
              <Button size="sm" variant="ghost" onClick={() => fileInput.current?.click()}>
                Choose a different file
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Existing goals"
                htmlFor="imp-mode"
                hint="Merge appends to the current tree; Replace clears it first."
              >
                <Select
                  id="imp-mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as Mode)}
                >
                  <option value="merge">Merge (append)</option>
                  <option value="replace">Replace (clear existing first)</option>
                </Select>
              </Field>
              <div className="flex items-end pb-2">
                <Checkbox
                  label="Apply engagement metadata (client, scope, contacts, dates)"
                  checked={applyMetadata}
                  onChange={(e) => setApplyMetadata(e.target.checked)}
                />
              </div>
            </div>

            <div className="max-h-[24rem] space-y-3 overflow-auto rounded-card border border-border p-3">
              {targetCount === 0 ? (
                <EmptyState
                  title="Nothing left to import"
                  description="You removed every target. Choose another file or keep at least one target."
                />
              ) : (
                draft.targets.map((t, ti) => (
                  <TargetPreview
                    key={ti}
                    target={t}
                    onRemove={() => removeTarget(ti)}
                    onRemoveActivity={(ai) => removeActivity(ti, ai)}
                    onRemoveGoal={(ai, gi) => removeGoal(ti, ai, gi)}
                    onAddGoal={(ai, title) => addGoal(ti, ai, title)}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function TargetPreview({
  target,
  onRemove,
  onRemoveActivity,
  onRemoveGoal,
  onAddGoal,
}: {
  target: ImportTarget;
  onRemove: () => void;
  onRemoveActivity: (ai: number) => void;
  onRemoveGoal: (ai: number, gi: number) => void;
  onAddGoal: (ai: number, title: string) => void;
}) {
  return (
    <div className="rounded-card border border-border bg-surface-2 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text">{target.name}</p>
          {target.description && (
            <p className="truncate text-xs text-muted">{target.description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove target ${target.name}`}
          title="Remove target"
          className="px-1 text-muted hover:text-danger"
        >
          ✕
        </button>
      </div>
      <div className="mt-2 space-y-2 pl-2">
        {target.activities.map((a, ai) => (
          <div key={ai} className="rounded-input border border-border bg-surface p-2">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm text-text">
                {a.name}
                {a.category && <span className="ml-1.5 text-xs text-muted">· {a.category}</span>}
              </p>
              <button
                type="button"
                onClick={() => onRemoveActivity(ai)}
                aria-label={`Remove activity ${a.name}`}
                title="Remove activity"
                className="px-1 text-muted hover:text-danger"
              >
                ✕
              </button>
            </div>
            <ul className="mt-1.5 flex flex-col gap-1 pl-2">
              {a.goals.map((g, gi) => (
                <li key={gi} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-text">{g.title}</span>
                  {g.isRetest && <Badge tone="warning">Retest</Badge>}
                  <button
                    type="button"
                    onClick={() => onRemoveGoal(ai, gi)}
                    aria-label={`Remove goal ${g.title}`}
                    title="Remove goal"
                    className="px-1 text-muted hover:text-danger"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <AddGoalInline onAdd={(title) => onAddGoal(ai, title)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function AddGoalInline({ onAdd }: { onAdd: (title: string) => void }) {
  const [value, setValue] = useState('');
  function submit() {
    if (value.trim()) {
      onAdd(value);
      setValue('');
    }
  }
  return (
    <div className="mt-1.5 flex items-center gap-2 pl-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Add a goal…"
        aria-label="Add a goal"
        className="h-8 text-sm"
      />
      <Button size="sm" variant="secondary" onClick={submit} disabled={!value.trim()}>
        Add
      </Button>
    </div>
  );
}
