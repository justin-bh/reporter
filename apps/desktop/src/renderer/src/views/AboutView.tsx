import { useEffect, useState } from 'react';
import { Badge, Button, Spinner } from '@reporter/ui';
import type { AboutInfo, UpdateCheckResult } from '../../../shared/types.js';

export function AboutView() {
  const [about, setAbout] = useState<AboutInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [update, setUpdate] = useState<UpdateCheckResult | null>(null);

  useEffect(() => {
    window.reporter.getAbout().then(setAbout);
  }, []);

  async function checkForUpdates() {
    setChecking(true);
    setUpdate(null);
    try {
      setUpdate(await window.reporter.checkForUpdates());
    } finally {
      setChecking(false);
    }
  }

  if (!about) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Loading…
      </div>
    );
  }

  const buildDate = formatDate(about.buildDate);

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col items-center gap-1 py-2 text-center">
        <span className="text-lg font-semibold text-text">{about.productName}</span>
        <div className="flex items-center gap-2 text-sm text-muted">
          <Badge tone="accent">v{about.version}</Badge>
          {about.commit !== 'unknown' && <span className="font-mono text-xs">{about.commit}</span>}
        </div>
        {about.homepage && (
          <ExternalLink href={about.homepage}>{stripScheme(about.homepage)}</ExternalLink>
        )}
      </section>

      <section className="flex flex-col gap-2 border-t border-border pt-4">
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={checkForUpdates} loading={checking}>
            Check for updates
          </Button>
        </div>
        {update && <UpdateStatus result={update} />}
      </section>

      <section className="flex flex-col gap-2 border-t border-border pt-4">
        <h2 className="text-sm font-semibold text-text">Build</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          <Row label="Version" value={`v${about.version}`} />
          <Row label="Commit" value={about.commit} mono />
          {buildDate && <Row label="Built" value={buildDate} />}
          <Row label="Server" value={about.serverUrl || '— not set —'} mono />
        </dl>
      </section>

      <section className="flex flex-col gap-2 border-t border-border pt-4">
        <h2 className="text-sm font-semibold text-text">Runtime</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          <Row label="Electron" value={about.electron} mono />
          <Row label="Chromium" value={about.chrome} mono />
          <Row label="Node" value={about.node} mono />
          <Row label="V8" value={about.v8} mono />
          <Row label="Platform" value={`${about.platform} (${about.arch})`} mono />
        </dl>
      </section>
    </div>
  );
}

function UpdateStatus({ result }: { result: UpdateCheckResult }) {
  if (result.status === 'update-available') {
    return (
      <p className="text-xs text-text">
        A new version (<span className="font-mono">v{result.latestVersion}</span>) is available.{' '}
        {result.releaseUrl && <ExternalLink href={result.releaseUrl}>Download</ExternalLink>}
      </p>
    );
  }
  if (result.status === 'up-to-date') {
    return <p className="text-xs text-success">You’re on the latest version.</p>;
  }
  // error / unknown
  return (
    <p className="text-xs text-muted">
      {result.error ?? 'Could not check for updates.'}{' '}
      {result.releaseUrl && <ExternalLink href={result.releaseUrl}>View releases</ExternalLink>}
    </p>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className={`break-all text-text ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => window.reporter.openExternal(href)}
      className="text-accent underline-offset-2 hover:underline"
    >
      {children}
    </button>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//, '');
}
