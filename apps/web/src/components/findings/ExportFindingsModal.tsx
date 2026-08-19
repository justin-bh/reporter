import { useState } from 'react';
import { Button, Checkbox, Field, Modal, Select, useToast } from '@reporter/ui';
import {
  EVIDENCE_GROUPINGS,
  EVIDENCE_GROUPING_LABELS,
  type EvidenceGrouping,
} from '@reporter/shared';
import { downloadFile } from '../../lib/download.js';

type ReportFormat = 'pdf' | 'zip';

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
  const [format, setFormat] = useState<ReportFormat>('pdf');
  const [includeAll, setIncludeAll] = useState(false);
  const [includeContent, setIncludeContent] = useState(false);
  // Narrative (executive summary, scope, threat model, execution, findings) is
  // always in the report. The timeline is an optional, off-by-default extra.
  const [includeTimeline, setIncludeTimeline] = useState(false);
  const [includeAppendix, setIncludeAppendix] = useState(true);
  const [group, setGroup] = useState<EvidenceGrouping>('chronological');
  const [busy, setBusy] = useState<'report' | 'json' | null>(null);

  async function runReport() {
    setBusy('report');
    try {
      const base = `/web/engagements/${slug}/findings`;
      const params = new URLSearchParams({
        includeAll: String(includeAll),
        includeNarrative: 'true',
        includeTimeline: String(includeTimeline),
        includeAppendix: String(includeAppendix),
        evidenceGroup: group,
      });
      if (format === 'zip') {
        await downloadFile(`${base}/report.zip?${params}`, `${slug}-report.zip`);
      } else {
        await downloadFile(`${base}/report.pdf?${params}`, `${slug}-report.pdf`);
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(null);
    }
  }

  async function runJson() {
    setBusy('json');
    try {
      const base = `/web/engagements/${slug}/findings`;
      await downloadFile(
        `${base}/export.json?includeAll=${includeAll}&includeEvidenceContent=${includeContent}`,
        `${slug}-findings.json`,
      );
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
      title="Export report"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy !== null}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={runJson}
            loading={busy === 'json'}
            disabled={busy !== null}
          >
            Export JSON
          </Button>
          <Button onClick={runReport} loading={busy === 'report'} disabled={busy !== null}>
            {format === 'zip' ? 'Export bundle' : 'Export PDF'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          The report is a full, branded PDF: cover page, executive summary, service scope, threat
          model, strengths and weaknesses (with severity and standards mapping), and remediation. A
          ZIP bundle wraps that same PDF together with its supporting files. JSON exports the
          report-ready findings and can be re-imported later.
        </p>

        <Field
          label="Report format"
          htmlFor="ex-format"
          hint="A ZIP bundle adds supporting files alongside the PDF."
        >
          <Select
            id="ex-format"
            value={format}
            onChange={(e) => setFormat(e.target.value as ReportFormat)}
            className="max-w-[22rem]"
          >
            <option value="pdf">PDF</option>
            <option value="zip">ZIP bundle (PDF + supporting files)</option>
          </Select>
        </Field>

        <Checkbox
          label="Include all findings (not only “Ready to report”)"
          checked={includeAll}
          onChange={(e) => setIncludeAll(e.target.checked)}
        />

        <div className="border-t border-border pt-4">
          <p className="mb-1 text-sm font-medium text-text">Report contents</p>
          <p className="mb-3 text-xs text-muted">
            The written narrative — executive summary, scope, threat model, execution, and findings —
            is always included.
          </p>
          <div className="flex flex-col gap-4">
            <Checkbox
              label="Include the appendix (standards mapping and reference tables)"
              checked={includeAppendix}
              onChange={(e) => setIncludeAppendix(e.target.checked)}
            />
            <Checkbox
              label="Also include the evidence timeline"
              checked={includeTimeline}
              onChange={(e) => setIncludeTimeline(e.target.checked)}
            />
            {includeTimeline && (
              <Field
                label="Evidence timeline grouping"
                htmlFor="ex-group"
                hint="How the captured evidence is organized in the timeline."
              >
                <Select
                  id="ex-group"
                  value={group}
                  onChange={(e) => setGroup(e.target.value as EvidenceGrouping)}
                  className="max-w-[16rem]"
                >
                  {EVIDENCE_GROUPINGS.map((g) => (
                    <option key={g} value={g}>
                      {EVIDENCE_GROUPING_LABELS[g]}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
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
