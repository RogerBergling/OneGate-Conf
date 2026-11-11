import { DEMO_ENVIRONMENTS } from './demo.js';
import { safeDecode } from './parser/values.js';
import {
  ACL_COLUMNS,
  downloadText,
  timestampSlug,
  toCsv,
  toHtml,
  toJson,
  toResourceCsv,
} from './export.js';

const RESOURCE_PAGE_SIZE = 100;
const ACL_PAGE_SIZE = 100;

const state = {
  environments: [],
  nextEnvironmentId: 1,
  result: null,
  worker: null,
  loading: false,
  view: 'resources',
  resourcePage: 1,
  resourceSearch: '',
  resourceStatus: 'all',
  resourceVh: 'all',
  selectedResource: null,
  detailShowAll: false,
  aclPage: 1,
  aclSearch: '',
  aclEnvironment: 'all',
  aclResource: 'all',
  aclVh: 'all',
  aclService: 'all',
  aclSource: 'all',
  aclAuth: 'all',
  aclEncryption: 'all',
  aclDeny: 'all',
  selectedAclId: null,
  aclVisibleColumns: new Set(),
  aclColumnsCustomized: false,
  exportVisibleColumns: false,
  aclFormat: 'csv',
  emptyAsAbsent: true,
  ignoredFields: new Map(),
};

const dom = {
  importView: document.getElementById('import-view'),
  workspace: document.getElementById('workspace'),
  environmentCards: document.getElementById('environment-cards'),
  addEnvironment: document.getElementById('add-environment'),
  compareButton: document.getElementById('compare-button'),
  demoButton: document.getElementById('demo-button'),
  clearImport: document.getElementById('clear-import'),
  importStatus: document.getElementById('import-status'),
  emptyAsAbsent: document.getElementById('empty-as-absent'),
  emptyAsAbsentToggle: document.getElementById('empty-as-absent-toggle'),
  ignoredFieldsOptions: document.getElementById('ignored-fields-options'),
  ignoredFieldsCount: document.getElementById('ignored-fields-count'),
  ignoredFieldsClear: document.getElementById('ignored-fields-clear'),
  forgetButton: document.getElementById('forget-button'),
  themeToggle: document.getElementById('theme-toggle'),
  summary: document.getElementById('summary'),
  resourceSearch: document.getElementById('resource-search'),
  resourceStatus: document.getElementById('resource-status'),
  resourceVh: document.getElementById('resource-vh'),
  resourceCount: document.getElementById('resource-count'),
  exportResources: document.getElementById('export-resources'),
  resourceTable: document.getElementById('resource-table'),
  resourcePagination: document.getElementById('resource-pagination'),
  resourceDetail: document.getElementById('resource-detail'),
  resourceSplit: document.querySelector('.workspace-split'),
  aclSearch: document.getElementById('acl-search'),
  aclEnvironment: document.getElementById('acl-environment'),
  aclResource: document.getElementById('acl-resource'),
  aclVh: document.getElementById('acl-vh'),
  aclService: document.getElementById('acl-service'),
  aclSource: document.getElementById('acl-source'),
  aclAuth: document.getElementById('acl-auth'),
  aclEncryption: document.getElementById('acl-encryption'),
  aclDeny: document.getElementById('acl-deny'),
  aclClear: document.getElementById('acl-clear'),
  aclCount: document.getElementById('acl-count'),
  exportFormat: document.getElementById('export-format'),
  exportAll: document.getElementById('export-all'),
  exportFiltered: document.getElementById('export-filtered'),
  aclTable: document.getElementById('acl-table'),
  aclPagination: document.getElementById('acl-pagination'),
  aclSplit: document.getElementById('acl-split'),
  aclDetail: document.getElementById('acl-detail'),
  aclColumnPicker: document.getElementById('acl-column-picker'),
  aclColumnOptions: document.getElementById('acl-column-options'),
  aclColumnCount: document.getElementById('acl-column-count'),
  aclColumnsAll: document.getElementById('acl-columns-all'),
  aclColumnsReset: document.getElementById('acl-columns-reset'),
  exportVisibleColumns: document.getElementById('export-visible-columns'),
  schemaContent: document.getElementById('schema-content'),
  tabs: [...document.querySelectorAll('.tab')],
  views: {
    resources: document.getElementById('resources-view'),
    acl: document.getElementById('acl-view'),
    schema: document.getElementById('schema-view'),
    security: document.getElementById('security-view'),
  },
};

function createEnvironment() {
  const id = state.nextEnvironmentId;
  state.nextEnvironmentId += 1;
  return { id, name: `Environment ${id}`, files: [] };
}

function el(tag, options = {}, ...children) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = String(options.text);
  if (options.title !== undefined) node.title = String(options.title);
  if (options.type) node.type = options.type;
  if (options.multiple !== undefined) node.multiple = Boolean(options.multiple);
  if (options.value !== undefined) node.value = options.value;
  if (options.placeholder !== undefined) node.placeholder = options.placeholder;
  if (options.disabled !== undefined) node.disabled = Boolean(options.disabled);
  if (options.checked !== undefined) node.checked = Boolean(options.checked);
  if (options.id) node.id = options.id;
  if (options.role) node.setAttribute('role', options.role);
  if (options.tabIndex !== undefined) node.tabIndex = options.tabIndex;
  if (options.ariaLabel) node.setAttribute('aria-label', options.ariaLabel);
  if (options.dataset) {
    for (const [key, value] of Object.entries(options.dataset)) node.dataset[key] = value;
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function formatFileSize(size) {
  if (!Number.isFinite(size) || size <= 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(value ?? 0);
}

function statusPill(status, label) {
  const text = label || {
    same: 'Same',
    different: 'Different',
    missing: 'Missing',
    ignored: 'Ignored',
    present: 'Present',
    unknown: 'Unknown',
  }[status] || status;
  return el('span', { className: `status-pill ${status}`, text });
}

function badge(text, kind = '') {
  return el('span', { className: `badge${kind ? ` ${kind}` : ''}`, text });
}

function resourceStatusPill(status) {
  if (state.result?.environments.length === 1 && status === 'same') {
    return statusPill('loaded', 'Loaded');
  }
  return statusPill(status);
}

function rowStatusPill(status) {
  if (state.result?.environments.length === 1 && status === 'same') {
    return statusPill('loaded', 'Present');
  }
  return statusPill(status);
}

function setStatus(message, kind = '') {
  dom.importStatus.textContent = message;
  dom.importStatus.className = `status-text${kind ? ` is-${kind}` : ''}`;
}

function toast(message, kind = '') {
  const node = el('div', { className: `toast${kind ? ` ${kind}` : ''}`, text: message });
  document.body.append(node);
  window.setTimeout(() => node.remove(), 4200);
}

function debounce(callback, delay = 160) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  };
}

function initWorker() {
  if (state.worker) state.worker.terminate();
  state.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  state.worker.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'result') {
      state.result = message.result;
      state.loading = false;
      dom.compareButton.disabled = false;
      if (!state.aclColumnsCustomized) {
        state.aclVisibleColumns = screenDefaultColumns();
      }
      const environmentCount = message.result.stats.environments;
      setStatus(
        environmentCount === 1
          ? 'Opened 1 configuration. ACL browsing and export are ready.'
          : `Compared ${formatNumber(environmentCount)} environments.`,
        'ok',
      );
      showWorkspace();
      state.view = 'resources';
      if (location.hash !== '#/resources') location.hash = '#/resources';
      renderWorkspace();
      return;
    }
    if (message.type === 'error') {
      state.loading = false;
      dom.compareButton.disabled = false;
      setStatus(message.message || 'Could not parse the files.', 'error');
      toast(message.message || 'Could not parse the files.', 'error');
    }
  });
  state.worker.addEventListener('error', (event) => {
    state.loading = false;
    dom.compareButton.disabled = false;
    setStatus('The parser worker failed.', 'error');
    toast(event.message || 'The parser worker failed.', 'error');
  });
}

function showImport() {
  dom.importView.hidden = false;
  dom.workspace.hidden = true;
  dom.forgetButton.hidden = true;
  if (location.hash !== '#/import') location.hash = '#/import';
}

function showWorkspace() {
  dom.importView.hidden = true;
  dom.workspace.hidden = false;
  dom.forgetButton.hidden = false;
}

function setView(view) {
  if (!state.result && view !== 'security') return;
  state.view = view;
  for (const tab of dom.tabs) {
    tab.classList.toggle('is-active', tab.dataset.view === view);
    tab.setAttribute('aria-selected', tab.dataset.view === view ? 'true' : 'false');
  }
  for (const [name, node] of Object.entries(dom.views)) {
    node.hidden = name !== view;
  }
  if (view === 'resources') renderResources();
  if (view === 'acl') renderAcl();
  if (view === 'schema') renderSchema();
}

function renderWorkspace() {
  if (!state.result) return;
  renderSummary();
  setView(state.view || 'resources');
}

function renderSummary() {
  clear(dom.summary);
  const stats = state.result.stats;
  const cards = [
    ['Environments', stats.environments, 'loaded in this tab'],
    ['Resources', stats.resources, 'across all environments'],
    ['Different', stats.different, 'resources with changes'],
    ['Missing', stats.missing, 'not present everywhere'],
    ['ACL rules', stats.aclRules, 'from both sources'],
    ['Schema drift', stats.schemaDrift, 'sections not shared'],
  ];

  for (const [label, value, hint] of cards) {
    dom.summary.append(
      el('div', { className: 'summary-card' },
        el('span', { className: 'summary-card-label', text: label }),
        el('strong', { text: formatNumber(value) }),
        el('small', { text: hint }),
      ),
    );
  }

  const chips = el('div', { className: 'summary-environments' });
  for (const environment of state.result.environments) {
    const server = environment.server || {};
    const detail = [server.defaulthostname, server.repo ? `repo ${server.repo}` : ''].filter(Boolean).join(' · ');
    chips.append(
      el('div', { className: 'environment-chip' },
        el('strong', { text: environment.name }),
        el('span', { text: detail || `${environment.files.length} file(s)` }),
      ),
    );
  }
  dom.summary.append(chips);

  if (state.result.environments.length === 1) {
    dom.summary.append(
      el('div', { className: 'single-banner' },
        el('strong', { text: 'Single-file mode' }),
        el('span', { text: 'ACL browsing and export are active. Add a second environment to compare resources.' }),
      ),
    );
  }
}

function renderImport() {
  clear(dom.environmentCards);
  state.environments.forEach((environment, index) => {
    const card = el('article', { className: 'environment-card' });
    const fileInputId = `environment-file-${environment.id}`;
    const fileInput = el('input', {
      id: fileInputId,
      type: 'file',
      multiple: true,
      className: 'sr-only',
    });

    fileInput.addEventListener('change', () => {
      addFiles(environment.id, fileInput.files);
      fileInput.value = '';
    });

    const dropZone = el('div', { className: 'drop-zone', role: 'button', tabIndex: 0 },
      el('div', {},
        el('strong', { text: 'Drop config files here' }),
        el('span', { text: 'or click to choose one or more files' }),
      ),
    );
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        fileInput.click();
      }
    });
    dropZone.addEventListener('dragover', (event) => {
      event.preventDefault();
      dropZone.classList.add('is-over');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('is-over'));
    dropZone.addEventListener('drop', (event) => {
      event.preventDefault();
      dropZone.classList.remove('is-over');
      addFiles(environment.id, event.dataTransfer.files);
    });

    const nameInput = el('input', {
      type: 'text',
      value: environment.name,
      placeholder: `Environment ${index + 1}`,
      ariaLabel: `Name for environment ${index + 1}`,
    });
    nameInput.addEventListener('input', () => {
      environment.name = nameInput.value;
    });

    const removeButton = el('button', { className: 'button ghost danger', type: 'button', text: 'Remove' });
    removeButton.disabled = state.environments.length <= 1;
    removeButton.addEventListener('click', () => {
      state.environments = state.environments.filter((item) => item.id !== environment.id);
      renderImport();
    });

    const fileList = el('div', { className: 'file-list' });
    if (environment.files.length) {
      for (const item of environment.files) {
        const removeFile = el('button', { className: 'link-button', type: 'button', text: 'remove' });
        removeFile.addEventListener('click', () => {
          environment.files = environment.files.filter((file) => file !== item);
          renderImport();
        });
        fileList.append(
          el('div', { className: 'file-item' },
            el('span', { className: 'file-item-name', text: item.name, title: item.name }),
            el('span', { className: 'file-item-size', text: formatFileSize(item.size) }),
            removeFile,
          ),
        );
      }
    } else {
      fileList.append(el('span', { className: 'status-text', text: 'No files added yet.' }));
    }

    card.append(
      el('div', { className: 'environment-card-header' },
        el('h3', { text: `Environment ${index + 1}` }),
        removeButton,
      ),
      el('label', { className: 'field' },
        el('span', { text: 'Display name' }),
        nameInput,
      ),
      dropZone,
      fileInput,
      fileList,
    );
    dom.environmentCards.append(card);
  });

  dom.addEnvironment.disabled = state.environments.length >= 5;
  dom.compareButton.disabled = state.loading;
  dom.emptyAsAbsent.checked = state.emptyAsAbsent;
  dom.emptyAsAbsentToggle.checked = state.emptyAsAbsent;
}

function addFiles(environmentId, fileList) {
  const environment = state.environments.find((item) => item.id === environmentId);
  if (!environment) return;

  const rejected = [];
  for (const file of [...fileList]) {
    if (/\.bup$/i.test(file.name)) {
      rejected.push(file.name);
      continue;
    }
    const duplicate = environment.files.some((item) => item.name === file.name && item.size === file.size);
    if (!duplicate) {
      environment.files.push({ file, name: file.name, size: file.size });
    }
  }

  if (rejected.length) {
    const message = `Backup file${rejected.length === 1 ? '' : 's'} not supported: ${rejected.join(', ')}. This tool does not decrypt .bup backups. Extract the plain-text config first.`;
    setStatus(message, 'error');
    toast(message, 'error');
  }

  renderImport();
}

function requestRecompare() {
  if (!state.result || !state.worker) return;
  state.worker.postMessage({
    type: 'recompare',
    emptyAsAbsent: state.emptyAsAbsent,
    ignoredFields: [...state.ignoredFields.keys()],
  });
}

function compareEnvironments() {
  if (state.loading) return;
  const active = state.environments.filter((environment) => environment.files.length > 0);
  if (!active.length) {
    setStatus('Add at least one config file.', 'error');
    return;
  }

  state.loading = true;
  state.ignoredFields = new Map();
  dom.compareButton.disabled = true;
  setStatus(active.length === 1 ? 'Opening the configuration in the browser…' : 'Parsing files in the browser…', '');

  state.worker.postMessage({
    type: 'analyze',
    emptyAsAbsent: state.emptyAsAbsent,
    ignoredFields: [],
    environments: active.map((environment) => ({
      id: environment.id,
      name: environment.name.trim() || `Environment ${environment.id}`,
      files: environment.files.map((item) => (
        item.file
          ? { name: item.name, file: item.file }
          : { name: item.name, text: item.text }
      )),
    })),
  });
}

function loadDemo() {
  state.environments = DEMO_ENVIRONMENTS.map((environment, index) => ({
    id: index + 1,
    name: environment.name,
    files: environment.files.map((file) => ({ name: file.name, size: file.text.length, text: file.text })),
  }));
  state.nextEnvironmentId = state.environments.length + 1;
  renderImport();
  setStatus('Demo loaded. Click Open / compare.', 'ok');
}

function clearImport() {
  if (state.result) {
    resetApplication();
    return;
  }
  state.environments = [createEnvironment(), createEnvironment()];
  renderImport();
  setStatus('', '');
}

function resetApplication() {
  if (state.worker) state.worker.postMessage({ type: 'reset' });
  state.result = null;
  state.selectedResource = null;
  state.selectedAclId = null;
  state.resourcePage = 1;
  state.aclPage = 1;
  state.aclVisibleColumns = new Set();
  state.aclColumnsCustomized = false;
  state.exportVisibleColumns = false;
  state.ignoredFields = new Map();
  state.environments = [createEnvironment(), createEnvironment()];
  renderImport();
  showImport();
  setStatus('', '');
}

function setFieldIgnored(path, label, ignored) {
  if (ignored) state.ignoredFields.set(path, label);
  else state.ignoredFields.delete(path);
  renderIgnoredFieldOptions();
  requestRecompare();
  toast(
    ignored
      ? `Ignoring ${label} in every resource for this comparison.`
      : `Comparing ${label} again in every resource.`,
    'ok',
  );
}

function renderIgnoredFieldOptions() {
  clear(dom.ignoredFieldsOptions);
  const entries = [...state.ignoredFields.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  dom.ignoredFieldsCount.textContent = String(entries.length);
  dom.ignoredFieldsClear.disabled = entries.length === 0;
  if (!entries.length) {
    dom.ignoredFieldsOptions.append(
      el('p', { className: 'status-text', text: 'No fields are excluded. Use the Ignore checkbox on any compared field to exclude it from every resource.' }),
    );
    return;
  }
  for (const [path, label] of entries) {
    const remove = el('button', {
      className: 'link-button',
      type: 'button',
      text: 'compare again',
      ariaLabel: `Compare ${label} again in every resource`,
    });
    remove.addEventListener('click', () => setFieldIgnored(path, label, false));
    dom.ignoredFieldsOptions.append(
      el('div', { className: 'ignored-field-item' },
        el('div', { className: 'ignored-field-copy' },
          el('strong', { text: label }),
          el('span', { className: 'ignored-field-path mono', text: path, title: path }),
        ),
        remove,
      ),
    );
  }
}

function renderResourceVhOptions() {
  const names = [...new Set(state.result.resources.map((resource) => resource.vhName).filter(Boolean))].sort();
  const current = dom.resourceVh.value || state.resourceVh;
  clear(dom.resourceVh);
  dom.resourceVh.add(new Option('All virtual hosts', 'all'));
  for (const name of names) dom.resourceVh.add(new Option(name, name));
  dom.resourceVh.value = names.includes(current) ? current : 'all';
  state.resourceVh = dom.resourceVh.value;
}

function filteredResources() {
  const search = state.resourceSearch.trim().toLowerCase();
  return state.result.resources.filter((resource) => {
    if (state.resourceStatus !== 'all' && resource.status !== state.resourceStatus) return false;
    if (state.resourceVh !== 'all' && resource.vhName !== state.resourceVh) return false;
    if (!search) return true;
    const haystack = [
      resource.name,
      resource.vhName,
      resource.type,
      ...(resource.addresses || []),
      ...(resource.ports || []),
    ].join(' ').toLowerCase();
    return haystack.includes(search);
  });
}

function renderResources() {
  if (!state.result) return;
  renderResourceVhOptions();
  renderIgnoredFieldOptions();
  const resources = filteredResources();
  const totalPages = Math.max(1, Math.ceil(resources.length / RESOURCE_PAGE_SIZE));
  state.resourcePage = Math.min(Math.max(1, state.resourcePage), totalPages);
  const start = (state.resourcePage - 1) * RESOURCE_PAGE_SIZE;
  const pageItems = resources.slice(start, start + RESOURCE_PAGE_SIZE);

  dom.resourceCount.textContent = `${formatNumber(resources.length)} of ${formatNumber(state.result.resources.length)} resources`;
  dom.resourceSearch.value = state.resourceSearch;
  dom.resourceStatus.value = state.resourceStatus;

  clear(dom.resourceTable);
  if (!pageItems.length) {
    dom.resourceTable.append(
      el('div', { className: 'empty-state' },
        el('strong', { text: 'No resources match the filters.' }),
        el('span', { text: 'Try clearing the search or selecting a different status.' }),
      ),
    );
  } else {
    const table = el('table');
    const thead = el('thead');
    const headerRow = el('tr');
    for (const label of ['Resource', 'Virtual host', 'Type', 'Addresses', 'Ports', 'ACLs', 'Menu', 'Status', 'Differences']) {
      headerRow.append(el('th', { text: label }));
    }
    thead.append(headerRow);
    const tbody = el('tbody');

    for (const resource of pageItems) {
      const row = el('tr', {
        className: `resource-row${state.selectedResource === resource.name ? ' is-selected' : ''}`,
        tabIndex: 0,
        role: 'button',
        ariaLabel: `Open resource ${resource.name}`,
      });
      row.append(
        el('td', {}, el('strong', { text: resource.name })),
        el('td', { className: 'muted', text: resource.vhName || 'Global' }),
        el('td', { className: 'mono', text: resource.type || '—' }),
        el('td', { className: 'mono', text: (resource.addresses || []).join(', ') || '—' }),
        el('td', { className: 'mono', text: (resource.ports || []).join(', ') || '—' }),
        el('td', { className: 'mono', text: formatNumber(resource.counts.aclTotal) }),
        el('td', { className: 'mono', text: formatNumber(resource.counts.menu) }),
        el('td', {}, resourceStatusPill(resource.status)),
        el('td', { className: 'mono', text: formatNumber(resource.diffCount) }),
      );
      const open = () => {
        state.selectedResource = resource.name;
        state.detailShowAll = false;
        renderResources();
      };
      row.addEventListener('click', open);
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      });
      tbody.append(row);
    }
    table.append(thead, tbody);
    dom.resourceTable.append(table);
  }

  renderPagination(dom.resourcePagination, state.resourcePage, totalPages, (page) => {
    state.resourcePage = page;
    renderResources();
  });

  renderResourceDetail();
}

function renderPagination(container, page, totalPages, onChange) {
  clear(container);
  if (totalPages <= 1) return;
  const actions = el('div', { className: 'pagination-actions' });
  const previous = el('button', { type: 'button', text: 'Previous', disabled: page <= 1 });
  const next = el('button', { type: 'button', text: 'Next', disabled: page >= totalPages });
  previous.addEventListener('click', () => onChange(page - 1));
  next.addEventListener('click', () => onChange(page + 1));
  actions.append(previous, next);
  container.append(
    el('span', { text: `Page ${page} of ${totalPages}` }),
    actions,
  );
}

function renderResourceDetail() {
  const resource = state.result.resources.find((item) => item.name === state.selectedResource);
  clear(dom.resourceDetail);
  if (!resource) {
    dom.resourceDetail.hidden = true;
    dom.resourceSplit.classList.remove('has-detail');
    return;
  }

  dom.resourceDetail.hidden = false;
  dom.resourceSplit.classList.add('has-detail');

  const close = el('button', { className: 'icon-button', type: 'button', text: 'Close', ariaLabel: 'Close resource detail' });
  close.addEventListener('click', () => {
    state.selectedResource = null;
    renderResources();
  });

  const toggle = el('input', { type: 'checkbox', checked: state.detailShowAll });
  toggle.addEventListener('change', () => {
    state.detailShowAll = toggle.checked;
    renderResourceDetail();
  });

  const ignoredSuffix = resource.ignoredCount
    ? ` · ${formatNumber(resource.ignoredCount)} ignored globally`
    : '';

  dom.resourceDetail.append(
    el('div', { className: 'detail-header' },
      el('div', {},
        el('h3', { text: resource.name }),
        el('p', { text: `${resource.vhName || 'Global'} · ${resource.type || 'no type'} · ${formatNumber(resource.counts.aclTotal)} ACL rules` }),
      ),
      close,
    ),
    el('div', { className: 'detail-body' },
      el('div', { className: 'detail-section' },
        el('div', { className: 'toolbar' },
          resourceStatusPill(resource.status),
          el('label', { className: 'inline-check' }, toggle, 'Show all fields'),
          el('span', { className: 'status-text', text: `${formatNumber(resource.diffCount)} differences${ignoredSuffix}` }),
        ),
      ),
    ),
  );

  const body = dom.resourceDetail.querySelector('.detail-body');
  const rows = resource.rows.filter((row) => state.detailShowAll || (!row.ignored && row.status !== 'same'));
  if (!rows.length) {
    let text = 'No differences in this resource. Turn on “Show all fields” to inspect every compared value.';
    if (state.result.environments.length === 1) {
      text = 'Single-file mode: turn on “Show all fields” to inspect every value.';
    } else if (resource.ignoredCount) {
      text = `${formatNumber(resource.ignoredCount)} field(s) are ignored globally for this comparison. Use “Ignored fields” in the toolbar or turn on “Show all fields” to review them.`;
    }
    body.append(el('div', { className: 'detail-empty', text }));
  } else {
    const groups = new Map();
    for (const row of rows) {
      if (!groups.has(row.group)) groups.set(row.group, []);
      groups.get(row.group).push(row);
    }
    const environmentNames = state.result.environments.map((environment) => environment.name);
    for (const [group, groupRows] of groups) {
      const table = el('table', { className: 'detail-table' });
      const thead = el('thead');
      const header = el('tr');
      header.append(el('th', { text: 'Field' }));
      for (const name of environmentNames) header.append(el('th', { text: name }));
      header.append(
        el('th', { text: 'Status' }),
        el('th', { text: 'Ignore', title: 'Exclude this field from every resource in this comparison' }),
      );
      thead.append(header);
      const tbody = el('tbody');
      for (const row of groupRows) {
        const tr = el('tr', { className: row.ignored ? 'is-ignored' : '' });
        const label = el('td', {});
        label.append(el('span', { text: row.label }));
        if (row.isSecret) label.append(document.createTextNode(' '), badge('secret', 'violet'));
        tr.append(label);
        for (const value of row.values) {
          tr.append(el('td', { className: 'mono', text: value, title: value }));
        }
        tr.append(el('td', {}, row.ignored ? statusPill('ignored', 'Ignored') : rowStatusPill(row.status)));
        const ignoreCheck = el('input', {
          type: 'checkbox',
          checked: row.ignored,
          ariaLabel: `Ignore ${row.label} in every resource`,
        });
        ignoreCheck.addEventListener('change', () => {
          setFieldIgnored(row.path, row.label, ignoreCheck.checked);
        });
        tr.append(
          el('td', { className: 'ignore-cell' },
            el('label', {
              className: 'ignore-check',
              title: 'Exclude this field from every resource in this comparison',
            }, ignoreCheck),
          ),
        );
        tbody.append(tr);
      }
      table.append(thead, tbody);
      body.append(
        el('div', { className: 'detail-section' },
          el('h4', { text: group }),
          table,
        ),
      );
    }
  }

  const aclButton = el('button', { className: 'button ghost', type: 'button', text: 'View ACL rules for this resource' });
  aclButton.addEventListener('click', () => {
    state.aclResource = resource.name;
    state.aclPage = 1;
    location.hash = '#/acl';
    setView('acl');
  });
  body.append(el('div', { className: 'detail-section' }, aclButton));
}

function setSelectOptions(select, items, allLabel, currentValue) {
  const previous = currentValue ?? select.value;
  clear(select);
  select.add(new Option(allLabel, 'all'));
  for (const item of items) select.add(new Option(item.label, item.value));
  select.value = [...select.options].some((option) => option.value === previous) ? previous : 'all';
  return select.value;
}

function renderAclFilterOptions() {
  const records = state.result.aclRules;
  state.aclEnvironment = setSelectOptions(
    dom.aclEnvironment,
    state.result.environments.map((environment) => ({ label: environment.name, value: String(environment.id) })),
    'All environments',
    state.aclEnvironment,
  );
  state.aclResource = setSelectOptions(
    dom.aclResource,
    [...new Set(records.map((record) => record.resource))].sort().map((value) => ({ label: value, value })),
    'All resources',
    state.aclResource,
  );
  state.aclVh = setSelectOptions(
    dom.aclVh,
    [...new Set(records.map((record) => record.vhName))].sort().map((value) => ({ label: value, value })),
    'All virtual hosts',
    state.aclVh,
  );
  state.aclService = setSelectOptions(
    dom.aclService,
    [...new Set(records.map((record) => record.localService))].filter(Boolean).sort().map((value) => ({ label: value, value })),
    'All services',
    state.aclService,
  );
  state.aclAuth = setSelectOptions(
    dom.aclAuth,
    [...new Set(records.map((record) => record.authMethod))].filter(Boolean).sort().map((value) => ({ label: value, value })),
    'All methods',
    state.aclAuth,
  );
  state.aclEncryption = setSelectOptions(
    dom.aclEncryption,
    [...new Set(records.map((record) => record.encryption))].filter(Boolean).sort().map((value) => ({ label: value, value })),
    'All levels',
    state.aclEncryption,
  );
  dom.aclSource.value = state.aclSource;
  dom.aclDeny.value = state.aclDeny;
}

function aclHaystack(record) {
  return [
    record.environmentName,
    record.resource,
    record.localService,
    record.resourceType,
    record.vhName,
    record.group,
    record.authMethod,
    record.encryption,
    record.path,
    record.ipAddress,
    record.behaviorMetrics,
    record.extra ? JSON.stringify(record.extra) : '',
  ].join(' ').toLowerCase();
}

function filteredAclRecords() {
  const search = state.aclSearch.trim().toLowerCase();
  return state.result.aclRules.filter((record) => {
    if (state.aclEnvironment !== 'all' && String(record.environmentId) !== state.aclEnvironment) return false;
    if (state.aclResource !== 'all' && record.resource !== state.aclResource) return false;
    if (state.aclVh !== 'all' && record.vhName !== state.aclVh) return false;
    if (state.aclService !== 'all' && record.localService !== state.aclService) return false;
    if (state.aclSource !== 'all' && record.source !== state.aclSource) return false;
    if (state.aclAuth !== 'all' && record.authMethod !== state.aclAuth) return false;
    if (state.aclEncryption !== 'all' && record.encryption !== state.aclEncryption) return false;
    if (state.aclDeny === 'yes' && record.deny !== true) return false;
    if (state.aclDeny === 'no' && record.deny === true) return false;
    if (search && !aclHaystack(record).includes(search)) return false;
    return true;
  });
}

function formatAclCell(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(safeDecode(value));
}

function screenDefaultColumns() {
  const singleEnvironment = state.result?.environments.length === 1;
  const all = ACL_COLUMNS.map((column) => column.key);
  const omitSingleEnvironment = (keys) => keys.filter((key) => !(singleEnvironment && key === 'environmentName'));

  if (window.innerWidth >= 1500) {
    return new Set(omitSingleEnvironment(all));
  }

  if (window.innerWidth >= 1000) {
    return new Set(omitSingleEnvironment([
      'environmentName',
      'resource',
      'localService',
      'authMethod',
      'path',
      'ipAddress',
      'encryption',
      'group',
      'vhName',
      'source',
      'ruleIndex',
      'deny',
      'disabled',
    ]));
  }

  return new Set(omitSingleEnvironment([
    'environmentName',
    'resource',
    'localService',
    'authMethod',
    'group',
    'path',
    'ipAddress',
    'source',
    'deny',
  ]));
}

function visibleAclColumns() {
  return ACL_COLUMNS.filter((column) => state.aclVisibleColumns.has(column.key));
}

function renderAclColumnOptions() {
  clear(dom.aclColumnOptions);
  for (const column of ACL_COLUMNS) {
    const checkbox = el('input', {
      type: 'checkbox',
      checked: state.aclVisibleColumns.has(column.key),
      value: column.key,
    });
    checkbox.addEventListener('change', () => {
      if (!checkbox.checked && state.aclVisibleColumns.size <= 1) {
        checkbox.checked = true;
        toast('Keep at least one ACL column visible.', 'error');
        return;
      }
      if (checkbox.checked) state.aclVisibleColumns.add(column.key);
      else state.aclVisibleColumns.delete(column.key);
      state.aclColumnsCustomized = true;
      renderAcl();
    });
    dom.aclColumnOptions.append(
      el('label', { className: 'column-option' }, checkbox, el('span', { text: column.label })),
    );
  }
  dom.aclColumnCount.textContent = `${state.aclVisibleColumns.size}/${ACL_COLUMNS.length}`;
  dom.exportVisibleColumns.checked = state.exportVisibleColumns;
}

function renderAcl() {
  if (!state.result) return;
  if (!state.aclVisibleColumns.size) state.aclVisibleColumns = screenDefaultColumns();
  const columns = visibleAclColumns();
  renderAclFilterOptions();
  renderAclColumnOptions();
  const records = filteredAclRecords();
  const totalPages = Math.max(1, Math.ceil(records.length / ACL_PAGE_SIZE));
  state.aclPage = Math.min(Math.max(1, state.aclPage), totalPages);
  const start = (state.aclPage - 1) * ACL_PAGE_SIZE;
  const pageItems = records.slice(start, start + ACL_PAGE_SIZE);

  dom.aclSearch.value = state.aclSearch;
  dom.aclCount.textContent = `${formatNumber(records.length)} of ${formatNumber(state.result.aclRules.length)} rules · ${formatNumber(new Set(records.map((record) => record.resource)).size)} resources`;

  clear(dom.aclTable);
  if (!pageItems.length) {
    dom.aclTable.append(
      el('div', { className: 'empty-state' },
        el('strong', { text: 'No ACL rules match the filters.' }),
        el('span', { text: 'Clear the filters or choose a different environment.' }),
      ),
    );
  } else {
    const table = el('table');
    const thead = el('thead');
    const header = el('tr');
    for (const column of columns) header.append(el('th', { text: column.label }));
    thead.append(header);
    const tbody = el('tbody');

    for (const record of pageItems) {
      const selected = state.selectedAclId === record.id;
      const tr = el('tr', {
        className: `acl-row${selected ? ' is-selected' : ''}`,
        tabIndex: 0,
        role: 'button',
        ariaLabel: `Open ACL detail for ${record.resource} rule ${record.ruleIndex}`,
      });
      for (const column of columns) {
        let value;
        if (column.key === 'extra') {
          value = record.extra && Object.keys(record.extra).length ? JSON.stringify(record.extra) : '';
        } else {
          value = record[column.key];
        }
        const formatted = formatAclCell(value);
        const cell = el('td', {
          text: formatted,
          title: formatted,
          className: column.key === 'group' || column.key === 'path' || column.key === 'extra' ? 'acl-long' : '',
        });
        if (column.key === 'source') {
          cell.textContent = '';
          const sourceButton = el('button', {
            className: `badge ${record.source === 'ACL' ? 'accent' : 'violet'}`,
            type: 'button',
            text: record.source === 'ACL' ? 'ACL table' : 'Detailed',
            ariaLabel: `Open details for ${record.resource} rule ${record.ruleIndex}`,
          });
          sourceButton.addEventListener('click', (event) => {
            event.stopPropagation();
            state.selectedAclId = record.id;
            renderAcl();
          });
          cell.append(sourceButton);
        }
        tr.append(cell);
      }

      const openDetail = () => {
        state.selectedAclId = record.id;
        renderAcl();
      };
      tr.addEventListener('click', openDetail);
      tr.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openDetail();
        }
      });
      tbody.append(tr);
    }
    table.append(thead, tbody);
    dom.aclTable.append(table);
  }

  renderPagination(dom.aclPagination, state.aclPage, totalPages, (page) => {
    state.aclPage = page;
    renderAcl();
  });
  renderAclDetail();
}

function aclSourceLabel(source) {
  return source === 'ACL' ? 'ACL table' : 'Access control list';
}

function renderAclDetail() {
  const record = state.result.aclRules.find((item) => item.id === state.selectedAclId);
  clear(dom.aclDetail);
  if (!record) {
    dom.aclDetail.hidden = true;
    dom.aclSplit.classList.remove('has-detail');
    return;
  }

  dom.aclDetail.hidden = false;
  dom.aclSplit.classList.add('has-detail');

  const close = el('button', { className: 'icon-button', type: 'button', text: 'Close', ariaLabel: 'Close ACL rule detail' });
  close.addEventListener('click', () => {
    state.selectedAclId = null;
    renderAcl();
  });

  const fields = [
    ['Environment', record.environmentName],
    ['Resource', record.resource],
    ['Local service', record.localService],
    ['Resource type', record.resourceType],
    ['Virtual host', record.vhName],
    ['Source', aclSourceLabel(record.source)],
    ['Rule #', record.ruleIndex],
    ['Entry #', record.entryIndex],
    ['Group', record.group],
    ['Auth method', record.authMethod],
    ['Encryption', record.encryption],
    ['Path', record.path],
    ['SSO', record.sso],
    ['IP address', record.ipAddress],
    ['Deny', record.deny],
    ['Disabled', record.disabled],
    ['Behaviour metrics', record.behaviorMetrics],
    ['Time', record.time],
  ];

  const table = el('table', { className: 'detail-table' });
  const thead = el('thead');
  const header = el('tr', {}, el('th', { text: 'Field' }), el('th', { text: 'Value' }));
  thead.append(header);
  const tbody = el('tbody');
  for (const [label, value] of fields) {
    const formatted = formatAclCell(value);
    tbody.append(
      el('tr', {},
        el('td', { text: label }),
        el('td', { className: 'mono', text: formatted, title: formatted }),
      ),
    );
  }
  table.append(thead, tbody);

  dom.aclDetail.append(
    el('div', { className: 'detail-header' },
      el('div', {},
        el('h3', { text: `${record.resource}${record.localService ? ` · ${record.localService}` : ''}` }),
        el('p', { text: `${record.environmentName} · ${aclSourceLabel(record.source)} · rule ${record.ruleIndex}` }),
      ),
      close,
    ),
    el('div', { className: 'detail-body' },
      el('div', { className: 'detail-section' },
        el('h4', { text: 'Rule fields' }),
        table,
      ),
    ),
  );

  const extraEntries = Object.entries(record.extra || {});
  if (extraEntries.length) {
    const extraTable = el('table', { className: 'detail-table' });
    const extraHead = el('thead');
    extraHead.append(el('tr', {}, el('th', { text: 'Additional field' }), el('th', { text: 'Value' })));
    const extraBody = el('tbody');
    for (const [key, value] of extraEntries) {
      const formatted = formatAclCell(value);
      extraBody.append(
        el('tr', {},
          el('td', { className: 'mono', text: key }),
          el('td', { className: 'mono', text: formatted, title: formatted }),
        ),
      );
    }
    extraTable.append(extraHead, extraBody);
    dom.aclDetail.querySelector('.detail-body').append(
      el('div', { className: 'detail-section' },
        el('h4', { text: 'Additional fields' }),
        extraTable,
      ),
    );
  }
}

function currentAclFilters(scope) {
  return {
    scope,
    environment: state.aclEnvironment === 'all' ? 'All' : dom.aclEnvironment.selectedOptions[0]?.textContent || state.aclEnvironment,
    resource: state.aclResource === 'all' ? 'All' : state.aclResource,
    virtualHost: state.aclVh === 'all' ? 'All' : state.aclVh,
    service: state.aclService === 'all' ? 'All' : state.aclService,
    source: state.aclSource === 'all' ? 'Both' : state.aclSource,
    authMethod: state.aclAuth === 'all' ? 'All' : state.aclAuth,
    encryption: state.aclEncryption === 'all' ? 'All' : state.aclEncryption,
    deny: state.aclDeny === 'all' ? 'All' : state.aclDeny,
    search: state.aclSearch,
  };
}

function exportResourcesCsv() {
  if (!state.result) return;
  const csv = toResourceCsv(state.result.resources, state.result.environments);
  downloadText(`onegate-resources-${timestampSlug()}.csv`, csv, 'text/csv;charset=utf-8');
  toast(`Exported ${formatNumber(state.result.resources.length)} resources. The CSV contains internal addresses and resource names.`, 'ok');
}

function exportAcl(scope) {
  if (!state.result) return;
  const records = scope === 'all' ? state.result.aclRules : filteredAclRecords();
  const format = dom.exportFormat.value;
  const columns = state.exportVisibleColumns ? visibleAclColumns() : ACL_COLUMNS;
  const context = {
    generatedAt: state.result.generatedAt,
    environments: state.result.environments.map((environment) => environment.name),
    filters: currentAclFilters(scope),
    columns: state.exportVisibleColumns ? 'visible' : 'all',
  };
  const base = `onegate-acl-${scope}-${timestampSlug()}`;
  if (format === 'html') {
    downloadText(`${base}.html`, toHtml(records, context, columns), 'text/html;charset=utf-8');
  } else if (format === 'json') {
    downloadText(`${base}.json`, toJson(records, context, columns), 'application/json;charset=utf-8');
  } else {
    downloadText(`${base}.csv`, toCsv(records, columns), 'text/csv;charset=utf-8');
  }
  toast(`Exported ${formatNumber(records.length)} ACL rules (${format.toUpperCase()}). Treat the file as sensitive.`, 'ok');
}

function renderSchema() {
  if (!state.result) return;
  clear(dom.schemaContent);
  const schema = state.result.schema;

  const cards = el('div', { className: 'schema-grid' });
  cards.append(
    el('div', { className: `schema-card${schema.driftCount ? ' warning' : ''}` },
      el('h3', { text: 'Shared section set' }),
      el('p', { text: schema.driftCount
        ? `${schema.driftCount} section(s) are missing from at least one environment. That may be version drift rather than a configuration difference.`
        : 'Every parsed environment contains the same section names.' }),
    ),
    el('div', { className: 'schema-card' },
      el('h3', { text: 'Unknown sections' }),
      el('p', { text: schema.unknownSections.length
        ? `${schema.unknownSections.length} section(s) are not in the current schema registry. They are preserved as schema drift, not parsed as resource data.`
        : 'No unknown sections found.' }),
    ),
    el('div', { className: `schema-card${schema.parseErrors.length ? ' error' : ''}` },
      el('h3', { text: 'Parse errors' }),
      el('p', { text: schema.parseErrors.length
        ? `${schema.parseErrors.length} parse issue(s) were recorded. See the list below.`
        : 'No parse errors recorded.' }),
    ),
  );
  dom.schemaContent.append(cards);

  const table = el('table');
  const thead = el('thead');
  const header = el('tr');
  header.append(el('th', { text: 'Section' }), el('th', { text: 'Kind' }), el('th', { text: 'Scope' }));
  for (const environment of state.result.environments) header.append(el('th', { text: environment.name }));
  header.append(el('th', { text: 'Status' }));
  thead.append(header);
  const tbody = el('tbody');

  for (const section of schema.sections) {
    const tr = el('tr');
    tr.append(
      el('td', { className: 'mono', text: section.name }),
      el('td', { className: 'muted', text: section.kind || 'unknown' }),
      el('td', { className: 'muted', text: section.scope || 'unknown' }),
    );
    for (const environment of state.result.environments) {
      const present = section.presentIn.includes(environment.id);
      tr.append(el('td', {}, present ? badge('present', 'accent') : badge('missing', 'violet')));
    }
    tr.append(el('td', {}, statusPill(section.status, section.status === 'same' ? 'Shared' : 'Missing')));
    tbody.append(tr);
  }
  table.append(thead, tbody);
  dom.schemaContent.append(el('div', { className: 'table-card' }, el('div', { className: 'table-wrap' }, table)));

  if (schema.unknownSections.length) {
    const list = el('ul', { className: 'error-list' });
    for (const name of schema.unknownSections) list.append(el('li', { className: 'mono', text: name }));
    dom.schemaContent.append(
      el('div', { className: 'schema-card warning' },
        el('h3', { text: 'Unknown sections' }),
        el('p', { text: 'These sections were not parsed. Add them to the schema registry before relying on their contents.' }),
        list,
      ),
    );
  }

  if (schema.parseErrors.length) {
    const list = el('ul', { className: 'error-list' });
    for (const error of schema.parseErrors) {
      list.append(el('li', { text: `${error.environment} · ${error.fileName || 'file'}${error.line ? ` · line ${error.line}` : ''} · ${error.message}` }));
    }
    dom.schemaContent.append(
      el('div', { className: 'schema-card error' },
        el('h3', { text: 'Parse errors' }),
        list,
      ),
    );
  }

  const fileCards = el('div', { className: 'schema-grid' });
  for (const environment of state.result.environments) {
    const list = el('ul', { className: 'error-list' });
    for (const file of environment.files) list.append(el('li', { text: file }));
    fileCards.append(
      el('div', { className: 'schema-card' },
        el('h3', { text: environment.name }),
        el('p', { text: `${formatNumber(environment.stats.resources)} resources · ${formatNumber(environment.stats.aclRules)} ACL rules · ${formatNumber(environment.nodeCount)} node config(s)` }),
        list,
      ),
    );
  }
  dom.schemaContent.append(fileCards);
}

function bindEvents() {
  dom.addEnvironment.addEventListener('click', () => {
    if (state.environments.length >= 5) return;
    state.environments.push(createEnvironment());
    renderImport();
  });

  dom.compareButton.addEventListener('click', compareEnvironments);
  dom.demoButton.addEventListener('click', loadDemo);
  dom.clearImport.addEventListener('click', clearImport);
  dom.forgetButton.addEventListener('click', resetApplication);

  dom.emptyAsAbsent.addEventListener('change', () => {
    state.emptyAsAbsent = dom.emptyAsAbsent.checked;
    dom.emptyAsAbsentToggle.checked = state.emptyAsAbsent;
  });

  dom.emptyAsAbsentToggle.addEventListener('change', () => {
    state.emptyAsAbsent = dom.emptyAsAbsentToggle.checked;
    dom.emptyAsAbsent.checked = state.emptyAsAbsent;
    if (state.result && state.worker) {
      requestRecompare();
      toast('Recomparing with the new empty-value rule.', 'ok');
    }
  });

  dom.ignoredFieldsClear.addEventListener('click', () => {
    if (!state.ignoredFields.size) return;
    state.ignoredFields.clear();
    renderIgnoredFieldOptions();
    requestRecompare();
    toast('All globally ignored fields are compared again.', 'ok');
  });

  dom.themeToggle.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = current === 'light' ? 'dark' : 'light';
  });

  dom.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      if (!state.result) return;
      location.hash = `#/${tab.dataset.view}`;
      setView(tab.dataset.view);
    });
  });

  const renderResourceSearch = debounce(() => {
    state.resourcePage = 1;
    renderResources();
  });
  dom.resourceSearch.addEventListener('input', () => {
    state.resourceSearch = dom.resourceSearch.value;
    renderResourceSearch();
  });
  dom.resourceStatus.addEventListener('change', () => {
    state.resourceStatus = dom.resourceStatus.value;
    state.resourcePage = 1;
    renderResources();
  });
  dom.resourceVh.addEventListener('change', () => {
    state.resourceVh = dom.resourceVh.value;
    state.resourcePage = 1;
    renderResources();
  });

  const renderAclSearch = debounce(() => {
    state.aclPage = 1;
    renderAcl();
  });
  dom.aclSearch.addEventListener('input', () => {
    state.aclSearch = dom.aclSearch.value;
    renderAclSearch();
  });

  const aclFilters = [
    [dom.aclEnvironment, 'aclEnvironment'],
    [dom.aclResource, 'aclResource'],
    [dom.aclVh, 'aclVh'],
    [dom.aclService, 'aclService'],
    [dom.aclSource, 'aclSource'],
    [dom.aclAuth, 'aclAuth'],
    [dom.aclEncryption, 'aclEncryption'],
    [dom.aclDeny, 'aclDeny'],
  ];
  for (const [element, key] of aclFilters) {
    element.addEventListener('change', () => {
      state[key] = element.value;
      state.aclPage = 1;
      state.selectedAclId = null;
      renderAcl();
    });
  }

  dom.aclClear.addEventListener('click', () => {
    state.aclSearch = '';
    state.aclEnvironment = 'all';
    state.aclResource = 'all';
    state.aclVh = 'all';
    state.aclService = 'all';
    state.aclSource = 'all';
    state.aclAuth = 'all';
    state.aclEncryption = 'all';
    state.aclDeny = 'all';
    state.selectedAclId = null;
    state.aclPage = 1;
    dom.aclSearch.value = '';
    renderAcl();
  });

  dom.exportFormat.addEventListener('change', () => {
    state.aclFormat = dom.exportFormat.value;
  });
  dom.exportVisibleColumns.addEventListener('change', () => {
    state.exportVisibleColumns = dom.exportVisibleColumns.checked;
  });
  dom.aclColumnsAll.addEventListener('click', () => {
    state.aclVisibleColumns = new Set(ACL_COLUMNS.map((column) => column.key));
    state.aclColumnsCustomized = true;
    renderAcl();
  });
  dom.aclColumnsReset.addEventListener('click', () => {
    state.aclColumnsCustomized = false;
    state.aclVisibleColumns = screenDefaultColumns();
    renderAcl();
  });
  dom.exportResources.addEventListener('click', exportResourcesCsv);
  dom.exportAll.addEventListener('click', () => exportAcl('all'));
  dom.exportFiltered.addEventListener('click', () => exportAcl('filtered'));

  const responsiveAclColumns = debounce(() => {
    if (!state.result || state.aclColumnsCustomized) return;
    state.aclVisibleColumns = screenDefaultColumns();
    if (state.view === 'acl') renderAcl();
  }, 180);
  window.addEventListener('resize', responsiveAclColumns);

  window.addEventListener('hashchange', () => {
    if (!state.result) return;
    const match = location.hash.match(/^#\/(resources|acl|schema|security)$/);
    if (match) setView(match[1]);
  });
}

function init() {
  state.environments = [createEnvironment(), createEnvironment()];
  bindEvents();
  initWorker();
  renderImport();
  if (location.hash && location.hash !== '#/import') {
    const match = location.hash.match(/^#\/(resources|acl|schema|security)$/);
    if (match) state.view = match[1];
  }
  showImport();
}

init();
