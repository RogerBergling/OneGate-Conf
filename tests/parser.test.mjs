import test from 'node:test';
import assert from 'node:assert/strict';

import { splitSections } from '../public/assets/js/parser/tokenize.js';
import { parseFile } from '../public/assets/js/parser/parse.js';
import { SecretVault } from '../public/assets/js/parser/secrets.js';
import { buildEnvironment } from '../public/assets/js/parser/build.js';
import { buildComparison } from '../public/assets/js/parser/compare.js';
import { DEMO_ENVIRONMENTS } from '../public/assets/js/demo.js';

const BASE = `<HEADER>\tTEST_CONFIG

<SERVER>
\tdefaulthostname=portal.example.com
\trepo=stable
\tcontrolpassword=demo-control-secret
</SERVER>

<VIRTUAL_HOSTS>
\t0\tportal.example.com\tPortal
\t1\tapi.example.com\tAPI
</VIRTUAL_HOSTS>

<RESOURCE_LIST>
{
  "resourceMap": [
    {
      "portal": {
        "boolAttribs": {"ALLOW_WEBSOCKETS": true},
        "intAttribs": {"SERVER_TYPE": 1},
        "stringAttribs": {
          "RESOURCE_NAME": "portal",
          "TYPE": "https",
          "FORCE_INTERNAL_AUTH_PWD": "demo-resource-secret"
        },
        "listAttribs": {
          "ADDRESS_LIST": ["192.0.2.10"],
          "PORT_LIST": ["443"]
        }
      }
    },
    {
      "api": {
        "boolAttribs": {"ALLOW_WEBSOCKETS": false},
        "intAttribs": {"SERVER_TYPE": 1},
        "stringAttribs": {"RESOURCE_NAME": "api", "TYPE": "https"},
        "listAttribs": {
          "ADDRESS_LIST": ["192.0.2.20"],
          "PORT_LIST": ["443"]
        }
      }
    }
  ]
}
</RESOURCE_LIST>

<HOST>
\tportal\thttps\tportal.example.com\t443
\tapi\thttps\tapi.example.com\t443
</HOST>

<ACL>
\tportal\t*\twebtoken\thigh\t/\tfalse - -
</ACL>

<ACCESS_CONTROL_LIST>
{
  "access_control_list": [
    {
      "portal": {
        "resource_type": "web",
        "local_service": "/",
        "rules": [
          {
            "group": "*",
            "auth": "smstoken",
            "encryption": "high",
            "ipadress": "*",
            "time": null,
            "path": "/",
            "sso": false,
            "deny": false,
            "disabled": false,
            "behaviormetry": "any"
          }
        ]
      }
    }
  ]
}
</ACCESS_CONTROL_LIST>

<MENU>
\t/portal\tportal\t-\t-\t-\t-\t"Portal"\t-\tfalse\t-\tfalse\tfalse\t1\tPortal\t-\t-
</MENU>

<CACHE_CONTROL>
\tportal\t/\tcache
</CACHE_CONTROL>

<HOST_ESIGN>
\tportal\t-\t-\t-\t15\tnone\tfalse\t-\thttp\t-\t-\tV1_0\t45\tfalse\tfalse
</HOST_ESIGN>

<VH_SELECT_RESOURCES>
{"portal": 0, "api": 1}
</VH_SELECT_RESOURCES>

<FUTURE_SECTION>
\tfeature=true
</FUTURE_SECTION>
`;

const API_RESOURCE_BLOCK = `    {
      "api": {
        "boolAttribs": {"ALLOW_WEBSOCKETS": false},
        "intAttribs": {"SERVER_TYPE": 1},
        "stringAttribs": {"RESOURCE_NAME": "api", "TYPE": "https"},
        "listAttribs": {
          "ADDRESS_LIST": ["192.0.2.20"],
          "PORT_LIST": ["443"]
        }
      }
    }`;

const QA = BASE
  .replace(`,\n${API_RESOURCE_BLOCK}`, '')
  .replace('defaulthostname=portal.example.com', 'defaulthostname=qa.portal.example.com')
  .replace('repo=stable', 'repo=testing')
  .replace('"PORT_LIST": ["443"]', '"PORT_LIST": ["8443"]')
  .replace('\tapi\thttps\tapi.example.com\t443\n', '')
  .replace('\tportal\t*\twebtoken\thigh\t/\tfalse - -\n', '\tportal\t*\tsmstoken\thigh\t/\tfalse - -\n')
  .replace('"portal": 0, "api": 1', '"portal": 0')
  .replace('"auth": "smstoken"', '"auth": "webtoken"')
  .replace('<FUTURE_SECTION>\n\tfeature=true\n</FUTURE_SECTION>\n', '');

test('splitSections handles the header marker and comments', () => {
  const result = splitSections(BASE, 'test.conf');
  assert.equal(result.errors.length, 0);
  assert.equal(result.sections[0].name, 'HEADER');
  assert.equal(result.sections[0].headerValue, 'TEST_CONFIG');
  assert.ok(result.sections.some((section) => section.name === 'RESOURCE_LIST'));
  assert.ok(result.sections.find((section) => section.name === 'FUTURE_SECTION').suffix === null);
});

test('parseFile parses properties, JSON, tables and redacts secrets', () => {
  const parsed = parseFile({ fileName: 'test.conf', text: BASE }, new SecretVault());
  assert.equal(parsed.errors.length, 0);
  assert.ok(parsed.unknownSections.includes('FUTURE_SECTION'));

  const server = parsed.sections.find((section) => section.name === 'SERVER');
  assert.equal(server.value.defaulthostname, 'portal.example.com');
  assert.equal(server.value.controlpassword.__secret, true);
  assert.equal(JSON.stringify(parsed).includes('demo-control-secret'), false);

  const resourceList = parsed.sections.find((section) => section.name === 'RESOURCE_LIST');
  assert.equal(resourceList.value.resourceMap.length, 2);
  assert.equal(JSON.stringify(parsed).includes('demo-resource-secret'), false);

  const acl = parsed.sections.find((section) => section.name === 'ACL');
  assert.equal(acl.value[0].resource, 'portal');
  assert.equal(acl.value[0].sso, 'false - -');
});

test('buildEnvironment assembles resource profiles and ACL records', () => {
  const environment = buildEnvironment(
    { id: 1, name: 'Production' },
    [{ fileName: 'test.conf', text: BASE }],
    new SecretVault(),
  );

  assert.equal(environment.resources.length, 2);
  const portal = environment.resources.find((resource) => resource.name === 'portal');
  assert.equal(portal.vhName, 'Portal');
  assert.equal(portal.type, 'https');
  assert.equal(portal.counts.aclLegacy, 1);
  assert.equal(portal.counts.aclDetailed, 1);
  assert.equal(portal.counts.aclTotal, 2);
  assert.equal(environment.aclRecords.length, 2);
  assert.equal(environment.nodeCount, 0);
  assert.ok(environment.unknownSections.includes('FUTURE_SECTION'));
});

test('buildComparison detects differences, missing resources and schema drift', () => {
  const vault = new SecretVault();
  const production = buildEnvironment(
    { id: 1, name: 'Production' },
    [{ fileName: 'prod.conf', text: BASE }],
    vault,
  );
  const qa = buildEnvironment(
    { id: 2, name: 'QA' },
    [{ fileName: 'qa.conf', text: QA }],
    vault,
  );

  const result = buildComparison([production, qa], { emptyAsAbsent: true });
  assert.equal(result.stats.environments, 2);
  assert.equal(result.stats.resources, 2);
  assert.equal(result.stats.missing, 1);
  assert.equal(result.stats.different, 1);

  const portal = result.resources.find((resource) => resource.name === 'portal');
  assert.equal(portal.status, 'different');
  const portRow = portal.rows.find((row) => row.path === 'RESOURCE_LIST.listAttribs.PORT_LIST');
  assert.equal(portRow.status, 'different');

  const api = result.resources.find((resource) => resource.name === 'api');
  assert.equal(api.status, 'missing');

  assert.ok(result.schema.driftCount >= 1);
  assert.ok(result.schema.unknownSections.includes('FUTURE_SECTION'));
  assert.ok(result.aclRules.length >= 3);
});

test('the bundled demo parses, compares and keeps its secret marker redacted', () => {
  const vault = new SecretVault();
  const environments = DEMO_ENVIRONMENTS.map((environment, index) => buildEnvironment(
    { id: index + 1, name: environment.name },
    environment.files.map((file) => ({ fileName: file.name, text: file.text })),
    vault,
  ));

  const result = buildComparison(environments, { emptyAsAbsent: true });
  assert.equal(result.stats.environments, 2);
  assert.ok(result.stats.resources >= 3);
  assert.ok(result.stats.different >= 1);
  assert.ok(result.stats.missing >= 1);
  assert.ok(result.stats.aclRules >= 4);
  assert.ok(result.schema.unknownSections.includes('FUTURE_SECTION'));
  assert.equal(JSON.stringify(result).includes('demo-only-not-a-real-secret'), false);
});

test('multiple files per environment merge by resource name', () => {
  const first = `<RESOURCE_LIST>
{"resourceMap":[{"portal":{"stringAttribs":{"RESOURCE_NAME":"portal","TYPE":"https"}}}]}
</RESOURCE_LIST>`;
  const second = `<HOST>
\tportal\thttps\tportal.example.com\t443
</HOST>
<ACL>
\tportal\t*\twebtoken\thigh\t/\tfalse - -
</ACL>`;

  const environment = buildEnvironment(
    { id: 1, name: 'Merged' },
    [
      { fileName: 'resources.conf', text: first },
      { fileName: 'acl.conf', text: second },
    ],
    new SecretVault(),
  );

  assert.equal(environment.resources.length, 1);
  const portal = environment.resources[0];
  assert.equal(portal.name, 'portal');
  assert.equal(portal.host.serverId, 'portal.example.com');
  assert.equal(portal.counts.aclLegacy, 1);
  assert.equal(portal.counts.aclTotal, 1);
});

test('buildComparison treats empty and absent as equal when requested', () => {
  const left = buildEnvironment(
    { id: 1, name: 'Left' },
    [{
      fileName: 'left.conf',
      text: `<RESOURCE_LIST>\n{"resourceMap":[{"portal":{"stringAttribs":{"TYPE":"https","EMPTY":""}}}]}\n</RESOURCE_LIST>`,
    }],
    new SecretVault(),
  );
  const right = buildEnvironment(
    { id: 2, name: 'Right' },
    [{
      fileName: 'right.conf',
      text: `<RESOURCE_LIST>\n{"resourceMap":[{"portal":{"stringAttribs":{"TYPE":"https"}}}]}\n</RESOURCE_LIST>`,
    }],
    new SecretVault(),
  );

  const equalResult = buildComparison([left, right], { emptyAsAbsent: true });
  const differentResult = buildComparison([left, right], { emptyAsAbsent: false });
  const equalPortal = equalResult.resources.find((resource) => resource.name === 'portal');
  const differentPortal = differentResult.resources.find((resource) => resource.name === 'portal');
  assert.equal(equalPortal.rows.some((row) => row.path.endsWith('.EMPTY')), false);
  assert.equal(differentPortal.rows.some((row) => row.path.endsWith('.EMPTY')), true);
});
