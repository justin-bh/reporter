import type { UpdateCheckResult } from '../shared/types.js';
import { BUILD_INFO } from './build-info.js';

/** Extract "owner/repo" from a GitHub homepage URL, or null if it isn't one. */
function repoSlug(homepage: string): string | null {
  const match = /github\.com\/([^/]+\/[^/#?]+?)(?:\.git)?\/?$/.exec(homepage);
  return match ? (match[1] ?? null) : null;
}

function parseSemver(v: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** >0 if a is newer than b, <0 if older, 0 if equal or either is unparseable. */
function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
}

/**
 * Check the project's GitHub releases for a newer version. Never throws — a
 * network failure, missing repo, or unset homepage returns a descriptive
 * non-fatal result the About view renders inline.
 */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = BUILD_INFO.version;
  const slug = repoSlug(BUILD_INFO.homepage);
  if (!slug) {
    return { status: 'unknown', currentVersion, error: 'No update source is configured.' };
  }
  try {
    const res = await fetch(`https://api.github.com/repos/${slug}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'reporter-desktop' },
    });
    if (!res.ok) {
      return { status: 'error', currentVersion, error: `Update check failed (HTTP ${res.status}).` };
    }
    const data = (await res.json()) as { tag_name?: string; html_url?: string };
    const latestVersion = (data.tag_name ?? '').replace(/^v/, '');
    if (!latestVersion) {
      return { status: 'error', currentVersion, error: 'No published releases found yet.' };
    }
    // A rolling/channel tag ("nightly", "latest", "2024.08", …) isn't comparable —
    // report 'unknown' rather than falsely claiming the app is up to date.
    if (!parseSemver(latestVersion) || !parseSemver(currentVersion)) {
      return {
        status: 'unknown',
        currentVersion,
        latestVersion,
        releaseUrl: data.html_url,
        error: `Latest release “${latestVersion}” isn’t a comparable version — check manually.`,
      };
    }
    const newer = compareSemver(latestVersion, currentVersion) > 0;
    return {
      status: newer ? 'update-available' : 'up-to-date',
      currentVersion,
      latestVersion,
      releaseUrl: data.html_url,
    };
  } catch (err) {
    return {
      status: 'error',
      currentVersion,
      error: err instanceof Error ? err.message : 'Could not reach the update server.',
    };
  }
}
