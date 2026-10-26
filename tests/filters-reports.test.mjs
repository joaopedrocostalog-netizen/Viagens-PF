import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesSearch, filterOperationalData, filterLinkedRows } from '../src/filtering.mjs';
import { buildOperationalReport, reportTypesFor } from '../src/access-ui.mjs';
import { operationalFilters, renderReportHub } from '../src/advanced-ui.mjs';
import { renderDriverRouteDetails, renderAlertsHub } from '../src/intelligence-ui.mjs';

const data = {
  viagens: [
    {
      id: 'r1',
      rvId: '1',
      numero: '123',
      cliente: 'Cliente Alfa',
      placa: 'ABC-1D23',
      motoristaId: '7',
      motoristaNome: 'João Silva',
      origem: 'Santos',
      destino: 'Campinas',
      data: '2026-10-01',
      status: 'Concluída',
      nroMdf: '700',
      receita: 987654
    },
    {
      id: 'r2',
      rvId: '2',
      numero: '124',
      cliente: 'Cliente Beta',
      placa: 'DEF-4G56',
      motoristaId: '8',
      motoristaNome: 'José Lima',
      origem: 'Guarujá',
      destino: 'Jundiaí',
      data: '2026-10-02',
      status: 'Em andamento',
      nroMdf: '800'
    }
  ],
  pedidos: [
    {
      id: 'p1',
      pedidoNumero: 'PF-A',
      cteNumero: '50',
      isCte: true,
      viagemId: 'r1',
      cliente: 'Cliente Alfa',
      motoristaId: '7',
      motoristaNome: 'João Silva',
      placa: 'ABC-1D23',
      data: '2026-10-01',
      tipoServico: 'A',
      nroMdf: '700',
      entregaConcluida: true,
      comprovanteEntrega: false,
      valor: 987654,
      numeroFatura: 'FAT-SECRETA',
      liberadoFaturamento: true
    },
    {
      id: 'p2',
      pedidoNumero: 'PF-B',
      cliente: 'Cliente Beta',
      motoristaId: '8',
      motoristaNome: 'José Lima',
      viagemId: 'r2',
      placa: 'DEF-4G56',
      data: '2026-10-02',
      tipoServico: 'B',
      nroMdf: '800'
    }
  ],
  ctes: [],
  mdfes: [
    { id: 'm1', numero: '700', viagemId: 'r1', placa: 'ABC-1D23', data: '2026-10-01' },
    { id: 'm2', numero: '800', viagemId: 'r2', placa: 'DEF-4G56', data: '2026-10-02' }
  ],
  ocorrencias: [
    { id: 'o1', rv_id: 1, data: '2026-10-01', placa: 'ABC-1D23', descricao: 'Ocorrência Alfa' },
    { id: 'o2', rv_id: 2, data: '2026-10-02', placa: 'DEF-4G56', descricao: 'Ocorrência Beta' }
  ],
  sources: { pedidos: true }
};
const state = {
  role: 'operacional',
  company: 'costalog',
  permissions: { financeiro: false },
  reportSelected: 'pedidos',
  page: 1,
  filter: 'todos',
  search: '',
  sortDir: 'asc'
};
test('Buscas reconhecem acentos, múltiplos termos, placas, prefixos RV e datas brasileiras', () => {
  const row = data.viagens[0];
  for (const query of ['JOAO', 'abc1d23', 'joao campinas', 'RV 123', '01/10/2026'])
    assert(matchesSearch(row, query), query);
  assert(!matchesSearch(row, 'joao jundiai'));
  assert(matchesSearch({ comprovanteEntrega: false }, 'não'));
  assert(matchesSearch({ entregaConcluida: true }, 'sim'));
  assert(!matchesSearch({ ...row, empresa: 'Ideallog' }, 'ideallog'), 'Empresa não é um campo de busca do registro');
});
test('Cliente, placa e serviço restringem também MDF-e e ocorrências; listas de opções permanecem completas', () => {
  const filtered = filterOperationalData(data, {
    from: '2026-10-01',
    to: '2026-10-22',
    customer: 'Cliente Alfa',
    vehicle: 'ABC-1D23',
    serviceType: 'A'
  });
  assert.deepEqual(
    filtered.viagens.map(r => r.id),
    ['r1']
  );
  assert.deepEqual(
    filtered.pedidos.map(r => r.id),
    ['p1']
  );
  assert.deepEqual(
    filtered.mdfes.map(r => r.id),
    ['m1']
  );
  assert.deepEqual(
    filtered.ocorrencias.map(r => r.id),
    ['o1']
  );
  const html = operationalFilters(data, { ...state, customer: 'Cliente Alfa' });
  assert(html.includes('Cliente Beta'));
  assert(html.includes('value="Cliente Alfa" selected'));
  assert.equal(
    filterLinkedRows(data.viagens, 'viagens', data, 'vinculado').length,
    2,
    'Pedidos sem CT-e também vinculam a RV'
  );
  const status = filterOperationalData(data, { status: 'Concluída', view: 'viagens' });
  assert.equal(status.viagens.length, 1);
  assert.equal(status.pedidos.length, 2, 'Situação da RV não deve apagar pedidos de apoio à conferência de vínculos');
  assert.equal(filterLinkedRows(status.viagens, 'viagens', status, 'vinculado').length, 1);
});
test('Rotas, motoristas e pendências respeitam a barra de busca', () => {
  const route = renderDriverRouteDetails(data, { ...state, search: 'Guaruja' }, 'rotas');
  assert(route.includes('Guarujá → Jundiaí'));
  assert(!route.includes('data-route-open="Santos → Campinas"'));
  const driver = renderDriverRouteDetails(data, { ...state, search: 'JOAO' }, 'motoristas');
  assert(driver.includes('data-driver-open="7"'));
  assert(!driver.includes('data-driver-open="8"'));
  const alerts = renderAlertsHub(data, { ...state, search: 'sem comprovante' });
  assert(alerts.includes('data-alert-detail="ctes:p1"'));
  assert(!alerts.includes('data-alert-detail="ctes:p2"'));
});
test('Todos os relatórios operacionais mantêm colunas seguras e usam a busca da prévia', () => {
  for (const type of reportTypesFor('administrador')) {
    const model = buildOperationalReport(type, data, { ...state, role: 'administrador' });
    assert(!JSON.stringify(model).includes('987654'), type);
    assert(!JSON.stringify(model).includes('FAT-SECRETA'), type);
    assert(!model.rows.some(row => row.type === 'sem_fatura'));
  }
  const selected = buildOperationalReport('pedidos', data, { ...state, search: 'Cliente Alfa' });
  assert.deepEqual(
    selected.rows.map(r => r.pedidoNumero),
    ['PF-A']
  );
  const hub = renderReportHub(data, { ...state, search: 'Cliente Alfa' });
  const preview = hub.slice(hub.indexOf('<tbody>'));
  assert(preview.includes('PF-A'));
  assert(!preview.includes('PF-B'));
  assert(!hub.includes('option value="clientes"'));
});
test('Resumo mensal inclui todos os anos do período selecionado', () => {
  const model = buildOperationalReport(
    'mensal',
    { viagens: [{ data: '2025-12-01' }, { data: '2026-01-01' }], pedidos: [] },
    state
  );
  assert.deepEqual(
    model.rows.map(r => r.month),
    ['2025-12', '2026-01']
  );
});
