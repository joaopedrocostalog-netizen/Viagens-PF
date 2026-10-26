/**
 * Renderizador ÚNICO das áreas do portal.
 * - Servidor (api/portal-render.mjs): consulta preparada da DSS, com paginação de rede.
 * - Navegador (src/app.js): modo demonstração e servidores anteriores.
 * Qualquer correção de tela é feita aqui uma vez só e vale para os dois modos.
 * Não consulta a DSS, não grava nada e só lê o `state` recebido (exceto paginação/seleção normalizadas).
 */
import { KM_FROM_API, unavailableKey } from './data-availability.mjs';
import { scopeCompanyData, companyIdentity } from './companies.mjs';
import { permittedView, buildOperationalReport, reportTypesFor } from './access-ui.mjs';
import { filterOperationalData, searchOperationalData, filterLinkedRows } from './filtering.mjs';
import { filterRvStage, renderRelatedRvStages } from './rv-stage-filter.mjs';
import { rvStatusCounts, renderRvStatusStages } from './rv-status.mjs';
import { memoView } from './view-cache.mjs';
import { searchRecords } from './operational.mjs';
import {
  renderGrid,
  renderAdvanced,
  renderReportHub,
  filterOptions,
  renderActiveFilters,
  filterView
} from './advanced-ui.mjs';
import {
  renderGlobalSearch,
  renderCustomDashboard,
  renderMyTasksSummary,
  renderAlertsHub,
  renderDriverRouteDetails,
  renderComparison
} from './intelligence-ui.mjs';
import { renderHero, renderSummary, renderTripsHeader, renderReportsHeader } from './visual-dashboard.mjs';
import { renderDayProgramming, dayStageData } from './programming.mjs';
import { renderTripChecklist } from './rv-checklist.mjs';
import { createTripTimeline } from './trip-timeline.mjs';
import { renderDataQuality } from './data-quality.mjs';

const esc = value =>
  String(value ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const dateBR = v =>
  /^\d{4}-\d{2}-\d{2}/.test(String(v || ''))
    ? v.slice(8, 10) + '/' + v.slice(5, 7) + '/' + v.slice(0, 4)
    : esc(v || '—');
const button = (action, label, extra = '') =>
  '<button type="button" class="btn ' + extra + '" data-action="' + action + '">' + label + '</button>';

/** Campos financeiros nunca aparecem neste portal operacional, em nenhum perfil. */
const FINANCIAL_KEYS = new Set([
  'custo',
  'receita',
  'abastecimento',
  'custoAbastecimentoKm',
  'adiantamento',
  'proventos',
  'liquido',
  'valor',
  'valorReceber',
  'valorAverbacao',
  'valorIcmsIss',
  'freteSemIcms',
  'valorMercadorias',
  'numeroFatura',
  'liberadoFaturamento',
  'statusPagamentoSaldo',
  'dataPagamentoSaldo',
  'contratoVf'
]);
const DETAIL_LABELS = {
  tipoRv: 'Tipo de RV',
  numero: 'Número',
  data: 'Data',
  dataTermino: 'Término',
  cliente: 'Cliente',
  nroMdf: 'MDF-e informado',
  rvReferencia: 'RV referenciada',
  pedidoNumero: 'Pedido de frete',
  cteNumero: 'Número CT-e',
  placa: 'Placa',
  origem: 'Origem',
  destino: 'Destino',
  status: 'Situação',
  viagemId: 'Viagem',
  chave: 'Chave CT-e',
  motoristaNome: 'Motorista',
  motoristaId: 'Motorista ID',
  tipoServico: 'Tipo de serviço',
  empresa: 'Empresa'
};

const TRIP_COLUMNS = [
  { key: 'numero', label: 'Nº RV', detail: 'viagens' },
  { key: 'tipoRv', label: 'Tipo de RV' },
  { key: 'data', label: 'Início', format: 'date' },
  { key: 'dataTermino', label: 'Término', format: 'date' },
  { key: 'cliente', label: 'Cliente' },
  { key: 'placa', label: 'Placa' },
  { key: 'motoristaId', label: 'Motorista ID' },
  { key: 'motoristaNome', label: 'Motorista' },
  { key: 'container', label: 'Container' },
  { key: 'nroMdf', label: 'Referência MDF-e' },
  { key: 'origem', label: 'Origem' },
  { key: 'destino', label: 'Destino' },
  { key: 'kmPrevisto', label: 'KM previsto', format: 'number' },
  { key: 'kmRodados', label: 'KM rodado', format: 'number' },
  { key: 'desvioKm', label: 'Desvio KM', format: 'number' },
  { key: 'status', label: 'Situação' }
];
const ORDER_COLUMNS = [
  { key: 'pedidoNumero', label: 'Pedido PF', detail: 'ctes' },
  { key: 'cteNumero', label: 'CT-e' },
  { key: 'data', label: 'Emissão', format: 'date' },
  { key: 'dataCte', label: 'Emissão CT-e', format: 'date' },
  { key: 'cliente', label: 'Cliente' },
  { key: 'motoristaNome', label: 'Motorista' },
  { key: 'placa', label: 'Placa' },
  { key: 'rvReferencia', label: 'RV ref.' },
  { key: 'nroMdf', label: 'MDF-e ref.' },
  { key: 'entregaConcluida', label: 'Entrega concluída', format: 'bool' },
  { key: 'comprovanteEntrega', label: 'Comprovante', format: 'bool' },
  { key: 'ocorrencia', label: 'Ocorrência' },
  { key: 'status', label: 'Situação' }
];
const MDFE_COLUMNS = [
  { key: 'numero', label: 'MDF-e', detail: 'mdfes' },
  { key: 'data', label: 'Emissão', format: 'date' },
  { key: 'viagemId', label: 'RV vinculada' },
  { key: 'placa', label: 'Placa' },
  { key: 'status', label: 'Situação declarada' }
];
const INCIDENT_COLUMNS = [
  { key: 'data', label: 'Data', format: 'date' },
  { key: 'id', label: 'ID' },
  { key: 'placa', label: 'Placa' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'descricao', label: 'Descrição' },
  { key: 'relato', label: 'Relato' },
  { key: 'status', label: 'Situação' },
  { key: 'providencia', label: 'Providência' }
];
const INCIDENTS_UNAVAILABLE =
  '<p class="help" role="status">As ocorrências não estão disponíveis nesta consulta. Uma lista vazia não confirma ausência de ocorrências.</p>';

// Separação por empresa/pessoa jurídica + período é a etapa mais cara de cada clique e só depende da base carregada.
// Memorizada por conjunto normalizado (descartado junto com ele); listas derivadas são sempre novas.
const periodCache = new WeakMap(),
  PERIOD_CACHE_MAX = 8;
export function periodData(full, company, entity, from, to) {
  let saved = periodCache.get(full);
  if (!saved) periodCache.set(full, (saved = new Map()));
  const k = [company, entity || '', from, to].join('|');
  if (saved.has(k)) {
    const v = saved.get(k);
    saved.delete(k);
    saved.set(k, v);
    return v;
  }
  const v = filterOperationalData(scopeCompanyData(full, company, entity), { from, to });
  saved.set(k, v);
  while (saved.size > PERIOD_CACHE_MAX) saved.delete(saved.keys().next().value);
  return v;
}

/** Espaço do painel de filtros na página. As opções chegam à parte (ação "filters") só quando o painel é aberto,
 * para a página não carregar listas grandes de clientes/placas em cada clique. */
export const FILTER_SLOT = '<div class="v-extra-filters" id="advancedFiltersPanel" data-filter-slot></div>';
export function renderListFilters(period, state) {
  return FILTER_SLOT + renderActiveFilters(state);
}

function renderDrawer(period, state) {
  const [kind, id] = String(state.selected || '').split(':');
  if (!permittedView(state.role, kind)) {
    state.selected = null;
    return '';
  }
  const item =
    kind === 'viagens'
      ? period.viagens.find(x => x.id === id)
      : kind === 'ctes'
        ? [...period.pedidos, ...period.ctes].find(x => x.id === id)
        : (period.mdfes || []).find(x => x.id === id);
  if (!item) {
    state.selected = null;
    return '';
  }
  const rows = Object.entries(item)
    .filter(([k]) => !['id', 'isCte'].includes(k) && !unavailableKey(k) && !FINANCIAL_KEYS.has(k))
    .map(
      ([k, v]) =>
        '<div class="detail-line"><span>' +
        esc(DETAIL_LABELS[k] || k) +
        '</span><b>' +
        (k === 'data' || k === 'dataTermino' ? dateBR(v) : esc(v === null || v === '' ? '—' : v)) +
        '</b></div>'
    )
    .join('');
  let related = '';
  if (kind === 'viagens') {
    const { cs, ms, orders, incidents } = memoView('drawer-related', [item, period], () => ({
      cs: period.ctes.filter(c => c.viagemId === id),
      ms: (period.mdfes || []).filter(m => m.viagemId === id),
      orders: period.pedidos.filter(p => p.viagemId === id),
      // Contexto por placa e intervalo não estabelece vínculo documental.
      incidents: (period.ocorrencias || [])
        .filter(
          o =>
            (!companyIdentity(o) || companyIdentity(o) === companyIdentity(item)) &&
            item.placa &&
            o.placa === item.placa &&
            o.data &&
            item.data &&
            o.data >= item.data &&
            o.data <= (item.dataTermino || item.data)
        )
        .slice(0, 20)
    }));
    const pager = memoView('trip-timeline', [item, period], () => createTripTimeline(item, period));
    const timelineResult = pager.getPage({ page: state.timelinePage || 1 });
    const pageCount = timelineResult.pages;
    state.timelinePage = timelineResult.page;
    const timeline =
      '<h3 class="drawer-section">Linha do tempo da viagem</h3><ol class="trip-timeline">' +
      timelineResult.rows
        .map(
          event =>
            '<li class="' +
            (event.context ? 'timeline-context' : '') +
            '"><small>' +
            dateBR(event.date || 'Data não fornecida') +
            '</small><strong>' +
            esc(event.title) +
            '</strong><p>' +
            esc(event.detail) +
            '</p>' +
            (event.reference
              ? '<button class="btn btn-sm" data-detail="' + esc(event.reference) + '">Abrir documento</button>'
              : '') +
            '</li>'
        )
        .join('') +
      '</ol>' +
      (pageCount > 1
        ? '<div class="pagination"><span>Página ' +
          state.timelinePage +
          ' de ' +
          pageCount +
          '</span><button class="btn btn-sm" data-action="timeline-prev" ' +
          (state.timelinePage === 1 ? 'disabled' : '') +
          '>Anterior</button><button class="btn btn-sm" data-action="timeline-next" ' +
          (state.timelinePage === pageCount ? 'disabled' : '') +
          '>Próxima</button></div>'
        : '');
    const list = rows =>
      rows
        .slice(0, 15)
        .map(x => esc(x.numero))
        .join(', ');
    related =
      renderTripChecklist(item, period) +
      timeline +
      '<h3 class="drawer-section">Visão 360° da viagem</h3>' +
      '<p class="help">Motorista: ' +
      esc(item.motoristaNome || item.motoristaId || 'Não informado') +
      ' · Veículo: ' +
      esc(item.placa || 'Não informado') +
      '</p>' +
      '<p class="help">Trajeto: ' +
      esc(item.origem || '—') +
      ' → ' +
      esc(item.destino || '—') +
      '</p>' +
      (KM_FROM_API
        ? '<p class="help">KM previsto: ' +
          esc(item.kmPrevisto ?? '—') +
          ' · KM rodado: ' +
          esc(item.kmRodados ?? '—') +
          '</p>'
        : '') +
      '<h3 class="drawer-section">Documentos vinculados</h3>' +
      '<p class="help">Pedidos de frete: ' +
      orders.length +
      (orders.length ? ' · ' + list(orders) : '') +
      '</p>' +
      '<p class="help">CT-e identificados: ' +
      (cs.length ? list(cs) : 'nenhum') +
      '</p>' +
      '<p class="help">MDF-e vinculados: ' +
      (ms.length ? list(ms) : 'nenhum') +
      '</p>' +
      '<h3 class="drawer-section">Ocorrências da mesma placa no intervalo</h3>' +
      '<p class="help">Contexto por placa e data — não confirma relação com esta viagem: ' +
      (incidents.length
        ? incidents.map(o => esc(o.data) + ' · ' + esc(o.descricao || o.tipo || o.status || 'Ocorrência')).join(' | ')
        : 'nenhuma encontrada nos dados carregados') +
      '</p>';
  }
  return (
    '<div class="overlay" data-action="close-overlay"><aside class="drawer" role="dialog" aria-modal="true" aria-label="Detalhes do registro"><div class="drawer-top"><h2>Detalhes · ' +
    esc(item.numero) +
    '</h2>' +
    button('close', '×', 'btn-sm') +
    '</div>' +
    button('share-record', 'Copiar link deste registro', 'btn-sm') +
    (kind === 'viagens'
      ? renderRvStatusStages({ [item.status]: 1 }, item.status, { readonly: true }) +
        related +
        '<details class="rv-fields"><summary>Dados da RV</summary>' +
        rows +
        '</details>'
      : rows) +
    '</aside></div>'
  );
}

/**
 * @param {object} p
 * @param {'view'|'metrics'|'detail'|'export'|'compare'} p.action
 * @param {object} p.full  base normalizada da empresa (todas as pessoas jurídicas, todo o período carregado)
 * @param {object} p.state estado já validado; recebe listFilters, página/seleção normalizadas e visibleAlerts
 * @param {string} [p.workflowWarning] aviso de acompanhamento indisponível (somente servidor)
 * @param {boolean} [p.exportMulti]
 * @param {string} [p.exportType]
 */
export function renderPortalView({ action, full, state, workflowWarning = '', exportMulti = false, exportType = '' }) {
  const period = periodData(full, state.company, state.legalEntity, state.from, state.to);
  if (action === 'filters') return { options: filterOptions(period, state) };
  const stageBase = filterOperationalData(period, { ...state, status: state.view === 'viagens' ? '' : state.status });
  const staged = filterRvStage(period, state.rvStage || '');
  const d = filterOperationalData(staged, state);
  const searchRows = rows => searchRecords(rows, state.search);
  state.listFilters = renderListFilters(period, state);

  if (action === 'detail') {
    if (!state.selected) return { html: '' };
    return { html: renderDrawer(period, state), timelinePage: state.timelinePage };
  }
  if (action === 'export') {
    const allowed = reportTypesFor(state.role),
      types = exportMulti === true ? allowed : [exportType];
    if (types.some(type => !allowed.includes(type)))
      throw Object.assign(Error('Relatório não permitido.'), { status: 403 });
    if (types.includes('pendencias') && !state.taskIndexLoaded)
      throw Object.assign(Error('Carregue os tratamentos antes de exportar pendências.'), { status: 503 });
    return {
      models: types.map(type => buildOperationalReport(type, d, state)),
      company: state.company,
      from: state.from,
      to: state.to
    };
  }
  if (action === 'compare') return { html: renderComparison(d, state) };

  const common = {
    hero: renderHero(state.view, d, state),
    search: renderGlobalSearch(state, d),
    technical: renderDataQuality(state, period)
  };
  if (action === 'metrics' || state.view === 'painel') {
    const searched = searchOperationalData(d, state.search);
    return {
      ...common,
      html:
        workflowWarning +
        state.listFilters +
        renderCustomDashboard(searched, state) +
        renderMyTasksSummary(searched, state) +
        renderSummary(searched, { ...state, financeiro: false, showCards: false })
    };
  }

  const stages =
    state.view === 'viagens'
      ? ''
      : renderRelatedRvStages(
          state.view === 'programacao' ? dayStageData(stageBase, state) : stageBase,
          state.rvStage || ''
        );
  let html = '';
  if (state.view === 'viagens') {
    // Contagem das etapas respeita pesquisa e vínculo, mas não a própria etapa escolhida.
    const stageRows = memoView('rv-stage-rows', [stageBase, state.search, state.filter], () =>
      filterLinkedRows(searchRows(stageBase.viagens), 'viagens', stageBase, state.filter)
    );
    const rows = memoView('trip-rows', [d, state.search, state.filter], () =>
      filterLinkedRows(searchRows(d.viagens), 'viagens', d, state.filter)
    );
    html =
      renderTripsHeader(d) +
      renderRvStatusStages(rvStatusCounts(stageRows), state.status) +
      renderGrid(
        'Viagens cadastradas',
        rows,
        TRIP_COLUMNS,
        state,
        'viagens',
        'Clique no número da RV para consultar a ficha completa e os pedidos relacionados.'
      );
  } else if (state.view === 'ctes') {
    const rows = memoView('order-rows', [d, state.search, state.filter], () =>
      filterLinkedRows(searchRows(d.pedidos), 'pedidos', d, state.filter)
    );
    html = stages + renderGrid('Pedidos de frete', rows, ORDER_COLUMNS, state, 'ctes');
  } else if (state.view === 'mdfes') {
    const rows = memoView('mdfe-rows', [d, state.search, state.filter], () =>
      filterLinkedRows(searchRows(d.mdfes || []), 'mdfes', d, state.filter)
    );
    html =
      stages +
      '<div class="table-tools"><label class="btn btn-sm" for="csvMDFE">Importar CSV de MDF-e</label><input id="csvMDFE" type="file" accept=".csv,text/csv" hidden></div>' +
      renderGrid('Referências de MDF-e', rows, MDFE_COLUMNS, state, 'mdfes');
  } else if (state.view === 'ocorrencias') {
    const rows = memoView('incident-rows', [d, state.search], () => searchRows(d.ocorrencias || []));
    html =
      stages +
      (d.sources?.ocorrencias === false ? INCIDENTS_UNAVAILABLE : '') +
      renderGrid('Ocorrências', rows, INCIDENT_COLUMNS, state, 'ocorrencias');
  } else if (state.view === 'pendencias') html = workflowWarning + stages + renderAlertsHub(d, state);
  else if (['rotas', 'motoristas'].includes(state.view)) html = stages + renderDriverRouteDetails(d, state, state.view);
  else if (state.view === 'programacao') html = stages + renderDayProgramming(d, state);
  else if (state.view === 'relatorios')
    html = stages + renderReportsHeader(d, { financeiro: false, interval: 'mensal' }) + renderReportHub(d, state);
  else if (state.view === 'comparativos') html = renderComparison(d, state);
  else if (state.view === 'veiculos' || state.view === 'entregas') html = stages + renderAdvanced(state.view, d, state);
  return {
    ...common,
    html,
    page: state.page,
    detailPage: state.detailPage,
    programPage: state.programPage,
    visibleAlerts: state.visibleAlerts || [],
    sources: d.sources,
    reportColumns:
      state.view === 'relatorios'
        ? buildOperationalReport(state.reportSelected, d, state, { preview: true }).columns
        : []
  };
}
