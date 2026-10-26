import { createPendingClient } from './pending-client.mjs';
import { createPortalClient } from './portal-client.mjs';
import {
  renderDateControl,
  editDateControl,
  resetDateControls,
  hasDateErrors,
  openDateCalendar,
  parseEditableDate
} from './date-controls.mjs';
import { mobileTables } from './mobile-tables.mjs';
import { parsePortalLink, portalLink } from './portal-links.mjs';
import { renderPortalView } from './portal-view.mjs';
import { demoPayload } from './demo-data.mjs';
import { clearViewCache } from './view-cache.mjs';
import { alertKey, taskFor, updateTask, taskSummary, assignmentForOwner } from './workflow.mjs';
import { renderTaskDrawer } from './workflow-ui.mjs';
import { reportTemplate, applyReportTemplate } from './report-templates.mjs';
import { filterOperationalData, serviceTypeLabel } from './filtering.mjs';
import { COMPANIES, COSTALOG_ENTITIES, validCompany, scopeCompanyData } from './companies.mjs';
import { normalizedLayout, reorderMetric, moveMetric, subsetPeriod } from './intelligence.mjs';
import { renderHero } from './visual-dashboard.mjs';
import { resolvePortalApi } from './site-config.mjs';
import { renderUsersManagement, renderForcePasswordChange } from './admin-users.mjs';
import {
  permittedView,
  reportTypesFor,
  safeView,
  operationalPermissions,
  operationalDataset,
  buildOperationalReport
} from './access-ui.mjs';
import { downloadXlsx, downloadFile, printReport } from './reporting.mjs';
import { normalizeOverview } from './dss-mapping.mjs';
/* COSTALOG | Viagens e Fretes. Sem credenciais no frontend. */
const root = document.getElementById('app');
const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtNum = new Intl.NumberFormat('pt-BR');
const year = new Date().getFullYear();
const localToday = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};
const emptyDataset = () => ({ viagens: [], pedidos: [], ctes: [], mdfes: [], ocorrencias: [], sources: {} });
// Demonstração: dados fictícios no formato bruto da DSS, passando pelo mesmo mapeamento da produção.
const demo = operationalDataset(normalizeOverview(demoPayload(localToday())));
const readPrefs = (key, def) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? def;
  } catch {
    return def;
  }
};

/* GitHub Pages = APENAS DEMONSTRAÇÃO, SEM AUTENTICAÇÃO REAL.
   Os dados reais DSS nunca devem ser servidos com a autenticação local do navegador. */
const portalSettings = resolvePortalApi(window.location);
const PUBLIC_DEMO = portalSettings.demoOnly;
const DEMO_USERS_KEY = 'costalog_demo_users_v1';
const TEMP_ADMIN_SALT = '0586030c9088763dba9e1cde008cce5a';
const TEMP_ADMIN_HASH = '977b36fdad10f371180e01878f3d4331ae80c73e7b422eaeabb058ac48e65bdd';
const PBKDF2_ITERATIONS = 120000;
const demoRoles = ['operacional', 'financeiro', 'administrador'];
const demoRights = role => ({ operacional: true, financeiro: false, admin: role === 'administrador' });
function demoUsers() {
  try {
    const rows = JSON.parse(localStorage.getItem(DEMO_USERS_KEY) || 'null');
    if (Array.isArray(rows) && rows.length) return rows;
  } catch {}
  return [
    {
      username: 'admin',
      name: 'Administrador (demonstração)',
      role: 'administrador',
      salt: TEMP_ADMIN_SALT,
      hash: TEMP_ADMIN_HASH,
      disabled: false,
      mustChangePassword: true
    }
  ];
}
function demoSave(rows) {
  localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(rows));
}
const randomHex = n =>
  [...crypto.getRandomValues(new Uint8Array(n))].map(x => x.toString(16).padStart(2, '0')).join('');
async function demoHash(password, salt) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256)
    throw Error('Use uma senha de 12 a 256 caracteres.');
  if (!crypto?.subtle) throw Error('O modo de demonstração exige HTTPS e navegador atualizado.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(salt.match(/../g).map(x => parseInt(x, 16))),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    key,
    256
  );
  return [...new Uint8Array(derived)].map(x => x.toString(16).padStart(2, '0')).join('');
}
const demoPublic = u => ({
  username: u.username,
  displayName: u.name || u.username,
  name: u.name || u.username,
  role: u.role,
  disabled: !!u.disabled,
  mustChangePassword: !!u.mustChangePassword
});
async function demoSignin(username, password) {
  const u = demoUsers().find(
    x =>
      x.username ===
        String(username || '')
          .toLowerCase()
          .trim() && !x.disabled
  );
  if (!u || (await demoHash(password, u.salt)) !== u.hash) throw Error('Usuário ou senha temporária incorretos.');
  return demoPublic(u);
}
async function demoAccountAction(path = '', options = {}) {
  if (state.role !== 'administrador' || !state.user || state.user.mustChangePassword)
    throw Error('Somente o administrador pode modificar contas demonstrativas.');
  const rows = demoUsers(),
    operation = options.method || 'GET',
    input = options.body ? JSON.parse(options.body) : {};
  const admins = () => rows.filter(x => x.role === 'administrador' && !x.disabled).length;
  if (!path && operation === 'GET') return { users: rows.map(demoPublic) };
  if (!path && operation === 'POST') {
    const username = String(input.username || '')
        .trim()
        .toLowerCase(),
      name = String(input.name || '').trim();
    if (!/^[a-z0-9._-]{3,60}$/.test(username) || name.length < 2 || name.length > 100)
      throw Error('Informe nome e login válidos.');
    if (!demoRoles.includes(input.role)) throw Error('Permissão inválida.');
    if (rows.some(x => x.username === username)) throw Error('Este login já está cadastrado neste navegador.');
    const salt = randomHex(16),
      hash = await demoHash(input.password, salt);
    const newUser = { username, name, role: input.role, salt, hash, disabled: false, mustChangePassword: true };
    rows.push(newUser);
    demoSave(rows);
    return { user: demoPublic(newUser) };
  }
  if (path.startsWith('/') && operation === 'PATCH') {
    const username = decodeURIComponent(path.slice(1)),
      target = rows.find(x => x.username === username);
    if (!target) throw Error('Funcionário não encontrado.');
    switch (input.action) {
      case 'role':
        if (!demoRoles.includes(input.role)) throw Error('Permissão inválida.');
        if (target.username === state.user.username && input.role !== 'administrador')
          throw Error('Não é possível rebaixar sua própria conta.');
        if (target.role === 'administrador' && input.role !== 'administrador' && admins() <= 1)
          throw Error('Mantenha um administrador.');
        target.role = input.role;
        break;
      case 'disable':
        if (target.username === state.user.username) throw Error('Não pode bloquear sua própria conta.');
        if (target.role === 'administrador' && admins() <= 1) throw Error('Mantenha um administrador.');
        target.disabled = true;
        break;
      case 'enable':
        target.disabled = false;
        break;
      case 'reset-password':
        target.salt = randomHex(16);
        target.hash = await demoHash(input.password, target.salt);
        target.mustChangePassword = true;
        break;
      default:
        throw Error('Ação inválida.');
    }
    demoSave(rows);
    return { user: demoPublic(target) };
  }
  throw Error('Operação inválida.');
}
async function demoChangeOwnPassword(currentPassword, newPassword) {
  const rows = demoUsers(),
    u = rows.find(x => x.username === state.user?.username);
  if (!u || (await demoHash(currentPassword, u.salt)) !== u.hash) throw Error('Senha provisória incorreta.');
  if (currentPassword === newPassword) throw Error('A nova senha deve ser diferente.');
  const salt = randomHex(16),
    hash = await demoHash(newPassword, salt);
  Object.assign(u, { salt, hash, mustChangePassword: false });
  demoSave(rows);
}

const requestedCompany =
  new URLSearchParams(window.location.search || '').get('empresa') || readPrefs('viagens_pf_company', 'costalog');
const initialCompany = validCompany(requestedCompany) ? requestedCompany : 'costalog';
const companySnapshots = new Map();
let sharedIntent = parsePortalLink(window.location);
let sharedLoginPending = sharedIntent.hasLink;
const state = {
  preferenceStorage: '',
  workflowStorage: null,
  serverMode: false,
  remoteSnapshot: '',
  remoteError: '',
  queryNotice: '',
  preferencesError: '',
  rvStage: '',
  company: initialCompany,
  technicalOpen: false,
  alertGrouping: 'lista',
  alertGroup: '',
  dayDate: localToday(),
  tripFocus: '',
  alertScope: 'todos',
  alertDue: 'todos',
  legalEntity: '',
  drilldown: '',
  detailPage: 1,
  timelinePage: 1,
  visibleAlerts: [],
  tasks: {},
  taskIndexLoaded: false,
  taskIndexLoading: false,
  taskIndexError: '',
  taskSelected: null,
  taskDetail: null,
  taskLoading: false,
  taskSaving: false,
  taskError: '',
  taskUnavailable: false,
  alertStatus: 'todos',
  alertOwner: '',
  syncMetadata: [],
  reportTemplates: {},
  templateSelected: '',
  reportFormat: 'xlsx',
  reportColumnOrder: {},
  compareCustom: true,
  compareCurrentFrom: String(year) + '-10-01',
  compareCurrentTo: localToday(),
  comparePreviousFrom: String(year) + '-09-01',
  comparePreviousTo: String(year) + '-09-30',
  view: 'painel',
  chartInterval: 'mensal',
  compareInterval: 'mensal',
  compareAnchor: new Date().toISOString().slice(0, 10),
  from: String(year) + '-01-01',
  to: localToday(),
  search: '',
  filter: 'todos',
  page: 1,
  dataset: demo,
  mode: 'demo',
  error: '',
  loading: false,
  selected: null,
  connect: false,
  menu: false,
  apiUrl: portalSettings.apiUrl,
  token: '',
  importCount: 0,
  globalQuery: '',
  clientSelected: '',
  routeSelected: '',
  driverSelected: '',
  alertKind: 'todos',
  metricLayout: null,
  showMetricOptions: false,
  comparison: null,
  comparisonLoading: false,
  comparisonError: '',
  customer: '',
  vehicle: '',
  serviceType: '',
  status: '',
  filtersOpen: false,
  sortKey: '',
  sortDir: 'desc',
  alertPriority: 'todos',
  hiddenColumns: readPrefs('costalog_visible_columns', {}),
  presets: readPrefs('costalog_filter_presets_' + initialCompany, {}),
  demoOnly: PUBLIC_DEMO,
  reportSelected: 'viagens',
  reportMulti: false,
  autoRefresh: 0,
  lastSync: null,
  prevDataset: null,
  lateDays: 2,
  apiDiagnostics: null,
  adminUsers: [],
  adminUsersLoading: false,
  adminUsersError: '',
  adminResetUser: '',
  role: 'operacional',
  user: null,
  permissions: { operacional: true, financeiro: false, admin: false }
};
const remoteClient = createPortalClient(state, render);
const pendingClient = createPendingClient(state, render, {
  invalidate: () => remoteClient.invalidate(),
  exportModels: deliverExport
});
const icons = {
  home: '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
  truck: '<path d="M3 6h12v11H3zM15 10h4l3 4v3h-7"/><circle cx="7.5" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  doc: '<path d="M5 3h9l5 5v13H5zM14 3v5h5M8 13h8M8 17h8"/>',
  chart: '<path d="M4 20V4M4 20h17M8 15l4-5 4 2 5-7"/>',
  shield: '<path d="m12 2 9 4v6c0 5-4 8-9 10-5-2-9-5-9-10V6z"/><path d="m8 12 3 3 5-6"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"/>',
  reload: '<path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="M5 5l14 14M19 5 5 19"/>'
};
function icon(name) {
  return (
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (icons[name] || icons.doc) +
    '</svg>'
  );
}
function esc(value) {
  return String(value === null || value === undefined ? '' : value).replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}
function number(n) {
  return Number.isFinite(n) ? fmtNum.format(n) : '—';
}
function dateBR(v) {
  if (!v) return '—';
  const s = String(v).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
  return esc(s);
}
function attr(v) {
  return esc(v);
}
function normalKey(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}
function pick(o, aliases) {
  if (!o || typeof o !== 'object') return undefined;
  const keys = Object.keys(o);
  for (const a of aliases) {
    const k = keys.find(x => normalKey(x) === normalKey(a));
    if (k && o[k] !== null && o[k] !== '') return o[k];
  }
  return undefined;
}
function toDay(v) {
  if (!v) return '';
  const s = String(v);
  const match = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) return match[3] + '-' + match[2] + '-' + match[1];
  return s.slice(0, 10);
}
function str(v) {
  return v === undefined || v === null ? '' : String(v);
}
function extractList(v) {
  if (Array.isArray(v)) return v;
  if (!v || typeof v !== 'object') return [];
  for (const key of ['data', 'dados', 'results', 'result', 'items', 'lista', 'registros', 'retorno', 'content']) {
    const match = Object.keys(v).find(k => normalKey(k) === key);
    if (match) {
      const r = extractList(v[match]);
      if (r.length || Array.isArray(v[match])) return r;
    }
  }
  return [];
}
function normalizeMdfe(v, i) {
  const n = str(pick(v, ['numeroMDFe', 'nroMDFe', 'nrMDFe', 'numero', 'id']));
  return {
    id: n || String(i + 1),
    numero: n || '—',
    empresa: str(pick(v, ['empresa', 'company', 'nomeEmpresa'])),
    data: toDay(pick(v, ['dataEmissao', 'dtEmissao', 'data'])),
    viagemId: str(pick(v, ['idViagem', 'numeroViagem', 'nroViagem', 'nrViagem', 'viagemId', 'viagem'])) || null,
    placa: str(pick(v, ['placaVeiculo', 'placa', 'placaTracao'])),
    status: str(pick(v, ['situacao', 'status'])) || 'Não informado'
  };
}
function normalizePayload(raw, company = state.company) {
  return operationalDataset(normalizeOverview({ data: scopeCompanyData(raw?.data || raw, company) }));
}
let companyPeriodCache = null,
  scopedCache = null;
function filterOptionsData() {
  const key = [state.company, state.legalEntity, state.from, state.to].join('|');
  if (companyPeriodCache?.dataset === state.dataset && companyPeriodCache.key === key) return companyPeriodCache.value;
  const value = filterOperationalData(scopeCompanyData(state.dataset, state.company, state.legalEntity), {
    from: state.from,
    to: state.to
  });
  companyPeriodCache = { dataset: state.dataset, key, value };
  return value;
}
function scoped() {
  const source = filterOptionsData(),
    key = [
      state.customer,
      state.vehicle,
      state.serviceType,
      state.status,
      state.status ? state.view : '',
      state.status ? state.reportSelected : '',
      state.drilldown,
      state.tripFocus
    ].join('|');
  if (scopedCache?.dataset === source && scopedCache.key === key) return scopedCache.value;
  const value = filterOperationalData(source, state);
  scopedCache = { dataset: source, key, value };
  return value;
}
const navItems = [
  ['painel', 'home', 'Painel'],
  ['viagens', 'truck', 'Viagens / RV'],
  ['ctes', 'doc', 'Pedidos de frete'],
  ['relatorios', 'doc', 'Relatórios'],
  ['programacao', 'truck', 'Programação do dia'],
  ['comparativos', 'chart', 'Comparativos'],
  ['entregas', 'doc', 'Entregas'],
  ['pendencias', 'shield', 'Pendências'],
  ['rotas', 'chart', 'Rotas'],
  ['veiculos', 'truck', 'Frota'],
  ['motoristas', 'home', 'Motoristas'],
  ['mdfes', 'shield', 'MDF-e'],
  ['ocorrencias', 'shield', 'Ocorrências']
];
function button(action, label, extra) {
  return '<button type="button" class="btn ' + (extra || '') + '" data-action="' + action + '">' + label + '</button>';
}
let textRenderTimer = null;
// Estado "aberto" de cada <details> no momento em que a tela o desenhou. Um <details open> recriado dispara
// "toggle" sozinho; só mudanças diferentes do desenhado vêm do usuário (antes o filtro reabria ao ser fechado).
const renderedOpen = new WeakMap();
function render() {
  pendingClient.observe();
  remoteClient.observe();
  const focusedDate = document.activeElement?.dataset?.editDate
    ? { id: document.activeElement.id, cursor: document.activeElement.selectionStart }
    : null;
  if (textRenderTimer) {
    clearTimeout(textRenderTimer);
    textRenderTimer = null;
  }
  if (
    !remoteClient.active() &&
    state.pendingRecord &&
    state.mode === 'live' &&
    state.user &&
    !state.user.mustChangePassword &&
    state.loadedRange
  ) {
    const [kind, id] = state.pendingRecord.split(':'),
      rows =
        kind === 'viagens'
          ? filterOptionsData().viagens
          : kind === 'ctes'
            ? filterOptionsData().pedidos
            : filterOptionsData().mdfes;
    if (rows.some(row => row.id === id)) {
      state.selected = state.pendingRecord;
      state.pendingRecord = '';
      state.linkMessage = '';
    } else state.linkMessage = 'O registro do link não foi localizado no período consultado.';
  }
  const brand = COMPANIES[state.company],
    other = state.company === 'costalog' ? 'ideallog' : 'costalog';
  if (document.title !== undefined) document.title = brand.name + ' · Viagens e pedidos de frete';
  state.view = safeView(state.role, state.view);
  const remote = remoteClient.active(),
    remoteResponse = remote ? remoteClient.response() : null;
  // Modo demonstração/servidor anterior: mesma apresentação do servidor (src/portal-view.mjs).
  const local = remote ? null : renderLocalResponse();
  const allowed = navItems.filter(x => x[0] !== 'integracoes' && permittedView(state.role, x[0]));
  const PRIMARY = ['painel', 'viagens', 'ctes', 'relatorios'];
  const secondary = allowed.filter(x => !PRIMARY.includes(x[0]));
  const tab = (x, cl) =>
    '<button type="button" class="' +
    cl +
    ' ' +
    (state.view === x[0] ? 'active' : '') +
    '" data-nav="' +
    x[0] +
    '" aria-current="' +
    (state.view === x[0] ? 'page' : 'false') +
    '">' +
    icon(x[1]) +
    '<span>' +
    esc(x[2]) +
    '</span></button>';
  const primary = allowed
    .filter(x => PRIMARY.includes(x[0]))
    .map(x => tab(x, 'v-nav-item'))
    .join('');
  const sub = secondary.map(x => tab(x, 'v-sub-item')).join('');
  const message =
    state.mode === 'demo'
      ? '<div class="demo-label" role="status">Demonstração · registros fictícios</div>'
      : state.error
        ? '<p class="ins-inline-error" role="alert">Não foi possível atualizar. Os dados anteriores foram mantidos. Tente atualizar novamente.</p>'
        : '';
  const needsUpdate =
    !state.alertArchive &&
    state.mode === 'live' &&
    !state.loading &&
    (!state.loadedRange || state.from < state.loadedRange.from || state.to > state.loadedRange.to);
  const updateNotice = needsUpdate
    ? '<div class="info-strip">O período selecionado precisa ser consultado. Clique em <strong>Atualizar dados da DSS</strong> para carregar os registros.</div>'
    : '';
  const tools = ['viagens', 'ctes', 'mdfes'].includes(state.view)
    ? '<div class="v-heading-tools">' +
      button('csv', icon('download') + ' CSV', 'btn-sm') +
      button('print', 'PDF / Imprimir', 'btn-sm btn-red') +
      '</div>'
    : '';
  const dateFilters = state.view === 'administracao' ? '' : renderFilters();
  const globalSearch = state.view === 'administracao' ? '' : remote ? remoteResponse?.search || '' : local.search || '';
  root.innerHTML =
    '<div class="layout v-app"><main class="main v-main">' +
    '<header class="topbar v-topbar"><div class="v-topbrand"><img class="v-brand-logo ' +
    (state.company === 'ideallog' ? 'v-ideal-logo' : '') +
    '" src="./' +
    brand.logo +
    '" alt="Logotipo ' +
    brand.name +
    '"><div><b>' +
    brand.name +
    '</b><small>' +
    brand.description +
    '</small></div><i></i><strong>GESTÃO DE VIAGENS & FRETES</strong></div>' +
    '<div class="topbar-right v-accountbar">' +
    button('switch-company', 'Trocar para ' + COMPANIES[other].label, 'btn-sm btn-company-switch') +
    '<span class="v-environment ' +
    (state.mode === 'live' ? 'connected' : '') +
    '">' +
    (state.mode === 'live' ? '● DSS' : '● DEMO') +
    '</span>' +
    pendingClient.bell() +
    (state.user
      ? '<span class="v-username">' +
        esc(state.user.displayName || state.user.username) +
        ' · ' +
        esc(state.role) +
        '</span>' +
        button('logout', 'Sair', 'btn-sm btn-ghost')
      : button('connect', 'Entrar', 'btn-sm btn-ghost')) +
    '</div></header>' +
    '<div class="v-menu-row"><nav class="v-main-nav" aria-label="Seções principais">' +
    primary +
    '</nav><div class="v-right-hint">' +
    (state.mode === 'live' ? 'DADOS DO DSS' : 'DADOS DE TESTE') +
    '</div></div>' +
    (sub ? '<nav class="v-sub-nav" aria-label="Outras áreas">' + sub + '</nav>' : '') +
    '<div class="content v-content">' +
    (remote
      ? remoteResponse?.hero ||
        renderHero(state.view, emptyDataset(), {
          from: state.from,
          to: state.to,
          mode: state.mode,
          company: state.company
        }).replace(/<small>[^<]* RVs[^<]*<\/small>/, '<small>Consulta no servidor</small>')
      : local.hero || '') +
    '<div class="v-tools-row">' +
    dateFilters +
    tools +
    button('share-query', 'Copiar link', 'btn-sm') +
    '</div>' +
    globalSearch +
    (state.linkMessage ? '<p class="help" role="status">' + esc(state.linkMessage) + '</p>' : '') +
    updateNotice +
    message +
    (remote
      ? '<div id="syncProgress">' + remoteClient.progress() + '</div>'
      : state.loading
        ? '<div class="info-strip">Consultando registros DSS...</div>'
        : '') +
    (state.queryNotice ? '<p class="help" role="status">' + esc(state.queryNotice) + '</p>' : '') +
    (state.preferencesError
      ? '<p class="ins-inline-error" role="status">' +
        esc(state.preferencesError) +
        ' <button class="btn btn-sm" data-action="reload-preferences">Recarregar preferências</button></p>'
      : '') +
    renderDrilldownNotice() +
    mobileTables(
      remote
        ? state.alertArchive &&
          (state.view === 'pendencias' || (state.view === 'relatorios' && state.reportSelected === 'pendencias'))
          ? pendingClient.contents()
          : remoteClient.contents()
        : local.html
    ) +
    (remote ? remoteResponse?.technical || '' : local.technical || '') +
    '<footer class="v-footer">' +
    brand.name +
    ' • Portal de inteligência operacional • ' +
    (PUBLIC_DEMO
      ? 'Contas de demonstração somente neste navegador.'
      : 'Acesso baseado em permissões, dados DSS protegidos no servidor.') +
    '</footer></div></main></div>' +
    (state.selected ? (remote ? remoteClient.drawer() : localDrawer()) : '') +
    renderTaskDrawer(state) +
    pendingClient.dialogs() +
    (state.connect ? renderConnect() : '') +
    (state.user?.mustChangePassword ? renderForcePasswordChange() : '') +
    (state.adminResetUser && state.permissions.admin ? renderAdminPasswordReset(state.adminResetUser) : '');
  for (const box of root.querySelectorAll?.('details[id]') || []) renderedOpen.set(box, box.open);
  pendingClient.afterRender();
  if (focusedDate) {
    const field = document.getElementById(focusedDate.id);
    field?.focus?.();
    if (typeof focusedDate.cursor === 'number') field?.setSelectionRange?.(focusedDate.cursor, focusedDate.cursor);
  }
  if (
    !remote &&
    (state.view === 'pendencias' ||
      (state.view === 'painel' && state.user?.username && !state.user.mustChangePassword) ||
      (state.view === 'relatorios' && state.reportSelected === 'pendencias')) &&
    !state.user?.mustChangePassword &&
    !state.taskIndexLoaded &&
    !state.taskIndexLoading &&
    !state.taskIndexError
  )
    loadTaskIndex();
}
function renderFilters() {
  const validDates =
    /^\d{4}-\d{2}-\d{2}$/.test(state.from) &&
    /^\d{4}-\d{2}-\d{2}$/.test(state.to) &&
    state.from <= state.to &&
    !hasDateErrors(['from', 'to']);
  return (
    '<div class="filters">' +
    (state.company === 'costalog'
      ? '<div class="filter"><label for="legalEntityFilter">Empresa Costalog</label><select id="legalEntityFilter" class="control"><option value="">Todas: AC · CRC · Comex</option>' +
        Object.entries(COSTALOG_ENTITIES)
          .map(
            ([key, label]) =>
              '<option value="' + key + '" ' + (state.legalEntity === key ? 'selected' : '') + '>' + label + '</option>'
          )
          .join('') +
        '</select></div>'
      : '') +
    '<div class="filter"><label for="from">De</label>' +
    renderDateControl('from', state.from, { label: 'De', max: localToday() }) +
    '</div><div class="filter"><label for="to">Até</label>' +
    renderDateControl('to', state.to, { label: 'Até', max: localToday() }) +
    '</div>' +
    '<div class="filter grow"><label for="searchInput">Pesquisar no portal</label><div class="search-field"><input id="searchInput" class="control full" type="search" autocomplete="off" placeholder="' +
    attr('RV, pedido, CT-e, MDF-e, placa, cliente ou motorista') +
    '" value="' +
    attr(state.search) +
    '">' +
    (state.search ? button('clear-table-search', 'Limpar busca', 'btn-sm') : '') +
    '</div></div>' +
    (state.mode === 'live' && !PUBLIC_DEMO
      ? '<div class="filter"><label>Consulta DSS</label><button type="button" class="btn btn-red" data-action="refresh" ' +
        (state.loading || !validDates ? 'disabled' : '') +
        '>' +
        (state.loading ? state.loadingProgress || 'Consultando DSS...' : 'Atualizar dados da DSS') +
        '</button></div>'
      : '') +
    '</div>'
  );
}
/** Resposta local (demonstração e servidores anteriores) do mesmo renderizador usado no servidor. */
function renderLocalResponse() {
  if (state.view === 'administracao' && state.permissions.admin)
    return {
      html:
        renderUsersManagement(state.adminUsers, state.adminUsersLoading, state.adminUsersError) +
        (PUBLIC_DEMO
          ? '<p class="help">Demonstração: contas e senhas ficam somente neste navegador. Sem dados reais.</p>'
          : '<p class="help">Use Atualizar dados da DSS nas telas de viagens e pedidos para consultar os dados.</p>')
    };
  return renderPortalView({ action: 'view', full: state.dataset, state });
}
function localDrawer() {
  const html = renderPortalView({ action: 'detail', full: state.dataset, state }).html;
  return html;
}

function renderConnect() {
  return (
    '<div class="overlay" data-action="close-overlay"><aside class="drawer" role="dialog" aria-modal="true" aria-label="Acessar portal COSTALOG">' +
    '<div class="drawer-top"><h2>Entrar no portal COSTALOG</h2>' +
    button('close', icon('close'), 'btn-sm') +
    '</div>' +
    '<p class="help">' +
    (PUBLIC_DEMO
      ? 'Acesso de demonstração com dados fictícios. Conta e alterações ficam somente neste navegador; não protegem informações reais.'
      : 'Cada funcionário utiliza sua própria conta e vê apenas os módulos autorizados. O servidor protege os dados reais.') +
    '</p>' +
    '<form id="loginForm">' +
    '<div class="filter" style="margin-top:17px"><label for="loginUser">Usuário do portal</label><input id="loginUser" class="control full" autocomplete="username" required placeholder="usuario.funcionario"></div>' +
    '<div class="filter" style="margin-top:17px"><label for="loginPassword">Senha do portal</label><input id="loginPassword" class="control full" type="password" autocomplete="current-password" required placeholder="Sua senha individual"></div>' +
    '<div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap"><button class="btn btn-red" type="submit">' +
    (PUBLIC_DEMO ? 'Entrar (demonstração)' : 'Entrar com segurança') +
    '</button>' +
    button('demo', 'Fechar / demonstração operacional', 'btn-ghost') +
    '</div></form>' +
    '<p class="help">' +
    (PUBLIC_DEMO
      ? 'Login inicial: admin. Utilize a senha temporária disponibilizada para testar e troque-a no primeiro acesso.'
      : 'O backend corporativo será configurado fora desta tela.') +
    '</p></aside></div>'
  );
}
async function portalLogin() {
  const url = state.apiUrl?.replace(/\/$/, '') || window.location.origin;
  const username = document.getElementById('loginUser')?.value.trim() || '';
  const password = document.getElementById('loginPassword')?.value || '';
  if (PUBLIC_DEMO) {
    try {
      const user = await demoSignin(username, password);
      clearSession();
      state.user = user;
      state.role = user.role;
      state.permissions = demoRights(user.role);
      state.view = 'painel';
      state.connect = false;
      state.error = '';
      state.mode = 'demo';
      state.dataset = demo;
      loadMetricPreferences();
      render();
    } catch (err) {
      alert('Demonstração: ' + err.message);
    }
    return;
  }
  if (!/^https:\/\//i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url)) {
    alert('Use HTTPS ou localhost para desenvolvimento.');
    return;
  }
  try {
    const res = await fetch(url + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw Error(data.error || 'Não foi possível autenticar.');
    if (!data.token || !['operacional', 'financeiro', 'administrador'].includes(data.user?.role))
      throw Error('Resposta inválida do servidor de autenticação.');
    clearSession();
    state.apiUrl = url;
    state.workflowStorage = data.workflowStorage || null;
    state.serverMode = data.portalVersion === 2;
    state.token = data.token;
    state.user = data.user;
    state.role = data.user.role;
    state.permissions = operationalPermissions(data.permissions);
    state.view = 'painel';
    state.connect = false;
    state.error = '';
    state.dataset = { viagens: [], pedidos: [], ctes: [], mdfes: [], sources: {} };
    state.mode = 'live';
    if (!remoteClient.active()) loadMetricPreferences();
    if (sharedLoginPending) {
      Object.assign(state, sharedIntent.state);
      sharedLoginPending = false;
      state.linkMessage = 'Consulta compartilhada. Atualize os dados para ver os registros autorizados.';
    }
    render();
    if (state.user.mustChangePassword) return;
    if (remoteClient.active()) remoteClient.loadPreferences();
    // Dados DSS são carregados apenas ao clicar em Atualizar.
  } catch (err) {
    const offline = err instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(err.message || '');
    alert(
      offline
        ? 'Não foi possível conectar à API. Se está no mesmo computador, inicie o backend no PowerShell com node api/server.mjs e abra http://localhost:3001/ (não o endereço GitHub Pages). Verifique http://localhost:3001/api/health.'
        : 'Login não autorizado: ' + err.message
    );
  }
}
function adminEndpoint(path = '') {
  return state.apiUrl.replace(/\/$/, '') + '/api/users' + path;
}
async function adminFetch(path = '', options = {}) {
  if (PUBLIC_DEMO) return demoAccountAction(path, options);
  if (!state.permissions.admin || !state.token) throw Error('Somente administradores podem gerenciar contas.');
  const headers = {
    Authorization: 'Bearer ' + state.token,
    ...(options.body ? { 'Content-Type': 'application/json' } : {})
  };
  const response = await fetch(adminEndpoint(path), { ...options, headers, credentials: 'omit' });
  let result;
  try {
    result = await response.json();
  } catch {
    result = {};
  }
  if (response.status === 401) {
    clearSession();
    state.connect = true;
    render();
    throw Error('Sessão expirada. Faça login novamente.');
  }
  if (!response.ok) throw Error(result.error || 'Erro HTTP ' + response.status);
  return result;
}
async function loadAdminUsers() {
  if (!state.permissions.admin || (PUBLIC_DEMO ? false : !state.token)) return;
  const stamp = identityEpoch;
  state.adminUsersLoading = true;
  state.adminUsersError = '';
  render();
  try {
    const result = await adminFetch();
    if (stamp !== identityEpoch) return;
    state.adminUsers = result.users || [];
  } catch (err) {
    if (stamp === identityEpoch) state.adminUsersError = err.message;
  } finally {
    if (stamp === identityEpoch) {
      state.adminUsersLoading = false;
      render();
    }
  }
}
async function createPortalUser() {
  if (!state.permissions.admin) return;
  const name = document.getElementById('adminNewName')?.value.trim();
  const username = document.getElementById('adminNewUsername')?.value.trim().toLowerCase();
  const role = document.getElementById('adminNewRole')?.value;
  const password = document.getElementById('adminNewPassword')?.value || '';
  if (password.length < 12 || password.length > 256) {
    alert('A senha provisória precisa ter de 12 a 256 caracteres.');
    return;
  }
  if (
    role === 'administrador' &&
    !confirm('Este funcionário terá acesso total e poderá gerenciar outros usuários. Confirmar?')
  )
    return;
  try {
    await adminFetch('', { method: 'POST', body: JSON.stringify({ name, username, role, password }) });
    await loadAdminUsers();
    alert(
      'Conta de ' +
        username +
        ' criada. Entregue a senha provisória de forma segura. A troca será exigida no primeiro acesso.'
    );
  } catch (err) {
    alert('Não foi possível criar funcionário: ' + err.message);
  }
}
async function updatePortalUser(username, action, extra = {}) {
  if (!state.permissions.admin) return;
  try {
    await adminFetch('/' + encodeURIComponent(username), {
      method: 'PATCH',
      body: JSON.stringify({ action, ...extra })
    });
    state.adminResetUser = '';
    await loadAdminUsers();
  } catch (err) {
    alert('Não foi possível atualizar o usuário: ' + err.message);
  }
}
function renderAdminPasswordReset(username) {
  return (
    '<div class="overlay"><aside class="drawer" role="dialog" aria-modal="true"><div class="drawer-top"><h2>Redefinir senha de ' +
    esc(username) +
    '</h2><button class="btn" type="button" data-action="close-admin-reset">Fechar</button></div>' +
    '<p class="help">Defina uma senha provisória de pelo menos 12 caracteres. O funcionário será obrigado a trocá-la no próximo acesso.</p>' +
    '<form id="resetPortalUserPassword"><label for="adminResetPassword">Senha provisória</label><input id="adminResetPassword" class="control full" type="password" minlength="12" maxlength="256" autocomplete="new-password" required>' +
    '<button class="btn btn-red" type="submit">Confirmar redefinição</button></form></aside></div>'
  );
}
async function changePortalPassword() {
  const currentPassword = document.getElementById('currentPortalPassword')?.value || '';
  const newPassword = document.getElementById('newPortalPassword')?.value || '';
  const confirmPassword = document.getElementById('confirmPortalPassword')?.value || '';
  if (newPassword !== confirmPassword) {
    alert('As novas senhas são diferentes.');
    return;
  }
  if (newPassword.length < 12 || newPassword.length > 256) {
    alert('A senha deve ter 12 a 256 caracteres.');
    return;
  }
  try {
    if (PUBLIC_DEMO) {
      await demoChangeOwnPassword(currentPassword, newPassword);
      clearSession();
      state.connect = true;
      render();
      alert('Senha de demonstração alterada neste navegador. Entre novamente com a nova senha.');
      return;
    }
    const r = await fetch(state.apiUrl.replace(/\/$/, '') + '/api/change-password', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + state.token, 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.error || 'Não foi possível trocar senha.');
    clearSession();
    state.connect = true;
    render();
    alert('Senha atualizada. Entre novamente com sua senha pessoal.');
  } catch (err) {
    alert('Falha ao alterar senha: ' + err.message);
  }
}

function metricPrefsKey() {
  const user = state.user?.username || 'visitante',
    mode = PUBLIC_DEMO ? 'demo' : 'corporativo';
  return 'costalog_dashboard_v1:' + mode + ':' + encodeURIComponent(user) + ':' + state.role + ':' + state.company;
}
function loadMetricPreferences() {
  state.reportTemplates = readPrefs(reportTemplatesKey(), {});
  state.templateSelected = '';
  let saved = null;
  try {
    const v = JSON.parse(
      localStorage.getItem(metricPrefsKey()) ||
        (state.company === 'costalog'
          ? localStorage.getItem(metricPrefsKey().slice(0, metricPrefsKey().lastIndexOf(':')))
          : null) ||
        'null'
    );
    if (Array.isArray(v)) saved = v;
  } catch {}
  state.metricLayout = normalizedLayout(saved, { financial: !!state.permissions.financeiro });
}
function saveMetricPreferences() {
  !remoteClient.active() &&
    localStorage.setItem(
      metricPrefsKey(),
      JSON.stringify(normalizedLayout(state.metricLayout, { financial: !!state.permissions.financeiro }))
    );
}
let comparisonSeq = 0;
async function fetchPeriodComparison() {
  if (remoteClient.active()) {
    if (hasDateErrors(['compareCurrentFrom', 'compareCurrentTo', 'comparePreviousFrom', 'comparePreviousTo'])) return;
    return remoteClient.compare();
  }
  if (hasDateErrors(['compareCurrentFrom', 'compareCurrentTo', 'comparePreviousFrom', 'comparePreviousTo'])) return;
  if (state.mode !== 'live' || !state.apiUrl || !state.token) return;
  const windows = {
    current: { from: state.compareCurrentFrom, to: state.compareCurrentTo },
    previous: { from: state.comparePreviousFrom, to: state.comparePreviousTo }
  };
  try {
    for (const range of Object.values(windows)) {
      if (
        parseEditableDate(range.from) !== range.from ||
        parseEditableDate(range.to) !== range.to ||
        !range.from ||
        !range.to ||
        range.from > range.to
      )
        throw Error('Corrija as datas dos períodos A e B.');
      splitMonths(range.from, range.to);
    }
  } catch (error) {
    state.comparisonError = error.message;
    render();
    return;
  }
  const seq = ++comparisonSeq,
    identity = identityEpoch,
    company = state.company,
    token = state.token,
    api = state.apiUrl;
  const dataset = state.dataset,
    loaded = state.loadedRange;
  state.comparisonLoading = true;
  state.comparisonError = '';
  state.comparison = null;
  render();
  try {
    const get = async range => {
      if (loaded && loaded.from <= range.from && loaded.to >= range.to) return subsetPeriod(dataset, range);
      const windows = splitMonths(range.from, range.to),
        results = new Array(windows.length);
      let next = 0;
      const worker = async () => {
        while (next < windows.length && seq === comparisonSeq && identity === identityEpoch) {
          const i = next++,
            window = windows[i],
            query = new URLSearchParams({ ...window, company });
          const response = await fetch(api.replace(/\/$/, '') + '/api/overview?' + query, {
            headers: { Authorization: 'Bearer ' + token },
            credentials: 'omit',
            signal: AbortSignal.timeout(90000)
          });
          if (!response.ok)
            throw Error(
              response.status === 401
                ? 'Sessão expirada. Entre novamente.'
                : 'Consulta indisponível (HTTP ' + response.status + '). Tente novamente.'
            );
          const body = await response.json();
          if (!Array.isArray(body.data?.viagens) || !Array.isArray(body.data?.pedidos))
            throw Error('Consulta incompleta. Tente novamente.');
          results[i] = body.data;
        }
      };
      await Promise.all(Array.from({ length: Math.min(2, windows.length) }, worker));
      if (identity !== identityEpoch || seq !== comparisonSeq) return null;
      const data = {};
      for (const key of ['viagens', 'pedidos', 'ctes', 'mdfes', 'rotas', 'ocorrencias', 'programacoes'])
        data[key] = results.flatMap(result => result[key] || []);
      data.sources = results.reduce((acc, result) => {
        for (const [key, value] of Object.entries(result.sources || {}))
          acc[key] = Object.hasOwn(acc, key) ? acc[key] && value : value;
        return acc;
      }, {});
      return normalizePayload({ data }, company);
    };
    const current = await get(windows.current);
    if (seq !== comparisonSeq || identity !== identityEpoch) return;
    const previous = await get(windows.previous);
    if (seq !== comparisonSeq || identity !== identityEpoch) return;
    state.comparison = {
      company,
      currentRange: windows.current,
      previousRange: windows.previous,
      current,
      previous,
      source: 'DSS'
    };
  } catch (error) {
    if (seq === comparisonSeq && identity === identityEpoch) state.comparisonError = error.message;
  } finally {
    if (seq === comparisonSeq && identity === identityEpoch) {
      state.comparisonLoading = false;
      render();
    }
  }
}

async function switchCompany() {
  if (remoteClient.active() && !(await remoteClient.flushPreferences())) return;
  const remoteSnapshot = state.remoteSnapshot,
    remoteRange = state.loadedRange,
    remoteLastSync = state.lastSync;
  resetDateControls();
  sharedLoginPending = false;
  state.pendingRecord = '';
  state.linkMessage = '';
  if (state.user?.mustChangePassword) return;
  if (state.mode === 'live' && state.loadedRange && !state.loading)
    companySnapshots.set(state.company, {
      dataset: state.dataset,
      range: state.loadedRange,
      lastSync: state.lastSync,
      syncMetadata: state.syncMetadata
    });
  const company = state.company === 'costalog' ? 'ideallog' : 'costalog';
  identityEpoch++;
  comparisonSeq++;
  state.company = company;
  clearViewCache();
  localStorage.setItem('viagens_pf_company', JSON.stringify(company));
  if (window.history?.replaceState) {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('empresa', company);
    window.history.replaceState(null, '', url);
  }
  const saved = companySnapshots.get(company);
  const reusable = saved && saved.range.from <= state.from && saved.range.to >= state.to;
  const syncing = state.loading,
    loadingProgress = state.loadingProgress;
  state.dataset = state.mode === 'demo' ? demo : reusable ? saved.dataset : emptyDataset();
  Object.assign(state, {
    alertArchive: false,
    alertAllTracked: false,
    alertUnassigned: false,
    alertRecurrent: false,
    alertRelevant: false,
    pendingDialog: '',
    technicalOpen: false,
    pendingRecord: '',
    linkMessage: '',
    alertGroup: '',
    tripFocus: '',
    alertScope: 'todos',
    alertDue: 'todos',
    legalEntity: '',
    drilldown: '',
    detailPage: 1,
    timelinePage: 1,
    visibleAlerts: [],
    tasks: {},
    taskIndexLoaded: false,
    taskIndexLoading: false,
    taskIndexError: '',
    taskSelected: null,
    taskDetail: null,
    taskLoading: false,
    taskSaving: false,
    taskUnavailable: false,
    alertStatus: 'todos',
    alertOwner: '',
    syncMetadata: reusable ? saved.syncMetadata || [] : [],
    selected: null,
    page: 1,
    customer: '',
    vehicle: '',
    serviceType: '',
    status: '',
    search: '',
    globalQuery: '',
    filter: 'todos',
    sortKey: '',
    clientSelected: '',
    routeSelected: '',
    driverSelected: '',
    alertPriority: 'todos',
    alertKind: 'todos',
    comparison: null,
    comparisonLoading: false,
    comparisonError: '',
    prevDataset: null,
    error: '',
    loading: false,
    loadingProgress: '',
    loadedRange: reusable ? saved.range : null,
    lastSync: reusable ? saved.lastSync : null,
    presets: readPrefs('costalog_filter_presets_' + company, {})
  });
  state.loading = syncing;
  state.loadingProgress = loadingProgress;
  if (remoteClient.active()) {
    Object.assign(state, {
      remoteSnapshot,
      loadedRange: remoteRange,
      lastSync: remoteLastSync,
      rvStage: '',
      dataset: emptyDataset()
    });
    remoteClient.invalidate();
    remoteClient.loadPreferences();
  } else loadMetricPreferences();
  render();
}
function clearSession() {
  remoteClient.reset();
  state.preferenceStorage = '';
  state.workflowStorage = null;
  state.serverMode = false;
  state.remoteSnapshot = '';
  state.remoteError = '';
  state.queryNotice = '';
  state.preferencesError = '';
  state.rvStage = '';
  resetDateControls();
  identityEpoch++;
  comparisonSeq++;
  syncSeq++;
  companySnapshots.clear();
  clearViewCache();
  Object.assign(state, {
    alertArchive: false,
    alertAllTracked: false,
    alertUnassigned: false,
    alertRecurrent: false,
    alertRelevant: false,
    pendingDialog: '',
    technicalOpen: false,
    pendingRecord: '',
    linkMessage: '',
    alertGroup: '',
    tripFocus: '',
    alertScope: 'todos',
    alertDue: 'todos',
    legalEntity: '',
    drilldown: '',
    detailPage: 1,
    timelinePage: 1,
    visibleAlerts: [],
    tasks: {},
    taskIndexLoaded: false,
    taskIndexLoading: false,
    taskIndexError: '',
    taskSelected: null,
    taskDetail: null,
    taskLoading: false,
    taskSaving: false,
    taskUnavailable: false,
    alertStatus: 'todos',
    alertOwner: '',
    syncMetadata: [],
    reportTemplates: {},
    templateSelected: '',
    reportColumnOrder: {},
    reportFormat: 'xlsx'
  });
  const token = state.token,
    url = state.apiUrl;
  if (token && url)
    fetch(url.replace(/\/$/, '') + '/api/logout', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      credentials: 'omit'
    }).catch(() => {});
  state.token = '';
  state.user = null;
  state.role = 'operacional';
  state.permissions = { operacional: true, financeiro: false, admin: false };
  state.mode = 'demo';
  state.dataset = demo;
  state.loadedRange = null;
  state.view = 'painel';
  state.customer = '';
  state.vehicle = '';
  state.serviceType = '';
  state.status = '';
  state.rvStage = '';
  state.search = '';
  state.filter = 'todos';
  state.page = 1;
  state.comparison = null;
  state.comparisonError = '';
  state.metricLayout = null;
  state.clientSelected = '';
  state.globalQuery = '';
  state.adminUsers = [];
  state.adminUsersError = '';
  state.adminResetUser = '';
  state.adminUsersLoading = false;
  state.prevDataset = null;
  state.loading = false;
  state.selected = null;
  state.lastSync = null;
  state.apiDiagnostics = null;
}
function csvCell(s) {
  const v = str(s);
  return '"' + v.replace(/"/g, '""') + '"';
}
function exportCsv(which) {
  const d = scoped();
  let rows = [],
    name = 'relatorio';
  if (which === 'viagens') {
    name = 'viagens';
    rows = [
      ['RV', 'Data', 'Cliente', 'Placa', 'MDF-e', 'Origem', 'Destino', 'Fretes', 'Abastecimento ou custo', 'Situacao'],
      ...d.viagens.map(v => [
        v.numero,
        v.data,
        v.cliente,
        v.placa,
        v.nroMdf,
        v.origem,
        v.destino,
        v.receita,
        state.mode === 'live' ? v.abastecimento : v.custo,
        v.status
      ])
    ];
  } else if (which === 'ctes') {
    name = 'pedidos_cte';
    rows = [
      ['Documento', 'Pedido PF', 'Tipo', 'Data', 'Cliente', 'RV', 'MDF-e', 'Valor', 'Situacao'],
      ...[
        ...d.ctes.map(x => ({ ...x, tipo: 'CT-e' })),
        ...d.pedidos.filter(x => !x.isCte).map(x => ({ ...x, tipo: 'Pedido de frete' }))
      ].map(v => [v.numero, v.pedidoNumero, v.tipo, v.data, v.cliente, v.viagemId, v.nroMdf, v.valor, v.status])
    ];
  } else if (which === 'clientes') {
    name = 'clientes';
    rows = [
      ['Cliente', 'Viagens', 'Receita', 'Custo'],
      ...aggregateClients(d.viagens, d.pedidos).map(v => [
        v.cliente,
        v.viagens,
        v.receitaN === v.viagens ? v.receita : '',
        v.custoN === v.viagens ? v.custo : ''
      ])
    ];
  } else if (which === 'mdfes') {
    name = 'mdfe';
    rows = [
      ['MDF-e', 'Data', 'Viagem', 'Placa', 'Situacao', 'Conciliacao'],
      ...d.mdfes.map(v => [v.numero, v.data, v.viagemId, v.placa, v.status, mdfeSituation(v, d)])
    ];
  } else {
    return exportCsv('viagens');
  }
  const blob = new Blob(['\uFEFF' + rows.map(r => r.map(csvCell).join(';')).join('\r\n')], {
    type: 'text/csv;charset=utf-8;'
  });
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u;
  a.download = 'costalog_' + name + '_' + state.from + '_' + state.to + (state.mode === 'demo' ? '_DEMO' : '') + '.csv';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
function parseCsv(content) {
  const text = content.replace(/^\uFEFF/, '').replace(/\r/g, '');
  const rows = text.split('\n').filter(x => x.trim());
  if (rows.length < 2) return [];
  const sep = rows[0].includes(';') ? ';' : ',';
  function parseLine(l) {
    const out = [];
    let token = '',
      quoted = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"' && l[i + 1] === '"' && quoted) {
        token += '"';
        i++;
      } else if (c === '"') {
        quoted = !quoted;
      } else if (c === sep && !quoted) {
        out.push(token);
        token = '';
      } else token += c;
    }
    out.push(token);
    return out;
  }
  const headers = parseLine(rows.shift()).map(normalKey);
  return rows
    .map((l, i) => {
      const fields = parseLine(l);
      const v = {};
      headers.forEach((h, j) => (v[h] = fields[j] || ''));
      return normalizeMdfe(v, i);
    })
    .filter(x => x.numero !== '—');
}
// Carrega mês a mês: evita respostas de 80 mil registros em uma única conexão HTTP.
function splitMonths(from, to) {
  const result = [];
  let y = Number(from.slice(0, 4)),
    m = Number(from.slice(5, 7));
  while (y < Number(to.slice(0, 4)) || (y === Number(to.slice(0, 4)) && m <= Number(to.slice(5, 7)))) {
    const first = [y, String(m).padStart(2, '0'), '01'].join('-');
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    result.push({ from: result.length ? first : from, to: last < to ? last : to });
    if (result.length > 12) throw Error('Selecione no máximo 12 meses.');
    if (++m === 13) {
      m = 1;
      y++;
    }
  }
  return result;
}
async function fetchDssWindow(range, token, syncTo, company = state.company) {
  // O botão Atualizar deve ir à DSS mesmo que o MariaDB tenha uma cópia válida.
  const url =
    (state.apiUrl || window.location.origin).replace(/\/$/, '') +
    '/api/overview?from=' +
    encodeURIComponent(range.from) +
    '&to=' +
    encodeURIComponent(range.to) +
    '&refresh=recent&sync_to=' +
    encodeURIComponent(syncTo) +
    '&company=' +
    encodeURIComponent(company) +
    '&include_companies=1';
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(url, {
      headers: { Authorization: 'Bearer ' + token },
      credentials: 'omit',
      signal: controller.signal
    });
    if (!response.ok) {
      let message =
        response.status === 502 ? 'HTTP 502 no período ' + range.from + ' a ' + range.to : 'HTTP ' + response.status;
      try {
        const b = await response.json();
        message = b.error || message;
      } catch {}
      if (response.status === 401) throw Error('Sessão expirada. Entre novamente no portal.');
      throw Error(message);
    }
    const body = await response.json();
    if (!body?.data || !Array.isArray(body.data.viagens) || !Array.isArray(body.data.pedidos))
      throw Error('Resposta DSS incompleta em ' + range.from + ' a ' + range.to);
    return body;
  } finally {
    clearTimeout(timer);
  }
}
function snapshotForCompany(results, company, requestCompany, range, lastSync) {
  const parts = results.map(result => (company === requestCompany ? result : result.companions?.[company]));
  // Backend antigo não confirma a outra empresa: não inventar uma consulta vazia nem chamar a DSS.
  if (
    parts.some(
      part =>
        !part ||
        (company !== requestCompany && part.company !== company) ||
        !Array.isArray(part.data?.viagens) ||
        !Array.isArray(part.data?.pedidos)
    )
  )
    return null;
  const data = {};
  for (const key of ['viagens', 'pedidos', 'ctes', 'mdfes', 'rotas', 'programacoes', 'ocorrencias'])
    data[key] = parts.flatMap(part => part.data[key] || []);
  data.sources = parts.reduce((acc, part) => {
    for (const [key, value] of Object.entries(part.data.sources || {}))
      acc[key] = Object.hasOwn(acc, key) ? acc[key] && value : value;
    return acc;
  }, {});
  return {
    dataset: normalizePayload({ data }, company),
    range,
    lastSync,
    syncMetadata: parts.map(part => part.quality || {})
  };
}
async function loadData() {
  if (remoteClient.active()) {
    if (hasDateErrors(['from', 'to']) || !state.from || !state.to || state.from > state.to) return;
    return remoteClient.synchronize();
  }
  if (hasDateErrors(['from', 'to'])) return;
  if (
    parseEditableDate(state.from) !== state.from ||
    parseEditableDate(state.to) !== state.to ||
    !state.from ||
    !state.to ||
    state.from > state.to
  ) {
    state.error = 'Informe datas válidas para consultar a DSS.';
    render();
    return;
  }
  if (!state.token) {
    state.connect = true;
    state.loading = false;
    state.error = 'Faça login para consultar a DSS.';
    render();
    return;
  }
  const requestFrom = state.from,
    requestTo = state.to,
    token = state.token,
    requestCompany = state.company,
    seq = ++syncSeq;
  const current = () => seq === syncSeq && state.token === token;
  state.loading = true;
  state.loadingProgress = 'Preparando consulta...';
  state.connect = false;
  state.error = '';
  render();
  try {
    const windows = splitMonths(requestFrom, requestTo),
      results = new Array(windows.length);
    // Duas chamadas no máximo; cada resposta fornece as duas empresas já separadas.
    let next = 0,
      failed = false;
    const worker = async () => {
      try {
        while (next < windows.length && current() && !failed) {
          const index = next++;
          results[index] = await fetchDssWindow(windows[index], token, requestTo, requestCompany);
          if (current() && !failed) {
            state.loadingProgress =
              'Consultando DSS: ' + results.filter(Boolean).length + ' de ' + windows.length + ' meses';
            const button = document.querySelector('[data-action="refresh"]');
            if (button) button.textContent = state.loadingProgress;
          }
        }
      } catch (error) {
        failed = true;
        throw error;
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, windows.length) }, worker));
    if (!current()) return;
    const range = { from: requestFrom, to: requestTo },
      lastSync = new Date().toISOString();
    // Preparar as duas bases antes de substituir qualquer cópia da sessão.
    const snapshots = Object.fromEntries(
      Object.keys(COMPANIES).map(company => [
        company,
        snapshotForCompany(results, company, requestCompany, range, lastSync)
      ])
    );
    for (const [company, snapshot] of Object.entries(snapshots)) if (snapshot) companySnapshots.set(company, snapshot);
    const active = snapshots[state.company];
    if (active && state.from >= range.from && state.to <= range.to) {
      clearViewCache();
      Object.assign(state, {
        dataset: active.dataset,
        loadedRange: range,
        mode: 'live',
        error: '',
        page: 1,
        comparison: null,
        lastSync,
        syncMetadata: active.syncMetadata,
        prevDataset: null
      });
    }
  } catch (err) {
    if (!current()) return;
    const alreadyLive = state.mode === 'live';
    if (!alreadyLive) {
      state.mode = 'demo';
      state.dataset = demo;
      state.loadedRange = null;
    }
    state.error =
      'API indisponível: ' +
      (err.name === 'AbortError' ? 'tempo limite na consulta mensal' : err.message) +
      (alreadyLive ? '. Dados anteriores mantidos.' : '. Exibindo somente dados fictícios.');
  } finally {
    if (current()) {
      state.loading = false;
      state.loadingProgress = '';
      render();
    }
  }
}

function exportAdvanced(type, format) {
  if (remoteClient.active() && type === 'pendencias' && state.alertArchive)
    return pendingClient
      .exportArchive()
      .then(value => deliverExport(value.models, type, format, false))
      .catch(error => alert(error.message));
  if (remoteClient.active()) {
    const full = state.view === 'relatorios' && state.reportMulti && format === 'xlsx';
    return remoteClient
      .export(type, full)
      .then(models => deliverExport(models, type, format, full))
      .catch(error => alert('Erro ao gerar relatório: ' + error.message));
  }
  const d = scoped(),
    full = state.view === 'relatorios' && state.reportMulti && format === 'xlsx';
  if ((type === 'pendencias' || full) && state.mode === 'live' && !state.taskIndexLoaded) {
    const epoch = identityEpoch,
      query = state.search;
    loadTaskIndex(true)
      .then(() => {
        if (epoch !== identityEpoch || scoped() !== d || state.search !== query) return;
        if (!state.taskIndexLoaded) throw Error(state.taskIndexError || 'Tratamentos ainda não carregados.');
        exportAdvanced(type, format);
      })
      .catch(error => alert('Erro ao gerar relatório: ' + error.message));
    return;
  }
  const allowed = reportTypesFor(state.role);
  if (!allowed.includes(type)) throw Error('Acesso negado ao relatório.');
  const models = (full ? allowed : [type]).map(t => buildOperationalReport(t, d, state));
  deliverExport(models, type, format, full);
}
function deliverExport(models, type, format, full) {
  const suffix =
    (state.mode === 'live' ? 'DSS' : 'DEMO') +
    '_' +
    state.from +
    '_' +
    state.to +
    (state.legalEntity ? '_' + state.legalEntity : '');
  if (format === 'xlsx')
    downloadXlsx(
      models,
      { mode: state.mode, from: state.from, to: state.to, company: state.company },
      state.company.toUpperCase() + '_' + (full ? 'COMPLETO' : type) + '_' + suffix + '.xlsx'
    );
  if (format === 'pdf')
    printReport(models, { mode: state.mode, from: state.from, to: state.to, company: state.company });
  if (format === 'csv') {
    const r = models[0],
      lines = [r.columns.map(x => x[1]), ...r.rows.map(row => r.columns.map(c => row[c[0]] ?? ''))];
    const quote = x => {
      let t = String(x ?? '');
      if (/^[=+@-]/.test(t) && !/^-(\d+)(\.\d+)?$/.test(t)) t = "'" + t;
      return '"' + t.replace(/"/g, '""') + '"';
    };
    const csv = '\uFEFF' + lines.map(x => x.map(quote).join(';')).join('\r\n');
    downloadFile(
      new TextEncoder().encode(csv),
      state.company.toUpperCase() + '_' + type + '_' + suffix + '.csv',
      'text/csv;charset=utf-8'
    );
  }
}
let refreshTimer = null;
let identityEpoch = 0;
let syncSeq = 0;
function activateRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  state.autoRefresh = 0;
}

async function comparePeriods() {
  if (state.mode !== 'live' || !state.apiUrl || !state.token) {
    alert('Conecte a API DSS para comparar períodos reais.');
    return;
  }
  const start = Date.parse(state.from + 'T12:00:00Z'),
    end = Date.parse(state.to + 'T12:00:00Z');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    alert('Escolha um intervalo de datas válido.');
    return;
  }
  const days = Math.round((end - start) / 86400000) + 1;
  const iso = x => new Date(x).toISOString().slice(0, 10),
    from = iso(start - days * 86400000),
    to = iso(start - 86400000);
  try {
    const response = await fetch(state.apiUrl.replace(/\/$/, '') + '/api/overview?from=' + from + '&to=' + to, {
      headers: { Authorization: 'Bearer ' + state.token }
    });
    if (!response.ok) throw Error('HTTP ' + response.status);
    const previous = normalizePayload(await response.json());
    const matches = r =>
      (!state.customer || r.cliente === state.customer) && (!state.vehicle || r.placa === state.vehicle);
    const pedidos = previous.pedidos.filter(
      p => matches(p) && (!state.serviceType || serviceTypeLabel(p.tipoServico) === serviceTypeLabel(state.serviceType))
    );
    const viagens = previous.viagens.filter(
      v => matches(v) && (!state.serviceType || pedidos.some(p => p.viagemId === v.id))
    );
    state.prevDataset = {
      ...previous,
      allViagens: previous.viagens,
      viagens,
      pedidos,
      ctes: previous.ctes.filter(matches),
      mdfes: previous.mdfes
    };
    render();
  } catch (err) {
    alert('Não foi possível obter o período anterior: ' + err.message);
  }
}
function activateChartPoint(hit) {
  if (!hit || typeof hit.getAttribute !== 'function') return;
  const wasActive = hit.getAttribute('data-active') === 'true';
  // Não altera os dados nem re-renderiza todo o portal ao tocar num ponto.
  if (typeof root.querySelectorAll === 'function') {
    root
      .querySelectorAll('[data-chart-point][data-active="true"]')
      .forEach(node => node.removeAttribute('data-active'));
  }
  if (!wasActive) {
    hit.setAttribute('data-active', 'true');
    if (hit.dataset?.chartPoint === 'legend') {
      const layout = hit.closest('.v-donut-layout');
      const index = hit.dataset.chartIndex;
      if (layout && index !== undefined) {
        const slices = layout.querySelectorAll('[data-chart-point="donut"]');
        for (const slice of slices) if (slice.dataset.chartIndex === index) slice.setAttribute('data-active', 'true');
      }
    }
  }
}
function openMyTasks(due = 'todos') {
  if (!state.user?.username || state.user.mustChangePassword) {
    state.connect = !state.user?.username;
    render();
    return;
  }
  Object.assign(state, {
    view: 'pendencias',
    selected: null,
    tripFocus: '',
    drilldown: '',
    alertScope: 'mine',
    alertDue: due,
    alertStatus: 'ativas',
    alertKind: 'todos',
    alertPriority: 'todos',
    alertOwner: '',
    search: '',
    globalQuery: '',
    page: 1
  });
  render();
}
function openChecklistRecords(reference) {
  const [view, id] = String(reference || '').split(':');
  if (
    !['ctes', 'entregas'].includes(view) ||
    (!remoteClient.active() && !filterOptionsData().viagens.some(row => row.id === id))
  )
    return;
  Object.assign(state, {
    view,
    alertGroup: '',
    tripFocus: id,
    drilldown: '',
    selected: null,
    page: 1,
    search: '',
    globalQuery: '',
    customer: '',
    vehicle: '',
    serviceType: '',
    status: '',
    filter: 'todos',
    sortKey: ''
  });
  render();
}
const drilldownLabels = {
  viagens: 'Todas as viagens',
  andamento: 'Viagens em andamento',
  concluidas: 'Viagens concluídas',
  pedidos: 'Todos os pedidos',
  ctes: 'Pedidos com CT-e',
  sem_cte: 'Pedidos sem CT-e',
  sem_rv: 'CT-e sem RV localizada',
  entregas: 'Entregas concluídas sem comprovante',
  km: 'RVs com KM informado'
};
function renderDrilldownNotice() {
  const focused = state.tripFocus ? (filterOptionsData().viagens || []).find(row => row.id === state.tripFocus) : null;
  if (state.tripFocus)
    return (
      '<div class="info-strip drilldown-notice"><strong>RV ' +
      esc(
        focused?.numero || (remoteClient.active() ? state.tripFocus.split('~').at(-1) : 'não localizada no período')
      ) +
      '</strong> · Apenas documentos vinculados nesta consulta. ' +
      button('clear-trip-focus', 'Remover filtro da RV', 'btn-sm') +
      (focused
        ? '<button class="btn btn-sm" data-detail="viagens:' + attr(focused.id) + '">Voltar à RV</button>'
        : '') +
      '</div>'
    );
  return state.drilldown
    ? '<div class="info-strip drilldown-notice"><strong>Filtro do painel:</strong> ' +
        esc(drilldownLabels[state.drilldown] || state.drilldown) +
        ' ' +
        button('clear-drilldown', 'Remover filtro', 'btn-sm') +
        '</div>'
    : '';
}
function openMetric(id) {
  const view = ['viagens', 'andamento', 'concluidas', 'km'].includes(id)
    ? 'viagens'
    : id === 'entregas'
      ? 'entregas'
      : 'ctes';
  if (!drilldownLabels[id] || !permittedView(state.role, view)) return;
  Object.assign(state, {
    view,
    alertGroup: '',
    tripFocus: '',
    drilldown: id,
    page: 1,
    search: '',
    status: '',
    filter: 'todos',
    sortKey: '',
    selected: null,
    routeSelected: '',
    driverSelected: '',
    globalQuery: ''
  });
  render();
}
function reportTemplatesKey() {
  return (
    'viagens_pf_report_templates_v1:' +
    state.company +
    ':' +
    (PUBLIC_DEMO ? 'demo' : 'portal') +
    ':' +
    encodeURIComponent(state.user?.username || 'visitante')
  );
}
function saveReportTemplate() {
  try {
    const model = reportTemplate(state),
      name = prompt('Nome do modelo de relatório:', state.templateSelected || '');
    if (!name?.trim()) return;
    const label = name.trim().slice(0, 60);
    if (Object.hasOwn(state.reportTemplates, label) && !confirm('Substituir o modelo “' + label + '”?')) return;
    state.reportTemplates = { ...state.reportTemplates, [label]: model };
    !remoteClient.active() && localStorage.setItem(reportTemplatesKey(), JSON.stringify(state.reportTemplates));
    state.templateSelected = label;
    render();
  } catch (error) {
    alert('Não foi possível salvar o modelo: ' + error.message);
  }
}
function applySelectedReportTemplate() {
  const name = state.templateSelected;
  if (!name) return;
  try {
    const restored = applyReportTemplate(state.reportTemplates[name], state);
    resetDateControls();
    Object.assign(state, restored, { selected: null, routeSelected: '', driverSelected: '', detailPage: 1 });
    render();
  } catch (error) {
    alert(error.message);
  }
}
function deleteReportTemplate() {
  const name = state.templateSelected;
  if (!name) return;
  if (!confirm('Excluir o modelo “' + name + '”?')) return;
  state.reportTemplates = { ...state.reportTemplates };
  delete state.reportTemplates[name];
  !remoteClient.active() && localStorage.setItem(reportTemplatesKey(), JSON.stringify(state.reportTemplates));
  state.templateSelected = '';
  render();
}
async function workflowFetch(company, options = {}, key = '') {
  const query = new URLSearchParams({ company });
  if (key) query.set('key', key);
  const response = await fetch(state.apiUrl.replace(/\/$/, '') + '/api/workflow?' + query, {
    ...options,
    credentials: 'omit',
    headers: {
      Authorization: 'Bearer ' + state.token,
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    },
    signal: AbortSignal.timeout(20000)
  });
  const body = await response.json();
  if (!response.ok) {
    const error = Error(
      response.status === 401
        ? 'Sessão expirada. Entre novamente no portal.'
        : body.error || 'Falha ao consultar tratamentos.'
    );
    error.status = response.status;
    throw error;
  }
  return body;
}
function demoWorkflowKey(company) {
  return 'viagens_pf_demo_workflow_v1:' + company;
}
let taskIndexRequest = null;
function loadTaskIndex(force = false) {
  if (remoteClient.active()) {
    remoteClient.invalidate();
    render();
    return Promise.resolve();
  }
  if (state.taskIndexLoading) return taskIndexRequest || Promise.resolve();
  if (state.taskIndexLoaded && !force) return Promise.resolve();
  const epoch = identityEpoch,
    company = state.company;
  state.taskIndexLoading = true;
  taskIndexRequest = (async () => {
    try {
      const tasks =
        state.mode === 'demo'
          ? Object.fromEntries(
              Object.entries(readPrefs(demoWorkflowKey(company), {})).map(([key, value]) => [key, taskSummary(value)])
            )
          : (await workflowFetch(company)).tasks;
      if (epoch !== identityEpoch) return;
      state.tasks = tasks || {};
      state.taskIndexLoaded = true;
      state.taskIndexError = '';
    } catch (error) {
      if (epoch === identityEpoch) state.taskIndexError = 'Tratamentos não carregados: ' + error.message;
    } finally {
      if (epoch === identityEpoch) {
        state.taskIndexLoading = false;
        render();
      }
    }
  })();
  return taskIndexRequest;
}
async function openTask(item) {
  resetDateControls(['taskDue']);
  const epoch = identityEpoch,
    key = alertKey(item),
    company = state.company;
  Object.assign(state, {
    taskOwnerSelf: false,
    taskSelected: { ...item, key },
    taskDetail: taskFor(item, state.tasks),
    taskLoading: true,
    taskSaving: false,
    taskError: '',
    taskUnavailable: false
  });
  render();
  try {
    const task =
      state.mode === 'demo'
        ? readPrefs(demoWorkflowKey(company), {})[key]
        : (await workflowFetch(company, {}, key)).task;
    if (epoch !== identityEpoch || state.taskSelected?.key !== key) return;
    state.taskDetail = task || { ...taskFor(item, {}), comments: [], history: [] };
    state.tasks = { ...state.tasks, [key]: taskSummary(state.taskDetail) };
  } catch (error) {
    if (epoch === identityEpoch && state.taskSelected?.key === key) {
      state.taskError = error.message;
      state.taskUnavailable = true;
    }
  } finally {
    if (epoch === identityEpoch && state.taskSelected?.key === key) {
      state.taskLoading = false;
      render();
    }
  }
}
async function saveTask() {
  const dueInput = document.getElementById('taskDue'),
    due = parseEditableDate(dueInput?.value || '');
  if (due === null) {
    editDateControl(dueInput, { optional: true });
    dueInput.reportValidity?.();
    return;
  }
  if (!state.taskSelected || state.taskSaving || state.taskLoading || state.taskUnavailable) return;
  const epoch = identityEpoch,
    company = state.company,
    key = state.taskSelected.key;
  const owner = document.getElementById('taskOwner')?.value || '';
  const input = {
    key,
    ...(remoteClient.active() && state.remoteSnapshot ? { snapshot: state.remoteSnapshot } : {}),
    ...(document.getElementById('taskResolutionReason')
      ? { resolutionReason: document.getElementById('taskResolutionReason').value }
      : {}),
    owner,
    ownerUsername: assignmentForOwner(owner, state.user, state.taskDetail, state.taskOwnerSelf),
    due,
    priority: document.getElementById('taskPriority')?.value,
    status: document.getElementById('taskStatus')?.value,
    comment: document.getElementById('taskComment')?.value || '',
    revision: state.taskDetail?.revision || 0
  };
  state.taskSaving = true;
  state.taskError = '';
  const submit = document.querySelector('#taskForm button[type="submit"]');
  if (submit) {
    submit.disabled = true;
    submit.textContent = 'Salvando…';
  }
  try {
    let task;
    if (state.mode === 'demo') {
      const tasks = readPrefs(demoWorkflowKey(company), {});
      task = updateTask(tasks[key], input, state.user?.username || 'demonstração');
      tasks[key] = task;
      localStorage.setItem(demoWorkflowKey(company), JSON.stringify(tasks));
    } else task = (await workflowFetch(company, { method: 'PATCH', body: JSON.stringify(input) })).task;
    if (epoch !== identityEpoch) return;
    state.tasks = { ...state.tasks, [key]: taskSummary(task) };
    if (remoteClient.active()) pendingClient.refresh();
    if (state.taskSelected?.key === key) {
      state.taskDetail = task;
      state.taskSelected = null;
      state.taskDetail = null;
    }
  } catch (error) {
    if (epoch === identityEpoch) {
      state.taskError = error.message;
      if (error.status === 409 || error.status === 401) state.taskUnavailable = true;
    }
  } finally {
    if (epoch === identityEpoch) {
      state.taskSaving = false;
      // Preserva os campos digitados em caso de falha, inclusive o comentário.
      if (state.taskError && state.taskSelected?.key === key) {
        state.taskDetail = {
          ...state.taskDetail,
          owner: input.owner,
          ownerUsername: input.ownerUsername,
          due: input.due,
          priority: input.priority,
          status: input.status,
          resolutionReason: input.resolutionReason || ''
        };
        render();
        const comment = document.getElementById('taskComment');
        if (comment) comment.value = input.comment;
      } else render();
    }
  }
}
root.addEventListener('click', e => {
  if (pendingClient.handleClick(e.target)) return;
  const stage = e.target.closest('[data-related-rv-stage]');
  if (stage) {
    state.rvStage = stage.dataset.relatedRvStage;
    state.page = 1;
    state.selected = null;
    render();
    return;
  }
  const calendar = e.target.closest('[data-open-calendar]');
  if (calendar) {
    openDateCalendar(calendar.dataset.openCalendar);
    return;
  }
  const rvStage = e.target.closest('[data-rv-status]');
  if (rvStage) {
    state.status = rvStage.dataset.rvStatus;
    state.page = 1;
    render();
    return;
  }

  const mobile = e.target.closest('[data-mobile-row]');
  if (mobile) {
    const row = mobile.closest('tr'),
      expanded = mobile.getAttribute('aria-expanded') !== 'true';
    row.classList.toggle('mobile-expanded', expanded);
    mobile.setAttribute('aria-expanded', String(expanded));
    mobile.innerHTML = (expanded ? 'Menos detalhes' : 'Mais detalhes') + ' <span aria-hidden="true">⌄</span>';
    return;
  }
  const alertGroup = e.target.closest('[data-alert-group]');
  if (alertGroup) {
    state.alertGroup = alertGroup.dataset.alertGroup;
    state.page = 1;
    render();
    return;
  }
  const mineDue = e.target.closest('[data-mine-due]');
  if (mineDue) {
    openMyTasks(mineDue.dataset.mineDue);
    return;
  }
  const scope = e.target.closest('[data-alert-scope]');
  if (scope) {
    if (scope.dataset.alertScope === 'mine') openMyTasks('todos');
    else {
      Object.assign(state, { alertScope: 'todos', alertDue: 'todos', alertStatus: 'todos', alertOwner: '', page: 1 });
      render();
    }
    return;
  }
  const due = e.target.closest('[data-alert-due]');
  if (due) {
    state.alertDue = due.dataset.alertDue;
    state.page = 1;
    render();
    return;
  }
  const checklist = e.target.closest('[data-checklist-open]');
  if (checklist) {
    openChecklistRecords(checklist.dataset.checklistOpen);
    return;
  }
  const metric = e.target.closest('[data-metric-open]');
  if (metric) {
    openMetric(metric.dataset.metricOpen);
    return;
  }
  const manage = e.target.closest('[data-alert-manage]');
  if (manage) {
    const item = state.visibleAlerts?.find(item => alertKey(item) === manage.dataset.alertManage);
    if (item) openTask(item);
    return;
  }
  const columnMove = e.target.closest('[data-report-column-move]');
  if (columnMove) {
    const [key, direction] = columnMove.dataset.reportColumnMove.split(':'),
      model = remoteClient.active()
        ? { columns: state.remoteColumns || [] }
        : buildOperationalReport(state.reportSelected, scoped(), state, { preview: true }),
      keys = model.columns.map(([key]) => key),
      i = keys.indexOf(key),
      j = i + Number(direction);
    if (i >= 0 && j >= 0 && j < keys.length) {
      [keys[i], keys[j]] = [keys[j], keys[i]];
      state.reportColumnOrder = { ...state.reportColumnOrder, [state.reportSelected]: keys };
      render();
    }
    return;
  }
  const point = e.target.closest('[data-chart-point]');
  if (point) {
    activateChartPoint(point);
    return;
  }
  const searchHit = e.target.closest('[data-search-result]');
  if (searchHit) {
    const raw = searchHit.dataset.searchResult || '',
      pos = raw.indexOf(':');
    if (pos < 0) return;
    const group = raw.slice(0, pos),
      id = raw.slice(pos + 1);
    state.globalQuery = '';
    state.search = '';
    state.page = 1;
    if (group === 'clientes' && state.permissions.financeiro) {
      state.view = 'clientes';
      state.clientSelected = id;
      render();
      return;
    }
    const view = group === 'viagens' ? 'viagens' : group === 'pedidos' ? 'ctes' : 'mdfes';
    if (!permittedView(state.role, view)) return;
    state.view = view;
    state.selected = view + ':' + id;
    state.timelinePage = 1;
    render();
    return;
  }
  const openClient = e.target.closest('[data-client-open]');
  if (openClient && state.permissions.financeiro) {
    state.clientSelected = openClient.dataset.clientOpen;
    render();
    return;
  }
  const profileDetail = e.target.closest('[data-profile-detail]');
  if (profileDetail) {
    state.selected = profileDetail.dataset.profileDetail;
    state.timelinePage = 1;
    render();
    return;
  }
  const openRoute = e.target.closest('[data-route-open]');
  if (openRoute) {
    state.routeSelected = openRoute.dataset.routeOpen;
    state.detailPage = 1;
    render();
    return;
  }
  const openDriver = e.target.closest('[data-driver-open]');
  if (openDriver) {
    state.driverSelected = openDriver.dataset.driverOpen;
    state.detailPage = 1;
    render();
    return;
  }
  const alertDetail = e.target.closest('[data-alert-detail]');
  if (alertDetail) {
    const ref = alertDetail.dataset.alertDetail,
      kind = ref.split(':')[0];
    if (!permittedView(state.role, kind)) return;
    state.view = kind;
    state.alertArchive = false;
    state.alertAllTracked = false;
    state.selected = ref;
    state.timelinePage = 1;
    if (remoteClient.active() && !state.remoteSnapshot) {
      const item = state.visibleAlerts?.find(row => row.recordId === ref.split(':')[1]);
      state.pendingRecord = ref;
      state.selected = null;
      state.linkMessage =
        'Ajuste o período' +
        (item?.refDate ? ' para incluir ' + dateBR(item.refDate) : ' do registro') +
        ' e atualize os dados da DSS para abrir o documento.';
    }
    render();
    return;
  }
  const compareInterval = e.target.closest('[data-compare-interval]');
  if (compareInterval) {
    state.compareInterval = compareInterval.dataset.compareInterval;
    state.comparison = null;
    state.comparisonError = '';
    comparisonSeq++;
    render();
    return;
  }
  const insAction = e.target.closest('[data-ins-action]');
  if (insAction) {
    const action = insAction.dataset.insAction;
    if (action === 'clear-search') state.globalQuery = '';
    if (action === 'close-client') state.clientSelected = '';
    if (action === 'clear-route') state.routeSelected = '';
    if (action === 'clear-driver') state.driverSelected = '';
    if (action === 'customize') state.showMetricOptions = !state.showMetricOptions;
    if (action === 'reset-metrics') {
      state.metricLayout = null;
      try {
        localStorage.removeItem(metricPrefsKey());
      } catch {}
    }
    if (action === 'load-comparison') {
      fetchPeriodComparison();
      return;
    }
    render();
    return;
  }
  const nav = e.target.closest('[data-nav]');
  if (nav) {
    if (state.user?.mustChangePassword) return;
    if (!permittedView(state.role, nav.dataset.nav)) return;
    state.view = nav.dataset.nav;
    state.alertArchive = false;
    state.alertAllTracked = false;
    state.alertUnassigned = false;
    state.alertRecurrent = false;
    state.alertRelevant = false;
    state.pendingDialog = '';
    state.rvStage = '';
    state.technicalOpen = false;
    state.alertGroup = '';
    state.tripFocus = '';
    state.alertScope = 'todos';
    state.alertDue = 'todos';
    state.drilldown = '';
    state.alertPriority = 'todos';
    state.alertKind = 'todos';
    state.alertStatus = 'todos';
    state.alertOwner = '';
    state.clientSelected = '';
    state.routeSelected = '';
    state.driverSelected = '';
    state.globalQuery = '';
    state.search = '';
    state.filter = 'todos';
    state.status = '';
    state.sortKey = '';
    state.page = 1;
    state.menu = false;
    state.selected = null;
    render();
    if (state.view === 'administracao' && state.permissions.admin) loadAdminUsers();
    return;
  }
  const sorter = e.target.closest('[data-sort-metric]');
  if (sorter) {
    const [kind, key] = (sorter.dataset.sortMetric || '').split(':');
    const allowed = {
      rotas: ['name', 'count', 'km', 'kmPerTrip', 'vehicles', 'drivers'],
      motoristas: ['name', 'trips', 'orders', 'ctes', 'km', 'kmPerTrip', 'routes'],
      clientes: ['name', 'tripCount', 'orderCount', 'cteCount', 'fretesValor', 'lastDate']
    };
    if (allowed[kind]?.includes(key)) {
      state.tableSort ||= {};
      const prev = state.tableSort[kind];
      state.tableSort[kind] = { key, direction: prev?.key === key && prev.direction === 'desc' ? 'asc' : 'desc' };
      state.sortDir = state.tableSort[kind].direction;
      state.page = 1;
      render();
    }
    return;
  }
  const graphInterval = e.target.closest('[data-chart-interval]');
  if (graphInterval) {
    state.chartInterval = graphInterval.dataset.chartInterval;
    render();
    return;
  }
  const detail = e.target.closest('[data-detail]');
  if (detail) {
    state.selected = detail.dataset.detail;
    state.timelinePage = 1;
    render();
    return;
  }
  const sort = e.target.closest('[data-sort]');
  if (sort) {
    const k = sort.dataset.sort;
    state.sortDir = state.sortKey === k && state.sortDir === 'asc' ? 'desc' : 'asc';
    state.sortKey = k;
    state.page = 1;
    render();
    return;
  }
  const report = e.target.closest('[data-report-select]');
  if (report) {
    state.reportSelected = report.dataset.reportSelect;
    state.reportMulti = false;
    state.page = 1;
    state.sortKey = '';
    render();
    return;
  }
  const priority = e.target.closest('[data-alert-priority]');
  if (priority) {
    state.alertPriority = priority.dataset.alertPriority;
    state.page = 1;
    render();
    return;
  }
  const exp = e.target.closest('[data-export]');
  if (exp) {
    try {
      exportAdvanced(exp.dataset.export, 'csv');
    } catch (err) {
      alert(err.message);
    }
    return;
  }
  const targetRole = e.target.closest('[data-admin-reset]');
  if (targetRole && state.permissions.admin) {
    state.adminResetUser = targetRole.dataset.adminReset;
    render();
    return;
  }
  const targetToggle = e.target.closest('[data-admin-toggle]');
  if (targetToggle && state.permissions.admin) {
    const username = targetToggle.dataset.adminToggle,
      disabled = targetToggle.dataset.disabled === '1';
    if (confirm((disabled ? 'Reativar' : 'Bloquear') + ' o funcionário ' + username + '?'))
      updatePortalUser(username, disabled ? 'enable' : 'disable');
    return;
  }
  const act = e.target.closest('[data-action]');
  if (!act) return;
  const action = act.dataset.action;
  if (action === 'cancel-query') {
    remoteClient.cancel();
    return;
  }
  if (action === 'cancel-page') {
    remoteClient.cancelPage();
    return;
  }
  if (action === 'retry-page') {
    remoteClient.invalidate();
    render();
    return;
  }
  if (action === 'reload-preferences') {
    remoteClient.loadPreferences();
    return;
  }
  if (action === 'assign-task-to-me') {
    const owner = document.getElementById('taskOwner');
    if (owner && state.user?.username) {
      owner.value = state.user.displayName || state.user.username;
      state.taskOwnerSelf = true;
      const account = document.getElementById('taskOwnerAccount');
      if (account) account.textContent = 'Conta: ' + state.user.username + ' · confirme em Salvar tratamento';
    }
    return;
  }
  if (action === 'share-query' || action === 'share-record') {
    copyPortalLink(action === 'share-record' ? state.selected : '');
    return;
  }
  if (action === 'program-prev' || action === 'program-next') {
    state.programPage = (state.programPage || 1) + (action === 'program-prev' ? -1 : 1);
    render();
    return;
  }
  if (action === 'day-today') {
    resetDateControls(['dayDate']);
    state.dayDate = localToday();
    state.page = 1;
    render();
    return;
  }
  if (action === 'clear-alert-group') {
    state.alertGroup = '';
    state.page = 1;
    render();
    return;
  }
  if (action === 'clear-trip-focus') {
    state.tripFocus = '';
    state.page = 1;
    render();
    return;
  }
  if (action === 'close-task') {
    state.taskSelected = null;
    state.taskDetail = null;
    render();
    return;
  }
  if (action === 'reload-workflow') {
    pendingClient.refresh();
    state.taskIndexLoaded = false;
    state.taskIndexError = '';
    loadTaskIndex(true);
    return;
  }
  if (action === 'detail-prev' || action === 'detail-next') {
    state.detailPage += action === 'detail-prev' ? -1 : 1;
    render();
    return;
  }
  if (action === 'timeline-prev' || action === 'timeline-next') {
    state.timelinePage += action === 'timeline-prev' ? -1 : 1;
    render();
    return;
  }
  if (action === 'clear-drilldown') {
    state.drilldown = '';
    state.page = 1;
    render();
    return;
  }
  if (action === 'apply-report-template') {
    applySelectedReportTemplate();
    return;
  }
  if (action === 'save-report-template') {
    saveReportTemplate();
    return;
  }
  if (action === 'delete-report-template') {
    deleteReportTemplate();
    return;
  }
  if (action === 'export-report-template') {
    try {
      exportAdvanced(state.reportSelected, state.reportFormat || 'xlsx');
    } catch (err) {
      alert(err.message);
    }
    return;
  }
  if (action === 'close-overlay' && e.target !== act) return;
  if (action === 'switch-company') {
    switchCompany();
    return;
  }
  if (action === 'close' || action === 'close-overlay') {
    state.selected = null;
    state.connect = false;
    render();
  }
  if (action === 'menu') {
    state.menu = !state.menu;
    render();
  }
  if (action === 'refresh' && !PUBLIC_DEMO) loadData();
  if (action === 'reload-users') loadAdminUsers();
  if (action === 'close-admin-reset') {
    state.adminResetUser = '';
    render();
  }
  if (action === 'compare-periods' && !PUBLIC_DEMO) comparePeriods();
  if (action === 'api-diagnostics' && !PUBLIC_DEMO) {
    if (!state.permissions.admin) {
      alert('Acesso restrito a administradores.');
      return;
    }
    if (!state.apiUrl || !state.token) {
      alert('Conecte o backend e informe o token do portal antes de consultar os diagnósticos.');
      return;
    }
    fetch(state.apiUrl.replace(/\/$/, '') + '/api/status', { headers: { Authorization: 'Bearer ' + state.token } })
      .then(async res => {
        if (!res.ok) throw Error('HTTP ' + res.status);
        return res.json();
      })
      .then(value => {
        state.apiDiagnostics = value;
        render();
      })
      .catch(err => alert('Não foi possível consultar os diagnósticos: ' + err.message));
  }
  if (['xlsx-export', 'csv-advanced', 'pdf-report'].includes(action)) {
    try {
      exportAdvanced(
        state.reportSelected || 'viagens',
        action === 'xlsx-export' ? 'xlsx' : action === 'csv-advanced' ? 'csv' : 'pdf'
      );
    } catch (err) {
      alert('Erro ao gerar relatório: ' + err.message);
    }
  }
  if (action === 'clear-table-search') {
    state.search = '';
    state.page = 1;
    render();
  }
  if (action === 'clear-filters') {
    Object.assign(state, {
      rvStage: '',
      alertArchive: false,
      alertAllTracked: false,
      alertUnassigned: false,
      alertRecurrent: false,
      alertRelevant: false,
      pendingDialog: '',
      technicalOpen: false,
      pendingRecord: '',
      linkMessage: '',
      alertGroup: '',
      tripFocus: '',
      alertScope: 'todos',
      alertDue: 'todos',
      alertStatus: 'todos',
      alertOwner: '',
      alertKind: 'todos',
      alertPriority: 'todos',
      legalEntity: '',
      drilldown: '',
      customer: '',
      vehicle: '',
      serviceType: '',
      status: '',
      filter: 'todos',
      search: '',
      globalQuery: '',
      sortKey: '',
      sortDir: 'desc',
      page: 1,
      routeSelected: '',
      driverSelected: ''
    });
    render();
  }
  if (action === 'save-filter') {
    const name = prompt('Nome para este conjunto de filtros:');
    if (name && name.trim()) {
      state.presets = { ...state.presets };
      state.presets[name.trim().slice(0, 45)] = {
        alertArchive: !!state.alertArchive,
        alertAllTracked: !!state.alertAllTracked,
        alertRelevant: !!state.alertRelevant,
        alertUnassigned: !!state.alertUnassigned,
        alertRecurrent: !!state.alertRecurrent,
        rvStage: state.rvStage,
        alertGroup: state.alertGroup,
        alertGrouping: state.alertGrouping,
        tripFocus: state.tripFocus,
        alertScope: state.alertScope,
        alertDue: state.alertDue,
        alertStatus: state.alertStatus,
        alertOwner: state.alertOwner,
        alertKind: state.alertKind,
        alertPriority: state.alertPriority,
        legalEntity: state.legalEntity,
        drilldown: state.drilldown,
        from: state.from,
        to: state.to,
        customer: state.customer,
        vehicle: state.vehicle,
        serviceType: state.serviceType,
        status: state.status,
        filter: state.filter,
        search: state.search,
        sortKey: state.sortKey,
        sortDir: state.sortDir
      };
      !remoteClient.active() &&
        localStorage.setItem('costalog_filter_presets_' + state.company, JSON.stringify(state.presets));
      render();
    }
  }
  if (action === 'delete-filter') {
    const sel = document.getElementById('savedPreset'),
      name = sel?.value;
    if (!name) {
      alert('Selecione primeiro um filtro salvo.');
      return;
    }
    if (confirm('Excluir o filtro salvo ' + name + '?')) {
      state.presets = { ...state.presets };
      delete state.presets[name];
      !remoteClient.active() &&
        localStorage.setItem('costalog_filter_presets_' + state.company, JSON.stringify(state.presets));
      render();
    }
  }
  if (action === 'clear-settings') {
    if (confirm('Limpar filtros salvos e preferências de colunas?')) {
      localStorage.removeItem('costalog_filter_presets_' + state.company);
      localStorage.removeItem('costalog_visible_columns');
      state.presets = {};
      state.hiddenColumns = {};
      state.autoRefresh = 0;
      activateRefresh();
      render();
    }
  }
  if (action === 'connect') {
    state.connect = true;
    state.selected = null;
    render();
  }
  if (action === 'go-viagens') {
    state.view = 'viagens';
    state.page = 1;
    render();
  }
  if (action === 'csv') {
    try {
      exportAdvanced(
        state.view === 'ctes'
          ? 'pedidos'
          : state.view === 'mdfes'
            ? 'mdfes'
            : state.permissions.financeiro && state.view === 'clientes'
              ? 'clientes'
              : 'viagens',
        'csv'
      );
    } catch (err) {
      alert(err.message);
    }
  }
  if (action === 'print') {
    try {
      const type = state.view === 'ctes' ? 'pedidos' : state.view === 'mdfes' ? 'mdfes' : 'viagens';
      exportAdvanced(type, 'pdf');
    } catch (err) {
      alert(err.message);
    }
  }
  if (action === 'prev') {
    state.page--;
    render();
  }
  if (action === 'next') {
    state.page++;
    render();
  }
  if (action === 'demo') {
    clearSession();
    state.connect = false;
    render();
  }
  if (action === 'logout') {
    if (remoteClient.active()) {
      remoteClient.flushPreferences().finally(() => {
        clearSession();
        render();
      });
      return;
    }
    clearSession();
    render();
  }
  if (action === 'test-connect') {
    portalLogin();
  }
});
root.addEventListener('submit', e => {
  if (['pendingRulesForm', 'pendingBatchForm'].includes(e.target?.id)) {
    e.preventDefault();
    pendingClient.submit(e.target);
    return;
  }
  if (e.target?.id === 'taskForm') {
    e.preventDefault();
    saveTask();
    return;
  }
  if (e.target?.id === 'loginForm') {
    e.preventDefault();
    portalLogin();
  }
  if (e.target?.id === 'createPortalUser') {
    e.preventDefault();
    createPortalUser();
  }
  if (e.target?.id === 'forcePasswordChange') {
    e.preventDefault();
    changePortalPassword();
  }
  if (e.target?.id === 'resetPortalUserPassword') {
    e.preventDefault();
    const password = document.getElementById('adminResetPassword')?.value || '';
    if (state.adminResetUser && password.length >= 12)
      updatePortalUser(state.adminResetUser, 'reset-password', { password });
  }
});
root.addEventListener('change', e => {
  if (pendingClient.handleChange(e.target)) return;
  if (e.target.id === 'taskStatus') {
    const reason = document.getElementById('taskResolutionReason');
    if (reason) reason.required = e.target.value === 'resolvida';
    return;
  }
  if (e.target.dataset?.datePicker) {
    const id = e.target.dataset.datePicker,
      input = document.getElementById(id) || { id };
    input.value = e.target.value;
    applyDateEdit(input, { calendar: true });
    return;
  }
  if (DATE_FIELDS.has(e.target.id)) {
    applyDateEdit(e.target);
    return;
  }

  if (e.target.id === 'alertGrouping') {
    state.alertGrouping = e.target.value === 'rv' ? 'rv' : 'lista';
    state.alertGroup = '';
    state.page = 1;
    render();
    return;
  }
  if (e.target.id === 'legalEntityFilter') {
    state.legalEntity = e.target.value;
    state.tripFocus = '';
    Object.assign(state, {
      page: 1,
      detailPage: 1,
      selected: null,
      customer: '',
      vehicle: '',
      serviceType: '',
      status: '',
      search: '',
      globalQuery: '',
      routeSelected: '',
      driverSelected: ''
    });
    render();
    return;
  }
  if (e.target.id === 'alertDueFilter') {
    state.alertDue = e.target.value;
    state.page = 1;
    render();
    return;
  }
  if (e.target.id === 'alertStatusFilter') {
    state.alertStatus = e.target.value;
    state.page = 1;
    render();
    return;
  }
  if (e.target.id === 'reportFormat') {
    state.reportFormat = e.target.value;
    render();
    return;
  }
  if (e.target.id === 'reportTemplateSelect') {
    state.templateSelected = e.target.value;
    if (e.target.value) applySelectedReportTemplate();
    else render();
    return;
  }
  if (e.target.dataset?.adminRole && state.permissions.admin) {
    const username = e.target.dataset.adminRole,
      role = e.target.value;
    const previous = state.adminUsers.find(u => u.username === username)?.role;
    if (role !== previous && confirm('Alterar a permissão de ' + username + ' para ' + role + '?'))
      updatePortalUser(username, 'role', { role });
    else render();
    return;
  }
  if (e.target.id === 'compareCustom') {
    state.compareCustom = e.target.checked;
    state.comparison = null;
    state.comparisonError = '';
    comparisonSeq++;
    render();
    return;
  }
  if (e.target.id === 'compareAnchorInput') {
    state.compareAnchor = e.target.value;
    state.comparison = null;
    state.comparisonError = '';
    comparisonSeq++;
    render();
    return;
  }
  if (e.target.id === 'alertPriorityFilter') {
    state.alertPriority = e.target.value;
    state.page = 1;
    render();
    return;
  }
  if (e.target.id === 'alertKindFilter') {
    state.alertKind = e.target.value;
    state.page = 1;
    render();
    return;
  }
  if (e.target.dataset?.metricToggle) {
    const id = e.target.dataset.metricToggle;
    const current = normalizedLayout(state.metricLayout, { financial: !!state.permissions.financeiro });
    state.metricLayout = e.target.checked ? [...new Set([...current, id])] : current.filter(x => x !== id);
    saveMetricPreferences();
    render();
    return;
  }
  if (e.target.id === 'recordStatusFilter') {
    state.status = e.target.value;
    state.page = 1;
    render();
    return;
  }
  if (e.target.id === 'statusFilter') {
    state.filter = e.target.value;
    state.page = 1;
    render();
  }
  if (e.target.id === 'filterClient') {
    state.routeSelected = '';
    state.driverSelected = '';
    state.customer = e.target.value;
    state.page = 1;
    render();
  }
  if (e.target.id === 'filterPlate') {
    state.routeSelected = '';
    state.driverSelected = '';
    state.vehicle = e.target.value;
    state.page = 1;
    render();
  }
  if (e.target.id === 'filterType') {
    state.serviceType = e.target.value;
    state.page = 1;
    render();
  }
  if (e.target.id === 'sortDir') {
    state.sortDir = e.target.value;
    if (state.tableSort?.[state.view]) state.tableSort[state.view].direction = state.sortDir;
    state.page = 1;
    render();
  }
  if (e.target.id === 'autoRefresh') {
    state.autoRefresh = 0;
    activateRefresh();
    render();
  }
  if (e.target.id === 'reportSelected') {
    state.reportSelected = e.target.value;
    state.page = 1;
    state.sortKey = '';
    render();
  }
  if (e.target.id === 'reportMulti') {
    state.reportMulti = e.target.value === 'all';
    render();
  }
  if (e.target.id === 'savedPreset' && e.target.value) {
    resetDateControls();
    const preset = state.presets[e.target.value];
    if (!preset) return;
    const allowed = [
      'alertArchive',
      'alertAllTracked',
      'alertRelevant',
      'alertUnassigned',
      'alertRecurrent',
      'rvStage',
      'alertGroup',
      'alertGrouping',
      'tripFocus',
      'alertScope',
      'alertDue',
      'alertStatus',
      'alertOwner',
      'alertKind',
      'alertPriority',
      'legalEntity',
      'drilldown',
      'from',
      'to',
      'customer',
      'vehicle',
      'serviceType',
      'status',
      'filter',
      'search',
      'sortKey',
      'sortDir'
    ];
    Object.assign(
      state,
      {
        alertArchive: false,
        alertAllTracked: false,
        alertUnassigned: false,
        alertRecurrent: false,
        alertRelevant: false,
        pendingDialog: '',
        technicalOpen: false,
        pendingRecord: '',
        linkMessage: '',
        alertGroup: '',
        tripFocus: '',
        alertScope: 'todos',
        alertDue: 'todos',
        alertStatus: 'todos',
        alertOwner: '',
        alertKind: 'todos',
        alertPriority: 'todos',
        legalEntity: '',
        drilldown: '',
        customer: '',
        vehicle: '',
        serviceType: '',
        status: '',
        filter: 'todos',
        search: '',
        sortKey: '',
        sortDir: 'desc'
      },
      Object.fromEntries(allowed.filter(key => Object.hasOwn(preset, key)).map(key => [key, preset[key]])),
      { page: 1, prevDataset: null, routeSelected: '', driverSelected: '' }
    );
    render();
  }
  if (e.target.id === 'quickPeriod' && e.target.value) {
    resetDateControls(['from', 'to']);
    const now = new Date(),
      today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const iso = x => x.toISOString().slice(0, 10);
    let from, to;
    if (e.target.value === 'this-month') {
      from = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
      to = today;
    }
    if (e.target.value === 'last-month') {
      from = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1));
      to = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 0));
    }
    if (e.target.value === 'this-year') {
      from = new Date(Date.UTC(now.getFullYear(), 0, 1));
      to = today;
    }
    if (e.target.value === 'last-90') {
      from = new Date(today.getTime() - 89 * 86400000);
      to = today;
    }
    state.from = iso(from);
    state.to = iso(to);
    state.page = 1;
    state.prevDataset = null;
    render();
  }
  if (e.target.dataset.columnToggle) {
    const [view, key] = e.target.dataset.columnToggle.split(':'),
      old = state.hiddenColumns[view] || [];
    state.hiddenColumns[view] = e.target.checked ? old.filter(x => x !== key) : [...new Set([...old, key])];
    !remoteClient.active() && localStorage.setItem('costalog_visible_columns', JSON.stringify(state.hiddenColumns));
    render();
  }
  if (e.target.id === 'csvMDFE') {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (remoteClient.active()) {
      file
        .text()
        .then(text => remoteClient.importMdfes(parseCsv(text)))
        .then(count => alert(count + ' MDF-e importados para a consulta atual.'))
        .catch(error => alert(error.message));
      return;
    }
    file
      .text()
      .then(text => {
        const records = parseCsv(text);
        if (!records.length) {
          alert('Nenhum registro válido no CSV. Confira o cabeçalho.');
          return;
        }
        const imported = scopeCompanyData(
          { mdfes: records.map(row => ({ ...row, empresa: row.empresa || state.company })) },
          state.company
        ).mdfes;
        state.dataset = { ...state.dataset, mdfes: imported, sources: { ...state.dataset.sources, mdfes: true } };
        state.importCount = imported.length;
        render();
        alert(imported.length + ' MDF-e carregados para ' + COMPANIES[state.company].label + '.');
      })
      .catch(() => alert('Não foi possível ler o arquivo.'));
  }
});
const DATE_FIELDS = new Set([
  'from',
  'to',
  'compareCurrentFrom',
  'compareCurrentTo',
  'comparePreviousFrom',
  'comparePreviousTo',
  'dayDate',
  'taskDue'
]);
function applyDateEdit(input, { typing = false, calendar = false, enter = false } = {}) {
  const id = input.id,
    max = ['from', 'to'].includes(id) ? localToday() : '',
    optional = id === 'taskDue';
  const result = editDateControl(input, {
    max,
    optional,
    showError: !typing || String(input.value || '').replace(/\D/g, '').length >= 8
  });
  const refresh = document.querySelector('[data-action="refresh"]');
  if (refresh) refresh.disabled = state.loading || hasDateErrors(['from', 'to']);
  if (!result.valid) {
    if (enter) input.reportValidity?.();
    return;
  }
  if (optional) return;
  state[id] = result.iso;
  state.page = 1;
  if (id === 'from' && state.from > state.to) {
    state.to = state.from;
    resetDateControls(['to']);
  }
  if (id === 'to' && state.to < state.from) {
    state.from = state.to;
    resetDateControls(['from']);
  }
  if (id.startsWith('compare')) {
    state.compareCustom = true;
    state.comparison = null;
    state.comparisonError = '';
    state.comparisonLoading = false;
    comparisonSeq++;
  }
  if (id === 'dayDate') state.programPage = 1;
  if (calendar || enter) {
    render();
    return;
  }
  const cursor = input.selectionStart;
  if (textRenderTimer) clearTimeout(textRenderTimer);
  textRenderTimer = setTimeout(() => {
    const focused = document.activeElement === input;
    render();
    const field = document.getElementById(id);
    if (focused && field) {
      field.focus?.();
      if (typeof cursor === 'number') field.setSelectionRange?.(cursor, cursor);
    }
  }, 350);
}
// Personalizar cartões: arrastar e soltar com o mouse (somente com "Personalizar cartões" aberto).
let draggedMetric = '';
const metricTarget = e => (state.showMetricOptions && draggedMetric ? e.target?.closest?.('[data-metric-card]') : null);
const dropAfter = (card, e) => {
  const r = card.getBoundingClientRect();
  return e.clientX > r.left + r.width / 2;
};
const clearDropMarks = () =>
  root
    .querySelectorAll?.('.drop-before,.drop-after,.is-dragging')
    .forEach(el => el.classList.remove('drop-before', 'drop-after', 'is-dragging'));
function applyMetricLayout(layout, focusId = '') {
  const before = JSON.stringify(normalizedLayout(state.metricLayout, { financial: !!state.permissions.financeiro }));
  if (JSON.stringify(layout) === before) return;
  state.metricLayout = layout;
  saveMetricPreferences();
  // Enquanto o servidor redesenha o painel, a página anterior (esmaecida) já mostra a nova ordem.
  remoteClient.reshapeStale?.(html => reorderMetricCards(html, layout));
  render();
  if (focusId) document.querySelector?.('[data-metric-card="' + focusId + '"]')?.focus?.();
}
function reorderMetricCards(html, layout) {
  if (typeof document?.createElement !== 'function') return html;
  const box = document.createElement('template');
  box.innerHTML = html;
  const grid = box.content.querySelector('.ins-metric-grid');
  if (!grid) return html;
  const cards = new Map([...grid.querySelectorAll('[data-metric-card]')].map(card => [card.dataset.metricCard, card]));
  for (const id of layout) if (cards.has(id)) grid.append(cards.get(id));
  return box.innerHTML;
}
root.addEventListener('dragstart', e => {
  const card = state.showMetricOptions && e.target?.closest?.('[data-metric-card]');
  if (!card) return;
  draggedMetric = card.dataset.metricCard;
  card.classList.add('is-dragging');
  try {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedMetric);
  } catch {}
});
root.addEventListener('dragover', e => {
  const card = metricTarget(e);
  if (!card) return;
  e.preventDefault();
  try {
    e.dataTransfer.dropEffect = 'move';
  } catch {}
  if (card.dataset.metricCard === draggedMetric) return;
  const after = dropAfter(card, e);
  card.classList.toggle('drop-after', after);
  card.classList.toggle('drop-before', !after);
});
root.addEventListener('dragleave', e => {
  const card = metricTarget(e);
  if (card && !card.contains(e.relatedTarget)) card.classList.remove('drop-before', 'drop-after');
});
root.addEventListener('drop', e => {
  const card = metricTarget(e);
  if (!card) return;
  e.preventDefault();
  const id = draggedMetric,
    target = card.dataset.metricCard,
    after = dropAfter(card, e);
  draggedMetric = '';
  clearDropMarks();
  applyMetricLayout(moveMetric(state.metricLayout, id, target, { after, financial: !!state.permissions.financeiro }));
});
root.addEventListener('dragend', () => {
  draggedMetric = '';
  clearDropMarks();
});
root.addEventListener(
  'toggle',
  e => {
    if (e.target.closest?.('.stale-view') || renderedOpen.get(e.target) === e.target.open) return;
    const key =
      e.target.id === 'dayPrograms'
        ? 'dayProgramsOpen'
        : e.target.id === 'advancedFilters'
          ? 'filtersOpen'
          : e.target.id === 'technicalInfo' && state.permissions.admin
            ? 'technicalOpen'
            : '';
    if (key && state[key] !== e.target.open) {
      state[key] = e.target.open;
      render();
    }
  },
  true
);
root.addEventListener('input', e => {
  if (DATE_FIELDS.has(e.target.id)) {
    applyDateEdit(e.target, { typing: true });
    return;
  }

  if (e.target.id === 'taskOwner') {
    state.taskOwnerSelf = false;
    const account = document.getElementById('taskOwnerAccount'),
      username = assignmentForOwner(e.target.value, state.user, state.taskDetail);
    if (account)
      account.textContent = username
        ? 'Conta: ' + username
        : 'Responsável informado por nome; nenhuma conta vinculada.';
    return;
  }
  if (!['searchInput', 'alertOwnerFilter'].includes(e.target.id)) return;
  const id = e.target.id,
    cursor = e.target.selectionStart;
  if (id === 'alertOwnerFilter') {
    state.alertOwner = e.target.value;
    state.page = 1;
  } else {
    state.search = e.target.value;
    state.page = 1;
    state.routeSelected = '';
    state.driverSelected = '';
  }
  if (textRenderTimer) clearTimeout(textRenderTimer);
  textRenderTimer = setTimeout(() => {
    render();
    const input = document.getElementById(id);
    if (input) {
      input.focus?.();
      if (typeof cursor === 'number') input.setSelectionRange?.(cursor, cursor);
    }
  }, 160);
});
root.addEventListener('keydown', e => {
  const metricCard = state.showMetricOptions && e.target?.closest?.('[data-metric-card]');
  if (metricCard && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
    e.preventDefault();
    const id = metricCard.dataset.metricCard;
    applyMetricLayout(
      reorderMetric(state.metricLayout, id, ['ArrowLeft', 'ArrowUp'].includes(e.key) ? -1 : 1, {
        financial: !!state.permissions.financeiro
      }),
      id
    );
    return;
  }
  if (e.key === 'Enter' && DATE_FIELDS.has(e.target.id)) {
    e.preventDefault();
    applyDateEdit(e.target, { enter: true });
    return;
  }

  const point = e.target?.closest?.('[data-chart-point]');
  if (point && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    activateChartPoint(point);
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && (state.selected || state.connect || state.taskSelected)) {
    state.selected = null;
    state.connect = false;
    state.taskSelected = null;
    render();
  }
});
function applyIncomingLink(link) {
  remoteClient.reset();
  state.remoteSnapshot = '';
  state.rvStage = '';
  resetDateControls();
  identityEpoch++;
  comparisonSeq++;
  syncSeq++;
  clearViewCache();
  Object.assign(
    state,
    {
      dataset: state.token ? emptyDataset() : demo,
      selected: null,
      pendingRecord: '',
      tripFocus: '',
      drilldown: '',
      customer: '',
      vehicle: '',
      serviceType: '',
      search: '',
      status: '',
      filter: 'todos',
      alertGroup: '',
      alertScope: 'todos',
      alertDue: 'todos',
      alertStatus: 'todos',
      alertKind: 'todos',
      alertPriority: 'todos',
      alertOwner: '',
      comparison: null,
      comparisonLoading: false,
      comparisonError: '',
      loading: false,
      loadedRange: null,
      lastSync: null,
      syncMetadata: [],
      tasks: {},
      taskIndexLoaded: false,
      taskIndexLoading: false,
      taskIndexError: '',
      technicalOpen: false,
      page: 1
    },
    link.state
  );
  if (!PUBLIC_DEMO) {
    state.mode = 'live';
    state.dataset = emptyDataset();
    state.linkMessage = state.token
      ? 'Consulta compartilhada. Atualize os dados para ver os registros autorizados.'
      : 'Link compartilhado. Entre no portal e atualize os dados para consultar.';
  }
  sharedIntent = link;
  sharedLoginPending = !state.token && link.hasLink;
  loadMetricPreferences();
  render();
}
async function copyPortalLink(record = '') {
  const url = portalLink(window.location, state, { record });
  try {
    if (!globalThis.navigator?.clipboard?.writeText) throw Error('clipboard');
    await navigator.clipboard.writeText(url);
    state.linkMessage = 'Link copiado.';
    render();
  } catch {
    prompt('Copie o link da consulta (o destinatário precisará entrar no portal):', url);
  }
}
window.addEventListener?.('popstate', () => applyIncomingLink(parsePortalLink(window.location)));
loadMetricPreferences();
if (sharedIntent.hasLink) applyIncomingLink(sharedIntent);
else render();
// Nenhuma consulta automática ao abrir o portal.
