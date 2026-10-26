import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeCompanyData } from '../src/companies.mjs';
import { normalizeOverview } from '../src/dss-mapping.mjs';
import { filterOperationalData } from '../src/filtering.mjs';
import { dashboardMetrics } from '../src/intelligence.mjs';
import { tripTimeline, createTripTimeline } from '../src/trip-timeline.mjs';
import { reportTemplate, applyReportTemplate } from '../src/report-templates.mjs';
import { buildOperationalReport } from '../src/access-ui.mjs';
import { renderGrid, renderAdvanced, renderReportHub } from '../src/advanced-ui.mjs';
import { renderDriverRouteDetails } from '../src/intelligence-ui.mjs';
import { renderDataQuality } from '../src/data-quality.mjs';
import { clearViewCache } from '../src/view-cache.mjs';

test('Subfiltro Costalog mantém AC, CRC e Comex distintos, inclusive com IDs repetidos', () => {
  const raw = {
    viagens: ['AC da Costa', 'CRC', 'Comex', 'Ideallog'].map(empresa => ({
      empresa,
      rv_id: 1,
      nro_rv: 100,
      data_inicio: '01/10/2026'
    })),
    pedidos: ['AC da Costa', 'CRC', 'Comex', 'Ideallog'].map(empresa => ({
      empresa,
      pf_id: 1,
      nro_pf: 200,
      rv_viagem: 100,
      data_emissao: '01/10/2026'
    })),
    ocorrencias: [
      { ocorrencia_id: 1, rv_id: 1, descricao: 'Vínculo ambíguo' },
      { empresa: 'CRC', rv_id: 1, ocorrencia_id: 2, descricao: 'CRC' }
    ],
    sources: { pedidos: true }
  };
  const normalized = normalizeOverview({ data: scopeCompanyData(raw, 'costalog') });
  for (const entity of ['acdacosta', 'crc', 'comex']) {
    const scoped = scopeCompanyData(normalized, 'costalog', entity);
    assert.equal(scoped.viagens.length, 1);
    assert.equal(scoped.pedidos.length, 1);
    assert.equal(scoped.viagens[0].id, entity + '~1');
    assert.equal(scoped.pedidos[0].viagemId, entity + '~1');
    assert(!JSON.stringify(scoped).includes('Vínculo ambíguo'));
  }
  assert.throws(() => scopeCompanyData(normalized, 'ideallog', 'crc'), /Empresa inválida/);
});
const data = {
  viagens: [
    {
      id: 'crc~1',
      rvId: '1',
      numero: '100',
      empresa: 'CRC',
      data: '2026-10-01',
      dataTermino: '2026-10-05',
      status: 'Concluída',
      placa: 'ABC-1234',
      cliente: 'Alfa',
      motoristaId: '10',
      motoristaNome: 'João',
      origem: 'Santos',
      destino: 'Campinas',
      kmRodados: 100
    },
    { id: 'crc~2', numero: '101', empresa: 'CRC', data: '2026-10-02', status: 'Em andamento', kmRodados: null }
  ],
  pedidos: [
    {
      id: 'crc~p1',
      pedidoNumero: '200',
      cteNumero: '300',
      isCte: true,
      viagemId: 'crc~1',
      cliente: 'Alfa',
      data: '2026-10-02',
      dataCte: '2026-10-03',
      entregaConcluida: true,
      comprovanteEntrega: false
    },
    { id: 'crc~p2', pedidoNumero: '201', isCte: false, data: '2026-10-02' },
    { id: 'crc~p3', pedidoNumero: '202', cteNumero: '301', isCte: true, data: '2026-10-03' }
  ],
  ctes: [],
  mdfes: [{ id: 'm1', numero: '400', viagemId: 'crc~1', origem: 'Referência DSS', data: '2026-10-01' }],
  sources: { pedidos: true }
};
test('Cada atalho operacional do painel corresponde ao total do indicador', () => {
  const metrics = dashboardMetrics(data),
    views = {
      viagens: 'viagens',
      andamento: 'viagens',
      concluidas: 'viagens',
      pedidos: 'ctes',
      ctes: 'ctes',
      sem_cte: 'ctes',
      sem_rv: 'ctes',
      entregas: 'entregas'
    };
  for (const [id, view] of Object.entries(views)) {
    const scoped = filterOperationalData(data, { drilldown: id, view });
    assert.equal(
      (view === 'viagens' ? scoped.viagens : scoped.pedidos).length,
      metrics.find(m => m.id === id).value,
      id
    );
  }
  assert.equal(filterOperationalData(data, { drilldown: 'km' }).viagens.length, 1);
});
test('Linha do tempo ordena datas declaradas e deixa entrega/comprovante/referência sem data presumida', () => {
  const timeline = tripTimeline(data.viagens[0], {
    ...data,
    ocorrencias: [
      { id: 'o1', empresa: 'CRC', rv_id: 1, data: '2026-10-04', descricao: 'Documento recebido' },
      { id: 'o2', empresa: 'CRC', placa: 'ABC-1234', data: '2026-10-03', descricao: 'Mesma placa' },
      { id: 'o3', empresa: 'Comex', rv_id: 1, data: '2026-10-04', descricao: 'Outra empresa' }
    ]
  });
  assert.deepEqual(
    timeline.filter(e => e.date).map(e => e.date),
    ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-03', '2026-10-04', '2026-10-05']
  );
  assert.equal(timeline.find(e => e.title === 'Entrega registrada como concluída').date, '');
  assert.equal(timeline.find(e => e.title === 'Referência MDF-e na viagem').date, '');
  assert(timeline.find(e => e.detail === 'Mesma placa').context);
  assert(!timeline.some(e => e.detail === 'Outra empresa'));
});
test('Linha do tempo materializa somente 25 eventos e não confirma ocorrência com RV ambígua entre empresas', () => {
  const reads = [],
    trip = { id: 'crc~1', rvId: '1', numero: '100', empresa: 'CRC' };
  const source = {
    viagens: [trip, { id: 'comex~1', rvId: '1', numero: '100', empresa: 'Comex' }],
    pedidos: Array.from({ length: 61 }, (_, i) => ({
      id: 'crc~p' + i,
      viagemId: trip.id,
      data: '2026-10-01',
      get pedidoNumero() {
        reads.push(i);
        return 'PF-' + i;
      }
    })),
    ocorrencias: [{ rv_id: 1, data: '2026-10-02', descricao: 'Vínculo não comprovado' }]
  };
  const pager = createTripTimeline(trip, source);
  assert.deepEqual(reads, []);
  const result = pager.getPage({ page: 2 });
  assert.equal(result.total, 61);
  assert.equal(result.rows.length, 25);
  assert.deepEqual(
    reads,
    Array.from({ length: 25 }, (_, i) => i + 25)
  );
  assert(!result.rows.some(row => row.detail === 'Vínculo não comprovado'));
});
test('Modelos restauram filtros, empresa interna, ordem/colunas e formato sem expor campos financeiros', () => {
  const state = {
    role: 'operacional',
    company: 'costalog',
    legalEntity: 'crc',
    reportSelected: 'pedidos',
    from: '2026-10-01',
    to: '2026-10-22',
    search: 'Alfa',
    sortKey: 'pedidoNumero',
    sortDir: 'asc',
    hiddenColumns: { 'report-pedidos': ['data'] },
    reportColumnOrder: { pedidos: ['cliente', 'pedidoNumero'] },
    reportFormat: 'csv'
  };
  const template = reportTemplate(state),
    restored = { ...state, ...applyReportTemplate(template, { company: 'costalog' }) };
  assert.equal(restored.legalEntity, 'crc');
  assert.equal(restored.reportFormat, 'csv');
  assert.equal(restored.search, 'Alfa');
  const model = buildOperationalReport('pedidos', data, restored);
  assert.deepEqual(
    model.columns.slice(0, 2).map(([key]) => key),
    ['cliente', 'pedidoNumero']
  );
  assert(!model.columns.some(([key]) => key === 'data'));
  assert.equal(model.rows.length, 1);
  assert.throws(() => applyReportTemplate(template, { company: 'ideallog' }), /incompatível/);
  const altered = { ...template, columns: ['valor', 'numeroFatura'] };
  assert.throws(() => applyReportTemplate(altered, { company: 'costalog' }), /operacionais/);
});
test('Tabelas e relatórios materializam apenas a página solicitada e reutilizam a ordenação', () => {
  clearViewCache();
  const reads = [];
  const rows = Array.from({ length: 61 }, (_, i) => ({
    id: i,
    numero: i,
    data: '2026-10-01',
    get cliente() {
      reads.push(i);
      return 'Cliente ' + i;
    }
  }));
  const columns = [
      { key: 'numero', label: 'Número' },
      { key: 'cliente', label: 'Cliente' }
    ],
    state = {
      page: 1,
      sortKey: 'numero',
      sortDir: 'asc',
      role: 'operacional',
      hiddenColumns: {},
      permissions: { financeiro: false }
    };
  renderGrid('RVs', rows, columns, state, 'viagens');
  assert.deepEqual(
    reads,
    Array.from({ length: 25 }, (_, i) => i)
  );
  reads.length = 0;
  state.page = 2;
  renderGrid('RVs', rows, columns, state, 'viagens');
  assert.deepEqual(
    reads,
    Array.from({ length: 25 }, (_, i) => i + 25)
  );
  reads.length = 0;
  const source = { viagens: rows, pedidos: [], mdfes: [] };
  const model = buildOperationalReport('viagens', source, { ...state, sortKey: 'numero' }, { preview: true });
  assert.deepEqual(reads, [], 'Preparar a prévia não projeta o conteúdo das outras páginas');
  renderGrid('Prévia', model.rows, columns, { ...state, rowsSorted: true }, 'report-viagens');
  assert.deepEqual(
    reads,
    Array.from({ length: 25 }, (_, i) => i + 25)
  );
  const forbidden = {
    viagens: [],
    pedidos: [],
    get ctes() {
      throw Error('Aba não pedida');
    }
  };
  assert.doesNotThrow(() => renderAdvanced('entregas', forbidden, state));
});
test('Detalhes de rotas e motoristas também exibem 25 registros, sem preparar outras páginas', () => {
  const source = {
    viagens: Array.from({ length: 61 }, (_, i) => ({
      ...data.viagens[0],
      id: 'r' + i,
      numero: 'RV-' + String(i).padStart(3, '0')
    })),
    pedidos: []
  };
  const state = {
    permissions: { financeiro: false },
    search: '',
    page: 1,
    detailPage: 2,
    routeSelected: 'Santos → Campinas',
    driverSelected: '10'
  };
  const route = renderDriverRouteDetails(source, state, 'rotas');
  assert.equal((route.match(/data-profile-detail=/g) || []).length, 25);
  assert(route.includes('viagens:r25'));
  assert(!route.includes('viagens:r0"'));
  assert(!route.includes('viagens:r50"'));
  const driver = renderDriverRouteDetails(source, state, 'motoristas');
  assert.equal((driver.match(/data-profile-detail=/g) || []).length, 25);
  assert(driver.includes('data-action="detail-prev"'));
});
test('Cobertura distingue fonte indisponível de consulta vazia e preserva datas reais do cache', () => {
  const state = {
    user: { username: 'admin' },
    role: 'administrador',
    permissions: { admin: true },
    technicalOpen: true,
    company: 'costalog',
    legalEntity: 'crc',
    from: '2026-10-01',
    to: '2026-10-22',
    mode: 'live',
    lastSync: '2026-10-22T12:00:00Z',
    loadedRange: { from: '2026-10-01', to: '2026-10-22' },
    syncMetadata: [
      {
        sources: [
          { name: 'ocorrencias', status: 'unavailable' },
          { name: 'pedidos', status: 'ok' }
        ],
        periods: [{ from: '2026-10-01', to: '2026-10-22', syncedAt: '2026-10-20T12:00:00Z' }]
      }
    ]
  };
  const html = renderDataQuality(state, data);
  assert(html.includes('Costalog · CRC'));
  assert(html.includes('Indisponível'));
  assert(html.includes('Fontes complementares incompletas'));
  assert(html.includes('20/10/2026'));
  const report = renderReportHub(data, {
    ...state,
    role: 'operacional',
    page: 1,
    reportSelected: 'pedidos',
    permissions: { financeiro: false }
  });
  assert(report.includes('Modelos de relatório'));
});
