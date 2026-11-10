const PROPERTIES = 'properties';
const LIST = 'list';
const TABLE = 'table';
const JSON_BLOCK = 'json';
const RAW = 'raw';

export const SECTION_SCHEMA = {
  HEADER: { kind: RAW, scope: 'meta' },
  SERVER: {
    kind: PROPERTIES,
    scope: 'global',
    parse: true,
    secrets: ['certificatepass', 'controlpassword', 'consolemenupassword', 'smtppassword'],
    summaryKeys: ['defaulthostname', 'repo', 'server', 'port', 'frontend'],
  },
  SMS_SERVER: { kind: PROPERTIES, scope: 'global', secrets: ['pwd', 'failover_pwd'] },
  SMS_OTP: { kind: PROPERTIES, scope: 'global' },
  PASSWORD_POLICIES: { kind: JSON_BLOCK, scope: 'global' },
  STANDARD_METHODS: { kind: JSON_BLOCK, scope: 'global' },
  VIRTUAL_HOSTS: {
    kind: TABLE,
    scope: 'vh',
    parse: true,
    columns: ['id', 'hostnames'],
    joinFrom: 2,
    joinKey: 'description',
  },
  RADIUS_SERVERS: { kind: TABLE, scope: 'global', columns: ['id', 'address', 'authPort', 'accountingPort', 'description'] },
  AUTHENTICATION: { kind: PROPERTIES, scope: 'global' },
  AUTHENTICATION_METHODS: { kind: LIST, scope: 'global' },
  AUTHENTICATION_GROUPS: { kind: TABLE, scope: 'global', columns: ['id', 'name'], joinFrom: 2, joinKey: 'methods' },
  LDAP: { kind: PROPERTIES, scope: 'global', secrets: ['AdminPassword', 'AdminPasswordLocal'] },
  CACHE_CONTROL: {
    kind: TABLE,
    scope: 'resource',
    parse: true,
    columns: ['resource', 'path', 'cache'],
  },
  POOLS: { kind: TABLE, scope: 'global', columns: ['name'], joinFrom: 1, joinKey: 'cidrs' },
  ACL: {
    kind: TABLE,
    scope: 'resource',
    parse: true,
    columns: ['resource', 'group', 'authMethod', 'encryption', 'path'],
    joinFrom: 5,
    joinKey: 'sso',
  },
  SESSION_TIMEOUTS: { kind: TABLE, scope: 'global', columns: null },
  MENU: {
    kind: TABLE,
    scope: 'resource',
    parse: true,
    columns: null,
    resourceIndex: 1,
    descriptionIndex: 6,
  },
  TIMEOUTS: { kind: PROPERTIES, scope: 'global' },
  URL_POOLS: { kind: TABLE, scope: 'global', columns: null },
  HOST: {
    kind: TABLE,
    scope: 'resource',
    parse: true,
    columns: ['name', 'type', 'serverId', 'ports', 'custom1', 'custom2'],
  },
  USER_AGENTS: { kind: TABLE, scope: 'global', columns: null },
  CONFIG: { kind: PROPERTIES, scope: 'meta', ignore: true },
  THREADPOOL: { kind: PROPERTIES, scope: 'global' },
  ACCESS_CONTROL_LIST: { kind: JSON_BLOCK, scope: 'resource', parse: true },
  PAGE_LAYOUT: { kind: JSON_BLOCK, scope: 'global' },
  IDP_SETTINGS: { kind: JSON_BLOCK, scope: 'global' },
  LOAD_BALANCING: { kind: PROPERTIES, scope: 'global' },
  TUNNEL_CLIENT: { kind: JSON_BLOCK, scope: 'global', secrets: ['secret'] },
  SPECIAL_METHODS: { kind: RAW, scope: 'global' },
  NODE_CONFIG: { kind: PROPERTIES, scope: 'node', parse: true },
  VIP_CONFIGS: { kind: JSON_BLOCK, scope: 'global' },
  HSTS: { kind: JSON_BLOCK, scope: 'global' },
  DATE_AND_TIME: { kind: PROPERTIES, scope: 'global' },
  SYSMSG: { kind: JSON_BLOCK, scope: 'global' },
  SERVER_COOKIES: { kind: JSON_BLOCK, scope: 'global' },
  CA_SETTINGS: { kind: TABLE, scope: 'global', columns: null },
  CC_PROVIDERS: { kind: TABLE, scope: 'vh', columns: null },
  TRUSTED_SP_CONFIG: { kind: TABLE, scope: 'global', columns: null },
  REMOTE_SP_GROUPS: { kind: JSON_BLOCK, scope: 'global' },
  ATTRIBUTE_PROFILES: { kind: JSON_BLOCK, scope: 'global' },
  IMPORTED_GROUPS: { kind: LIST, scope: 'global' },
  CC_ACL_GROUPS: { kind: TABLE, scope: 'global', columns: null },
  VH_SELECT_RESOURCES: { kind: JSON_BLOCK, scope: 'resource', parse: true },
  CERTIFY_DOC_CONFIGS: { kind: JSON_BLOCK, scope: 'global', secrets: ['certpwd'] },
  SERVER_SUPERVISION: { kind: PROPERTIES, scope: 'global' },
  RESOURCE_LIST: {
    kind: JSON_BLOCK,
    scope: 'resource',
    parse: true,
    secrets: ['FORCE_INTERNAL_AUTH_PWD'],
  },
  HOST_ESIGN: {
    kind: TABLE,
    scope: 'resource',
    parse: true,
    columns: null,
    resourceIndex: 0,
  },
  FRONTEND_CONFIG: { kind: JSON_BLOCK, scope: 'vh' },
  DNS: { kind: JSON_BLOCK, scope: 'global' },
  VHOST_SELECTOR: { kind: JSON_BLOCK, scope: 'vh' },
  PREFLIGHT_RESPONSE: { kind: JSON_BLOCK, scope: 'global' },
  CERTIFICATES: { kind: JSON_BLOCK, scope: 'global', secrets: ['password'] },
  RELOAD_CONFIG: { kind: RAW, scope: 'meta' },
  SCHEDULE: { kind: JSON_BLOCK, scope: 'global' },
  AUTHENTICATION_CHAIN: { kind: JSON_BLOCK, scope: 'global' },
  OIDC_LOCAL_PROVIDERS: { kind: JSON_BLOCK, scope: 'global' },
  OIDC_REALM_SETTINGS: { kind: JSON_BLOCK, scope: 'global' },
  OIDC_REMOTE_CLIENTS: { kind: JSON_BLOCK, scope: 'global', secrets: ['client_secret'] },
  LOG_SETTINGS: { kind: JSON_BLOCK, scope: 'global' },
  RATE_LIMITS: { kind: JSON_BLOCK, scope: 'global' },
  YUBIKEY: { kind: PROPERTIES, scope: 'global', secrets: ['key'] },
  WIZEPASS_PROVIDERS: { kind: JSON_BLOCK, scope: 'global' },
  OATH: { kind: JSON_BLOCK, scope: 'global' },
  REMOTE_IDENTITY_PROVIDERS: { kind: JSON_BLOCK, scope: 'global' },
  LOCAL_SERVICE_PROVIDERS: { kind: JSON_BLOCK, scope: 'global' },
  AUTHENTICATION_MAPPING: { kind: TABLE, scope: 'global', columns: null },
  OIDC_REMOTE_PROVIDERS: { kind: JSON_BLOCK, scope: 'global' },
  FIDO2: { kind: JSON_BLOCK, scope: 'global' },
  OIDC_RP_AUTHENTICATION: { kind: JSON_BLOCK, scope: 'global', secrets: ['client_secret'] },
  BACKEND_FOR_FRONTEND: { kind: JSON_BLOCK, scope: 'global' },
  SIGNATURE_POLICIES: { kind: JSON_BLOCK, scope: 'global' },
  CA_SETTINGS_VH: { kind: TABLE, scope: 'vh', columns: null },
  ACTIVE_REMOTE_IDENTITY_PROVIDERS: { kind: JSON_BLOCK, scope: 'global' },
  REQUEST_FILTERS: { kind: JSON_BLOCK, scope: 'global' },
  REPORTS: { kind: JSON_BLOCK, scope: 'global' },
  CC_PROVIDERS_VH: { kind: TABLE, scope: 'vh', columns: null },
  IDP_SETTINGS_VHOST: { kind: JSON_BLOCK, scope: 'vh' },
  METHOD_CTXCLASSES: { kind: JSON_BLOCK, scope: 'global' },
  CONSOLE_SETTINGS: { kind: JSON_BLOCK, scope: 'global', secrets: ['pwdhash'] },
};

export const RESOURCE_SECTIONS = [
  'RESOURCE_LIST',
  'HOST',
  'ACL',
  'ACCESS_CONTROL_LIST',
  'MENU',
  'CACHE_CONTROL',
  'HOST_ESIGN',
  'VH_SELECT_RESOURCES',
];

export const PARSED_SECTIONS = new Set([
  'SERVER',
  'VIRTUAL_HOSTS',
  'NODE_CONFIG',
  'RESOURCE_LIST',
  'HOST',
  'ACL',
  'ACCESS_CONTROL_LIST',
  'MENU',
  'CACHE_CONTROL',
  'HOST_ESIGN',
  'VH_SELECT_RESOURCES',
]);

export function getSchema(sectionName) {
  return SECTION_SCHEMA[sectionName] || null;
}

export function isKnownSection(sectionName) {
  return Boolean(getSchema(sectionName));
}

export function schemaKind(sectionName) {
  return getSchema(sectionName)?.kind || 'unknown';
}

export function schemaScope(sectionName) {
  return getSchema(sectionName)?.scope || 'unknown';
}
