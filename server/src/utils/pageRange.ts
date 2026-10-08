export class PageRangeError extends Error {}

/**
 * Parse a page range expression like "1-3,5,8-10" into a sorted, unique list of
 * 1-based page numbers, validated against the document's page count.
 */
export function parsePageRange(range: string, totalPages: number): number[] {
  const trimmed = range.trim();
  if (!trimmed) return [];
  const out = new Set<number>();
  for (const rawPart of trimmed.split(',')) {
    const part = rawPart.trim();
    if (!part) continue;
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!m) throw new PageRangeError(`Invalid page range part: "${part}"`);
    const start = parseInt(m[1], 10);
    const end = m[2] !== undefined ? parseInt(m[2], 10) : start;
    if (start < 1 || end < 1) throw new PageRangeError('Page numbers must be 1 or greater');
    if (start > end) throw new PageRangeError(`Invalid range "${part}": start is after end`);
    if (end > totalPages) {
      throw new PageRangeError(`Page ${end} is outside the document (${totalPages} page${totalPages === 1 ? '' : 's'})`);
    }
    for (let p = start; p <= end; p++) out.add(p);
  }
  if (out.size === 0) throw new PageRangeError('Page range is empty');
  return [...out].sort((a, b) => a - b);
}

export function normalizePageRangeStr(range: string): string {
  return range.replace(/\s+/g, '');
}
