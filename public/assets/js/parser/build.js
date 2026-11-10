import { parseFile } from './parse.js';
import { isSecretMarker } from './secrets.js';

function makeResource(name) {
  return {
    name,
    resourceList: null,
    host: null,
    aclLegacy: [],
    aclEntries: [],
    aclRules: [],
    menu: [],
    cacheControl: [],
    hostEsign: null,
    vhId: null,
    vhName: 'Global',
    aclRecords: [],
  };
}

function warning(list, fileName, section, message) {
  list.push({ fileName, section, message });
}

function mergeServer(target, source, fileName, warnings) {
  for (const [key, value] of Object.entries(source || {})) {
    if (Object.prototype.hasOwnProperty.call(target, key)) {
      if (JSON.stringify(target[key]) !== JSON.stringify(value)) {
        warning(warnings, fileName, 'SERVER', `Duplicate global setting "${key}" with different values; keeping the first`);
      }
      continue;
    }
    target[key] = value;
  }
}

function parseVirtualHost(row, fileName, warnings) {
  const id = Number.parseInt(String(row.id ?? '').trim(), 10);
  if (!Number.isFinite(id)) {
    warning(warnings, fileName, 'VIRTUAL_HOSTS', `Could not parse virtual-host id "${row.id}"`);
    return null;
  }

  const hostnames = String(row.hostnames ?? '')
    .split(',')
    .map((hostname) => hostname.trim())
    .filter(Boolean)
    .filter((hostname) => !/^\d+$/.test(hostname));

  const description = String(row.description ?? '').trim();
  const name = description || hostnames[0] || `VH ${id}`;
  return { id, hostnames, description, name };
}

function getResource(state, name) {
  if (!name) return null;
  if (!state.resources.has(name)) state.resources.set(name, makeResource(name));
  return state.resources.get(name);
}

function mergeResourceList(profile, attributes, fileName, warnings) {
  if (profile.resourceList) {
    if (JSON.stringify(profile.resourceList) !== JSON.stringify(attributes)) {
      warning(warnings, fileName, 'RESOURCE_LIST', `Resource "${profile.name}" has conflicting RESOURCE_LIST entries; keeping the first`);
    }
    return;
  }
  profile.resourceList = attributes;
}

function cleanExtra(value) {
  if (Array.isArray(value)) return value.map(cleanExtra);
  if (isSecretMarker(value)) return value.empty ? '[redacted: empty]' : '[redacted]';
  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, child] of Object.entries(value)) output[key] = cleanExtra(child);
    return output;
  }
  return value;
}

function normalizeAclRecord(rule, context, profile, vhMap) {
  const common = new Set([
    'group',
    'auth',
    'authMethod',
    'encryption',
    'path',
    'sso',
    'ipadress',
    'ipAddress',
    'deny',
    'disabled',
    'behaviormetry',
    'behaviorMetrics',
    'time',
  ]);

  const extra = {};
  for (const [key, value] of Object.entries(rule)) {
    if (!common.has(key)) extra[key] = value;
  }

  const entry = context.entry || {};
  const localService = entry.local_service ?? null;
  const resourceType = entry.resource_type ?? null;
  const entryIndex = context.entryIndex ?? null;

  let vhId = profile.vhId;
  let vhName = profile.vhName;
  const ruleVh = rule.vhid ?? rule.vhId;

  if (ruleVh === '*') {
    vhId = '*';
    vhName = '*';
  } else if (ruleVh !== undefined && ruleVh !== null) {
    const numeric = Number.parseInt(String(ruleVh), 10);
    if (Number.isFinite(numeric)) {
      vhId = numeric;
      vhName = vhMap.get(numeric)?.name || `VH ${numeric}`;
    } else {
      vhId = ruleVh;
      vhName = String(ruleVh);
    }
  }

  return {
    source: context.source,
    ruleIndex: context.ruleIndex,
    entryIndex,
    resource: profile.name,
    localService,
    resourceType,
    vhId,
    vhName,
    group: rule.group ?? '',
    authMethod: rule.auth ?? rule.authMethod ?? '',
    encryption: rule.encryption ?? '',
    path: rule.path ?? '',
    sso: rule.sso ?? '',
    ipAddress: rule.ipadress ?? rule.ipAddress ?? '',
    deny: rule.deny ?? null,
    disabled: rule.disabled ?? null,
    behaviorMetrics: rule.behaviormetry ?? rule.behaviorMetrics ?? '',
    time: rule.time ?? null,
    extra: cleanExtra(extra),
  };
}

function buildVirtualHosts(rawHosts, fileName, warnings) {
  const map = new Map();
  for (const row of rawHosts) {
    const host = parseVirtualHost(row, fileName, warnings);
    if (!host) continue;
    if (map.has(host.id)) {
      const existing = map.get(host.id);
      if (JSON.stringify(existing) !== JSON.stringify(host)) {
        warning(warnings, fileName, 'VIRTUAL_HOSTS', `Virtual host ${host.id} is defined more than once with different values; keeping the first`);
      }
      continue;
    }
    map.set(host.id, host);
  }
  return map;
}

export function buildEnvironment(environment, files, vault) {
  const state = {
    resources: new Map(),
    virtualHosts: new Map(),
    resourceVh: new Map(),
    server: {},
    sectionPresence: new Map(),
    unknownSections: new Set(),
    parseErrors: [],
    files: [],
    warnings: [],
    nodeSections: 0,
    nodeHostnames: new Set(),
  };

  for (const file of files) {
    const parsed = parseFile(file, vault);
    state.files.push({
      name: file.fileName || file.name || 'unnamed',
      lineCount: parsed.lineCount,
      sections: parsed.sections.map((section) => section.name),
      errors: parsed.errors,
    });
    state.parseErrors.push(...parsed.errors);
    for (const section of parsed.sections) {
      if (state.sectionPresence.has(section.name)) {
        state.sectionPresence.get(section.name).count += 1;
      } else {
        state.sectionPresence.set(section.name, {
          name: section.name,
          baseName: section.baseName,
          kind: section.kind,
          scope: section.scope,
          known: section.known,
          count: 1,
        });
      }
      if (!section.known) state.unknownSections.add(section.name);
      if (!section.parsed) continue;

      switch (section.baseName) {
        case 'SERVER':
          mergeServer(state.server, section.value, file.fileName || file.name, state.warnings);
          break;

        case 'VIRTUAL_HOSTS': {
          const hosts = buildVirtualHosts(section.value || [], file.fileName || file.name, state.warnings);
          for (const [id, host] of hosts) {
            if (state.virtualHosts.has(id)) {
              const existing = state.virtualHosts.get(id);
              if (JSON.stringify(existing) !== JSON.stringify(host)) {
                warning(state.warnings, file.fileName || file.name, 'VIRTUAL_HOSTS', `Virtual host ${id} conflicts across files; keeping the first`);
              }
              continue;
            }
            state.virtualHosts.set(id, host);
          }
          break;
        }

        case 'NODE_CONFIG': {
          state.nodeSections += 1;
          const hostname = String(section.value?.hostname ?? '').trim();
          if (hostname) state.nodeHostnames.add(hostname);
          break;
        }

        case 'RESOURCE_LIST': {
          const entries = section.value?.resourceMap;
          if (!Array.isArray(entries)) {
            warning(state.warnings, file.fileName || file.name, 'RESOURCE_LIST', 'RESOURCE_LIST has no resourceMap array');
            break;
          }
          for (const entry of entries) {
            for (const [name, attributes] of Object.entries(entry || {})) {
              const profile = getResource(state, name);
              if (profile) mergeResourceList(profile, attributes, file.fileName || file.name, state.warnings);
            }
          }
          break;
        }

        case 'HOST': {
          for (const row of section.value || []) {
            const profile = getResource(state, row.name);
            if (!profile) continue;
            if (profile.host) {
              warning(state.warnings, file.fileName || file.name, 'HOST', `Resource "${profile.name}" has more than one HOST row; keeping the first`);
              continue;
            }
            profile.host = row;
          }
          break;
        }

        case 'ACL': {
          for (const row of section.value || []) {
            const profile = getResource(state, row.resource);
            if (!profile) continue;
            profile.aclLegacy.push(row);
          }
          break;
        }

        case 'ACCESS_CONTROL_LIST': {
          const entries = section.value?.access_control_list;
          if (!Array.isArray(entries)) {
            warning(state.warnings, file.fileName || file.name, 'ACCESS_CONTROL_LIST', 'ACCESS_CONTROL_LIST has no access_control_list array');
            break;
          }
          for (const entry of entries) {
            for (const [name, detail] of Object.entries(entry || {})) {
              const profile = getResource(state, name);
              if (!profile) continue;
              const entryIndex = profile.aclEntries.length + 1;
              profile.aclEntries.push({ entryIndex, detail });
              const rules = Array.isArray(detail?.rules) ? detail.rules : [];
              for (const rule of rules) {
                profile.aclRules.push({ rule, entry: detail, entryIndex });
              }
            }
          }
          break;
        }

        case 'MENU': {
          for (const row of section.value || []) {
            const profile = getResource(state, row.resource);
            if (profile) profile.menu.push(row);
          }
          break;
        }

        case 'CACHE_CONTROL': {
          for (const row of section.value || []) {
            const profile = getResource(state, row.resource);
            if (profile) profile.cacheControl.push(row);
          }
          break;
        }

        case 'HOST_ESIGN': {
          for (const row of section.value || []) {
            const profile = getResource(state, row.resource);
            if (!profile) continue;
            if (profile.hostEsign) {
              warning(state.warnings, file.fileName || file.name, 'HOST_ESIGN', `Resource "${profile.name}" has more than one HOST_ESIGN row; keeping the first`);
              continue;
            }
            profile.hostEsign = row;
          }
          break;
        }

        case 'VH_SELECT_RESOURCES': {
          for (const [name, vhId] of Object.entries(section.value || {})) {
            const profile = getResource(state, name);
            if (!profile) continue;
            const numeric = Number.parseInt(String(vhId), 10);
            if (!Number.isFinite(numeric)) {
              warning(state.warnings, file.fileName || file.name, 'VH_SELECT_RESOURCES', `Resource "${name}" has a non-numeric VH id "${vhId}"`);
              continue;
            }
            if (state.resourceVh.has(name) && state.resourceVh.get(name) !== numeric) {
              warning(state.warnings, file.fileName || file.name, 'VH_SELECT_RESOURCES', `Resource "${name}" is assigned to more than one VH; keeping the first`);
              continue;
            }
            state.resourceVh.set(name, numeric);
          }
          break;
        }

        default:
          break;
      }
    }
  }

  if (!state.virtualHosts.size) {
    state.virtualHosts.set(0, {
      id: 0,
      hostnames: [],
      description: 'Default',
      name: 'Default',
    });
  }

  const resources = [];
  const aclRecords = [];

  for (const profile of [...state.resources.values()].sort((left, right) => left.name.localeCompare(right.name))) {
    const vhId = state.resourceVh.has(profile.name) ? state.resourceVh.get(profile.name) : null;
    profile.vhId = vhId;
    profile.vhName = vhId === null
      ? 'Global'
      : (state.virtualHosts.get(vhId)?.name || `VH ${vhId}`);

    const legacyRecords = profile.aclLegacy.map((row, index) => {
      const record = normalizeAclRecord(row, { source: 'ACL', ruleIndex: index + 1 }, profile, state.virtualHosts);
      return record;
    });

    const detailedRecords = profile.aclRules.map((item, index) => {
      return normalizeAclRecord(
        item.rule,
        { source: 'ACCESS_CONTROL_LIST', ruleIndex: index + 1, entry: item.entry, entryIndex: item.entryIndex },
        profile,
        state.virtualHosts,
      );
    });

    profile.aclRecords = [...legacyRecords, ...detailedRecords];
    aclRecords.push(...profile.aclRecords);

    const resourceType = profile.resourceList?.stringAttribs?.TYPE || profile.host?.type || '';
    const addresses = profile.resourceList?.listAttribs?.ADDRESS_LIST || [];
    const ports = profile.resourceList?.listAttribs?.PORT_LIST || (profile.host?.ports ? [profile.host.ports] : []);

    resources.push({
      name: profile.name,
      vhId: profile.vhId,
      vhName: profile.vhName,
      type: resourceType,
      addresses,
      ports,
      resourceList: profile.resourceList,
      host: profile.host,
      aclLegacy: profile.aclLegacy,
      aclEntries: profile.aclEntries,
      aclRules: detailedRecords,
      aclRecords: profile.aclRecords,
      menu: profile.menu,
      cacheControl: profile.cacheControl,
      hostEsign: profile.hostEsign,
      counts: {
        aclLegacy: profile.aclLegacy.length,
        aclDetailed: detailedRecords.length,
        aclTotal: profile.aclRecords.length,
        menu: profile.menu.length,
        cacheControl: profile.cacheControl.length,
      },
    });
  }

  aclRecords.sort((left, right) => {
    const resourceCompare = left.resource.localeCompare(right.resource);
    if (resourceCompare) return resourceCompare;
    const sourceCompare = left.source.localeCompare(right.source);
    if (sourceCompare) return sourceCompare;
    return left.ruleIndex - right.ruleIndex;
  });

  const sections = [...state.sectionPresence.values()].sort((left, right) => left.name.localeCompare(right.name));
  const serverSummary = {};
  for (const key of ['defaulthostname', 'repo', 'server', 'port', 'frontend']) {
    if (state.server[key] !== undefined) serverSummary[key] = state.server[key];
  }

  return {
    id: environment.id,
    name: environment.name,
    files: state.files,
    server: serverSummary,
    virtualHosts: [...state.virtualHosts.values()].sort((left, right) => left.id - right.id),
    resources,
    aclRecords,
    sections,
    unknownSections: [...state.unknownSections].sort(),
    parseErrors: state.parseErrors,
    warnings: state.warnings,
    nodeCount: state.nodeHostnames.size || state.nodeSections,
    stats: {
      resources: resources.length,
      aclRules: aclRecords.length,
      virtualHosts: state.virtualHosts.size,
      nodes: state.nodeHostnames.size || state.nodeSections,
      unknownSections: state.unknownSections.size,
      parseErrors: state.parseErrors.length,
    },
  };
}

export function environmentSummary(environment) {
  return {
    id: environment.id,
    name: environment.name,
    server: environment.server,
    files: environment.files.map((file) => file.name),
    stats: environment.stats,
    sections: environment.sections.length,
    unknownSections: environment.unknownSections,
    parseErrors: environment.parseErrors,
    warnings: environment.warnings,
    nodeCount: environment.nodeCount,
  };
}
