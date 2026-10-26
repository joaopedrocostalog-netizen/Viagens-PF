import { renderDateControl } from './date-controls.mjs';
import { dayRows, dailyStatus, dayTrips, DAY_CATEGORIES } from './programming-data.mjs';
import { memoView } from './view-cache.mjs';
import { searchOperationalData } from './filtering.mjs';
import { renderGrid } from './advanced-ui.mjs';
const h = v =>
  String(v ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const dayOutside = state => {
  const date = state.dayDate;
  return (
    state.mode === 'live' &&
    (!state.loadedRange ||
      date < state.loadedRange.from ||
      date > state.loadedRange.to ||
      date < state.from ||
      date > state.to)
  );
};
/** RVs da data da programação (mesma regra da tabela "Viagens do dia"), para as contagens da barra de etapas. */
export function dayStageData(data, state) {
  if (dayOutside(state)) return { viagens: [] };
  return { viagens: dayRows(searchOperationalData(data, state.search), state.dayDate, state.dayCategory) };
}
export function renderDayProgramming(data, state) {
  const date = state.dayDate,
    source = memoView('day-search', [data, state.search], () => searchOperationalData(data, state.search));
  const all = memoView('day-trips', [source, date], () => dayTrips(source, date));
  const category = DAY_CATEGORIES.includes(state.dayCategory) ? state.dayCategory : '';
  const rows = category ? all.filter(row => dailyStatus(row) === category) : all;
  const counts = all.reduce((acc, row) => {
    const label = dailyStatus(row);
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
  const outside = dayOutside(state);
  const controls =
    '<div class="day-toolbar"><div class="filter"><label for="dayDate">Data da programação</label>' +
    renderDateControl('dayDate', date, { label: 'Data da programação' }) +
    '</div><div class="day-nav" role="group" aria-label="Navegar entre dias">' +
    '<button class="btn btn-sm" data-action="day-prev" aria-label="Dia anterior" title="Dia anterior">◀</button>' +
    '<button class="btn btn-sm" data-action="day-today">Hoje</button>' +
    '<button class="btn btn-sm" data-action="day-next" aria-label="Próximo dia" title="Próximo dia">▶</button>' +
    '</div><div class="day-actions">' +
    '<button class="btn btn-sm" data-export-day="xlsx">Exportar Excel</button>' +
    '<button class="btn btn-sm" data-export-day="pdf">PDF</button>' +
    '<button class="btn btn-sm btn-red" data-action="tv-mode">' +
    (state.tvMode ? 'Sair do modo TV' : 'Modo TV') +
    '</button></div></div>';
  const note = outside
    ? '<p class="ins-inline-error" role="status">Esta data está fora do período carregado ou selecionado. Ajuste o período e atualize os dados para consultar.</p>'
    : '';
  // Cartões filtram a tabela (clicar de novo remove o filtro), como os indicadores do Painel.
  const cards =
    '<div class="ins-kpi-row day-cards" role="group" aria-label="Filtrar viagens do dia por situação">' +
    DAY_CATEGORIES.map(
      label =>
        '<button type="button" class="ins-kpi day-card' +
        (category === label ? ' active' : '') +
        '" data-day-category="' +
        h(label) +
        '" aria-pressed="' +
        (category === label) +
        '" ' +
        (outside ? 'disabled' : '') +
        '><div>' +
        label +
        '</div><strong>' +
        (outside ? '—' : counts[label] || 0) +
        '</strong><small>' +
        (category === label ? 'Filtrando · clique para mostrar todas' : 'Clique para filtrar') +
        '</small></button>'
    ).join('') +
    '</div>';
  const columns = [
    { key: 'numero', label: 'RV', detail: 'viagens' },
    { key: 'placa', label: 'Placa' },
    { key: 'status', label: 'Situação' },
    { key: 'motoristaNome', label: 'Motorista' },
    { key: 'cliente', label: 'Cliente' },
    { key: 'origem', label: 'Origem' },
    { key: 'destino', label: 'Destino' },
    { key: 'data', label: 'Início', format: 'date' },
    { key: 'dataTermino', label: 'Término', format: 'date' }
  ];
  const programs = (source.programacoes || []).filter(row => row.data === date);
  // Independent pagination; supplementary rows render only when opened.
  const programState = { ...state, listFilters: '', page: state.programPage || 1 };
  const programTable =
    state.dayProgramsOpen && source.sources?.programacoes
      ? renderGrid(
          'Programações emitidas',
          programs,
          [
            { key: 'numero', label: 'Programação' },
            { key: 'data', label: 'Emissão', format: 'date' },
            { key: 'rvReferencia', label: 'RV ref.' },
            { key: 'motoristaId', label: 'Motorista ID' },
            { key: 'veiculoId', label: 'Veículo ID' }
          ],
          programState,
          'programacoes'
        )
          .replaceAll('data-action="prev"', 'data-action="program-prev"')
          .replaceAll('data-action="next"', 'data-action="program-next"')
      : '';
  state.programPage = programState.page;
  const extra =
    '<details class="day-programs" ' +
    (state.dayProgramsOpen ? 'open' : '') +
    ' id="dayPrograms"><summary>Programações emitidas na data ' +
    (source.sources?.programacoes ? '(' + programs.length + ')' : '· fonte indisponível ou não informada') +
    '</summary>' +
    (state.dayProgramsOpen
      ? source.sources?.programacoes
        ? '<p class="help">Data de emissão da programação. A saída prevista não foi informada pela fonte.</p>' +
          programTable
        : '<p role="status">As programações não estão disponíveis nesta consulta. A lista de RVs continua disponível.</p>'
      : '') +
    '</details>';
  return (
    controls +
    note +
    cards +
    renderGrid(
      category ? 'Viagens do dia · ' + category : 'Viagens do dia',
      outside ? [] : rows,
      columns,
      state,
      'programacao'
    ) +
    extra
  );
}
