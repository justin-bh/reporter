import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  Modal,
  Select,
  SeverityBadge,
  Spinner,
  Textarea,
  useConfirm,
  useToast,
} from '@reporter/ui';
import {
  EVIDENCE_TYPE_LABELS,
  SEVERITIES,
  SEVERITY_LABELS,
  type Evidence,
  type Severity,
} from '@reporter/shared';
import {
  useAttachEvidence,
  useDeleteFinding,
  useDetachEvidence,
  useFinding,
  useReorderEvidence,
  useTimeline,
  useUpdateFinding,
} from '../api/hooks.js';
import { CvssCalculator, type CvssResult } from '../components/findings/CvssCalculator.js';

export function FindingDetailPage() {
  const { slug = '', uuid = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: finding, isLoading } = useFinding(slug, uuid);
  const update = useUpdateFinding(slug, uuid);
  const del = useDeleteFinding(slug);
  const reorderEvidence = useReorderEvidence(slug, uuid);
  const [attaching, setAttaching] = useState(false);
  const [calc, setCalc] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: '',
    ticketLink: '',
    readyToReport: false,
    severity: '' as Severity | '',
    cvssVector: null as string | null,
    cvssScore: null as number | null,
  });

  // Seed the form once per finding, not on every cache change. Optimistic
  // evidence reorder/attach/detach replace the cached `finding` object; without
  // this guard the effect would re-run and silently discard unsaved edits.
  const seededUuid = useRef<string | null>(null);
  useEffect(() => {
    if (finding && seededUuid.current !== finding.uuid) {
      seededUuid.current = finding.uuid;
      setForm({
        title: finding.title,
        description: finding.description,
        category: finding.category ?? '',
        ticketLink: finding.ticketLink ?? '',
        readyToReport: finding.readyToReport,
        severity: finding.severity ?? '',
        cvssVector: finding.cvssVector,
        cvssScore: finding.cvssScore,
      });
    }
  }, [finding]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (isLoading) return <Spinner size={26} />;
  if (!finding) return <p className="text-danger">Finding not found.</p>;

  async function save() {
    try {
      const patch: Record<string, unknown> = {
        title: form.title,
        description: form.description,
        category: form.category || null,
        ticketLink: form.ticketLink || null,
        readyToReport: form.readyToReport,
      };
      if (form.cvssVector) {
        // A CVSS vector is set — the server derives score + severity from it.
        patch.cvssVector = form.cvssVector;
      } else {
        // No vector: record the manual severity (or clear it) and drop any vector.
        patch.severity = form.severity === '' ? null : form.severity;
        patch.cvssVector = null;
      }
      await update.mutateAsync(patch);
      toast.success('Finding updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  }

  // Picking a severity manually invalidates any stored CVSS vector.
  function pickSeverity(value: Severity | '') {
    setForm((prev) => ({ ...prev, severity: value, cvssVector: null, cvssScore: null }));
  }

  function applyCvss(result: CvssResult) {
    setForm((prev) => ({
      ...prev,
      severity: result.severity,
      cvssVector: result.vector,
      cvssScore: result.score,
    }));
    setCalc(false);
  }

  async function removeFinding() {
    if (!finding) return;
    const ok = await confirm({
      title: 'Delete finding',
      message: `Delete “${finding.title}”? Attached evidence is kept; this can’t be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await del.mutateAsync(finding.uuid);
      toast.success('Finding deleted');
      navigate(`/engagements/${slug}/findings`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  function onEvidenceDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id || !finding) return;
    const ids = finding.evidence.map((ev) => ev.uuid);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    reorderEvidence.mutate(arrayMove(ids, from, to));
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <Link to={`/engagements/${slug}/findings`} className="text-sm text-muted hover:text-text">
          ← Back to findings
        </Link>
        <Button variant="ghost" onClick={removeFinding} className="text-danger">
          Delete finding
        </Button>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="space-y-4 p-4">
          <Field label="Title" htmlFor="ft">
            <Input
              id="ft"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" htmlFor="fc">
              <Input
                id="fc"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </Field>
            <Field label="Ticket link" htmlFor="fl">
              <Input
                id="fl"
                value={form.ticketLink}
                onChange={(e) => setForm({ ...form, ticketLink: e.target.value })}
                placeholder="https://…"
              />
            </Field>
          </div>

          <Field label="Severity" htmlFor="fsev">
            <div className="flex items-center gap-2">
              <Select
                id="fsev"
                className="max-w-[10rem]"
                value={form.severity}
                onChange={(e) => pickSeverity(e.target.value as Severity | '')}
              >
                <option value="">Unrated</option>
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {SEVERITY_LABELS[s]}
                  </option>
                ))}
              </Select>
              <Button type="button" size="sm" variant="secondary" onClick={() => setCalc(true)}>
                CVSS calculator
              </Button>
              {form.cvssVector && (
                <SeverityBadge severity={form.severity || null} score={form.cvssScore} />
              )}
            </div>
          </Field>
          {form.cvssVector && (
            <p className="-mt-2 text-xs text-muted">
              <code>{form.cvssVector}</code>
            </p>
          )}

          <Field label="Description" htmlFor="fd">
            <Textarea
              id="fd"
              rows={6}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <div className="flex items-center justify-between">
            <Checkbox
              label="Ready to report"
              checked={form.readyToReport}
              onChange={(e) => setForm({ ...form, readyToReport: e.target.checked })}
            />
            <Button onClick={save} loading={update.isPending}>
              Save changes
            </Button>
          </div>
        </Card>

        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text">
              Evidence ({finding.evidence.length})
            </h3>
            <Button size="sm" variant="secondary" onClick={() => setAttaching(true)}>
              Attach
            </Button>
          </div>
          {finding.evidence.length === 0 ? (
            <p className="text-sm text-muted">No evidence attached yet.</p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              onDragEnd={onEvidenceDragEnd}
            >
              <SortableContext
                items={finding.evidence.map((e) => e.uuid)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="flex flex-col gap-2">
                  {finding.evidence.map((ev) => (
                    <SortableEvidenceItem key={ev.uuid} slug={slug} uuid={uuid} evidence={ev} />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </Card>
      </div>

      <CvssCalculator
        open={calc}
        onClose={() => setCalc(false)}
        initialVector={form.cvssVector}
        onApply={applyCvss}
      />
      <AttachEvidenceModal
        slug={slug}
        uuid={uuid}
        attachedUuids={finding.evidence.map((e) => e.uuid)}
        open={attaching}
        onClose={() => setAttaching(false)}
      />
    </div>
  );
}

function SortableEvidenceItem({
  slug,
  uuid,
  evidence: ev,
}: {
  slug: string;
  uuid: string;
  evidence: Evidence;
}) {
  const detach = useDetachEvidence(slug, uuid);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ev.uuid,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-2 text-sm">
      <button
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="cursor-grab touch-none text-muted hover:text-text active:cursor-grabbing"
      >
        ⠿
      </button>
      <Link
        to={`/engagements/${slug}/evidence/${ev.uuid}`}
        className="min-w-0 flex-1 truncate text-text hover:text-accent"
      >
        {ev.description || EVIDENCE_TYPE_LABELS[ev.contentType]}
      </Link>
      <button
        onClick={() => detach.mutate(ev.uuid)}
        className="text-muted hover:text-danger"
        aria-label="Detach"
      >
        ✕
      </button>
    </li>
  );
}

function AttachEvidenceModal({
  slug,
  uuid,
  attachedUuids,
  open,
  onClose,
}: {
  slug: string;
  uuid: string;
  attachedUuids: string[];
  open: boolean;
  onClose: () => void;
}) {
  const { data } = useTimeline(slug, '', 1);
  const attach = useAttachEvidence(slug, uuid);
  const toast = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const attachedSet = new Set(attachedUuids);

  async function submit() {
    if (selected.length === 0) return onClose();
    try {
      await attach.mutateAsync(selected);
      toast.success(`Attached ${selected.length} evidence`);
      setSelected([]);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Attach failed');
    }
  }

  const candidates = (data?.items ?? []).filter((e) => !attachedSet.has(e.uuid));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Attach evidence"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={attach.isPending} disabled={selected.length === 0}>
            Attach {selected.length || ''}
          </Button>
        </>
      }
    >
      {candidates.length === 0 ? (
        <p className="text-sm text-muted">No more evidence to attach.</p>
      ) : (
        <ul className="flex max-h-80 flex-col gap-1 overflow-auto">
          {candidates.map((e) => (
            <li key={e.uuid}>
              <Checkbox
                label={`${e.description || EVIDENCE_TYPE_LABELS[e.contentType]}`}
                checked={selected.includes(e.uuid)}
                onChange={(ev) =>
                  setSelected((s) =>
                    ev.target.checked ? [...s, e.uuid] : s.filter((x) => x !== e.uuid),
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
