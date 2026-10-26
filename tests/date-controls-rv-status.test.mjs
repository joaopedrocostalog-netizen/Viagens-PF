import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseEditableDate,
  dateText,
  renderDateControl,
  editDateControl,
  resetDateControls,
  hasDateErrors,
  openDateCalendar
} from '../src/date-controls.mjs';
import {
  RV_STATUSES,
  rvStatus,
  tripActive,
  tripCompleted,
  rvStatusCounts,
  renderRvStatusStages
} from '../src/rv-status.mjs';
import { normalizeOverview } from '../src/dss-mapping.mjs';
import { filterOperationalData } from '../src/filtering.mjs';
import { dashboardMetrics } from '../src/intelligence.mjs';
import { createAlertPager } from '../src/operational.mjs';
import { renderSummary } from '../src/visual-dashboard.mjs';
import { dayTrips, dailyStatus } from '../src/programming-data.mjs';

test('Datas aceitam digitação inteira, colagem e ISO; rejeitam anos parciais e dias inexistentes', () => {
  for (const text of ['23/10/2026', '23102026', '2026-10-23', ' 23/10/2026 '])
    assert.equal(parseEditableDate(text), '2026-10-23');
  assert.equal(parseEditableDate('29/02/2024'), '2024-02-29');
  for (const text of [
    '29/02/2026',
    '31/04/2026',
    '31/02/2026',
    '2026-13-01',
    '23/10/2',
    '23/10/0002',
    '99/99/9999',
    '2026-10-32'
  ])
    assert.equal(parseEditableDate(text), null, text);
  assert.equal(parseEditableDate(''), '');
  assert.equal(dateText('2026-10-23'), '23/10/2026');
});

test('Edição incompleta sobrevive a renderizações e não aplica data; calendário permanece independente', () => {
  resetDateControls();
  let validity = '';
  const field = { id: 'from', value: '23/10/2', setCustomValidity: v => (validity = v), setAttribute() {} };
  assert.equal(editDateControl(field, { showError: false }).valid, false);
  assert(hasDateErrors(['from']));
  let html = renderDateControl('from', '2026-10-01', { max: '2026-10-23' });
  assert(html.includes('value="23/10/2"'));
  assert(html.includes('data-date-picker="from" value="2026-10-01" max="2026-10-23"'));
  field.value = '24102026';
  assert.equal(editDateControl(field, { max: '2026-10-23' }).valid, false);
  assert(validity.includes('23/10/2026'));
  field.value = '23102026';
  const result = editDateControl(field, { max: '2026-10-23' });
  assert.equal(result.iso, '2026-10-23');
  assert.equal(field.value, '23/10/2026');
  assert(!hasDateErrors(['from']));
  assert.equal(validity, '');
  resetDateControls();
  let opens = 0;
  const previous = globalThis.document;
  globalThis.document = {
    getElementById: () => ({
      showPicker() {
        opens++;
      }
    })
  };
  openDateCalendar('from');
  assert.equal(opens, 1);
  globalThis.document = previous;
  const due = { id: 'taskDue', value: '' };
  assert(editDateControl(due, { optional: true }).valid);
  resetDateControls();
});

test('Etapas são as cinco do DSS e não equiparam Finalizado a Encerrado nem adivinham códigos', () => {
  assert.deepEqual(RV_STATUSES, ['Incluído', 'Escalado', 'Viajando', 'Finalizado', 'Encerrado']);
  assert.equal(rvStatus('incluido'), 'Incluído');
  assert.equal(rvStatus('Encerrada'), 'Encerrado');
  assert.equal(rvStatus('FINALIZADA'), 'Finalizado');
  assert.equal(rvStatus('Concluída'), 'Concluída');
  assert.equal(rvStatus('5'), '5');
  assert.equal(rvStatus('constructor'), 'constructor');
  assert.equal(rvStatus('cancelado'), 'Cancelado');
  assert.equal(rvStatus('CANCELADA'), 'Cancelado');
  assert.equal(rvStatus(''), 'Não informado');
  const trips = RV_STATUSES.map((status, i) => ({
    id: String(i),
    numero: String(i),
    data: '2026-10-01',
    status,
    tipoRv: 'RODO'
  }));
  const data = { viagens: trips, pedidos: [], mdfes: [], sources: { pedidos: true } };
  assert.equal(filterOperationalData(data, { view: 'viagens', status: 'Finalizado' }).viagens[0].status, 'Finalizado');
  assert.equal(filterOperationalData(data, { view: 'viagens', status: 'Encerrado' }).viagens[0].status, 'Encerrado');
  const metrics = dashboardMetrics(data);
  assert.equal(metrics.find(m => m.id === 'andamento').value, 1);
  assert.equal(metrics.find(m => m.id === 'concluidas').value, 2);
  assert.equal(filterOperationalData(data, { drilldown: 'andamento' }).viagens[0].status, 'Viajando');
  assert.equal(createAlertPager(data, { asOf: '2026-10-23' }).getPage({ kind: 'rv_sem_termino' }).total, 1);
  assert.deepEqual(
    dayTrips(data, '2026-10-23').map(row => row.status),
    ['Viajando']
  );
  assert.equal(dailyStatus(trips[1]), 'Planejadas');
  assert(tripActive('Viajando'));
  assert(tripCompleted('Finalizado'));
  assert(!tripActive('Encerrado'));
  const html = renderSummary(data, { from: '2026-10-01', to: '2026-10-23' });
  for (const stage of RV_STATUSES) assert(html.includes(stage.toUpperCase()));
  const bar = renderRvStatusStages(rvStatusCounts(trips), 'Finalizado');
  assert(bar.includes('data-rv-status="Encerrado"'));
  assert(bar.includes('data-rv-status="Finalizado" aria-pressed="true"'));
  const readonly = renderRvStatusStages({ Finalizado: 1 }, 'Finalizado', { readonly: true });
  assert.equal((readonly.match(/aria-current="step"/g) || []).length, 1);
  assert(!readonly.includes('data-rv-status'));
  const mapped = normalizeOverview({
    data: { viagens: [{ empresa: 'CRC', rv_id: 1, status_rv: 'Encerrada', tipo_rv: 'LS' }], pedidos: [] }
  });
  assert.equal(mapped.viagens[0].status, 'Encerrado');
  assert.equal(mapped.viagens[0].tipoRv, 'LS');
});
