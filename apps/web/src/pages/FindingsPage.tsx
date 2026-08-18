import { useRef, useState, type ChangeEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  SeverityBadge,
  Spinner,
  Textarea,
  useConfirm,
  useToast,
} from '@reporter/ui';
import type { Finding } from '@reporter/shared';
import {
  useCreateFinding,
  useDeleteFinding,
  useFindings,
  useImportFindings,
  useReorderFindings,
} from '../api/hooks.js';
import { READ_ONLY_TITLE, useEngagementPermissions } from '../lib/permissions.js';
import { ExportFindingsModal } from '../components/findings/ExportFindingsModal.js';

export function FindingsPage() {
  const { slug = '' } = useParams();
  const toast = useToast();
  const { canWrite } = useEngagementPermissions(slug);
  const { data: findings, isLoading, isError, refetch } = useFindings(slug);
  const reorder = useReorderFindings(slug);
  const importFindings = useImportFindings(slug);
  const fileInput = useRef<HTMLInputElement>(null);
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Export is available whenever findings exist — the modal's "include all"
  // toggle covers the case where none are marked ready yet.
  const hasFindings = (findings?.length ?? 0) > 0;

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id || !findings) return;
    const ids = findings.map((f) => f.uuid);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    reorder.mutate(arrayMove(ids, from, to));
  }

  async function onImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      toast.error('That file is not valid JSON');
      return;
    }
    try {
      const r = await importFindings.mutateAsync(data);
      const findingsMsg = [`${r.findingsCreated} created`, `${r.findingsUpdated} updated`]
        .concat(r.findingsSkipped ? [`${r.findingsSkipped} skipped`] : [])
        .join(', ');
      const evidence = r.evidenceCreated + r.evidenceLinked;
      const evidenceMsg =
        evidence || r.evidenceSkipped
          ? ` · ${evidence} evidence${r.evidenceSkipped ? `, ${r.evidenceSkipped} skipped` : ''}`
          : '';
      toast.success(`Imported ${findingsMsg}${evidenceMsg}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text">Findings</h2>
        <div className="flex items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={onImportFile}
          />
          <Button
            variant="ghost"
            onClick={() => fileInput.current?.click()}
            loading={importFindings.isPending}
            disabled={!canWrite}
            title={canWrite ? undefined : READ_ONLY_TITLE}
          >
            Import
          </Button>
          {hasFindings && (
            <Button variant="secondary" onClick={() => setExporting(true)}>
              Export
            </Button>
          )}
          <Button
            onClick={() => setCreating(true)}
            disabled={!canWrite}
            title={canWrite ? undefined : READ_ONLY_TITLE}
          >
            New finding
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <ErrorState description="Couldn’t load findings." onRetry={() => refetch()} />
      ) : !findings || findings.length === 0 ? (
        <EmptyState
          title="No findings yet"
          description="Group related evidence into a finding to build your report."
          action={
            <Button
              onClick={() => setCreating(true)}
              disabled={!canWrite}
              title={canWrite ? undefined : READ_ONLY_TITLE}
            >
              New finding
            </Button>
          }
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={findings.map((f) => f.uuid)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-2">
              {findings.map((f) => (
                <SortableFindingRow key={f.uuid} slug={slug} finding={f} canWrite={canWrite} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <CreateFindingModal slug={slug} open={creating} onClose={() => setCreating(false)} />
      <ExportFindingsModal slug={slug} open={exporting} onClose={() => setExporting(false)} />
    </div>
  );
}

function SortableFindingRow({
  slug,
  finding: f,
  canWrite,
}: {
  slug: string;
  finding: Finding;
  canWrite: boolean;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const del = useDeleteFinding(slug);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: f.uuid,
    disabled: !canWrite,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  async function remove() {
    const ok = await confirm({
      title: 'Delete finding',
      message: `Delete “${f.title}”? Attached evidence is kept; this can’t be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await del.mutateAsync(f.uuid);
      toast.success('Finding deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-card border border-border bg-surface p-3 hover:border-accent/50"
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        disabled={!canWrite}
        title={canWrite ? undefined : READ_ONLY_TITLE}
        aria-label="Drag to reorder"
        className="cursor-grab touch-none px-1 text-muted hover:text-text active:cursor-grabbing disabled:opacity-50"
      >
        ⠿
      </button>
      <Link
        to={`/engagements/${slug}/findings/${f.uuid}`}
        className="flex min-w-0 flex-1 items-center justify-between gap-3"
      >
        <div className="min-w-0">
          <p className="truncate font-medium text-text">{f.title}</p>
          <p className="text-xs text-muted">
            {f.category ?? 'Uncategorized'} · {f.numEvidence} evidence
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <SeverityBadge severity={f.severity} score={f.cvssScore} />
          {f.readyToReport && <Badge tone="success">Ready to report</Badge>}
        </div>
      </Link>
      <button
        type="button"
        onClick={remove}
        disabled={!canWrite}
        title={canWrite ? undefined : READ_ONLY_TITLE}
        aria-label="Delete finding"
        className="px-1 text-muted hover:text-danger disabled:opacity-50"
      >
        ✕
      </button>
    </li>
  );
}

function CreateFindingModal({
  slug,
  open,
  onClose,
}: {
  slug: string;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const create = useCreateFinding(slug);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');

  async function submit() {
    try {
      await create.mutateAsync({ title, description, category: category || null });
      toast.success('Finding created');
      setTitle('');
      setDescription('');
      setCategory('');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create finding');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New finding"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending} disabled={!title}>
            Create
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Title" htmlFor="f-title">
          <Input id="f-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label="Category" htmlFor="f-cat" hint="Optional">
          <Input
            id="f-cat"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Vulnerability"
          />
        </Field>
        <Field label="Description" htmlFor="f-desc">
          <Textarea
            id="f-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
          />
        </Field>
      </div>
    </Modal>
  );
}
