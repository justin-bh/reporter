import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  Modal,
  Spinner,
  Textarea,
  useToast,
} from '@reporter/ui';
import { EVIDENCE_TYPE_LABELS } from '@reporter/shared';
import {
  useAttachEvidence,
  useDetachEvidence,
  useFinding,
  useTimeline,
  useUpdateFinding,
} from '../api/hooks.js';

export function FindingDetailPage() {
  const { slug = '', uuid = '' } = useParams();
  const toast = useToast();
  const { data: finding, isLoading } = useFinding(slug, uuid);
  const update = useUpdateFinding(slug, uuid);
  const detach = useDetachEvidence(slug, uuid);
  const [attaching, setAttaching] = useState(false);

  const [form, setForm] = useState({ title: '', description: '', category: '', ticketLink: '', readyToReport: false });

  useEffect(() => {
    if (finding) {
      setForm({
        title: finding.title,
        description: finding.description,
        category: finding.category ?? '',
        ticketLink: finding.ticketLink ?? '',
        readyToReport: finding.readyToReport,
      });
    }
  }, [finding]);

  if (isLoading) return <Spinner size={26} />;
  if (!finding) return <p className="text-danger">Finding not found.</p>;

  async function save() {
    try {
      await update.mutateAsync({
        title: form.title,
        description: form.description,
        category: form.category || null,
        ticketLink: form.ticketLink || null,
        readyToReport: form.readyToReport,
      });
      toast.success('Finding updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  }

  return (
    <div>
      <Link to={`/operations/${slug}/findings`} className="text-sm text-muted hover:text-text">
        ← Back to findings
      </Link>

      <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="space-y-4 p-4">
          <Field label="Title" htmlFor="ft">
            <Input id="ft" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" htmlFor="fc">
              <Input id="fc" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </Field>
            <Field label="Ticket link" htmlFor="fl">
              <Input id="fl" value={form.ticketLink} onChange={(e) => setForm({ ...form, ticketLink: e.target.value })} placeholder="https://…" />
            </Field>
          </div>
          <Field label="Description" htmlFor="fd">
            <Textarea id="fd" rows={6} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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
            <h3 className="text-sm font-semibold text-text">Evidence ({finding.evidence.length})</h3>
            <Button size="sm" variant="secondary" onClick={() => setAttaching(true)}>
              Attach
            </Button>
          </div>
          {finding.evidence.length === 0 ? (
            <p className="text-sm text-muted">No evidence attached yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {finding.evidence.map((ev) => (
                <li key={ev.uuid} className="flex items-center justify-between gap-2 text-sm">
                  <Link
                    to={`/operations/${slug}/evidence/${ev.uuid}`}
                    className="truncate text-text hover:text-accent"
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
              ))}
            </ul>
          )}
        </Card>
      </div>

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
                  setSelected((s) => (ev.target.checked ? [...s, e.uuid] : s.filter((x) => x !== e.uuid)))
                }
              />
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
