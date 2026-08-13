const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 250;

export interface Pagination {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

/** Parse `page`/`pageSize` query params with sane caps. */
export function parsePagination(query: Record<string, unknown>): Pagination {
  const page = Math.max(1, toInt(query.page, 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, toInt(query.pageSize, DEFAULT_PAGE_SIZE)));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

function toInt(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? parseInt(value, 10) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) ? n : fallback;
}
