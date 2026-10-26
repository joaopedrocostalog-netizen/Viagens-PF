import { KM_FROM_API } from './data-availability.mjs';
import { tripActive, tripCompleted, rvStatus } from './rv-status.mjs';
import { memoView } from './view-cache.mjs';
import { taskFor, taskBelongsToUser, taskDueBucket, operationalToday } from './workflow.mjs';
import { matchesSearch } from './filtering.mjs';
/** COSTALOG - índices e análises baseadas exclusivamente em listarViagens/listarPedidosFrete.
 * Qualquer cálculo de lucro, status fiscal ou rastreamento requer outras fontes.
 */
const ok = x => x !== null && x !== undefined && x !== '';
const value = x => (Number.isFinite(x) ? x : null);
const uniq = arr => [...new Set(arr.filter(ok))];
const km = x => (Number.isFinite(x) ? x : 0);
const add = (rows, key, amount) => rows.reduce((n, r) => n + (Number.isFinite(amount(r)) ? amount(r) : 0), 0);
const known = (rows, fn) => rows.filter(v => Number.isFinite(fn(v)));
const result = (rows, fn) => ({ sum: add(rows, null, fn), known: known(rows, fn).length, total: rows.length });
const dateKey = d => String(d || '').slice(0, 7);
export function groupRows(rows, keyFn) {
  const map = new Map();
  rows.forEach(v => {
    const key = String(keyFn(v) || 'Não informado').trim() || 'Não informado';
    const arr = map.get(key) || [];
    arr.push(v);
    map.set(key, arr);
  });
  return [...map].map(([name, items]) => ({ name, items, count: items.length }));
}
export function sortRecords(rows, key = 'data', dir = 'desc') {
  const flip = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[key],
      y = b[key];
    if ((x === null || x === undefined || x === '') && (y === null || y === undefined || y === '')) return 0;
    if (x === null || x === undefined || x === '') return 1;
    if (y === null || y === undefined || y === '') return -1;
    if (typeof x === 'number' && typeof y === 'number') return flip * (x - y);
    return flip * String(x).localeCompare(String(y), 'pt-BR', { numeric: true, sensitivity: 'base' });
  });
}
export function searchRecords(rows, term, fields) {
  return !String(term || '').trim() ? rows : rows.filter(row => matchesSearch(row, term, fields));
}
export function monthsOverview(viagens, pedidos, year) {
  const start = Number(year);
  return Array.from({ length: 12 }, (_, i) => {
    const key = String(start) + '-' + String(i + 1).padStart(2, '0');
    const trips = viagens.filter(v => dateKey(v.data) === key);
    const orders = pedidos.filter(p => dateKey(p.data) === key);
    return {
      month: key,
      trips: trips.length,
      orders: orders.length,
      ctes: orders.filter(p => p.isCte).length,
      freight: add(orders, null, p => p.valor),
      fuel: add(trips, null, v => v.abastecimento),
      km: add(trips, null, v => v.kmRodados)
    };
  });
}
function alertContext(data, { asOf = operationalToday(), lateDays = 2, stall = null } = {}) {
  return {
    asOf,
    lateDays,
    // Prazos de "RV parada" (dias desde o início). Sem regra salva: só Viajando sem término, com lateDays.
    stall: {
      incluido: stall?.incluido ?? null,
      escalado: stall?.escalado ?? null,
      viajando: stall ? stall.viajando : lateDays
    },
    asOfTime: Date.parse(asOf + 'T12:00:00Z'),
    hasOrders: data.sources?.pedidos === true,
    linkedTrips: new Set((data.pedidos || []).map(p => p.viagemId).filter(Boolean))
  };
}
function* recordAlerts(record, view, context) {
  const ref = (type, level, age) => ({ type, level, record, view, age });
  if (view === 'ctes') {
    const p = record;
    if (!p.isCte) yield ref('cte_pendente', 'high');
    if (p.isCte && !p.viagemId) yield ref('cte_sem_rv', 'warning');
    if (p.rvReferencia && !p.viagemId) yield ref('rv_nao_localizada', 'warning');
    if (p.ambiguous) yield ref('rv_ambigua', 'warning');
    if (p.entregaConcluida === true && p.comprovanteEntrega === false) yield ref('comprovante_pendente', 'high');
    if (p.liberadoFaturamento === true && !p.numeroFatura) yield ref('sem_fatura', 'warning');
    if (ok(p.ocorrencia)) yield ref('ocorrencia', 'info');
    return;
  }
  const v = record;
  // Indexar vínculos uma vez evita percorrer todos os pedidos para cada RV.
  if (context.hasOrders && !context.linkedTrips.has(v.id)) yield ref('rv_sem_pedido', 'info');
  const active = tripActive(v.status);
  const age = v.data ? (context.asOfTime - Date.parse(v.data + 'T12:00:00Z')) / 86400000 : NaN;
  const late = limit => limit !== null && limit !== undefined && Number.isFinite(age) && age > limit;
  if (!v.dataTermino && active && late(context.stall.viajando)) yield ref('rv_sem_termino', 'warning', age);
  const stage = rvStatus(v.status);
  if (stage === 'Incluído' && late(context.stall.incluido)) yield ref('rv_parada_incluido', 'warning', age);
  if (stage === 'Escalado' && late(context.stall.escalado)) yield ref('rv_parada_escalado', 'warning', age);
  if (
    KM_FROM_API &&
    Number.isFinite(v.kmRodados) &&
    Number.isFinite(v.kmPrevisto) &&
    v.kmPrevisto > 0 &&
    v.kmRodados > v.kmPrevisto * 1.15
  )
    yield ref('km_acima', 'info');
}
function materializeAlert({ type, level, record: r, view, age }) {
  let title, detail;
  switch (type) {
    case 'cte_pendente':
      title = 'Pedido sem número de CT-e';
      detail = 'PF ' + (r.pedidoNumero || r.id) + ' • ' + r.cliente;
      break;
    case 'cte_sem_rv':
      title = 'CT-e sem RV localizada na consulta';
      detail = 'CT-e ' + (r.cteNumero || r.numero) + ' • PF ' + (r.pedidoNumero || r.id);
      break;
    case 'rv_nao_localizada':
      title = 'RV não localizada na consulta';
      detail = 'PF ' + (r.pedidoNumero || r.id) + ' • referência ' + r.rvReferencia;
      break;
    case 'rv_ambigua':
      title = 'Vínculo da RV ambíguo';
      detail = 'PF ' + (r.pedidoNumero || r.id);
      break;
    case 'comprovante_pendente':
      title = 'Entrega sem comprovante';
      detail = 'PF ' + (r.pedidoNumero || r.id) + ' • ' + r.cliente;
      break;
    case 'sem_fatura':
      title = 'Pedido liberado sem número de fatura';
      detail = 'PF ' + (r.pedidoNumero || r.id) + ' • ' + r.cliente;
      break;
    case 'ocorrencia':
      title = 'Ocorrência registrada';
      detail = 'PF ' + (r.pedidoNumero || r.id) + ' • ' + String(r.ocorrencia).slice(0, 85);
      break;
    case 'rv_sem_pedido':
      title = 'RV sem pedido PF localizado';
      detail = 'RV ' + r.numero + ' • confira também outros períodos de emissão';
      break;
    case 'rv_sem_termino':
      title = 'RV iniciada sem término informado';
      detail = r.numero + ' • ' + Math.floor(age) + ' dias desde o início';
      break;
    case 'rv_parada_incluido':
      title = 'RV ainda em Incluído';
      detail = 'RV ' + r.numero + ' • início há ' + Math.floor(age) + ' dias • ' + (r.cliente || '');
      break;
    case 'rv_parada_escalado':
      title = 'RV ainda em Escalado';
      detail = 'RV ' + r.numero + ' • início há ' + Math.floor(age) + ' dias • ' + (r.cliente || '');
      break;
    case 'km_acima':
      title = 'Quilometragem acima do previsto';
      detail = 'RV ' + r.numero + ' • ' + Math.round((r.kmRodados / r.kmPrevisto - 1) * 100) + '% acima';
      break;
  }
  return { type, level, recordId: r.id, title, detail, view, refDate: r.data };
}
export function* alertReferences(data, options = {}) {
  const context = alertContext(data, options);
  for (const record of data.pedidos || [])
    for (const ref of recordAlerts(record, 'ctes', context)) if (ref.type !== 'sem_fatura') yield ref;
  for (const record of data.viagens || []) yield* recordAlerts(record, 'viagens', context);
}
export function makeAlerts(data, options = {}) {
  const context = alertContext(data, options),
    alerts = [];
  for (const record of data.pedidos || [])
    for (const ref of recordAlerts(record, 'ctes', context)) alerts.push(materializeAlert(ref));
  for (const record of data.viagens || [])
    for (const ref of recordAlerts(record, 'viagens', context)) alerts.push(materializeAlert(ref));
  return sortRecords(alerts, 'refDate', 'desc');
}
export const ALERT_PAGE_SIZE = 25;
/** Mantém somente referências aos registros e contagens; nenhum conteúdo de outra página. */
export function createAlertPager(data, options = {}) {
  const context = alertContext(data, options);
  const records = [
    ...(data.pedidos || []).map(record => ({ record, view: 'ctes' })),
    ...(data.viagens || []).map(record => ({ record, view: 'viagens' }))
  ];
  records.sort((a, b) => {
    const x = String(a.record.data || ''),
      y = String(b.record.data || '');
    return x === y ? 0 : x < y ? 1 : -1;
  });
  function* refs() {
    for (const { record, view } of records) yield* recordAlerts(record, view, context);
  }
  const buckets = new Map();
  for (const ref of refs()) {
    const bucket = buckets.get(ref.type) || { type: ref.type, level: ref.level, count: 0 };
    bucket.count++;
    buckets.set(ref.type, bucket);
  }
  const emptyTasks = Object.freeze({});
  let statsCache = [];
  const trips = new Map((data.allViagens || data.viagens || []).map(row => [row.id, row]));
  const groupOf = ref =>
    ref.view === 'viagens'
      ? 'rv:' + ref.record.id
      : trips.has(ref.record.viagemId)
        ? 'rv:' + ref.record.viagemId
        : 'pf:' + ref.record.id;
  return {
    getPage({
      page = 1,
      priority = 'todos',
      kind = 'todos',
      financial = false,
      query = '',
      tasks = emptyTasks,
      status = 'todos',
      owner = '',
      scope = 'todos',
      user = null,
      due = 'todos',
      includeRows = true,
      grouped = false,
      group = '',
      unassigned = false,
      recurrent = false
    } = {}) {
      const visible = [...buckets.values()].filter(b => financial || b.type !== 'sem_fatura'),
        hasTasks = Object.keys(tasks).length > 0;
      const task = ref => taskFor({ type: ref.type, view: ref.view, recordId: ref.record.id, level: ref.level }, tasks);
      const inScope = t => scope !== 'mine' || taskBelongsToUser(t, user);
      const statusMatches = t =>
        status === 'todos' || (status === 'ativas' && t.status !== 'resolvida') || t.status === status;
      const matchesBase = (ref, t) =>
        (!unassigned || !t.owner) &&
        (!recurrent || t.recurrenceCount > 0) &&
        (!group || groupOf(ref) === group) &&
        inScope(t) &&
        (priority === 'todos' || t.priority === priority) &&
        (kind === 'todos' || ref.type === kind) &&
        statusMatches(t) &&
        (!owner || matchesSearch({ owner: t.owner }, owner));
      const matchesQuery = (ref, t) =>
        !String(query).trim() || matchesSearch({ ...materializeAlert(ref), ...t }, query);
      const deps = [
        priority,
        kind,
        financial,
        query,
        tasks,
        status,
        owner,
        scope,
        user?.username,
        user?.displayName,
        user?.name,
        due,
        grouped,
        group,
        unassigned,
        recurrent
      ];
      let stats = statsCache.find(entry => deps.every((value, i) => value === entry.deps[i]));
      if (!stats) {
        const groups = new Map();
        const counts = { high: 0, warning: 0, info: 0 },
          dueCounts = { vencidas: 0, hoje: 0, proximas: 0, sem_prazo: 0 };
        let total = 0,
          totalAlerts = 0,
          mineTotal = 0;
        for (const ref of refs()) {
          if (!financial && ref.type === 'sem_fatura') continue;
          const t = task(ref),
            mine = taskBelongsToUser(t, user);
          if (mine && t.status !== 'resolvida') mineTotal++;
          if (!inScope(t)) continue;
          totalAlerts++;
          counts[t.priority]++;
          if (!matchesBase(ref, t) || !matchesQuery(ref, t)) continue;
          const bucket = taskDueBucket(t, context.asOf);
          if (bucket !== 'resolvidas') dueCounts[bucket]++;
          if (due === 'todos' || bucket === due) {
            total++;
            if (grouped) {
              const id = groupOf(ref),
                entry = groups.get(id) || { id, ref, count: 0 };
              entry.count++;
              groups.set(id, entry);
            }
          }
        }
        stats = { deps, total, totalAlerts, mineTotal, counts, dueCounts, groups };
        statsCache = [stats, ...statsCache].slice(0, 4);
      }
      const { total, totalAlerts, mineTotal, counts, dueCounts } = stats;
      const pages = Math.max(1, Math.ceil((grouped ? stats.groups.size : total) / ALERT_PAGE_SIZE));
      const current = Math.min(pages, Math.max(1, Number.parseInt(page, 10) || 1));
      const offset = (current - 1) * ALERT_PAGE_SIZE,
        rows = [];
      let skipped = 0;
      if (total && includeRows && !grouped)
        for (const ref of refs()) {
          if (!financial && ref.type === 'sem_fatura') continue;
          const t = task(ref);
          if (
            !matchesBase(ref, t) ||
            !matchesQuery(ref, t) ||
            (due !== 'todos' && taskDueBucket(t, context.asOf) !== due)
          )
            continue;
          if (skipped++ < offset) continue;
          const alert = materializeAlert(ref);
          rows.push(hasTasks ? { ...alert, ...t, level: t.priority } : alert);
          if (rows.length === ALERT_PAGE_SIZE) break;
        }
      const groups =
        grouped && includeRows
          ? [...stats.groups.values()].slice(offset, offset + ALERT_PAGE_SIZE).map(({ id, ref, count }) => {
              const trip = id.startsWith('rv:') ? trips.get(id.slice(3)) : null;
              return {
                id,
                count,
                label: trip
                  ? 'RV ' + trip.numero
                  : 'PF ' + (ref.record.pedidoNumero || ref.record.numero || ref.record.id) + ' · Sem RV localizada',
                view: trip ? 'viagens' : 'ctes',
                recordId: trip ? trip.id : ref.record.id
              };
            })
          : [];
      return {
        rows,
        groups,
        groupTotal: stats.groups.size,
        page: current,
        pages,
        pageSize: ALERT_PAGE_SIZE,
        total,
        totalAlerts,
        mineTotal,
        counts,
        dueCounts,
        types: visible.map(b => b.type).sort()
      };
    }
  };
}

/** Índice compartilhado pelo painel e pela central; não guarda páginas materializadas. */
export function cachedAlertPager(data, { asOf = operationalToday(), lateDays = 2, stall = null } = {}) {
  return memoView('alert-pager', [data, asOf, lateDays, JSON.stringify(stall)], () =>
    createAlertPager(data, { asOf, lateDays, stall })
  );
}
export function buildInsights(data, opts = {}) {
  const viagens = data.viagens || [],
    pedidos = data.pedidos || [];
  const docs = pedidos.filter(x => x.isCte);
  const vTotal = new Map((data.allViagens || viagens).map(v => [v.id, v]));
  const inProgress = viagens.filter(v => tripActive(v.status));
  const finished = viagens.filter(v => tripCompleted(v.status));
  const withoutTrip = docs.filter(p => !p.viagemId),
    withoutCT = pedidos.filter(p => !p.isCte);
  const missingDelivery = pedidos.filter(p => p.entregaConcluida === true && p.comprovanteEntrega === false);
  const readyToInvoice = pedidos.filter(p => p.liberadoFaturamento === true);
  const withoutInvoice = readyToInvoice.filter(p => !p.numeroFatura);
  const freight = result(pedidos, p => p.valor),
    fuel = result(viagens, v => v.abastecimento),
    planned = result(viagens, v => v.kmPrevisto),
    actual = result(viagens, v => v.kmRodados);
  const periodMonths = monthsOverview(viagens, pedidos, opts.year || new Date().getFullYear());
  const customers = groupRows(pedidos, p => p.cliente)
    .map(g => {
      const vals = result(g.items, p => p.valor);
      return {
        name: g.name,
        orders: g.count,
        ctes: g.items.filter(p => p.isCte).length,
        freight: vals.sum,
        freightKnown: vals.known,
        linkedTrips: uniq(g.items.map(p => p.viagemId)).length,
        ticket: vals.known ? vals.sum / vals.known : null
      };
    })
    .sort((a, b) => b.freight - a.freight);
  const routes = groupRows(viagens, v => (v.origem || 'Não informado') + ' → ' + (v.destino || 'Não informado'))
    .map(g => ({
      name: g.name,
      viagens: g.count,
      km: add(g.items, null, v => v.kmRodados),
      fuel: add(g.items, null, v => v.abastecimento),
      freight: add(g.items, null, v => v.receita),
      ids: g.items.map(x => x.id)
    }))
    .sort((a, b) => b.viagens - a.viagens);
  const vehicles = groupRows(viagens, v => v.placa || 'Veículo ID ' + (v.veiculoId || '?'))
    .map(g => ({
      name: g.name,
      viagens: g.count,
      km: add(g.items, null, v => v.kmRodados),
      fuel: add(g.items, null, v => v.abastecimento),
      freight: add(g.items, null, v => v.receita),
      ids: g.items.map(x => x.id)
    }))
    .sort((a, b) => b.viagens - a.viagens);
  // motoristas em duas fontes; se o ID não consta na RV, contar apenas pedidos.
  const drivers = groupRows(pedidos, p =>
    p.motoristaId
      ? 'ID ' + p.motoristaId + ' · ' + (p.motoristaNome || 'nome não disponível')
      : p.motoristaNome || 'Não informado'
  )
    .map(g => ({
      name: g.name,
      orders: g.count,
      freight: add(g.items, null, p => p.valor),
      ctes: g.items.filter(p => p.isCte).length
    }))
    .sort((a, b) => b.orders - a.orders);
  const containers = groupRows(
    [
      ...viagens.map(v => ({ container: v.container, kind: 'RV', id: v.id, data: v.data })),
      ...pedidos.map(p => ({ container: p.container, kind: 'PF', id: p.id, data: p.data }))
    ].filter(x => ok(x.container)),
    x => x.container
  )
    .map(g => ({
      name: g.name,
      viagens: g.items.filter(x => x.kind === 'RV').length,
      pedidos: g.items.filter(x => x.kind === 'PF').length,
      lastDate: g.items.reduce((last, x) => (x.data > last ? x.data : last), '')
    }))
    .sort((a, b) => b.viagens + b.pedidos - a.viagens - a.pedidos);
  const serviceTypes = groupRows(pedidos, p => p.tipoServico || p.operacaoTransporte)
    .map(g => ({ name: g.name, orders: g.count, freight: add(g.items, null, p => p.valor) }))
    .sort((a, b) => b.orders - a.orders);
  const insured = pedidos.filter(p => ok(p.numeroAverbacao)),
    averbacao = result(pedidos, p => p.valorAverbacao);
  const alerts = opts.includeAlerts === false ? [] : makeAlerts(data, { lateDays: opts.lateDays ?? 2 });
  return {
    totals: {
      trips: viagens.length,
      ongoing: inProgress.length,
      completed: finished.length,
      orders: pedidos.length,
      ctes: docs.length,
      withoutCT: withoutCT.length,
      withoutTrip: withoutTrip.length,
      missingDelivery: missingDelivery.length,
      readyToInvoice: readyToInvoice.length,
      withoutInvoice: withoutInvoice.length,
      freight,
      fuel,
      planned,
      actual,
      kmDifference:
        actual.known === viagens.length && planned.known === viagens.length && viagens.length
          ? actual.sum - planned.sum
          : null,
      insured: insured.length,
      averbacao,
      uniqueContainers: containers.length,
      uniqueVehicles: vehicles.filter(v => v.name !== 'Veículo ID ?').length
    },
    months: periodMonths,
    customers,
    routes,
    vehicles,
    drivers,
    containers,
    serviceTypes,
    alerts,
    uniqueClients: uniq(pedidos.map(p => p.cliente)).length
  };
}
export function extractRows(type, data) {
  const v = data.viagens || [],
    p = data.pedidos || [],
    m = data.mdfes || [];
  const i = ['clientes', 'containers'].includes(type)
    ? buildInsights(data, { includeAlerts: false })
    : ['rotas', 'veiculos', 'motoristas'].includes(type)
      ? { [type === 'rotas' ? 'routes' : type === 'veiculos' ? 'vehicles' : 'drivers']: operationalGroups(type, data) }
      : null;
  switch (type) {
    case 'viagens':
      return {
        title: 'Relatório de viagens (RV)',
        columns: [
          ['numero', 'RV'],
          ['tipoRv', 'Tipo de RV'],
          ['data', 'Início'],
          ['dataTermino', 'Término'],
          ['cliente', 'Cliente'],
          ['placa', 'Placa'],
          ['motoristaId', 'Motorista ID'],
          ['motoristaNome', 'Motorista'],
          ['container', 'Container'],
          ['nroMdf', 'Ref. MDF-e'],
          ['origem', 'Origem'],
          ['destino', 'Destino'],
          ['kmPrevisto', 'KM previsto'],
          ['kmRodados', 'KM rodado'],
          ['desvioKm', 'Desvio de KM'],
          ['custoAbastecimentoKm', 'Abastecimento por KM (R$)'],
          ['abastecimento', 'Abastecimento (R$)'],
          ['receita', 'Pedidos vinculados (R$)'],
          ['status', 'Situação']
        ],
        rows: v
      };
    case 'pedidos':
      return {
        title: 'Pedidos de frete e CT-e',
        columns: [
          ['pedidoNumero', 'Pedido'],
          ['cteNumero', 'CT-e'],
          ['data', 'Emissão'],
          ['dataCte', 'Emissão CT-e'],
          ['cliente', 'Cliente'],
          ['motoristaNome', 'Motorista'],
          ['placa', 'Placa'],
          ['container', 'Container'],
          ['rvReferencia', 'Referência RV'],
          ['nroMdf', 'Referência MDF-e'],
          ['valor', 'Frete (R$)'],
          ['valorReceber', 'A receber (R$)'],
          ['liberadoFaturamento', 'Liberado faturamento'],
          ['numeroFatura', 'Fatura'],
          ['entregaConcluida', 'Entrega concluída'],
          ['comprovanteEntrega', 'Comprovante'],
          ['ocorrencia', 'Ocorrência'],
          ['status', 'Situação']
        ],
        rows: p
      };
    case 'ctes':
      return {
        title: 'CT-e identificados',
        columns: [
          ['pedidoNumero', 'Pedido'],
          ['cteNumero', 'CT-e'],
          ['dataCte', 'Emissão CT-e'],
          ['cliente', 'Cliente'],
          ['rvReferencia', 'Referência RV'],
          ['viagemId', 'RV vinculada ID'],
          ['nroMdf', 'MDF-e'],
          ['valor', 'Frete (R$)'],
          ['status', 'Situação']
        ],
        rows: [
          ...new Map(
            [...p.filter(x => x.isCte), ...(data.ctes || [])].map(row => [row.id || row.cteNumero, row])
          ).values()
        ]
      };
    case 'clientes':
      return {
        title: 'Resumo por cliente',
        columns: [
          ['name', 'Cliente'],
          ['orders', 'Pedidos'],
          ['ctes', 'CT-e'],
          ['linkedTrips', 'Viagens vinculadas'],
          ['freight', 'Total fretes (R$)'],
          ['ticket', 'Ticket médio (R$)']
        ],
        rows: i.customers
      };
    case 'rotas':
      return {
        title: 'Resumo por rota',
        columns: [
          ['name', 'Rota'],
          ['viagens', 'Viagens'],
          ['km', 'KM rodados'],
          ['fuel', 'Abastecimento (R$)'],
          ['freight', 'Fretes vinculados (R$)']
        ],
        rows: i.routes
      };
    case 'veiculos':
      return {
        title: 'Resumo da frota',
        columns: [
          ['name', 'Veículo'],
          ['viagens', 'Viagens'],
          ['km', 'KM rodados'],
          ['fuel', 'Abastecimento (R$)'],
          ['freight', 'Fretes vinculados (R$)']
        ],
        rows: i.vehicles
      };
    case 'motoristas':
      return {
        title: 'Pedidos por motorista',
        columns: [
          ['name', 'Motorista'],
          ['orders', 'Pedidos'],
          ['ctes', 'CT-e'],
          ['freight', 'Fretes (R$)']
        ],
        rows: i.drivers
      };
    case 'containers':
      return {
        title: 'Histórico por container',
        columns: [
          ['name', 'Container'],
          ['viagens', 'Registros RV'],
          ['pedidos', 'Pedidos'],
          ['lastDate', 'Último registro']
        ],
        rows: i.containers
      };
    case 'mdfes':
      return {
        title: 'Referências de MDF-e',
        columns: [
          ['numero', 'MDF-e'],
          ['data', 'Data'],
          ['viagemId', 'RV ID'],
          ['placa', 'Placa'],
          ['status', 'Situação declarada']
        ],
        rows: m
      };
    case 'entregas':
      return {
        title: 'Acompanhamento de entregas',
        columns: [
          ['pedidoNumero', 'Pedido PF'],
          ['cteNumero', 'CT-e'],
          ['data', 'Emissão'],
          ['cliente', 'Cliente'],
          ['motoristaNome', 'Motorista'],
          ['placa', 'Placa'],
          ['entregaConcluida', 'Entrega concluída'],
          ['comprovanteEntrega', 'Comprovante'],
          ['ocorrencia', 'Ocorrência'],
          ['status', 'Situação']
        ],
        rows: p
      };
    case 'ocorrencias':
      return {
        title: 'Ocorrências operacionais',
        columns: [
          ['id', 'ID'],
          ['data', 'Data'],
          ['placa', 'Placa'],
          ['tipo', 'Tipo'],
          ['descricao', 'Descrição'],
          ['relato', 'Relato'],
          ['status', 'Situação'],
          ['providencia', 'Providência']
        ],
        rows: data.ocorrencias || []
      };
    case 'pendencias':
      return {
        title: 'Pendências operacionais',
        columns: [
          ['type', 'Tipo'],
          ['level', 'Prioridade'],
          ['recordId', 'Registro'],
          ['title', 'Ocorrência'],
          ['detail', 'Detalhes'],
          ['refDate', 'Data']
        ],
        rows: makeAlerts(data)
      };
    case 'mensal':
      return {
        title: 'Indicadores por mês',
        columns: [
          ['month', 'Mês'],
          ['trips', 'Viagens'],
          ['orders', 'Pedidos'],
          ['ctes', 'CT-e'],
          ['freight', 'Fretes (R$)'],
          ['fuel', 'Abastecimento (R$)'],
          ['km', 'KM rodado']
        ],
        rows: [
          ...new Set([...v, ...p].map(row => String(row.data || '').slice(0, 4)).filter(year => /^\d{4}$/.test(year)))
        ]
          .sort()
          .flatMap(year => monthsOverview(v, p, Number(year)))
          .filter(row => row.trips || row.orders)
      };
    default:
      throw Error('Relatório desconhecido: ' + type);
  }
}
export const REPORT_TYPES = [
  'entregas',
  'ocorrencias',
  'viagens',
  'pedidos',
  'ctes',
  'clientes',
  'rotas',
  'veiculos',
  'motoristas',
  'containers',
  'mdfes',
  'pendencias',
  'mensal'
];

/** Agrupa somente a área pedida; não monta outras abas nem descrições de registros. */
export function operationalGroups(type, data) {
  return memoView('groups-' + type, [data], () => {
    const trips = data.viagens || [],
      orders = data.pedidos || [];
    if (type === 'motoristas')
      return groupRows(orders, p =>
        p.motoristaId
          ? 'ID ' + p.motoristaId + ' · ' + (p.motoristaNome || 'nome não disponível')
          : p.motoristaNome || 'Não informado'
      ).map(g => ({ name: g.name, orders: g.count, ctes: g.items.filter(p => p.isCte).length }));
    return groupRows(
      trips,
      type === 'rotas'
        ? v => (v.origem || 'Não informado') + ' → ' + (v.destino || 'Não informado')
        : v => v.placa || 'Veículo ID ' + (v.veiculoId || '?')
    )
      .map(g => ({
        name: g.name,
        viagens: g.count,
        km: g.items.some(v => Number.isFinite(v.kmRodados))
          ? g.items.reduce((sum, v) => sum + (v.kmRodados || 0), 0)
          : null
      }))
      .sort((a, b) => b.viagens - a.viagens);
  });
}
