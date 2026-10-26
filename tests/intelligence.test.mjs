import test from 'node:test';
import assert from 'node:assert/strict';
import {
  unifiedSearch,
  customerProfiles,
  routeStats,
  driverStats,
  comparisonWindows,
  subsetPeriod,
  periodMetrics,
  comparePeriodMetrics,
  dashboardMetrics,
  normalizedLayout,
  reorderMetric,
  alertsForRole
} from '../src/intelligence.mjs';
import { makeAlerts } from '../src/operational.mjs';

const rows = {
  viagens: [
    {
      id: 'rv1',
      rvId: '110',
      numero: '110',
      cliente: 'Cliente Alfa',
      placa: 'ABC-1234',
      data: '2026-10-14',
      status: 'Concluída',
      origem: 'Santos',
      destino: 'Campinas',
      kmRodados: 310,
      kmPrevisto: 300,
      motoristaId: '55',
      abastecimento: 500
    },
    {
      id: 'rv2',
      rvId: '111',
      numero: '111',
      cliente: 'Cliente Alfa',
      placa: 'QWE-5544',
      data: '2026-10-15',
      status: 'Em andamento',
      origem: 'Santos',
      destino: 'Campinas',
      kmRodados: null,
      kmPrevisto: 300,
      motoristaId: '55',
      abastecimento: null
    },
    {
      id: 'rv3',
      rvId: '112',
      numero: '112',
      cliente: 'Cliente Beta',
      placa: 'RTY-0000',
      data: '2026-09-14',
      status: 'Concluída',
      origem: 'Santos',
      destino: 'São Paulo',
      kmRodados: 80,
      kmPrevisto: 75,
      motoristaId: '66',
      abastecimento: 80
    }
  ],
  pedidos: [
    {
      id: 'p1',
      pedidoNumero: 'PF-20',
      cteNumero: '4488',
      numero: '4488',
      isCte: true,
      cliente: 'Cliente Alfa',
      placa: 'ABC-1234',
      data: '2026-10-14',
      valor: 2800,
      valorReceber: 2500,
      viagemId: 'rv1',
      motoristaId: '55',
      motoristaNome: 'José',
      nroMdf: 'MDF001',
      entregaConcluida: true,
      comprovanteEntrega: true
    },
    {
      id: 'p2',
      pedidoNumero: 'PF-21',
      cteNumero: '',
      numero: 'PF-21',
      isCte: false,
      cliente: 'Cliente Alfa',
      placa: 'QWE-5544',
      data: '2026-10-15',
      valor: null,
      viagemId: 'rv2',
      motoristaId: '55',
      motoristaNome: 'José',
      entregaConcluida: true,
      comprovanteEntrega: false
    },
    {
      id: 'p3',
      pedidoNumero: 'PF-22',
      cteNumero: '4499',
      numero: '4499',
      isCte: true,
      cliente: 'Cliente Beta',
      placa: 'RTY-0000',
      data: '2026-09-14',
      valor: 1600,
      viagemId: null,
      rvReferencia: '999',
      motoristaId: '66',
      motoristaNome: 'Carlos',
      entregaConcluida: false,
      comprovanteEntrega: null
    }
  ],
  mdfes: [{ id: 'ref-MDF001', numero: 'MDF001', placa: 'ABC-1234', data: '2026-10-14' }],
  sources: { viagens: true, pedidos: true, ctes: true, mdfes: false }
};
test('Pesquisa global encontra PF/RV/CT-e/placa/cliente/MDFe e não divulga fretes', () => {
  const rv = unifiedSearch(rows, 'ABC-1234', { financial: false });
  assert(rv.some(x => x.group === 'viagens'));
  assert(rv.some(x => x.group === 'pedidos'));
  const pf = unifiedSearch(rows, 'PF-20', { financial: false });
  assert.equal(pf[0].group, 'pedidos');
  const cte = unifiedSearch(rows, '4488', { financial: false });
  assert.equal(cte[0].group, 'pedidos');
  assert(unifiedSearch(rows, 'MDF001', { financial: false }).some(x => x.group === 'mdfes'));
  assert(!unifiedSearch(rows, 'Alfa', { financial: false }).some(x => x.group === 'clientes'));
  assert(unifiedSearch(rows, 'Alfa', { financial: true }).some(x => x.group === 'clientes'));
  const joined = JSON.stringify(unifiedSearch(rows, 'Cliente', { financial: false }));
  assert(!joined.includes('2800') && !joined.includes('2500'), 'Não retornar valores na pesquisa operacional');
  assert.deepEqual(unifiedSearch(rows, 'x'), []);
});
test('Perfil de cliente preserva viagens e valores conhecidos, sem tratar ausências como zero', () => {
  const clients = customerProfiles(rows, { financial: true });
  const alfa = clients.find(c => c.name === 'Cliente Alfa');
  assert.equal(alfa.tripCount, 2);
  assert.equal(alfa.orderCount, 2);
  assert.equal(alfa.cteCount, 1);
  assert.equal(alfa.fretesValor, 2800);
  assert.equal(alfa.fretesConhecidos, 1);
  assert.equal(alfa.ticket, 2800);
  assert.equal(alfa.monthly[0].pedidos, 2);
  const hidden = customerProfiles(rows, { financial: false }).find(c => c.name === 'Cliente Alfa');
  assert.equal(hidden.fretesValor, null);
  assert.equal(hidden.ticket, null);
});
test('KM por rota e motorista usa somente registros com KM conhecido e chave de motorista DSS', () => {
  const r = routeStats(rows.viagens),
    campinas = r.find(x => x.name === 'Santos → Campinas');
  assert.equal(campinas.count, 2);
  assert.equal(campinas.km, 310);
  assert.equal(campinas.kmKnown, 1);
  assert.equal(campinas.kmPerTrip, 310);
  assert.equal(campinas.vehicles, 2);
  const d = driverStats(rows.viagens, rows.pedidos).find(x => x.id === '55');
  assert.equal(d.name, 'José');
  assert.equal(d.trips, 2);
  assert.equal(d.orders, 2);
  assert.equal(d.km, 310);
  assert.equal(d.kmKnown, 1);
  assert.equal(d.routes, 1);
});
test('Comparação diária semanal mensal usa calendários válidos e não divide por zero', () => {
  const day = comparisonWindows('2026-10-16', 'diario');
  assert.deepEqual(day.current, { from: '2026-10-16', to: '2026-10-16' });
  assert.deepEqual(day.previous, { from: '2026-10-15', to: '2026-10-15' });
  const week = comparisonWindows('2026-10-16', 'semanal');
  assert.deepEqual(week.current, { from: '2026-10-12', to: '2026-10-18' });
  assert.deepEqual(week.previous, { from: '2026-10-05', to: '2026-10-11' });
  const month = comparisonWindows('2026-10-16', 'mensal');
  assert.deepEqual(month.current, { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(month.previous, { from: '2026-09-01', to: '2026-09-30' });
  const current = subsetPeriod(rows, month.current),
    prev = subsetPeriod(rows, month.previous);
  const comparison = comparePeriodMetrics(current, prev, { financial: true });
  assert.equal(comparison.find(x => x.key === 'viagens').value, 2);
  assert.equal(comparison.find(x => x.key === 'viagens').previous, 1);
  assert.equal(comparison.find(x => x.key === 'fretes').value, 2800);
  assert.equal(comparison.find(x => x.key === 'fretes').previous, 1600);
  assert(!comparison.some(x => x.key === 'km'), 'KM fora dos comparativos enquanto a DSS não informa');
  assert(!comparePeriodMetrics(current, prev, { financial: false }).some(x => x.key === 'fretes'));
  assert.equal(comparePeriodMetrics({ viagens: [], pedidos: [] }, prev).find(x => x.key === 'viagens').pct, -100);
  assert.equal(comparePeriodMetrics(current, { viagens: [], pedidos: [] }).find(x => x.key === 'viagens').pct, null);
});
test('Personalização isola permissões financeiras e mantém ordenação dos favoritos', () => {
  const op = dashboardMetrics(rows, { financial: false }),
    fin = dashboardMetrics(rows, { financial: true });
  assert(!op.some(x => x.id === 'fretes'));
  assert(fin.some(x => x.id === 'fretes'));
  assert.deepEqual(normalizedLayout(['viagens', 'fretes', 'pedidos'], { financial: false }), ['viagens', 'pedidos']);
  assert.deepEqual(normalizedLayout([], { financial: true }), []);
  assert.deepEqual(reorderMetric(['viagens', 'pedidos', 'ctes'], 'pedidos', -1, { financial: false }), [
    'pedidos',
    'viagens',
    'ctes'
  ]);
  assert(!dashboardMetrics(rows, { financial: true }).some(x => x.id === 'km'));
  assert.deepEqual(normalizedLayout(['km', 'viagens']), ['viagens'], 'cartão de KM salvo antes some do painel');
});
test('Alertas geram pendências de CT-e, RV e comprovantes sem presumir resultado fiscal', () => {
  const alerts = makeAlerts(rows, { asOf: '2026-10-16' });
  assert(alerts.some(x => x.type === 'cte_sem_rv' && x.recordId === 'p3'));
  assert(alerts.some(x => x.type === 'cte_pendente' && x.recordId === 'p2'));
  assert(alerts.some(x => x.type === 'comprovante_pendente' && x.recordId === 'p2'));
  assert(alerts.some(x => x.type === 'rv_sem_pedido' && x.recordId === 'rv3'));
  const safe = alertsForRole([...alerts, { type: 'sem_fatura', detail: 'fatura privada' }], false);
  assert(!safe.some(x => x.type === 'sem_fatura'));
  assert(alertsForRole(alerts, true).length >= alertsForRole(alerts, false).length);
});

test('Comparativo de etapas: RVs de cada período por etapa, com diferença e variação', async () => {
  const { compareStages } = await import('../src/intelligence.mjs');
  const rv = status => ({ status });
  const rows = compareStages(
    { viagens: [rv('Escalado'), rv('escalada'), rv('Viajando'), rv('cancelado')] },
    { viagens: [rv('Escalado'), rv('Encerrado'), rv('Encerrado')] }
  );
  const by = Object.fromEntries(rows.map(r => [r.stage, r]));
  assert.deepEqual(
    rows.slice(0, 5).map(r => r.stage),
    ['Incluído', 'Escalado', 'Viajando', 'Finalizado', 'Encerrado']
  );
  assert.deepEqual([by.Escalado.value, by.Escalado.previous, by.Escalado.delta, by.Escalado.pct], [2, 1, 1, 100]);
  assert.deepEqual([by.Encerrado.value, by.Encerrado.previous, by.Encerrado.delta], [0, 2, -2]);
  assert.equal(by.Viajando.pct, null, 'sem base no período B');
  assert.equal(by.Cancelado.value, 1);
});
