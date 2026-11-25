// Normalize camelCase, snake_case, kebab-case and dotted names before
// matching. Over-redaction is safer than leaking a credential from an export.
const SENSITIVE_KEY_PATTERN = /(password|passwd|pwd|secret|token|apikey|privatekey|accesskey|passphrase)/;

export function isSensitiveKeyName(key) {
  const normalized = String(key ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return SENSITIVE_KEY_PATTERN.test(normalized);
}

export class SecretVault {
  constructor() {
    this.values = new Map();
    this.next = 1;
  }

  token(value) {
    const key = String(value ?? '');
    if (!this.values.has(key)) {
      this.values.set(key, `s${this.next}`);
      this.next += 1;
    }
    return this.values.get(key);
  }

  clear() {
    this.values.clear();
    this.next = 1;
  }
}

export function secretMarker(vault, value, key = '', path = '') {
  return {
    __secret: true,
    token: vault.token(value),
    empty: value === '' || value === null || value === undefined,
    key,
    path,
  };
}

export function isSecretMarker(value) {
  return Boolean(value && typeof value === 'object' && value.__secret === true);
}
