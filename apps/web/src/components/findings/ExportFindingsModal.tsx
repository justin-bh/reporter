import { useState } from 'react';
import { Button, Checkbox, Modal, useToast } from '@reporter/ui';
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
  const [busy, setBusy] = useState<'pdf' | 'json' | null>(null);

  async function run(kind: 'pdf' | 'json') {
    setBusy(kind);
    try {
      const base = `/web/engagements/${slug}/findings`;
      if (kind === 'pdf') {
        await downloadFile(`${base}/report.pdf?includeAll=${includeAll}`, `${slug}-findings.pdf`);
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
          Exports the report-ready findings with their details and evidence. JSON can be re-imported
          later.
        </p>
        <Checkbox
          label="Include all findings (not only “Ready to report”)"
          checked={includeAll}
          onChange={(e) => setIncludeAll(e.target.checked)}
        />
        <Checkbox
          label="Embed evidence content in JSON (portable across servers, larger file)"
          checked={includeContent}
          onChange={(e) => setIncludeContent(e.target.checked)}
        />
      </div>
    </Modal>
  );
}
