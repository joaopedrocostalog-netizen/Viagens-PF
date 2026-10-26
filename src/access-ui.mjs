import { availableColumns as withSourceColumns } from './data-availability.mjs';
import { memoView } from './view-cache.mjs';
import { taskFor, taskBelongsToUser, taskDueBucket, operationalToday } from './workflow.mjs';
import { extractRows, searchRecords, sortRecords } from './operational.mjs';
import { filterLinkedRows } from './filtering.mjs';
/** Regras visuais: segurança real é aplicada em api/access.mjs no servidor. */
export const OP_VIEWS = [
  'painel',
  'programacao',
  'comparativos',
  'relatorios',
  'viagens',
  'ctes',
  'entregas',
  'pendencias',
  'rotas',
  'veiculos',
  'motoristas',
  'mdfes',
  'ocorrencias'
];
export const FIN_VIEWS = [];
export const ADMIN_VIEWS = [];
export const OP_REPORTS = [
  'viagens',
  'pedidos',
  'ctes',
  'entregas',
  'rotas',
  'veiculos',
  'motoristas',
  'mdfes',
  'pendencias',
  'ocorrencias',
  'mensal'
];
export const OP_COLUMNS = {
  viagens: [
    'numero',
    'tipoRv',
    'data',
    'dataTermino',
    'cliente',
    'placa',
    'motoristaId',
    'motoristaNome',
    'container',
    'nroMdf',
    'origem',
    'destino',
    'kmPrevisto',
    'kmRodados',
    'desvioKm',
    'status'
  ],
  entregas: [
    'pedidoNumero',
    'cteNumero',
    'data',
    'cliente',
    'motoristaNome',
    'placa',
    'entregaConcluida',
    'comprovanteEntrega',
    'ocorrencia',
    'status'
  ],
  ocorrencias: ['id', 'data', 'placa', 'tipo', 'descricao', 'relato', 'status', 'providencia'],
  pedidos: [
    'pedidoNumero',
    'cteNumero',
    'data',
    'dataCte',
    'cliente',
    'motoristaNome',
    'placa',
    'container',
    'rvReferencia',
    'nroMdf',
    'entregaConcluida',
    'comprovanteEntrega',
    'ocorrencia',
    'status'
  ],
  ctes: ['pedidoNumero', 'cteNumero', 'dataCte', 'cliente', 'rvReferencia', 'viagemId', 'nroMdf', 'status'],
  rotas: ['name', 'viagens', 'km'],
  veiculos: ['name', 'viagens', 'km'],
  motoristas: ['name', 'orders', 'ctes'],
  containers: ['name', 'viagens', 'pedidos', 'lastDate'],
  mdfes: ['numero', 'data', 'viagemId', 'placa', 'status'],
  pendencias: [
    'type',
    'level',
    'recordId',
    'title',
    'detail',
    'refDate',
    'owner',
    'due',
    'priority',
    'status',
    'resolutionReason',
    'recurrenceCount',
    'resolvedAt',
    'resolvedBy',
    'presence'
  ],
  mensal: ['month', 'trips', 'orders', 'ctes', 'km']
};
export function permittedView(role, view) {
  if (ADMIN_VIEWS.includes(view)) return role === 'administrador';
  if (FIN_VIEWS.includes(view)) return role === 'financeiro' || role === 'administrador';
  return OP_VIEWS.includes(view) && ['operacional', 'financeiro', 'administrador'].includes(role);
}
export function reportTypesFor(role) {
  return ['operacional', 'financeiro', 'administrador'].includes(role) ? OP_REPORTS.slice() : [];
}
export function secureReport(report, type, role) {
  if (!reportTypesFor(role).includes(type)) throw Error('Relatório não permitido para este perfil.');
  const columns = report.columns.filter(([key]) => OP_COLUMNS[type]?.includes(key));
  const rows = report.rows.map(row => Object.fromEntries(columns.map(([key]) => [key, row[key]])));
  return { ...report, columns, rows };
}
export function safeView(role, view) {
  return permittedView(role, view) ? view : 'painel';
}

/** Mesmo em demonstração ou conectado a um backend antigo, este portal não mostra finanças. */
export function operationalPermissions(permissions = {}) {
  return { ...permissions, financeiro: false };
}
const TRIP_DETAILS = [
  ...OP_COLUMNS.viagens,
  'id',
  'rvId',
  'motoristaNome',
  'pedidosVinculados',
  'tipoRv',
  'veiculoId',
  'carreta1Id',
  'carreta2Id',
  'carreta3Id',
  'rotaMdf',
  'solicitacaoMonitoramento',
  'programacaoId',
  'nroProgramacao',
  'rotaId',
  'kmPrevistoFonte',
  'empresa',
  'clientePredominante',
  'proprietario',
  'createdOn'
];
const ORDER_DETAILS = [
  ...OP_COLUMNS.pedidos,
  'id',
  'numero',
  'viagemId',
  'isCte',
  'origem',
  'destino',
  'tipoCte',
  'tipoDocumento',
  'numeroPf',
  'veiculoId',
  'motoristaId',
  'operacaoTransporte',
  'tipoServico',
  'processoId',
  'numeroProcesso',
  'nroProgramacao',
  'programacaoId',
  'empresa',
  'remetente',
  'destinatario',
  'localColeta',
  'produtoPredominante',
  'refCliente',
  'numeroDocumento',
  'matchMethod',
  'ambiguous'
];
function operationalRow(row, keys) {
  return Object.fromEntries(keys.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]]));
}
export function operationalDataset(data) {
  return {
    ...data,
    viagens: (data.viagens || []).map(row => operationalRow(row, TRIP_DETAILS)),
    pedidos: (data.pedidos || []).map(row => operationalRow(row, ORDER_DETAILS)),
    ctes: (data.ctes || []).map(row => operationalRow(row, ORDER_DETAILS)),
    programacoes: (data.programacoes || []).map(row =>
      operationalRow(row, ['id', 'empresa', 'numero', 'data', 'viagemId', 'rvReferencia', 'motoristaId', 'veiculoId'])
    )
  };
}

/** Mesmo modelo para a prévia e para CSV/Excel/PDF. */
function makeOperationalReport(type, data, state, preview) {
  const scoped = { ...data };
  if (['viagens', 'pedidos', 'ctes', 'mdfes'].includes(type)) {
    const key = type === 'ctes' ? 'pedidos' : type;
    scoped[key] = filterLinkedRows(data[key] || [], key, data, state.filter);
    if (type === 'ctes') scoped.ctes = filterLinkedRows(data.ctes || [], 'pedidos', data, state.filter);
  }
  if (!reportTypesFor(state.role).includes(type)) throw Error('Relatório não permitido para este perfil.');
  const source = extractRows(type, scoped);
  const hidden = state.hiddenColumns?.['report-' + type] || [],
    order = state.reportColumnOrder?.[type] || [];
  const allowed = withSourceColumns(source.columns.filter(([key]) => OP_COLUMNS[type]?.includes(key)));
  if (type === 'pendencias')
    for (const [key, label] of [
      ['owner', 'Responsável'],
      ['due', 'Prazo'],
      ['priority', 'Prioridade do tratamento'],
      ['status', 'Situação do tratamento'],
      ['resolutionReason', 'Motivo da resolução'],
      ['recurrenceCount', 'Reincidências'],
      ['resolvedAt', 'Resolvida em'],
      ['resolvedBy', 'Resolvida por'],
      ['presence', 'Presença na última observação']
    ])
      allowed.push([key, label]);
  const availableColumns = allowed.slice().sort((a, b) => {
    const rank = key =>
      order.includes(key) ? order.indexOf(key) : order.length + allowed.findIndex(c => c[0] === key);
    return rank(a[0]) - rank(b[0]);
  });
  const columns = allowed
    .filter(([key]) => !hidden.includes(key))
    .sort((a, b) => {
      const rank = key =>
        order.includes(key) ? order.indexOf(key) : order.length + allowed.findIndex(c => c[0] === key);
      return rank(a[0]) - rank(b[0]);
    });
  const sourceRows =
    type === 'pendencias'
      ? source.rows.map(row => ({ ...row, ...taskFor(row, state.tasks), level: taskFor(row, state.tasks).priority }))
      : source.rows;
  const model = { ...source, columns, availableColumns, rows: sourceRows };
  const tripIds = new Set(
      type === 'pendencias' && state.alertGroup ? (data.allViagens || data.viagens || []).map(trip => trip.id) : []
    ),
    orderTrip = new Map(
      type === 'pendencias' && state.alertGroup ? (data.pedidos || []).map(order => [order.id, order.viagemId]) : []
    );
  const alertGroup = row =>
    row.view === 'viagens'
      ? 'rv:' + row.recordId
      : tripIds.has(orderTrip.get(row.recordId))
        ? 'rv:' + orderTrip.get(row.recordId)
        : 'pf:' + row.recordId;
  const rows = searchRecords(
    model.rows.filter(
      row =>
        type !== 'pendencias' ||
        (row.type !== 'sem_fatura' &&
          (!state.alertGroup || alertGroup(row) === state.alertGroup) &&
          (!state.alertPriority || state.alertPriority === 'todos' || row.level === state.alertPriority) &&
          (!state.alertKind || state.alertKind === 'todos' || row.type === state.alertKind) &&
          (!state.alertStatus ||
            state.alertStatus === 'todos' ||
            (state.alertStatus === 'ativas' && row.status !== 'resolvida') ||
            row.status === state.alertStatus) &&
          (!state.alertScope || state.alertScope !== 'mine' || taskBelongsToUser(row, state.user)) &&
          (!state.alertDue || state.alertDue === 'todos' || taskDueBucket(row) === state.alertDue) &&
          (!state.alertUnassigned || !row.owner) &&
          (!state.alertRecurrent || row.recurrenceCount > 0) &&
          (!state.alertOwner || searchRecords([{ owner: row.owner }], state.alertOwner).length))
    ),
    state.search,
    model.availableColumns.map(([key]) => key)
  );
  const keys = model.columns.map(([key]) => key);
  const sortKey = keys.includes(state.sortKey)
    ? state.sortKey
    : ['data', 'refDate', 'month', 'name'].find(key => keys.includes(key)) || keys[0];
  const sorted = sortRecords(rows, sortKey, type === 'pendencias' ? 'desc' : state.sortDir || 'desc');
  return {
    ...model,
    sortKey,
    rows: preview ? sorted : sorted.map(row => Object.fromEntries(columns.map(([key]) => [key, row[key]])))
  };
}

/** A prévia mantém referências; somente a exportação projeta todas as linhas. */
export function buildOperationalReport(type, data, state, { preview = false } = {}) {
  const deps = [
    data,
    state.role,
    state.filter,
    state.search,
    state.sortKey,
    state.sortDir,
    state.alertGroup,
    state.alertPriority,
    state.alertKind,
    state.alertStatus,
    state.alertOwner,
    state.alertUnassigned,
    state.alertRecurrent,
    state.alertScope,
    state.alertDue,
    state.user?.username,
    state.user?.displayName,
    state.user?.name,
    type === 'pendencias' ? operationalToday() : '',
    state.tasks,
    state.hiddenColumns?.['report-' + type],
    state.reportColumnOrder?.[type],
    preview
  ];
  return memoView('report-' + type + '-' + preview, deps, () => makeOperationalReport(type, data, state, preview));
}
