import test from 'node:test';
import assert from 'node:assert/strict';

import { ACL_COLUMNS, flattenAclRecord, toCsv, toHtml, toJson, toResourceCsv } from '../public/assets/js/export.js';

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

test('resource CSV exports every resource row', () => {
  const resources = [
    {
      name: 'portal',
      vhName: 'Portal',
      type: 'https',
      addresses: ['192.0.2.10'],
      ports: ['443'],
      counts: { aclLegacy: 1, aclDetailed: 1, aclTotal: 2, menu: 1, cacheControl: 1 },
      status: 'different',
      diffCount: 2,
      presentIn: [1, 2],
    },
    {
      name: '=cmd',
      vhName: 'API',
      type: 'https',
      addresses: ['192.0.2.20'],
      ports: ['8443'],
      counts: { aclLegacy: 0, aclDetailed: 0, aclTotal: 0, menu: 0, cacheControl: 0 },
      status: 'missing',
      diffCount: 5,
      presentIn: [1],
    },
  ];
  const environments = [{ id: 1, name: 'Production' }, { id: 2, name: 'QA' }];
  const csv = toResourceCsv(resources, environments);
  assert.match(csv, /Resource,Virtual host,Type,Addresses,Ports/);
  assert.match(csv, /portal,Portal,https,192\.0\.2\.10,443/);
  assert.match(csv, /Different,2,Production; QA/);
  assert.match(csv, /'=cmd/);

  const single = toResourceCsv([{ ...resources[0], status: 'same' }], [{ id: 1, name: 'Only' }]);
  assert.match(single, /Loaded/);
});

test('ACL exports can use a visible-column subset', () => {
  const columns = ACL_COLUMNS.filter((column) => ['resource', 'authMethod', 'path'].includes(column.key));
  const csv = toCsv([RECORD], columns);
  assert.match(csv, /^Resource,Auth method,Path/);
  const json = JSON.parse(toJson([RECORD], {}, columns));
  assert.deepEqual(Object.keys(json.rules[0]), ['resource', 'authMethod', 'path']);
  const html = toHtml([RECORD], {}, columns);
  assert.match(html, /<th>Resource<\/th><th>Auth method<\/th><th>Path<\/th>/);
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
