import { companyIdentity } from './companies.mjs';
const day = value => (/^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : '');
/** Índice de referências: descrições e links são gerados apenas para a página aberta. */
export function createTripTimeline(trip, data) {
  const refs = [],
    orders = (data.pedidos || []).filter(p => p.viagemId === trip.id);
  const add = (date, type, record, context = false) => refs.push({ date: day(date), type, record, context });
  if (trip.createdOn) add(trip.createdOn, 'created', trip);
  if (trip.data) add(trip.data, 'start', trip);
  const docs = new Map([...orders, ...(data.ctes || []).filter(p => p.viagemId === trip.id)].map(p => [p.id, p]));
  const orderIds = new Set(orders.map(p => p.id));
  for (const p of docs.values()) {
    if (orderIds.has(p.id)) add(p.data, 'pf', p);
    if (p.isCte) add(p.dataCte, 'cte', p);
    if (p.entregaConcluida === true) add('', 'delivery', p);
    if (p.comprovanteEntrega === true) add('', 'proof', p);
    if (p.ocorrencia) add('', 'order-incident', p);
  }
  for (const m of data.mdfes || [])
    if (m.viagemId === trip.id) add(m.origem === 'Referência DSS' ? '' : m.data, 'mdfe', m);
  const entity = companyIdentity(trip),
    allTrips = data.allViagens || data.viagens || [],
    allOrders = data.allPedidos || data.pedidos || [];
  const index = (rows, values) => {
    const map = new Map();
    for (const row of rows)
      for (const value of values(row)) {
        if (value == null || value === '') continue;
        const key = String(value),
          found = map.get(key) || new Set();
        found.add(row);
        map.set(key, found);
      }
    return map;
  };
  const tripIds = index(allTrips, v => [v.id]),
    rvIds = index(allTrips, v => [v.rvId]),
    rvNumbers = index(allTrips, v => [v.numero]);
  const pfIds = index(allOrders, p => [String(p.id).split('~').at(-1)]);
  for (const o of data.ocorrencias || []) {
    const owner = companyIdentity(o);
    if (owner && owner !== entity) continue;
    const candidates = [
      ...new Set([
        ...(tripIds.get(String(o.viagemId)) || []),
        ...(rvIds.get(String(o.rv_id)) || []),
        ...(rvNumbers.get(String(o.nro_rv)) || [])
      ])
    ].filter(v => !owner || companyIdentity(v) === owner);
    const pfs = [...(pfIds.get(String(o.pf_id)) || [])].filter(p => !owner || companyIdentity(p) === owner);
    const linked =
      (candidates.length === 1 && candidates[0].id === trip.id) || (pfs.length === 1 && pfs[0].viagemId === trip.id);
    const context =
      !linked &&
      trip.placa &&
      o.placa === trip.placa &&
      day(o.data) &&
      trip.data &&
      o.data >= trip.data &&
      o.data <= (trip.dataTermino || trip.data);
    if (linked || context) add(o.data, 'incident', o, !!context);
  }
  if (trip.dataTermino) add(trip.dataTermino, 'end', trip);
  refs.sort((a, b) => (!a.date && !b.date ? 0 : !a.date ? 1 : !b.date ? -1 : a.date.localeCompare(b.date)));
  const describe = ref => {
    const r = ref.record;
    let title = '',
      detail = '',
      reference = '';
    if (ref.type === 'created') {
      title = 'RV cadastrada';
      detail = 'RV ' + r.numero;
    }
    if (ref.type === 'start') {
      title = 'Início da viagem';
      detail = 'RV ' + r.numero;
    }
    if (ref.type === 'end') {
      title = 'Término informado da viagem';
      detail = 'RV ' + r.numero;
    }
    if (['pf', 'cte', 'delivery', 'proof', 'order-incident'].includes(ref.type)) {
      reference = 'ctes:' + r.id;
      if (ref.type === 'pf') {
        title = 'Pedido de frete emitido';
        detail = 'PF ' + (r.pedidoNumero || r.numero);
      }
      if (ref.type === 'cte') {
        title = 'CT-e identificado';
        detail = 'CT-e ' + (r.cteNumero || r.numero);
      }
      if (ref.type === 'delivery') {
        title = 'Entrega registrada como concluída';
        detail = 'PF ' + (r.pedidoNumero || r.numero) + ' · data da entrega não fornecida';
      }
      if (ref.type === 'proof') {
        title = 'Comprovante registrado';
        detail = 'PF ' + (r.pedidoNumero || r.numero) + ' · data do comprovante não fornecida';
      }
      if (ref.type === 'order-incident') {
        title = 'Ocorrência no pedido';
        detail = r.ocorrencia;
      }
    }
    if (ref.type === 'mdfe') {
      const derived = r.origem === 'Referência DSS';
      title = derived ? 'Referência MDF-e na viagem' : 'MDF-e informado';
      detail = 'MDF-e ' + r.numero + (derived ? ' · sem data de emissão confirmada' : '');
      reference = 'mdfes:' + r.id;
    }
    if (ref.type === 'incident') {
      title = ref.context ? 'Ocorrência por placa e período (contexto)' : 'Ocorrência vinculada';
      detail = r.descricao || r.tipo || r.relato || 'Ocorrência';
    }
    return { date: ref.date, title, detail, reference, context: ref.context };
  };
  return {
    getPage({ page = 1, pageSize = 25 } = {}) {
      const pages = Math.max(1, Math.ceil(refs.length / pageSize)),
        current = Math.min(pages, Math.max(1, page));
      return {
        total: refs.length,
        pages,
        page: current,
        rows: refs.slice((current - 1) * pageSize, current * pageSize).map(describe)
      };
    },
    all: () => refs.map(describe)
  };
}
/** Extração completa somente quando solicitada explicitamente. */
export function tripTimeline(trip, data) {
  return createTripTimeline(trip, data).all();
}
