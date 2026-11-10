import { getSchema } from './schema.js';
import { isSecretMarker } from './secrets.js';
import { compareStatus, formatValue, safeDecode } from './values.js';

function humanizeKey(key) {
  return String(key)
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

function menuKey(entry) {
  const uri = entry?.fields?.[0] || `entry-${entry?.fields?.join('-') || 'unknown'}`;
  return safeDecode(uri);
}

function cacheKey(row) {
  return safeDecode(row?.path || `entry-${row?.cache || 'unknown'}`);
}

function buildDiffRows(profiles, environments, options) {
  const rows = [];
  let order = 0;

  function addRow(path, label, group, values, arrayMode = 'ordered') {
    const status = compareStatus(values, { emptyAsAbsent: options.emptyAsAbsent, arrayMode });
    if (status === 'absent') return;
    const row = {
      path,
      label,
      group,
      values: values.map((value) => formatValue(value)),
      status,
      isSecret: values.some((value) => isSecretMarker(value)),
      order,
    };
    order += 1;
    rows.push(row);
  }

  function valuesFor(getter) {
    return profiles.map((profile) => (profile ? getter(profile) : undefined));
  }

  addRow('VIRTUAL_HOST', 'Virtual host', 'Overview', valuesFor((profile) => profile.vhName));
  addRow('RESOURCE_TYPE', 'Resource type', 'Overview', valuesFor((profile) => profile.type));

  const groups = ['boolAttribs', 'intAttribs', 'stringAttribs', 'listAttribs'];
  const groupLabels = {
    boolAttribs: 'Boolean attributes',
    intAttribs: 'Integer attributes',
    stringAttribs: 'String attributes',
    listAttribs: 'List attributes',
  };

  const keysByGroup = new Map(groups.map((group) => [group, new Set()]));
  for (const profile of profiles) {
    if (!profile?.resourceList) continue;
    for (const group of groups) {
      for (const key of Object.keys(profile.resourceList[group] || {})) {
        keysByGroup.get(group).add(key);
      }
    }
  }

  for (const group of groups) {
    for (const key of [...keysByGroup.get(group)].sort()) {
      addRow(
        `RESOURCE_LIST.${group}.${key}`,
        `${groupLabels[group]} · ${humanizeKey(key)}`,
        'Resource settings',
        valuesFor((profile) => profile.resourceList?.[group]?.[key]),
        group === 'listAttribs' ? 'set' : 'ordered',
      );
    }
  }

  for (const field of ['type', 'serverId', 'ports', 'custom1', 'custom2']) {
    addRow(
      `HOST.${field}`,
      `HOST · ${humanizeKey(field)}`,
      'Host',
      valuesFor((profile) => profile.host?.[field]),
    );
  }

  addRow(
    'HOST_ESIGN',
    'E-sign fields',
    'E-sign',
    valuesFor((profile) => profile.hostEsign?.fields),
  );

  const menuKeys = new Set();
  for (const profile of profiles) {
    for (const entry of profile?.menu || []) menuKeys.add(menuKey(entry));
  }
  for (const key of [...menuKeys].sort()) {
    addRow(
      `MENU[${key}]`,
      `Menu · ${key}`,
      'Menu',
      valuesFor((profile) => {
        const entry = (profile?.menu || []).find((item) => menuKey(item) === key);
        return entry?.fields;
      }),
    );
  }

  const cacheKeys = new Set();
  for (const profile of profiles) {
    for (const row of profile?.cacheControl || []) cacheKeys.add(cacheKey(row));
  }
  for (const key of [...cacheKeys].sort()) {
    addRow(
      `CACHE_CONTROL[${key}]`,
      `Cache · ${key}`,
      'Cache control',
      valuesFor((profile) => {
        const row = (profile?.cacheControl || []).find((item) => cacheKey(item) === key);
        return row?.cache;
      }),
    );
  }

  addRow(
    'ACL.legacy.count',
    'ACL table rules',
    'ACL',
    valuesFor((profile) => profile.counts?.aclLegacy),
  );
  addRow(
    'ACL.detailed.count',
    'Detailed ACL rules',
    'ACL',
    valuesFor((profile) => profile.counts?.aclDetailed),
  );

  return rows.sort((left, right) => left.order - right.order);
}

function buildSchemaComparison(environments) {
  const sectionNames = new Set();
  for (const environment of environments) {
    for (const section of environment.sections) sectionNames.add(section.name);
  }

  const sections = [];
  for (const name of [...sectionNames].sort()) {
    const presence = environments.map((environment) => environment.sections.find((section) => section.name === name));
    const base = presence.find(Boolean);
    const known = Boolean(getSchema(base?.baseName) || getSchema(name));
    const presentIn = environments
      .filter((environment, index) => Boolean(presence[index]))
      .map((environment) => environment.id);
    const status = presentIn.length === environments.length ? 'same' : 'missing';
    sections.push({
      name,
      baseName: base?.baseName || name,
      known,
      kind: base?.kind || (known ? getSchema(base?.baseName)?.kind : 'unknown'),
      scope: base?.scope || 'unknown',
      presentIn,
      status,
      drift: status !== 'same',
    });
  }

  const unknownSections = [...new Set(environments.flatMap((environment) => environment.unknownSections))].sort();
  const parseErrors = environments.flatMap((environment) =>
    environment.parseErrors.map((error) => ({ environment: environment.name, ...error })),
  );

  return {
    sections,
    unknownSections,
    parseErrors,
    driftCount: sections.filter((section) => section.drift).length,
  };
}

export function buildComparison(environments, options = {}) {
  const settings = {
    emptyAsAbsent: options.emptyAsAbsent !== false,
  };

  const resourceNames = new Set();
  for (const environment of environments) {
    for (const resource of environment.resources) resourceNames.add(resource.name);
  }

  const resources = [];
  for (const name of [...resourceNames].sort((left, right) => left.localeCompare(right))) {
    const profiles = environments.map((environment) => environment.resources.find((resource) => resource.name === name) || null);
    const presentIn = environments
      .filter((environment, index) => Boolean(profiles[index]))
      .map((environment) => environment.id);

    const rows = buildDiffRows(profiles, environments, settings);
    const diffCount = rows.filter((row) => row.status !== 'same').length;
    const missing = presentIn.length < environments.length;
    const status = missing ? 'missing' : (diffCount ? 'different' : 'same');
    const first = profiles.find(Boolean);

    resources.push({
      name,
      vhName: first?.vhName || 'Global',
      type: first?.type || '',
      addresses: first?.addresses || [],
      ports: first?.ports || [],
      status,
      diffCount,
      presentIn,
      counts: {
        aclLegacy: first?.counts?.aclLegacy || 0,
        aclDetailed: first?.counts?.aclDetailed || 0,
        aclTotal: first?.counts?.aclTotal || 0,
        menu: first?.counts?.menu || 0,
        cacheControl: first?.counts?.cacheControl || 0,
      },
      rows,
    });
  }

  const aclRules = environments.flatMap((environment) =>
    environment.aclRecords.map((record) => ({
      ...record,
      environmentId: environment.id,
      environmentName: environment.name,
      id: `${environment.id}:${record.resource}:${record.source}:${record.ruleIndex}`,
    })),
  );

  const schema = buildSchemaComparison(environments);
  const stats = {
    environments: environments.length,
    resources: resources.length,
    same: resources.filter((resource) => resource.status === 'same').length,
    different: resources.filter((resource) => resource.status === 'different').length,
    missing: resources.filter((resource) => resource.status === 'missing').length,
    aclRules: aclRules.length,
    schemaDrift: schema.driftCount,
    unknownSections: schema.unknownSections.length,
    parseErrors: schema.parseErrors.length,
  };

  return {
    generatedAt: new Date().toISOString(),
    settings,
    environments: environments.map((environment) => ({
      id: environment.id,
      name: environment.name,
      server: environment.server,
      files: environment.files.map((file) => file.name),
      stats: environment.stats,
      nodeCount: environment.nodeCount,
      warnings: environment.warnings,
    })),
    resources,
    aclRules,
    schema,
    stats,
  };
}
