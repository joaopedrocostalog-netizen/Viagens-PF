import { KM_FROM_API, availableColumns } from './data-availability.mjs';
import { serviceTypeLabel } from './filtering.mjs';
import { RV_STATUSES, rvStatus } from './rv-status.mjs';
import { memoView } from './view-cache.mjs';
import { renderAlertsHub } from './intelligence-ui.mjs';
import { COMPANIES } from './companies.mjs';
import { reportTypesFor, buildOperationalReport, OP_COLUMNS } from './access-ui.mjs';
import {
  buildInsights,
  sortRecords,
  searchRecords,
  extractRows,
  REPORT_TYPES,
  groupRows,
  operationalGroups
} from './operational.mjs';
const h = v =>
  String(v === null || v === undefined ? '' : v).replace(
    /[&<>"']/g,
    x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[x]
  );
const b = v => (v === true ? 'Sim' : v === false ? 'Não' : '—');
const numberFormatter = new Intl.NumberFormat('pt-BR'),
  moneyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brl = v => (Number.isFinite(v) ? moneyFormatter.format(v) : '—');
const num = v => (Number.isFinite(v) ? numberFormatter.format(v) : '—');
const dt = v =>
  String(v || '').match(/^\d{4}-\d{2}-\d{2}/)
    ? v.slice(8, 10) + '/' + v.slice(5, 7) + '/' + v.slice(0, 4)
    : h(v || '—');
const chip = (label, color = 'gray') => '<span class="pill ' + color + '">' + h(label) + '</span>';
const tt = (label, value, sub = '') =>
  '<article class="kpi"><div class="kpi-label">' +
  h(label) +
  '</div><div class="kpi-value">' +
  h(value) +
  '</div><div class="kpi-sub">' +
  h(sub) +
  '</div></article>';
const opts = (arr, value) =>
  arr
    .map(
      v => '<option value="' + h(v) + '" ' + (String(v) === String(value) ? 'selected' : '') + '>' + h(v) + '</option>'
    )
    .join('');
export const ADVANCED_VIEWS = [
  'pendencias',
  'rotas',
  'veiculos',
  'motoristas',
  'containers',
  'entregas',
  'faturamento',
  'analises',
  'administracao'
];
export const EXPORT_LABELS = {
  entregas: 'Entregas e comprovantes',
  ocorrencias: 'Ocorrências',
  viagens: 'Relatório de viagens',
  pedidos: 'Pedidos e CT-e',
  ctes: 'Somente CT-e',
  clientes: 'Por cliente',
  rotas: 'Por rota',
  veiculos: 'Frota',
  motoristas: 'Motoristas',
  containers: 'Containers',
  mdfes: 'Referências MDF-e',
  pendencias: 'Pendências',
  mensal: 'Resumo mensal',
  programacao: 'Programação do dia'
};
export const PAGE_SIZES = Object.freeze([25, 50, 100]);
/** Linhas por página escolhidas pelo usuário (25, 50 ou 100). */
export const pageSizeOf = s => (PAGE_SIZES.includes(Number(s?.pageSize)) ? Number(s.pageSize) : 25);
/** Seletor "Linhas por página", usado no rodapé de todas as tabelas paginadas. */
export function renderPageSize(s) {
  const size = pageSizeOf(s);
  return (
    '<label class="page-size">Linhas por página <select class="control" data-page-size aria-label="Linhas por página">' +
    PAGE_SIZES.map(n => '<option value="' + n + '"' + (n === size ? ' selected' : '') + '>' + n + '</option>').join(
      ''
    ) +
    '</select></label>'
  );
}
/** Filtros que podem ser removidos individualmente pelas etiquetas acima da tabela. */
export const CLEARABLE_FILTERS = Object.freeze({
  search: '',
  customer: '',
  vehicle: '',
  serviceType: '',
  status: '',
  filter: 'todos',
  rvStage: '',
  dayCategory: ''
});
/** Etiquetas dos filtros ativos ("Cliente: X ✕"), para ficar claro por que a lista tem menos registros. */
export function renderActiveFilters(s) {
  const keys = filterKeysFor(s);
  const applies = key =>
    !['customer', 'vehicle', 'serviceType', 'status', 'filter'].includes(key) ||
    keys.includes(key) ||
    (key === 'status' && filterView(s) === 'viagens');
  const chips = [
    ['search', 'Pesquisa', s.search && '"' + s.search + '"'],
    ['customer', 'Cliente', s.customer],
    ['vehicle', 'Placa', s.vehicle],
    ['serviceType', 'Tipo de serviço', s.serviceType && serviceTypeLabel(s.serviceType)],
    ['status', 'Situação', s.status],
    [
      'filter',
      (LINK_FILTER[filterView(s)] || ['Vínculo'])[0],
      s.filter &&
        s.filter !== 'todos' &&
        (LINK_FILTER[filterView(s)] || [, 'Com vínculo', 'Sem vínculo'])[s.filter === 'vinculado' ? 1 : 2]
    ],
    ['rvStage', 'Etapa da RV', s.view !== 'viagens' && s.rvStage],
    ['dayCategory', 'Programação', s.view === 'programacao' && s.dayCategory]
  ].filter(([key, , value]) => value && applies(key));
  if (!chips.length) return '';
  return (
    '<div class="active-filters" role="group" aria-label="Filtros ativos">' +
    chips
      .map(
        ([key, label, value]) =>
          '<span class="filter-chip"><span>' +
          h(label) +
          ': <b>' +
          h(value) +
          '</b></span><button type="button" data-clear-filter="' +
          key +
          '" aria-label="Remover filtro ' +
          h(label) +
          '">✕</button></span>'
      )
      .join('') +
    (chips.length > 1 ? '<button type="button" class="btn btn-sm" data-clear-filter="*">Limpar todos</button>' : '') +
    '</div>'
  );
}
/**
 * Filtros de cada aba: só o que tem efeito sobre os registros que ela mostra.
 * customer/vehicle/serviceType = Cliente/Placa/Tipo de serviço; status = situação do registro; filter = vínculo.
 * Viagens não repete "Situação": a barra de etapas logo acima já faz isso.
 */
export const VIEW_FILTERS = Object.freeze({
  painel: ['customer', 'vehicle', 'serviceType'],
  viagens: ['customer', 'vehicle', 'filter'],
  ctes: ['customer', 'vehicle', 'serviceType', 'status', 'filter'],
  entregas: ['customer', 'vehicle', 'serviceType', 'status'],
  programacao: ['customer', 'vehicle'],
  comparativos: ['customer', 'vehicle', 'serviceType'],
  pendencias: ['customer', 'vehicle', 'serviceType'],
  rotas: ['customer', 'vehicle'],
  veiculos: ['customer', 'vehicle'],
  motoristas: ['customer', 'vehicle', 'serviceType'],
  mdfes: ['vehicle', 'status', 'filter'],
  ocorrencias: ['vehicle', 'status']
});
const REPORT_AS_VIEW = {
  viagens: 'viagens',
  pedidos: 'ctes',
  ctes: 'ctes',
  entregas: 'entregas',
  rotas: 'rotas',
  veiculos: 'veiculos',
  motoristas: 'motoristas',
  mdfes: 'mdfes',
  ocorrencias: 'ocorrencias',
  pendencias: 'pendencias',
  programacao: 'programacao',
  mensal: 'painel'
};
/** Aba efetiva para os filtros (em Relatórios, a do relatório escolhido). */
export const filterView = s =>
  s.view === 'relatorios' ? REPORT_AS_VIEW[s.reportSelected] || 'painel' : s.view || 'painel';
export const filterKeysFor = s => VIEW_FILTERS[filterView(s)] || [];
const LINK_FILTER = {
  viagens: ['Pedido vinculado', 'Com pedido', 'Sem pedido'],
  ctes: ['RV vinculada', 'Com RV', 'Sem RV'],
  mdfes: ['RV vinculada', 'Com RV', 'Sem RV']
};
const STATUS_LABEL = { ctes: 'Situação do pedido', entregas: 'Situação do pedido', mdfes: 'Situação do MDF-e' };
/** Opções dos filtros da aba atual, tiradas dos registros que a aba mostra (ex.: placas de MDF-e na aba MDF-e).
 * Separadas do desenho para o navegador guardar as opções e redesenhar o painel com a seleção atual sem ir ao servidor. */
export function filterOptions(d, s) {
  const view = filterView(s),
    keys = filterKeysFor(s);
  const rows =
    view === 'viagens' || view === 'programacao'
      ? d.viagens || []
      : ['ctes', 'entregas'].includes(view)
        ? d.pedidos || []
        : view === 'mdfes'
          ? d.mdfes || []
          : view === 'ocorrencias'
            ? d.ocorrencias || []
            : [...(d.viagens || []), ...(d.pedidos || [])];
  const distinct = field => [...new Set(rows.map(x => x[field]).filter(Boolean))];
  return {
    view,
    customers: keys.includes('customer') ? distinct('cliente').sort((a, b) => a.localeCompare(b, 'pt-BR')) : [],
    plates: keys.includes('vehicle') ? distinct('placa').sort() : [],
    types: keys.includes('serviceType')
      ? [...new Set((d.pedidos || []).map(x => x.tipoServico).filter(Boolean))].sort()
      : [],
    statuses: keys.includes('status') ? distinct('status').sort() : []
  };
}
export function operationalFilters(d, s) {
  return renderFilterPanel(filterOptions(d, s), s);
}
/** Painel de filtros avançados com as opções já carregadas e a seleção atual do usuário. */
export function renderFilterPanel(o, s) {
  const view = filterView(s),
    keys = filterKeysFor(s);
  const select = (id, title, items, val, all = 'Todos') => {
    if (val && !items.includes(val)) items = [...items, val];
    return (
      '<label class="filter filter-compact"><span>' +
      h(title) +
      '</span><select id="' +
      id +
      '" class="control full"><option value="">' +
      all +
      '</option>' +
      opts(items, val) +
      '</select></label>'
    );
  };
  const fields = [];
  if (keys.includes('customer')) fields.push(select('filterClient', 'Cliente', o.customers || [], s.customer || ''));
  if (keys.includes('vehicle')) fields.push(select('filterPlate', 'Placa', o.plates || [], s.vehicle || ''));
  if (keys.includes('serviceType'))
    fields.push(
      select('filterType', 'Tipo de serviço', o.types || [], s.serviceType ? serviceTypeLabel(s.serviceType) : '')
    );
  if (keys.includes('status')) {
    const statuses = [...(o.statuses || [])];
    if (s.status && !statuses.includes(s.status)) statuses.push(s.status);
    fields.push(select('recordStatusFilter', STATUS_LABEL[view] || 'Situação', statuses, s.status || '', 'Todas'));
  }
  if (keys.includes('filter')) {
    const [label, yes, no] = LINK_FILTER[view] || ['Vínculo', 'Com vínculo', 'Sem vínculo'];
    fields.push(
      '<label class="filter filter-compact"><span>' +
        label +
        '</span><select id="statusFilter" class="control full"><option value="todos">Todos</option><option value="vinculado" ' +
        (s.filter === 'vinculado' ? 'selected' : '') +
        '>' +
        yes +
        '</option><option value="pendente" ' +
        (s.filter === 'pendente' ? 'selected' : '') +
        '>' +
        no +
        '</option></select></label>'
    );
  }
  const tableOrder = !['painel', 'pendencias', 'comparativos'].includes(view)
    ? '<label class="filter filter-compact"><span>Ordem</span><select id="sortDir" class="control full"><option value="desc" ' +
      (s.sortDir !== 'asc' ? 'selected' : '') +
      '>Mais recentes</option><option value="asc" ' +
      (s.sortDir === 'asc' ? 'selected' : '') +
      '>Mais antigos</option></select></label>'
    : '';
  const presets = Object.keys(s.presets || {});
  return (
    '<div class="filter-advanced">' +
    (fields.length || tableOrder
      ? '<div class="filter-row">' + fields.join('') + tableOrder + '</div>'
      : '<p class="help">Esta área não tem filtros adicionais.</p>') +
    '<div class="filter-row filter-row-actions">' +
    '<button class="btn btn-sm" data-action="clear-filters">Limpar</button>' +
    '<button class="btn btn-sm" data-action="save-filter">Salvar filtros</button>' +
    (presets.length
      ? '<select id="savedPreset" class="control control-sm" aria-label="Filtros salvos"><option value="">Filtros salvos…</option>' +
        opts(presets, '') +
        '</select><button class="btn btn-sm btn-ghost" data-action="delete-filter">Excluir salvo</button>'
      : '') +
    '</div></div>'
  );
}
export function applyAdvancedFilters(rows, s, kind) {
  let out = searchRecords(rows, s.search);
  if (s.customer) out = out.filter(x => x.cliente === s.customer || (kind === 'clientes' && x.name === s.customer));
  if (s.vehicle) out = out.filter(x => x.placa === s.vehicle || (kind === 'veiculos' && x.name === s.vehicle));
  if (s.serviceType)
    out = out.filter(
      x => x.tipoServico === s.serviceType || serviceTypeLabel(x.tipoServico) === serviceTypeLabel(s.serviceType)
    );
  return sortRecords(out, s.sortKey || (kind === 'clientes' ? 'freight' : 'data'), s.sortDir || 'desc');
}
function section(title, sub, content) {
  return (
    '<section class="card"><div class="card-head"><h3>' +
    h(title) +
    '</h3><span>' +
    h(sub || '') +
    '</span></div>' +
    content +
    '</section>'
  );
}
function cell(v, fmt) {
  if (fmt === 'money') return h(brl(v));
  if (fmt === 'number') return h(num(v));
  if (fmt === 'date') return h(dt(v));
  if (fmt === 'bool') return h(b(v));
  return h(v === null || v === undefined || v === '' ? '—' : v);
}
export function tableAdvanced(rows, columns, s, view) {
  const active = columns.filter(c => !(s.hiddenColumns?.[view] || []).includes(c.key));
  const head = active
    .map(
      c =>
        '<th><button class="sort-link" data-sort="' +
        h(c.key) +
        '" title="Ordenar por ' +
        h(c.label) +
        '">' +
        h(c.label) +
        ' ' +
        (s.sortKey === c.key ? (s.sortDir === 'asc' ? '↑' : '↓') : '↕') +
        '</button></th>'
    )
    .join('');
  const key = s.sortKey || columns[0].key,
    direction = s.sortDir || 'desc';
  const sorted = s.rowsSorted
    ? rows
    : memoView('sort-grid-' + view, [rows, key, direction], () => sortRecords(rows, key, direction));
  const total = sorted.length;
  const limit = pageSizeOf(s),
    pageCount = Math.max(1, Math.ceil(total / limit)),
    page = Math.min(Math.max(1, s.page || 1), pageCount);
  s.page = page;
  const pageRows = sorted.slice((page - 1) * limit, page * limit);
  const body = pageRows
    .map(
      row =>
        '<tr>' +
        active
          .map(c => {
            const v = row[c.key],
              val =
                c.detail && v !== undefined
                  ? '<button class="row-link" data-detail="' +
                    h(c.detail) +
                    ':' +
                    h(row.id) +
                    '">' +
                    cell(v, c.format) +
                    '</button>'
                  : cell(v, c.format);
            return '<td>' + val + '</td>';
          })
          .join('') +
        '</tr>'
    )
    .join('');
  const footer =
    '<div class="pagination"><span>' +
    num(total) +
    ' registros • Página ' +
    page +
    ' de ' +
    pageCount +
    '</span><div class="pagination-actions">' +
    renderPageSize(s) +
    '<button class="btn btn-sm" data-action="prev" ' +
    (page <= 1 ? 'disabled' : '') +
    '>Anterior</button><button class="btn btn-sm" data-action="next" ' +
    (page >= pageCount ? 'disabled' : '') +
    '>Próxima</button></div></div>';
  return (
    '<div class="table-wrap"><table><thead><tr>' +
    head +
    '</tr></thead><tbody>' +
    (body
      ? body
      : '<tr><td colspan="' +
        active.length +
        '" class="empty">Nenhum registro encontrado para os filtros selecionados.</td></tr>') +
    '</tbody></table></div>' +
    footer
  );
}
function columnsPicker(columns, s, view) {
  const visible = columns.filter(c => !(s.hiddenColumns?.[view] || []).includes(c.key));
  return (
    '<details class="columns-picker"><summary class="btn btn-sm">Colunas da tabela</summary><div class="columns-list">' +
    columns
      .map(
        c =>
          '<label><input type="checkbox" data-column-toggle="' +
          h(view) +
          ':' +
          h(c.key) +
          '" ' +
          (!(s.hiddenColumns?.[view] || []).includes(c.key) ? 'checked' : '') +
          ' ' +
          (visible.length === 1 && visible[0].key === c.key ? 'disabled' : '') +
          '/> ' +
          h(c.label) +
          '</label>'
      )
      .join('') +
    '</div></details>'
  );
}
function rowTable(title, rows, columns, s, view, sub = '') {
  columns = availableColumns(columns);
  return (
    '<div class="table-tools"><h2>' +
    h(title) +
    '</h2>' +
    columnsPicker(columns, s, view) +
    '</div>' +
    (s.listFilters || '') +
    section(title, '', tableAdvanced(rows, columns, s, view))
  );
}
export function renderGrid(title, rows, cols, state, view, sub = '') {
  return rowTable(title, rows, cols, state, view, sub);
}
const customerCols = [
  { key: 'name', label: 'Cliente' },
  { key: 'orders', label: 'Pedidos', format: 'number' },
  { key: 'ctes', label: 'CT-e', format: 'number' },
  { key: 'linkedTrips', label: 'RVs vinculadas', format: 'number' },
  { key: 'freight', label: 'Fretes', format: 'money' },
  { key: 'ticket', label: 'Ticket médio', format: 'money' }
];
const routesCols = [
  { key: 'name', label: 'Rota' },
  { key: 'viagens', label: 'Viagens', format: 'number' },
  { key: 'km', label: 'KM realizados', format: 'number' },
  { key: 'fuel', label: 'Abastecimento', format: 'money' },
  { key: 'freight', label: 'Fretes vinculados', format: 'money' }
];
const vehiclesCols = [
  { key: 'name', label: 'Veículo / placa' },
  { key: 'viagens', label: 'Viagens', format: 'number' },
  { key: 'km', label: 'KM realizados', format: 'number' },
  { key: 'fuel', label: 'Abastecimento', format: 'money' },
  { key: 'freight', label: 'Fretes vinculados', format: 'money' }
];
const driversCols = [
  { key: 'name', label: 'Motorista (DSS)' },
  { key: 'orders', label: 'Pedidos', format: 'number' },
  { key: 'ctes', label: 'CT-e', format: 'number' },
  { key: 'freight', label: 'Valor pedidos', format: 'money' }
];
const containerCols = [
  { key: 'name', label: 'Container' },
  { key: 'viagens', label: 'Registros RV', format: 'number' },
  { key: 'pedidos', label: 'Pedidos', format: 'number' },
  { key: 'lastDate', label: 'Último registro', format: 'date' }
];
const invoiceCols = [
  { key: 'pedidoNumero', label: 'Pedido', detail: 'ctes' },
  { key: 'cteNumero', label: 'CT-e' },
  { key: 'cliente', label: 'Cliente' },
  { key: 'data', label: 'Emissão', format: 'date' },
  { key: 'numeroFatura', label: 'Fatura' },
  { key: 'liberadoFaturamento', label: 'Liberado', format: 'bool' },
  { key: 'entregaConcluida', label: 'Entrega', format: 'bool' },
  { key: 'comprovanteEntrega', label: 'Comprovante', format: 'bool' },
  { key: 'valorReceber', label: 'Valor a receber', format: 'money' }
];
const alertCols = [
  { key: 'level', label: 'Prioridade' },
  { key: 'title', label: 'Pendência' },
  { key: 'detail', label: 'Detalhes' },
  { key: 'refDate', label: 'Data ref.', format: 'date' },
  { key: 'view', label: 'Área' },
  { key: 'recordId', label: 'ID do registro' }
];
function monthlyPanel(i, s) {
  const rows = i.months.filter(x => x.trips || x.orders);
  const cols = [
    { key: 'month', label: 'Mês' },
    { key: 'trips', label: 'Viagens', format: 'number' },
    { key: 'orders', label: 'Pedidos', format: 'number' },
    { key: 'ctes', label: 'CT-e', format: 'number' },
    { key: 'freight', label: 'Fretes', format: 'money' },
    { key: 'fuel', label: 'Abastecimento', format: 'money' },
    { key: 'km', label: 'KM rodados', format: 'number' }
  ];
  return rowTable(
    'Evolução mensal',
    rows,
    cols,
    s,
    'mensal',
    'Agrupamento por data de início da RV e emissão do pedido.'
  );
}
export function renderAdvanced(view, d, s) {
  if (view === 'pendencias') return renderAlertsHub(d, s);
  const i = ['entregas', 'veiculos'].includes(view)
    ? null
    : memoView('advanced-' + view, [d, s.lateDays], () =>
        buildInsights(d, {
          year: Number((s.from || '').slice(0, 4) || new Date().getFullYear()),
          lateDays: s.lateDays || 2,
          includeAlerts: false
        })
      );
  if (view === 'pendencias') {
    const count = i.alerts.reduce((v, a) => ((v[a.level] = (v[a.level] || 0) + 1), v), {});
    return (
      '<div class="kpis">' +
      tt('PENDÊNCIAS TOTAIS', num(i.alerts.length), 'Alertas calculados pelas APIs') +
      tt('PRIORIDADE ALTA', num(count.high || 0), 'Requer conferência') +
      tt('VERIFICAÇÃO', num(count.warning || 0), 'Vínculos, faturamento, RVs') +
      tt('INFORMATIVOS', num(count.info || 0), 'Ocorrências e quilometragem') +
      '</div>' +
      '<div class="info-strip">Alertas baseados nos campos do DSS. Um campo sem informação não prova que a operação esteja irregular. RV não encontrada pode estar fora do período consultado.</div>' +
      '<div class="filter-row">' +
      ['todos', 'high', 'warning', 'info']
        .map(
          x =>
            '<button class="btn btn-sm ' +
            (s.alertPriority === x ? 'btn-red' : '') +
            '" data-alert-priority="' +
            x +
            '">' +
            { todos: 'Todos', high: 'Alta', warning: 'A verificar', info: 'Informativa' }[x] +
            '</button>'
        )
        .join('') +
      '</div>' +
      rowTable(
        'Central de pendências',
        searchRecords(
          i.alerts.filter(x => s.alertPriority === 'todos' || !s.alertPriority || x.level === s.alertPriority),
          s.search
        ),
        alertCols,
        s,
        'pendencias',
        'DSS · somente leitura'
      )
    );
  }
  if (view === 'entregas') {
    const rows = memoView('delivery-search', [d, s.search], () => searchRecords(d.pedidos || [], s.search));
    const cols = [
      { key: 'pedidoNumero', label: 'Pedido', detail: 'ctes' },
      { key: 'cteNumero', label: 'CT-e' },
      { key: 'data', label: 'Emissão', format: 'date' },
      { key: 'cliente', label: 'Cliente' },
      { key: 'motoristaNome', label: 'Motorista' },
      { key: 'placa', label: 'Placa' },
      { key: 'entregaConcluida', label: 'Entrega concluída', format: 'bool' },
      { key: 'comprovanteEntrega', label: 'Comprovante', format: 'bool' },
      { key: 'ocorrencia', label: 'Ocorrência' },
      { key: 'status', label: 'Situação' }
    ];
    const counts = memoView('delivery-counts', [rows], () =>
      rows.reduce(
        (sum, row) => ({
          done: sum.done + (row.entregaConcluida === true ? 1 : 0),
          missing: sum.missing + (row.entregaConcluida === true && row.comprovanteEntrega === false ? 1 : 0)
        }),
        { done: 0, missing: 0 }
      )
    );
    return (
      '<div class="kpis">' +
      tt('PEDIDOS', num(rows.length)) +
      tt('ENTREGAS CONCLUÍDAS', num(counts.done)) +
      tt('SEM COMPROVANTE', num(counts.missing)) +
      '</div>' +
      rowTable(
        'Acompanhamento de entregas',
        rows,
        cols,
        s,
        'entregas',
        'Indicadores operacionais, sem dados de faturamento.'
      )
    );
  }
  if (view === 'rotas')
    return (
      '<div class="kpis">' +
      tt('ROTAS DISTINTAS', num(i.routes.length)) +
      (KM_FROM_API
        ? tt('KM TOTAL IDENTIFICADO', num(i.totals.actual.sum), 'Não informado não equivale a zero') +
          tt('KM PREVISTO', num(i.totals.planned.sum)) +
          tt('DESVIO GLOBAL', Number.isFinite(i.totals.kmDifference) ? num(i.totals.kmDifference) : '—')
        : '') +
      '</div>' +
      rowTable(
        'Rotas mais utilizadas',
        searchRecords(i.routes, s.search),
        s.permissions?.financeiro ? routesCols : routesCols.filter(x => !['fuel', 'freight'].includes(x.key)),
        s,
        'rotas',
        'Origem → destino, agrupamento por registro RV'
      )
    );
  if (view === 'veiculos') {
    const vehicles = operationalGroups('veiculos', d),
      rows = memoView('vehicles-search', [vehicles, s.search], () => searchRecords(vehicles, s.search));
    const totalKm = memoView('vehicles-km', [d], () => ({
      sum: d.viagens.reduce((n, v) => n + (Number.isFinite(v.kmRodados) ? v.kmRodados : 0), 0),
      known: d.viagens.some(v => Number.isFinite(v.kmRodados))
    }));
    return (
      '<div class="kpis">' +
      tt('VEÍCULOS IDENTIFICADOS', num(vehicles.filter(v => v.name !== 'Veículo ID ?').length)) +
      tt('VIAGENS', num(d.viagens.length)) +
      (KM_FROM_API ? tt('QUILOMETRAGEM', totalKm.known ? num(totalKm.sum) : '—') : '') +
      '</div>' +
      rowTable(
        'Indicadores por veículo',
        rows,
        vehiclesCols.filter(x => !['fuel', 'freight'].includes(x.key)),
        s,
        'veiculos',
        KM_FROM_API ? 'Placa da viagem RV; apenas KM informados.' : 'Placa da viagem RV.'
      )
    );
  }
  if (view === 'motoristas')
    return (
      '<div class="kpis">' +
      tt('GRUPOS DE MOTORISTAS', num(i.drivers.length), 'Dados por ID/nome no PF') +
      tt('PEDIDOS DE FRETE', num(i.totals.orders)) +
      tt('CT-e IDENTIFICADOS', num(i.totals.ctes)) +
      '</div>' +
      rowTable(
        'Pedidos por motorista',
        searchRecords(i.drivers, s.search),
        s.permissions?.financeiro ? driversCols : driversCols.filter(x => x.key !== 'freight'),
        s,
        'motoristas',
        'listarPedidosFrete • motoristas sem ID serão exibidos conforme nome cadastrado'
      )
    );
  if (view === 'containers')
    return (
      '<div class="kpis">' +
      tt('CONTAINERS IDENTIFICADOS', num(i.containers.length), 'RVs + pedidos; número distinto') +
      '</div>' +
      rowTable(
        'Histórico resumido de containers',
        searchRecords(i.containers, s.search),
        containerCols,
        s,
        'containers',
        'Somente registros operacionais retornados pelo DSS, não rastreamento'
      )
    );
  if (view === 'faturamento') {
    const rows = searchRecords(d.pedidos || [], s.search).filter(
      x => (!s.customer || x.cliente === s.customer) && (!s.vehicle || x.placa === s.vehicle)
    );
    return (
      '<div class="kpis">' +
      tt('LIBERADOS P/ FATURAR', num(i.totals.readyToInvoice)) +
      tt('LIBERADOS SEM Nº FATURA', num(i.totals.withoutInvoice)) +
      tt('ENTREGA SEM COMPROVANTE', num(i.totals.missingDelivery)) +
      tt('CT-e IDENTIFICADOS', num(i.totals.ctes)) +
      '</div>' +
      '<div class="info-strip">Os indicadores usam booleanos e números registrados no DSS. “Liberado para faturamento” não significa “faturado”; número da fatura não significa pagamento confirmado.</div>' +
      rowTable('Controle de entrega e faturamento', rows, invoiceCols, s, 'faturamento')
    );
  }
  if (view === 'analises') {
    return (
      '<div class="kpis">' +
      tt('PEDIDOS', num(i.totals.orders)) +
      tt(
        'FRETES INFORMADOS',
        brl(i.totals.freight.known ? i.totals.freight.sum : null),
        'Não são recebimentos confirmados'
      ) +
      tt('PEDIDOS COM AVERBAÇÃO', num(i.totals.insured)) +
      tt('VALOR DE AVERBAÇÃO', brl(i.totals.averbacao.known ? i.totals.averbacao.sum : null)) +
      tt('TICKET MÉDIO', brl(i.totals.freight.known ? i.totals.freight.sum / i.totals.freight.known : null)) +
      '</div>' +
      monthlyPanel(i, s) +
      '<div class="analysis-grid">' +
      section(
        'Ranking por cliente',
        'Total de fretes de pedidos',
        tableAdvanced(i.customers.slice(0, 50), customerCols, s, 'clientes')
      ) +
      section(
        'Tipos de serviços',
        'Dados do PF',
        tableAdvanced(
          i.serviceTypes,
          [
            { key: 'name', label: 'Serviço / operação' },
            { key: 'orders', label: 'Pedidos' },
            { key: 'freight', label: 'Fretes', format: 'money' }
          ],
          s,
          'tipos'
        )
      ) +
      '</div>'
    );
  }
  if (view === 'administracao') {
    return (
      '<div class="section-title"><h2>Administração e diagnóstico</h2><span>Não altera registros do DSS</span></div>' +
      '<div class="integration-box"><strong>Fonte atual:</strong> ' +
      h(s.mode === 'live' ? 'DSS (resposta do backend)' : 'Demonstração fictícia') +
      '<p>Última sincronização: ' +
      h(s.lastSync ? new Date(s.lastSync).toLocaleString('pt-BR') : 'Ainda não sincronizado') +
      '</p><p>Servidor configurado: ' +
      h(s.apiUrl || 'Não informado') +
      '</p></div>' +
      '<div class="split">' +
      section(
        'Sincronização',
        'Consultas mediante autenticação do portal',
        '<label class="filter"><span>Atualização automática (somente aba aberta)</span><select id="autoRefresh" class="control full">' +
          ['0', '5', '10', '15', '30']
            .map(
              v =>
                '<option value="' +
                v +
                '" ' +
                (String(s.autoRefresh || '0') === v ? 'selected' : '') +
                '>' +
                (v === '0' ? 'Desativada' : v + ' minutos') +
                '</option>'
            )
            .join('') +
          '</select></label><p class="help">A atualização automática não funciona com a aba fechada. O limite de chamadas e permissões do DSS devem ser respeitados.</p>' +
          '<button class="btn" data-action="refresh">Sincronizar agora</button> <button class="btn" data-action="api-diagnostics">Consultar diagnósticos</button>' +
          (s.apiDiagnostics
            ? '<p class="help">API: ' +
              h(s.apiDiagnostics.configured ? 'configurada' : 'não configurada') +
              ' · Sucesso: ' +
              h(s.apiDiagnostics.counters?.success ?? 0) +
              ' · Falhas: ' +
              h(s.apiDiagnostics.counters?.failed ?? 0) +
              ' · Cache: ' +
              h(s.apiDiagnostics.counters?.cached ?? 0) +
              ' · Último sucesso: ' +
              h(s.apiDiagnostics.lastSuccess || '—') +
              '</p>'
            : '')
      ) +
      section(
        'Segurança',
        'Configurações e retenção',
        '<p class="help">Token do portal permanece somente na memória da aba. Preferências locais armazenam apenas filtros e colunas, não registros operacionais.</p>' +
          '<button class="btn" data-action="clear-settings">Limpar preferências locais</button>'
      ) +
      '</div>' +
      '<div class="integration-box"><strong>Limites conhecidos:</strong> lucro completo depende de outras fontes de custo; MDF-e é referência, sem status fiscal comprovado; rotas não incluem localização em tempo real; login individual/SSO depende da infraestrutura da empresa.</div>'
    );
  }
  return '';
}
export function renderInsightsStrip(data, s) {
  const i = buildInsights(data, { year: Number((s.from || '').slice(0, 4) || new Date().getFullYear()) });
  return (
    '<section class="advanced-summary"><div class="section-title"><h2>Indicadores operacionais adicionais</h2><span>Fonte: ' +
    (s.mode === 'live' ? 'DSS' : 'demonstração') +
    '</span></div>' +
    '<div class="kpis">' +
    tt('VIAGENS EM ANDAMENTO', num(i.totals.ongoing)) +
    tt('VIAGENS FINALIZADAS', num(i.totals.completed)) +
    tt('PEDIDOS DE FRETE', num(i.totals.orders)) +
    tt('CT-e COM NÚMERO', num(i.totals.ctes)) +
    tt('SEM NÚMERO CT-e', num(i.totals.withoutCT)) +
    tt('ENTREGA SEM COMPROVANTE', num(i.totals.missingDelivery)) +
    '</div>' +
    '<div class="overview-shortcuts"><button class="btn" data-nav="pendencias">Ver pendências (' +
    num(i.alerts.length) +
    ')</button>' +
    '<button class="btn" data-nav="analises">Análise mensal</button>' +
    (s.demoOnly ? '' : '<button class="btn" data-action="compare-periods">Comparar período anterior</button>') +
    '</div>' +
    (s.prevDataset ? renderComparison(data, s.prevDataset, !!s.permissions?.financeiro) : '') +
    '</section>'
  );
}
export function renderComparison(current, previous, showFinancial = false) {
  const a = buildInsights(current),
    b0 = buildInsights(previous);
  const rows = [
    ['Viagens', a.totals.trips, b0.totals.trips],
    ['Pedidos', a.totals.orders, b0.totals.orders],
    ['CT-e', a.totals.ctes, b0.totals.ctes],
    ...(showFinancial
      ? [
          ['Fretes informados', a.totals.freight.sum, b0.totals.freight.sum],
          ['Abastecimento', a.totals.fuel.sum, b0.totals.fuel.sum]
        ]
      : [])
  ];
  return (
    '<div class="card"><div class="card-head"><h3>Comparação com período anterior da mesma duração</h3></div><div class="table-wrap"><table><thead><tr><th>Indicador</th><th>Atual</th><th>Anterior</th><th>Variação</th></tr></thead><tbody>' +
    rows
      .map(([name, n, m], i) => {
        const val = i >= 3 ? brl : num;
        return (
          '<tr><td>' +
          h(name) +
          '</td><td>' +
          h(val(n)) +
          '</td><td>' +
          h(val(m)) +
          '</td><td>' +
          h(m === 0 ? '—' : ((100 * (n - m)) / m).toFixed(1).replace('.', ',') + '%') +
          '</td></tr>'
        );
      })
      .join('') +
    '</tbody></table></div></div>'
  );
}
export function renderReportHub(data, s) {
  const allowed = reportTypesFor(s.role);
  const selected = allowed.includes(s.reportSelected) ? s.reportSelected : allowed[0];
  const multi = s.reportMulti === true;
  s.reportSelected = selected;
  const preview =
    selected === 'pendencias'
      ? renderAlertsHub(data, s)
      : (() => {
          const model = buildOperationalReport(selected, data, s, { preview: true });
          const previewState = { ...s, sortKey: model.sortKey, rowsSorted: true };
          const html = renderGrid(
            model.title,
            model.rows,
            model.availableColumns.map(([key, label]) => ({
              key,
              label,
              format: ['data', 'dataTermino', 'dataCte', 'refDate', 'due'].includes(key)
                ? 'date'
                : ['entregaConcluida', 'comprovanteEntrega'].includes(key)
                  ? 'bool'
                  : undefined
            })),
            previewState,
            'report-' + selected,
            'Prévia de 25 itens por página. A exportação inclui todos os resultados filtrados.'
          );
          s.page = previewState.page;
          return html;
        })();
  const pendingLabels = {
    type: 'Tipo',
    level: 'Prioridade',
    recordId: 'Registro',
    title: 'Pendência',
    detail: 'Detalhes',
    refDate: 'Data',
    owner: 'Responsável',
    due: 'Prazo',
    priority: 'Prioridade do tratamento',
    status: 'Situação do tratamento',
    resolutionReason: 'Motivo da resolução',
    recurrenceCount: 'Reincidências',
    resolvedAt: 'Resolvida em',
    resolvedBy: 'Resolvida por',
    presence: 'Presença na última observação'
  };
  const pendingColumns = OP_COLUMNS.pendencias
    .filter(key => !(s.hiddenColumns?.['report-pendencias'] || []).includes(key))
    .sort((a, b) => {
      const order = s.reportColumnOrder?.pendencias || [];
      return (
        (order.includes(a) ? order.indexOf(a) : order.length + OP_COLUMNS.pendencias.indexOf(a)) -
        (order.includes(b) ? order.indexOf(b) : order.length + OP_COLUMNS.pendencias.indexOf(b))
      );
    })
    .map(key => [key, pendingLabels[key]]);
  const model =
    selected === 'pendencias'
      ? { columns: pendingColumns }
      : buildOperationalReport(selected, data, s, { preview: true });
  const templateNames = Object.keys(s.reportTemplates || {});
  const pendingPicker =
    selected === 'pendencias'
      ? columnsPicker(
          OP_COLUMNS.pendencias.map(key => ({ key, label: pendingLabels[key] })),
          s,
          'report-pendencias'
        )
      : '';
  const templateControls =
    '<section class="card report-template-controls"><h3>Modelos de relatório</h3>' +
    (s.preferenceStorage === 'browser'
      ? '<p class="help">Modelos e preferências são salvos neste navegador, separados por usuário e empresa.</p>'
      : '') +
    '<div class="filter-row"><label class="filter grow">Modelo salvo<select id="reportTemplateSelect" class="control"><option value="">Selecionar modelo</option>' +
    templateNames
      .map(
        name =>
          '<option value="' +
          h(name) +
          '" ' +
          (s.templateSelected === name ? 'selected' : '') +
          '>' +
          h(name) +
          '</option>'
      )
      .join('') +
    '</select></label><button class="btn btn-sm" data-action="apply-report-template">Aplicar modelo</button><button class="btn btn-sm" data-action="save-report-template">Salvar modelo atual</button><button class="btn btn-sm" data-action="delete-report-template">Excluir modelo</button><label class="filter">Formato preferido<select id="reportFormat" class="control">' +
    ['xlsx', 'csv', 'pdf']
      .map(
        format =>
          '<option value="' +
          format +
          '" ' +
          ((s.reportFormat || 'xlsx') === format ? 'selected' : '') +
          '>' +
          format.toUpperCase() +
          '</option>'
      )
      .join('') +
    '</select></label><button class="btn btn-red" data-action="export-report-template">Exportar no formato salvo</button></div>' +
    pendingPicker +
    (model
      ? '<details><summary>Ordenar colunas do relatório</summary><div class="report-column-order">' +
        model.columns
          .map(
            ([key, label], i) =>
              '<div><span>' +
              h(label) +
              '</span><button class="btn btn-sm" data-report-column-move="' +
              key +
              ':-1" ' +
              (!i ? 'disabled' : '') +
              ' aria-label="Mover ' +
              h(label) +
              ' para cima">↑</button><button class="btn btn-sm" data-report-column-move="' +
              key +
              ':1" ' +
              (i === model.columns.length - 1 ? 'disabled' : '') +
              ' aria-label="Mover ' +
              h(label) +
              ' para baixo">↓</button></div>'
          )
          .join('') +
        '</div></details>'
      : '') +
    '</section>';
  return (
    templateControls +
    '<section class="card"><div class="card-head"><h3>Relatórios ' +
    h(COMPANIES[s.company || 'costalog'].name) +
    '</h3><span>Excel real (.xlsx), CSV e impressão/PDF</span></div>' +
    '<div class="filter-row">' +
    '<label class="filter grow"><span>Tipo do relatório</span><select id="reportSelected" class="control full">' +
    allowed
      .map(
        t => '<option value="' + t + '" ' + (selected === t ? 'selected' : '') + '>' + h(EXPORT_LABELS[t]) + '</option>'
      )
      .join('') +
    '</select></label>' +
    '<label class="filter"><span>Escopo Excel</span><select id="reportMulti" class="control"><option value="single" ' +
    (!multi ? 'selected' : '') +
    '>Uma aba</option><option value="all" ' +
    (multi ? 'selected' : '') +
    '>Todas as abas</option></select></label>' +
    '</div><div class="filter-row" style="margin-top:14px">' +
    '<button class="btn btn-red" data-action="xlsx-export">Baixar Excel (.xlsx)</button>' +
    '<button class="btn" data-action="csv-advanced">Baixar CSV</button>' +
    '<button class="btn" data-action="pdf-report">Imprimir / Salvar PDF</button></div>' +
    '<p class="help">PDF é gerado pelo recurso de impressão do navegador (Salvar como PDF). Os arquivos incluem os resultados da empresa ativa, do período e dos filtros selecionados.</p></section>' +
    '<div class="section-title"><h2>Relatórios disponíveis</h2></div><div class="report-grid">' +
    allowed
      .map(
        t =>
          '<button class="report-card ' +
          (selected === t ? 'active' : '') +
          '" aria-pressed="' +
          (selected === t) +
          '" data-report-select="' +
          t +
          '"><strong>' +
          h(EXPORT_LABELS[t]) +
          '</strong><small>Exportar / analisar</small></button>'
      )
      .join('') +
    '</div>' +
    preview
  );
}
