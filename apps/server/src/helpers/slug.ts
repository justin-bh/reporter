/** Turn an arbitrary name into a URL-safe slug (lowercase, hyphen-separated). */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/**
 * Ensure a slug is unique by appending `-2`, `-3`, … using the provided
 * existence check. Falls back to a random suffix if the base is empty.
 */
export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const candidate = slugify(base) || `item-${Math.abs(hashString(base)) % 100000}`;
  if (!(await exists(candidate))) return candidate;
  for (let i = 2; i < 1000; i++) {
    const next = `${candidate}-${i}`;
    if (!(await exists(next))) return next;
  }
  return `${candidate}-${Date.now()}`;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
