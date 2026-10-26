import { companyIdentity } from './companies.mjs';
import { rvStatus, rvStatusCounts, renderRvStatusStages } from './rv-status.mjs';
/** IDs have legal-entity namespaces. No plate/name/number approximation is allowed here. */
export function filterRvStage(data, stage = '') {
  if (!stage) return data;
  const trips = (data.viagens || []).filter(row => rvStatus(row.status) === rvStatus(stage));
  const ids = new Set(trips.map(row => row.id));
  const indexes = new Map();
  for (const trip of data.viagens || [])
    for (const [field, value] of [
      ['rv_id', trip.rvId],
      ['nro_rv', trip.numero]
    ])
      if (value) {
        const key = companyIdentity(trip) + ':' + field + ':' + String(value),
          list = indexes.get(key) || [];
        list.push(trip.id);
        indexes.set(key, list);
      }
  const orders = new Map(
    (data.pedidos || []).map(row => [companyIdentity(row) + ':' + String(row.id).split('~').at(-1), row])
  );
  const linked = row => {
    if (row.viagemId) return ids.has(row.viagemId);
    const entity = companyIdentity(row);
    if (!entity) return false;
    const candidates = new Set();
    for (const field of ['rv_id', 'nro_rv'])
      if (row[field] != null)
        for (const id of indexes.get(entity + ':' + field + ':' + String(row[field])) || []) candidates.add(id);
    const order = orders.get(entity + ':' + String(row.pf_id));
    if (order?.viagemId) candidates.add(order.viagemId);
    return candidates.size === 1 && ids.has([...candidates][0]);
  };
  const related = rows => (rows || []).filter(linked);
  return {
    ...data,
    viagens: trips,
    pedidos: related(data.pedidos),
    ctes: related(data.ctes),
    mdfes: related(data.mdfes),
    programacoes: related(data.programacoes),
    ocorrencias: related(data.ocorrencias)
  };
}
export function renderRelatedRvStages(data, stage = '') {
  return (
    '<div class="related-rv-stages"><small>Etapa da RV vinculada</small>' +
    renderRvStatusStages(rvStatusCounts(data.viagens || []), stage).replaceAll(
      'data-rv-status=',
      'data-related-rv-stage='
    ) +
    (stage ? '<p class="help">Somente registros com vínculo seguro a uma RV nesta etapa.</p>' : '') +
    '</div>'
  );
}
