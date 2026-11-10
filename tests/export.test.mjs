import test from 'node:test';
import assert from 'node:assert/strict';

import { flattenAclRecord, toCsv, toHtml, toJson } from '../public/assets/js/export.js';

const RECORD = {
  environmentId: 1,
  environmentName: 'Production',
  resource: 'portal',
  localService: '/',
  resourceType: 'web',
  vhName: 'Portal',
  source: 'ACCESS_CONTROL_LIST',
  ruleIndex: 1,
  group: '*',
  authMethod: 'webtoken',
  encryption: 'high',
  path: '/',
  sso: false,
  ipAddress: '*',
  deny: false,
  disabled: false,
  behaviorMetrics: 'any',
  time: null,
  extra: { localService: '/', client_secret: 'not-for-export' },
};

test('flattenAclRecord keeps fields and sanitizes extra secrets', () => {
  const flat = flattenAclRecord(RECORD);
  assert.equal(flat.resource, 'portal');
  assert.equal(flat.environmentName, 'Production');
  assert.equal(flat.localService, '/');
  assert.equal(flat.resourceType, 'web');
  assert.equal(flat.deny, 'false');
  assert.equal(flat.extra.includes('not-for-export'), false);
  assert.equal(flat.extra.includes('[redacted]'), true);
  const decoded = flattenAclRecord({ ...RECORD, group: '%2A', path: '%2Fabout' });
  assert.equal(decoded.group, '*');
  assert.equal(decoded.path, '/about');
});

test('CSV export has a header, all records, and formula-injection protection', () => {
  const danger = {
    ...RECORD,
    resource: '=cmd',
    group: '+SUM',
    path: '-1',
    extra: {},
  };
  const csv = toCsv([danger, RECORD]);
  assert.match(csv, /Environment,Resource,Service,Auth method,Path,IP address/);
  assert.match(csv, /'=cmd/);
  assert.match(csv, /'\+SUM/);
  assert.match(csv, /'-1/);
  assert.equal(csv.includes('not-for-export'), false);
});

test('HTML export escapes untrusted values and contains no script', () => {
  const danger = {
    ...RECORD,
    group: '<script>alert(1)</script>',
    path: '&',
  };
  const html = toHtml([danger], { environments: ['Production'] });
  assert.equal(html.includes('<script>alert(1)</script>'), false);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&amp;/);
  assert.match(html, /Generated/);
});

test('JSON export is structured and secret-safe', () => {
  const json = JSON.parse(toJson([RECORD], {
    generatedAt: '2026-01-01T00:00:00.000Z',
    environments: ['Production'],
    filters: { resource: 'portal' },
  }));
  assert.equal(json.count, 1);
  assert.equal(json.rules[0].resource, 'portal');
  assert.equal(JSON.stringify(json).includes('not-for-export'), false);
  assert.equal(json.rules[0].extra.includes('[redacted]'), true);
});
