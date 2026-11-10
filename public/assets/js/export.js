import { safeDecode } from './parser/values.js';

const SECRET_KEY_PATTERN = /(^|_)(password|passwd|pwd|secret|token|apikey|privatekey|accessToken)$/i;

export const ACL_COLUMNS = [
  { key: 'environmentName', label: 'Environment' },
  { key: 'resource', label: 'Resource' },
  { key: 'localService', label: 'Service' },
  { key: 'authMethod', label: 'Auth method' },
  { key: 'path', label: 'Path' },
  { key: 'ipAddress', label: 'IP address' },
  { key: 'encryption', label: 'Encryption' },
  { key: 'group', label: 'Group' },
  { key: 'vhName', label: 'Virtual host' },
  { key: 'source', label: 'Source' },
  { key: 'ruleIndex', label: 'Rule #' },
  { key: 'sso', label: 'SSO' },
  { key: 'deny', label: 'Deny' },
  { key: 'disabled', label: 'Disabled' },
  { key: 'behaviorMetrics', label: 'Behaviour metrics' },
  { key: 'resourceType', label: 'Resource type' },
  { key: 'time', label: 'Time' },
  { key: 'extra', label: 'Extra' },
];

function sanitizeExtra(value) {
  if (Array.isArray(value)) return value.map(sanitizeExtra);
  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, child] of Object.entries(value)) {
      output[key] = SECRET_KEY_PATTERN.test(key) ? '[redacted]' : sanitizeExtra(child);
    }
    return output;
  }
  return value;
}

function cellValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function flattenAclRecord(record, columns = ACL_COLUMNS) {
  const output = {};
  for (const column of columns) {
    if (column.key === 'extra') {
      const extra = sanitizeExtra(record.extra || {});
      output.extra = Object.keys(extra).length ? JSON.stringify(extra) : '';
    } else {
      output[column.key] = cellValue(safeDecode(record[column.key]));
    }
  }
  return output;
}

function csvEscape(value) {
  let text = cellValue(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(records, columns = ACL_COLUMNS) {
  const rows = [columns.map((column) => csvEscape(column.label)).join(',')];
  for (const record of records) {
    const flat = flattenAclRecord(record, columns);
    rows.push(columns.map((column) => csvEscape(flat[column.key])).join(','));
  }
  return `${rows.join('\r\n')}\r\n`;
}

export function toJson(records, context = {}, columns = ACL_COLUMNS) {
  return JSON.stringify(
    {
      schemaVersion: 1,
      application: 'OneGate Config Compare',
      generatedAt: context.generatedAt || new Date().toISOString(),
      environments: context.environments || [],
      filters: context.filters || {},
      count: records.length,
      rules: records.map((record) => flattenAclRecord(record, columns)),
    },
    null,
    2,
  );
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function toHtml(records, context = {}, columns = ACL_COLUMNS) {
  const generatedAt = context.generatedAt || new Date().toISOString();
  const environments = (context.environments || []).join(', ') || '—';
  const filters = context.filters || {};
  const filterRows = Object.entries(filters)
    .filter(([, value]) => value !== undefined && value !== null && value !== '' && value !== 'all')
    .map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join('');

  const body = records.map((record) => {
    const flat = flattenAclRecord(record, columns);
    return `<tr>${columns.map((column) => `<td>${escapeHtml(flat[column.key])}</td>`).join('')}</tr>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OneGate ACL export</title>
<style>
  :root { color-scheme: dark; --bg:#0b1020; --panel:#121a2e; --line:#263352; --text:#e8eefc; --muted:#93a4c7; --accent:#22d3ee; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 1600px; margin: 0 auto; padding: 28px; }
  h1 { margin: 0 0 6px; font-size: 24px; }
  .meta { color: var(--muted); margin-bottom: 18px; }
  .warning { border: 1px solid #7c5a12; background: #2a1f0b; color: #fbbf24; padding: 12px 14px; border-radius: 10px; margin-bottom: 18px; }
  .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 18px; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 14px; }
  .card h2 { margin: 0 0 8px; font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; }
  table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
  th, td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
  th { position: sticky; top: 0; background: #17213a; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }
  tr:last-child td { border-bottom: 0; }
  td { font-size: 12px; overflow-wrap: anywhere; }
  .filters th { width: 160px; }
  @media print { :root { color-scheme: light; --bg:#fff; --panel:#fff; --line:#ccc; --text:#111; --muted:#555; } body { background:#fff; } main { padding: 0; } .warning { background:#fff7e6; color:#7a4b00; } }
</style>
</head>
<body>
<main>
  <h1>OneGate ACL export</h1>
  <div class="meta">Generated ${escapeHtml(generatedAt)} · ${records.length} rules · environments: ${escapeHtml(environments)}</div>
  <div class="warning">This file contains ACL metadata, group DNs, internal IP addresses and resource names. It contains no secret values, but it is still sensitive. Store and share it accordingly.</div>
  <div class="summary">
    <div class="card"><h2>Rules</h2><strong>${records.length}</strong></div>
    <div class="card"><h2>Environments</h2><strong>${escapeHtml(environments)}</strong></div>
    <div class="card"><h2>Sources</h2><strong>${escapeHtml([...new Set(records.map((record) => record.source))].join(', ') || '—')}</strong></div>
  </div>
  ${filterRows ? `<table class="filters"><tbody>${filterRows}</tbody></table><br>` : ''}
  <table>
    <thead><tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr></thead>
    <tbody>${body}</tbody>
  </table>
</main>
</body>
</html>`;
}

export function timestampSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
}

export function downloadText(filename, text, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
