/** Minimal RFC 4180 CSV writer. Values with commas, quotes or newlines are quoted. */
export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return '';
  const cols = columns ?? Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const str = Array.isArray(value) ? value.join('; ') : typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [cols.join(',')];
  for (const row of rows) lines.push(cols.map((c) => escape(row[c])).join(','));
  return lines.join('\r\n');
}
