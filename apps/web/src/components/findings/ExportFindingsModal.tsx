import { useState } from 'react';
import { Button, Checkbox, Field, Modal, Select, useToast } from '@reporter/ui';
import {
  EVIDENCE_GROUPINGS,
  EVIDENCE_GROUPING_LABELS,
  type EvidenceGrouping,
} from '@reporter/shared';
import { downloadFile } from '../../lib/download.js';

export function ExportFindingsModal({
  slug,
  open,
  onClose,
}: {
  slug: string;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [includeAll, setIncludeAll] = useState(false);
  const [includeContent, setIncludeContent] = useState(false);
  const [includeTimeline, setIncludeTimeline] = useState(true);
  const [group, setGroup] = useState<EvidenceGrouping>('chronological');
  const [busy, setBusy] = useState<'pdf' | 'json' | null>(null);

  async function run(kind: 'pdf' | 'json') {
    setBusy(kind);
    try {
      const base = `/web/engagements/${slug}/findings`;
      if (kind === 'pdf') {
        await downloadFile(
          `${base}/report.pdf?includeAll=${includeAll}&includeTimeline=${includeTimeline}&evidenceGroup=${group}`,
          `${slug}-findings.pdf`,
        );
      } else {
        await downloadFile(
          `${base}/export.json?includeAll=${includeAll}&includeEvidenceContent=${includeContent}`,
          `${slug}-findings.json`,
        );
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Export findings"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy !== null}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={() => run('json')}
            loading={busy === 'json'}
            disabled={busy !== null}
          >
            Export JSON
          </Button>
          <Button onClick={() => run('pdf')} loading={busy === 'pdf'} disabled={busy !== null}>
            Export PDF
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          The PDF is a full, branded report — cover page, executive summary, findings, and (when
          enabled) the Assessment Execution timeline. JSON exports the report-ready findings and can
          be re-imported later.
        </p>
        <Checkbox
          label="Include all findings (not only “Ready to report”)"
          checked={includeAll}
          onChange={(e) => setIncludeAll(e.target.checked)}
        />
        <div className="border-t border-border pt-4">
          <p className="mb-3 text-sm font-medium text-text">PDF report</p>
          <div className="flex flex-col gap-4">
            <Checkbox
              label="Include full evidence timeline (Assessment Execution)"
              checked={includeTimeline}
              onChange={(e) => setIncludeTimeline(e.target.checked)}
            />
            <Field
              label="Assessment Execution grouping"
              htmlFor="ex-group"
              hint="How the evidence timeline is organized in the report."
            >
              <Select
                id="ex-group"
                value={group}
                onChange={(e) => setGroup(e.target.value as EvidenceGrouping)}
                disabled={!includeTimeline}
                className="max-w-[16rem]"
              >
                {EVIDENCE_GROUPINGS.map((g) => (
                  <option key={g} value={g}>
                    {EVIDENCE_GROUPING_LABELS[g]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
        <div className="border-t border-border pt-4">
          <p className="mb-3 text-sm font-medium text-text">JSON export</p>
          <Checkbox
            label="Embed evidence content in JSON (portable across servers, larger file)"
            checked={includeContent}
            onChange={(e) => setIncludeContent(e.target.checked)}
          />
        </div>
      </div>
    </Modal>
  );
}
