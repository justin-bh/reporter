/**
 * Fetch an authenticated file endpoint and save it, surfacing server errors
 * (e.g. "PDF generation unavailable") instead of downloading an error body.
 */
export async function downloadFile(url: string, fallbackName: string): Promise<void> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  if (!res.ok) {
    let message = `Export failed (${res.status})`;
    try {
      const body = await res.json();
      if (body && typeof body === 'object' && 'error' in body) message = String(body.error);
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(disposition);
  const name = match?.[1] ?? fallbackName;

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
