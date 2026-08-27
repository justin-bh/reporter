import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Spinner } from '@reporter/ui';

/**
 * Live preview of a single report section, shown in the Reports → Configure
 * panel. Renders the server's real section HTML (same output as the PDF) in a
 * same-origin iframe so the author sees exactly what a section will contain.
 * Reflects saved state; `refreshToken` bumps to reload after autosave.
 */
export function SectionPreview({
  slug,
  sectionKey,
  sectionLabel,
  refreshToken,
  onRefresh,
}: {
  slug: string;
  sectionKey: string | null;
  sectionLabel: string;
  refreshToken: number;
  onRefresh: () => void;
}) {
  const [loading, setLoading] = useState(true);

  const src = useMemo(() => {
    if (!sectionKey) return null;
    const params = new URLSearchParams({ section: sectionKey, v: String(refreshToken) });
    return `/web/engagements/${slug}/report/section-preview.html?${params.toString()}`;
  }, [slug, sectionKey, refreshToken]);

  // Show the spinner again whenever we navigate to a new section / refresh, so a
  // stale iframe isn't left visible while the next one loads.
  useEffect(() => {
    if (src) setLoading(true);
  }, [src]);

  return (
    <Card className="flex h-[75vh] flex-col overflow-hidden p-0 lg:sticky lg:top-4 lg:h-[calc(100vh-7rem)]">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text">Preview</h3>
          <p className="truncate text-xs text-muted">
            {sectionKey ? sectionLabel : 'Select a section to preview'}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onRefresh} disabled={!sectionKey}>
          Refresh
        </Button>
      </div>

      <div className="relative min-h-0 flex-1 bg-surface-2">
        {!src ? (
          <div className="flex h-[60vh] items-center justify-center px-6 text-center text-sm text-muted">
            Expand or select a section on the left to see how it will appear in the report.
          </div>
        ) : (
          <>
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-2/70">
                <Spinner />
              </div>
            )}
            <iframe
              // Remount on src change so onLoad fires for every navigation.
              key={src}
              src={src}
              title={`Preview of ${sectionLabel}`}
              className="h-full w-full border-0 bg-white"
              sandbox="allow-same-origin"
              onLoad={() => setLoading(false)}
            />
          </>
        )}
      </div>
    </Card>
  );
}
