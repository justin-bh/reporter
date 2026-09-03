import { useEffect, useState } from 'react';
import { evidenceContentUrl } from '../lib/urls.js';

/**
 * Fetch an evidence item's stored text body (note/event/codeblock/HTTP). `version`
 * (typically the evidence's `updatedAt`) is appended to the URL so that after an
 * edit — same blob URL, new bytes — the content is refetched and cache-busted
 * instead of showing the stale body.
 */
export function useEvidenceText(slug: string, uuid: string, version?: string, enabled = true) {
  const [state, setState] = useState<{ loading: boolean; text: string; error: boolean }>({
    loading: enabled,
    text: '',
    error: false,
  });
  useEffect(() => {
    if (!enabled) {
      setState({ loading: false, text: '', error: false });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    const base = evidenceContentUrl(slug, uuid);
    const url = version ? `${base}?v=${encodeURIComponent(version)}` : base;
    fetch(url, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('load failed'))))
      .then((text) => !cancelled && setState({ loading: false, text, error: false }))
      .catch(() => !cancelled && setState({ loading: false, text: '', error: true }));
    return () => {
      cancelled = true;
    };
  }, [slug, uuid, version, enabled]);
  return state;
}
