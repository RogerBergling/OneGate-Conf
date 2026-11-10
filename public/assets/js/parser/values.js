import { isSecretMarker } from './secrets.js';

export function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !isSecretMarker(value);
}

export function safeDecode(value) {
  if (typeof value !== 'string') return value;
  if (!/%[0-9A-Fa-f]{2}/.test(value)) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function normalizeString(value) {
  return safeDecode(String(value).trim());
}

export function normalizeForCompare(value, options = {}) {
  const { emptyAsAbsent = true, arrayMode = 'ordered' } = options;

  if (value === undefined || value === null) return undefined;

  if (isSecretMarker(value)) {
    if (value.empty && emptyAsAbsent) return undefined;
    return { __secret: value.token };
  }

  if (typeof value === 'string') {
    const normalized = normalizeString(value);
    if (normalized === '' && emptyAsAbsent) return undefined;
    return normalized;
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => normalizeForCompare(item, options));
    if (arrayMode === 'set') {
      return items
        .filter((item) => item !== undefined)
        .map((item) => canonicalJson(item))
        .sort();
    }
    return items;
  }

  if (isPlainObject(value)) {
    const output = {};
    for (const key of Object.keys(value).sort()) {
      const normalized = normalizeForCompare(value[key], options);
      if (normalized !== undefined) output[key] = normalized;
    }
    return output;
  }

  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(value);
}

export function valuesEqual(left, right, options = {}) {
  return canonicalJson(normalizeForCompare(left, options)) === canonicalJson(normalizeForCompare(right, options));
}

export function formatValue(value, options = {}) {
  if (value === undefined || value === null) return '—';
  if (isSecretMarker(value)) return value.empty ? '[redacted: empty]' : '[redacted]';
  if (Array.isArray(value)) {
    if (value.length === 0) return '—';
    return value.map((item) => formatValue(item, options)).join(', ');
  }
  if (isPlainObject(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  if (typeof value === 'string') return safeDecode(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

export function uniqueValues(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ''))];
}

export function compareStatus(values, options = {}) {
  const normalized = values.map((value) => normalizeForCompare(value, options));
  const missingCount = normalized.filter((value) => value === undefined).length;
  if (missingCount === normalized.length) return 'absent';
  if (missingCount > 0) return 'missing';
  const first = canonicalJson(normalized[0]);
  return normalized.every((value) => canonicalJson(value) === first) ? 'same' : 'different';
}

export function summarizeComplex(value) {
  if (Array.isArray(value)) return `${value.length} entr${value.length === 1 ? 'y' : 'ies'}`;
  if (isPlainObject(value)) return `${Object.keys(value).length} field${Object.keys(value).length === 1 ? '' : 's'}`;
  return formatValue(value);
}
