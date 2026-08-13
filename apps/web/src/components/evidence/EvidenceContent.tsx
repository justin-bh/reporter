import { useEffect, useRef, useState } from 'react';
import { Spinner } from '@reporter/ui';
import type { Evidence } from '@reporter/shared';
import 'asciinema-player/dist/bundle/asciinema-player.css';
import { evidenceContentUrl } from '../../lib/urls.js';

/** Renders the right viewer for a piece of evidence based on its content type. */
export function EvidenceContent({ evidence, slug }: { evidence: Evidence; slug: string }) {
  switch (evidence.contentType) {
    case 'image':
      return <ImageViewer slug={slug} uuid={evidence.uuid} />;
    case 'terminal-recording':
      return <TerminalPlayer slug={slug} uuid={evidence.uuid} />;
    case 'codeblock':
      return <CodeblockViewer slug={slug} uuid={evidence.uuid} language={undefined} />;
    case 'http-request-cycle':
      return <HarViewer slug={slug} uuid={evidence.uuid} />;
    case 'event':
    case 'none':
      return <NoteViewer text={evidence.description} />;
    default:
      return <p className="text-sm text-muted">No preview available.</p>;
  }
}

function ImageViewer({ slug, uuid }: { slug: string; uuid: string }) {
  const url = evidenceContentUrl(slug, uuid);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoom(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [zoom]);

  return (
    <>
      <button
        onClick={() => setZoom(true)}
        className="block w-full overflow-hidden rounded-card border border-border bg-surface-2"
        aria-label="Enlarge screenshot"
      >
        <img src={url} alt="Screenshot evidence" className="mx-auto max-h-[60vh] w-auto" />
      </button>
      {zoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Screenshot full size"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setZoom(false)}
        >
          <img src={url} alt="Screenshot evidence full size" className="max-h-full max-w-full" />
        </div>
      )}
    </>
  );
}

function TerminalPlayer({ slug, uuid }: { slug: string; uuid: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let player: { dispose: () => void } | undefined;
    let cancelled = false;
    import('asciinema-player').then((mod) => {
      if (cancelled || !ref.current) return;
      player = mod.create(evidenceContentUrl(slug, uuid), ref.current, {
        fit: 'width',
        terminalFontSize: 'small',
      });
    });
    return () => {
      cancelled = true;
      player?.dispose();
    };
  }, [slug, uuid]);
  return <div ref={ref} className="overflow-hidden rounded-card border border-border" />;
}

function useTextContent(slug: string, uuid: string) {
  const [state, setState] = useState<{ loading: boolean; text: string; error: boolean }>({
    loading: true,
    text: '',
    error: false,
  });
  useEffect(() => {
    let cancelled = false;
    fetch(evidenceContentUrl(slug, uuid), { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('load failed'))))
      .then((text) => !cancelled && setState({ loading: false, text, error: false }))
      .catch(() => !cancelled && setState({ loading: false, text: '', error: true }));
    return () => {
      cancelled = true;
    };
  }, [slug, uuid]);
  return state;
}

function CodeblockViewer({ slug, uuid }: { slug: string; uuid: string; language?: string }) {
  const { loading, text, error } = useTextContent(slug, uuid);
  if (loading) return <Spinner />;
  if (error) return <p className="text-sm text-danger">Couldn't load the code block.</p>;
  return (
    <pre className="max-h-[60vh] overflow-auto rounded-card border border-border bg-surface-2 p-4 text-sm">
      <code className="font-mono text-text">{text}</code>
    </pre>
  );
}

function NoteViewer({ text }: { text: string }) {
  return (
    <div className="whitespace-pre-wrap rounded-card border border-border bg-surface-2 p-4 text-sm text-text">
      {text || <span className="text-muted">No note text.</span>}
    </div>
  );
}

interface HarEntry {
  request?: { method?: string; url?: string };
  response?: { status?: number };
}

function HarViewer({ slug, uuid }: { slug: string; uuid: string }) {
  const { loading, text, error } = useTextContent(slug, uuid);
  const [selected, setSelected] = useState(0);
  if (loading) return <Spinner />;
  if (error) return <p className="text-sm text-danger">Couldn't load the HTTP data.</p>;

  let entries: HarEntry[] = [];
  try {
    const parsed = JSON.parse(text);
    entries = parsed?.log?.entries ?? (Array.isArray(parsed) ? parsed : [parsed]);
  } catch {
    return (
      <pre className="overflow-auto rounded-card border border-border bg-surface-2 p-4 text-sm">
        <code className="font-mono">{text}</code>
      </pre>
    );
  }

  const active = entries[selected];
  return (
    <div className="grid gap-3 md:grid-cols-[240px_1fr]">
      <div className="max-h-[50vh] overflow-auto rounded-card border border-border">
        {entries.map((e, i) => (
          <button
            key={i}
            onClick={() => setSelected(i)}
            className={`flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-xs ${
              i === selected ? 'bg-surface-2' : 'hover:bg-surface-2/60'
            }`}
          >
            <span className="font-mono font-semibold">{e.request?.method ?? '—'}</span>
            <span className="truncate text-muted">{e.request?.url ?? ''}</span>
          </button>
        ))}
      </div>
      <pre className="max-h-[50vh] overflow-auto rounded-card border border-border bg-surface-2 p-4 text-xs">
        <code className="font-mono">{active ? JSON.stringify(active, null, 2) : 'No entry selected'}</code>
      </pre>
    </div>
  );
}
