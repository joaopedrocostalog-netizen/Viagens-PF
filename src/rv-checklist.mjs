import { memoView } from './view-cache.mjs';
const h = value =>
  String(value ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const validNumber = value => !!String(value ?? '').trim() && !/^(0+|null|undefined)$/i.test(String(value).trim());
export function buildTripChecklist(trip, data) {
  return memoView('rv-checklist', [trip, data], () => {
    const orders = (data.pedidos || []).filter(row => row.viagemId === trip.id);
    const docs = (data.ctes || []).filter(row => row.viagemId === trip.id);
    const cteIds = new Set(
      docs
        .filter(row => validNumber(row.cteNumero) || (row.isCte === true && validNumber(row.numero)))
        .map(row => row.id)
    );
    const available = data.sources?.pedidos === true,
      items = [];
    items.push({
      id: 'pedidos',
      label: 'Pedidos de frete vinculados',
      state: !available ? 'unknown' : orders.length ? 'done' : 'pending',
      detail: !available
        ? 'A disponibilidade dos pedidos não foi confirmada.'
        : orders.length
          ? orders.length + ' PF(s) vinculados nesta consulta.'
          : 'Nenhum PF vinculado neste período. Confira também outros períodos de emissão.',
      view: 'ctes'
    });
    const ctes = orders.filter(row => validNumber(row.cteNumero) || cteIds.has(row.id)).length;
    items.push({
      id: 'ctes',
      label: 'Número de CT-e nos pedidos',
      state: !available || !orders.length ? 'unknown' : ctes === orders.length ? 'done' : 'pending',
      detail:
        !available || !orders.length
          ? 'Não há base suficiente de PFs vinculados para conferir os números.'
          : ctes +
            ' de ' +
            orders.length +
            ' PF(s) com número de CT-e. A presença do número não valida a autorização fiscal.',
      view: 'ctes'
    });
    for (const [id, key, label] of [
      ['entregas', 'entregaConcluida', 'Entregas registradas como concluídas'],
      ['comprovantes', 'comprovanteEntrega', 'Comprovantes registrados']
    ]) {
      const yes = orders.filter(row => row[key] === true).length,
        no = orders.filter(row => row[key] === false).length,
        unknown = orders.length - yes - no;
      const state = !available || !orders.length ? 'unknown' : no ? 'pending' : unknown ? 'unknown' : 'done';
      items.push({
        id,
        label,
        state,
        detail:
          !available || !orders.length
            ? 'Não há base suficiente de PFs vinculados para a conferência.'
            : yes +
              ' de ' +
              orders.length +
              ' PF(s) com confirmação; ' +
              no +
              ' com “não”; ' +
              unknown +
              ' sem informação.',
        view: 'entregas'
      });
    }
    return {
      items,
      total: items.length,
      done: items.filter(item => item.state === 'done').length,
      pending: items.filter(item => item.state === 'pending').length,
      unknown: items.filter(item => item.state === 'unknown').length
    };
  });
}
export function renderTripChecklist(trip, data) {
  const result = buildTripChecklist(trip, data),
    labels = { done: 'Conferido', pending: 'Pendente', unknown: 'Sem informação suficiente' };
  return (
    '<section class="rv-checklist" aria-labelledby="rvChecklistTitle"><h3 id="rvChecklistTitle">Checklist de encerramento da RV</h3><p class="help">' +
    result.done +
    ' conferido(s) · ' +
    result.pending +
    ' pendente(s) · ' +
    result.unknown +
    ' sem informação suficiente.</p><ul>' +
    result.items
      .map(
        item =>
          '<li class="checklist-' +
          item.state +
          '"><div><strong>' +
          h(item.label) +
          '</strong><span class="pill ' +
          (item.state === 'done' ? 'green' : item.state === 'pending' ? 'yellow' : 'gray') +
          '">' +
          labels[item.state] +
          '</span></div><p>' +
          h(item.detail) +
          '</p><button class="btn btn-sm" data-checklist-open="' +
          h(item.view + ':' + trip.id) +
          '">Ver PFs vinculados ↗</button></li>'
      )
      .join('') +
    '</ul><p class="help">Conferência dos dados do período selecionado. O checklist não encerra a RV nem altera a situação registrada na DSS.</p></section>'
  );
}
