import { useState, type ReactNode } from 'react';
import type {
  HttpBody,
  HttpExchange,
  HttpNameValue,
  HttpRequestData,
  HttpResponseData,
} from '@reporter/shared';
import { JsonTree } from './JsonTree.js';

/**
 * Render parsed HTTP exchanges (from `parseHttpExchanges`) as a field/value view:
 * method/URL/status up top, then query, header, and cookie tables, and each
 * request/response body — with JSON bodies shown as an expandable tree. When more
 * than one exchange is present (e.g. a multi-entry HAR), a compact left list picks
 * which one to show, mirroring the read-only HarViewer.
 */
export function HttpExchangeView({ entries }: { entries: HttpExchange[] }) {
  const [selected, setSelected] = useState(0);
  if (entries.length === 0) {
    return <p className="text-sm text-muted">No HTTP entries found.</p>;
  }
  if (entries.length === 1) {
    return <ExchangeDetail exchange={entries[0]!} />;
  }
  const active = entries[Math.min(selected, entries.length - 1)]!;
  return (
    <div className="grid min-w-0 gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
      <div className="max-h-[50vh] overflow-auto rounded-card border border-border">
        {entries.map((e, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setSelected(i)}
            className={`flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-xs last:border-b-0 ${
              i === selected ? 'bg-surface-2' : 'hover:bg-surface-2/60'
            }`}
          >
            <span className="font-mono font-semibold text-text">{entryMethod(e)}</span>
            <span className="truncate text-muted">{entryLabel(e)}</span>
          </button>
        ))}
      </div>
      {/* key by index so switching entries remounts the detail (fresh JSON-tree
          expand/collapse state instead of stale state from the previous entry). */}
      <ExchangeDetail key={selected} exchange={active} />
    </div>
  );
}

function entryMethod(e: HttpExchange): string {
  if (e.request) return e.request.method || 'REQ';
  if (e.response) return String(e.response.status ?? 'RES');
  return 'JSON';
}

function entryLabel(e: HttpExchange): string {
  if (e.request) return e.request.url || '';
  if (e.response) return e.response.statusText || '';
  return 'Data';
}

function ExchangeDetail({ exchange }: { exchange: HttpExchange }) {
  return (
    <div className="min-w-0 space-y-4 rounded-card border border-border bg-surface-2 p-4">
      {exchange.request && <RequestView request={exchange.request} />}
      {exchange.response && <ResponseView response={exchange.response} />}
      {exchange.data && (
        <Section title="JSON">
          <BodyView body={exchange.data} />
        </Section>
      )}
      {!exchange.request && !exchange.response && !exchange.data && (
        <p className="text-sm text-muted">Nothing to show for this entry.</p>
      )}
    </div>
  );
}

function RequestView({ request }: { request: HttpRequestData }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="rounded-input bg-accent/15 px-2 py-0.5 font-mono text-xs font-semibold text-accent">
          {request.method || 'GET'}
        </span>
        {request.httpVersion && <span className="text-xs text-muted">{request.httpVersion}</span>}
        <span className="min-w-0 break-all font-mono text-xs text-text">{request.url}</span>
      </div>
      <KVTable title="Query parameters" rows={request.queryString} />
      <KVTable title="Request headers" rows={request.headers} />
      <KVTable title="Cookies" rows={request.cookies} />
      {request.body && (
        <Section title="Request body">
          <BodyView body={request.body} />
        </Section>
      )}
    </div>
  );
}

function ResponseView({ response }: { response: HttpResponseData }) {
  const status =
    response.status !== undefined ? String(response.status) : response.statusText ? '' : '—';
  return (
    <div className="space-y-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className={`rounded-input px-2 py-0.5 font-mono text-xs font-semibold ${statusTone(response.status)}`}>
          {status || response.statusText}
        </span>
        {response.status !== undefined && response.statusText && (
          <span className="text-xs text-muted">{response.statusText}</span>
        )}
        {response.httpVersion && <span className="text-xs text-muted">{response.httpVersion}</span>}
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Response</span>
      </div>
      <KVTable title="Response headers" rows={response.headers} />
      <KVTable title="Cookies" rows={response.cookies} />
      {response.body && (
        <Section title="Response body">
          <BodyView body={response.body} />
        </Section>
      )}
    </div>
  );
}

/** Color the status pill by 2xx/3xx/4xx/5xx (design tokens only). */
function statusTone(status: number | undefined): string {
  if (status === undefined) return 'bg-surface text-text';
  if (status >= 500) return 'bg-danger/15 text-danger';
  if (status >= 400) return 'bg-warning/15 text-warning';
  if (status >= 300) return 'bg-info/15 text-info';
  return 'bg-success/15 text-success';
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</p>
      {children}
    </div>
  );
}

/** A field/value table; renders nothing when there are no rows. */
function KVTable({ title, rows }: { title: string; rows: HttpNameValue[] }) {
  if (!rows.length) return null;
  return (
    <Section title={title}>
      <div className="grid grid-cols-[minmax(90px,34%)_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        {rows.map((r, i) => (
          <div key={i} className="contents">
            <div className="min-w-0 break-words font-medium text-muted">{r.name}</div>
            <div className="min-w-0 break-words font-mono text-text">{r.value}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/** A body: an expandable JSON tree when it parsed as JSON, else raw text. */
function BodyView({ body }: { body: HttpBody }) {
  if (body.json !== undefined) {
    return (
      <div className="min-w-0 overflow-auto rounded-input border border-border bg-surface p-3">
        <JsonTree value={body.json} />
      </div>
    );
  }
  if (!body.text) return <p className="text-xs text-muted">(empty)</p>;
  return (
    <pre className="min-w-0 max-h-[40vh] overflow-auto rounded-input border border-border bg-surface p-3 text-xs">
      <code className="font-mono text-text">{body.text}</code>
    </pre>
  );
}
