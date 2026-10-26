import { normalizeOverview } from '../src/dss-mapping.mjs';
import { scopeCompanyData, companyIdentity } from '../src/companies.mjs';
import { projectOverview } from './access.mjs';
import { operationalDataset, OP_VIEWS } from '../src/access-ui.mjs';
import { clearViewCache } from '../src/view-cache.mjs';
import { renderPortalView } from '../src/portal-view.mjs';

/** Somente o que é do servidor: valida o estado, lê tratamentos, importa MDF-e e resolve comparativos.
 * Toda a apresentação vem de src/portal-view.mjs, o mesmo renderizador do navegador. */
const stateFields = [
  'alertUnassigned',
  'alertRecurrent',
  'alertAllTracked',
  'alertArchive',
  'preferenceStorage',
  'view',
  'from',
  'to',
  'legalEntity',
  'customer',
  'vehicle',
  'serviceType',
  'status',
  'rvStage',
  'search',
  'filter',
  'sortKey',
  'sortDir',
  'page',
  'detailPage',
  'timelinePage',
  'routeSelected',
  'driverSelected',
  'reportSelected',
  'reportMulti',
  'hiddenColumns',
  'reportColumnOrder',
  'reportTemplates',
  'templateSelected',
  'reportFormat',
  'presets',
  'metricLayout',
  'showMetricOptions',
  'tableSort',
  'alertPriority',
  'alertKind',
  'alertStatus',
  'alertOwner',
  'alertScope',
  'alertDue',
  'alertGrouping',
  'alertGroup',
  'tripFocus',
  'dayDate',
  'dayCategory',
  'tvMode',
  'dayProgramsOpen',
  'programPage',
  'filtersOpen',
  'technicalOpen',
  'drilldown',
  'selected',
  'compareCurrentFrom',
  'compareCurrentTo',
  'comparePreviousFrom',
  'comparePreviousTo'
];
function cleanState(input) {
  const state = Object.fromEntries(stateFields.filter(key => Object.hasOwn(input, key)).map(key => [key, input[key]]));
  for (const key of ['page', 'detailPage', 'timelinePage', 'programPage'])
    state[key] = Math.max(1, Math.min(1000000, Math.floor(Number(state[key]) || 1)));
  for (const [k, v] of Object.entries(state)) if (typeof v === 'string' && v.length > 500) state[k] = v.slice(0, 500);
  if (!OP_VIEWS.includes(state.view)) throw Object.assign(Error('Área não permitida.'), { status: 400 });
  return state;
}
function companyData(snapshot, company, role) {
  const key = company;
  snapshot.normalized ||= new Map();
  if (!snapshot.normalized.has(key))
    snapshot.normalized.set(
      key,
      operationalDataset(normalizeOverview(projectOverview(snapshot.payload, 'operacional', company)))
    );
  return snapshot.normalized.get(key);
}
export async function portalResponse({ action, input, snapshot, user, company, workflowStore, portalSessions }) {
  const state = cleanState(input.state || {});
  const full = companyData(snapshot, company, user.role);
  Object.assign(state, {
    company,
    role: user.role,
    user,
    mode: 'live',
    permissions: { ...user.permissions, financeiro: false },
    loadedRange: { from: snapshot.from, to: snapshot.to },
    lastSync: snapshot.payload.updatedAt,
    dataset: full,
    tasks: {},
    taskIndexLoaded: false,
    taskIndexError: '',
    syncMetadata: user.permissions.admin ? [snapshot.payload.quality || {}] : []
  });
  if (
    action !== 'compare' &&
    (!state.from || !state.to || state.from < snapshot.from || state.to > snapshot.to || state.from > state.to)
  )
    throw Object.assign(Error('Período fora da consulta carregada. Atualize os dados da DSS.'), { status: 409 });
  if (
    action === 'metrics' ||
    state.view === 'pendencias' ||
    (state.view === 'relatorios' && state.reportSelected === 'pendencias') ||
    action === 'export'
  ) {
    try {
      state.tasks = await workflowStore.get(company);
      state.taskIndexLoaded = true;
    } catch {
      state.taskIndexError = 'Tratamentos indisponíveis. Configure o armazenamento persistente ou tente novamente.';
    }
  }
  // Nada de await daqui em diante: o cache de apresentação é limpo entre requisições de usuários diferentes.
  clearViewCache();
  if (action === 'import') {
    if (!Array.isArray(input.rows) || input.rows.length > 1000)
      throw Object.assign(Error('Importe até 1.000 MDF-e por arquivo.'), { status: 400 });
    const rows = input.rows
      .map(row =>
        Object.fromEntries(
          ['id', 'numero', 'empresa', 'data', 'viagemId', 'placa', 'status']
            .filter(k => typeof row[k] === 'string' && row[k].length <= 200)
            .map(k => [k, row[k]])
        )
      )
      .map(row => ({ ...row, empresa: row.empresa || company }));
    const imported = scopeCompanyData({ mdfes: rows }, company)
      .mdfes.filter(row => row.numero)
      .map(row => {
        const entity = companyIdentity(row),
          trip = full.viagens.find(trip => trip.id === row.viagemId && companyIdentity(trip) === entity);
        return { ...row, id: entity + '~import-' + row.id, viagemId: trip?.id || null };
      });
    snapshot.normalized.set(company, { ...full, mdfes: imported, sources: { ...full.sources, mdfes: true } });
    return { count: imported.length };
  }
  if (action === 'compare') {
    const a = portalSessions.get(input.currentSnapshot, user),
      b = portalSessions.get(input.previousSnapshot, user);
    state.comparison = {
      company,
      currentRange: { from: state.compareCurrentFrom, to: state.compareCurrentTo },
      previousRange: { from: state.comparePreviousFrom, to: state.comparePreviousTo },
      current: companyData(a, company, user.role),
      previous: companyData(b, company, user.role)
    };
  }
  const result = renderPortalView({
    action,
    full,
    state,
    exportMulti: input.multi === true,
    exportType: input.type,
    workflowWarning: snapshot.payload.workflowUnavailable
      ? '<p class="ins-inline-error" role="status">Os dados DSS foram carregados, mas o acompanhamento das pendências não pôde ser atualizado. Atualize os dados novamente para repetir.</p>'
      : ''
  });
  if (action === 'detail' && state.selected === null && input.state?.selected)
    throw Object.assign(Error('Registro não encontrado nesta empresa e período.'), { status: 404 });
  return result;
}
