import { projectPortalOverview } from '../api/access.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('Painel, buscas, filtros salvos e relatório CSV usam a empresa e os filtros ativos', async t => {
  const events = {},
    storage = new Map(),
    downloads = [],
    anchors = [],
    alerts = [];
  const fields = {
    loginUser: { value: 'operador' },
    loginPassword: { value: 'senha-teste' },
    searchInput: { focus() {}, setSelectionRange() {} },
    unused: { focus() {}, setSelectionRange() {} }
  };
  const root = { innerHTML: '', addEventListener: (type, fn) => (events[type] = fn) };
  globalThis.document = {
    getElementById: id => (id === 'app' ? root : fields[id] || null),
    querySelector() {
      return null;
    },
    addEventListener() {},
    body: { appendChild() {} },
    createElement() {
      const anchor = { click() {}, remove() {} };
      anchors.push(anchor);
      return anchor;
    }
  };
  globalThis.window = { location: { protocol: 'file:', origin: 'https://teste.local' } };
  globalThis.localStorage = {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
  };
  globalThis.alert = text => alerts.push(text);
  globalThis.prompt = () => 'Filtro Alfa';
  const originalCreate = URL.createObjectURL,
    originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = blob => {
    downloads.push(blob);
    return 'blob:teste';
  };
  URL.revokeObjectURL = () => {};
  t.after(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });
  const data = {
    viagens: [
      {
        empresa: 'AC da Costa',
        rv_id: 1,
        nro_rv: 101,
        data_inicio: '01/10/2026',
        cliente_nome: 'Alfa',
        placa_veiculo: 'ABC-1D23',
        motorista_id: 7,
        motorista_nome: 'João Silva',
        status_rv: 'Concluída',
        cidade_inicial: 'Santos',
        cidade_final: 'Campinas'
      },
      {
        empresa: 'CRC',
        rv_id: 2,
        nro_rv: 102,
        data_inicio: '02/10/2026',
        cliente_nome: 'Beta',
        placa_veiculo: 'DEF-4G56',
        motorista_id: 8,
        motorista_nome: 'José Lima',
        status_rv: 'Em andamento'
      },
      {
        empresa: 'Ideallog',
        rv_id: 1,
        nro_rv: 201,
        data_inicio: '01/10/2026',
        cliente_nome: 'Ideal Cliente',
        placa_veiculo: 'GHI-7J89',
        motorista_id: 9,
        motorista_nome: 'Maria'
      }
    ],
    pedidos: [
      {
        empresa: 'AC da Costa',
        pf_id: 1,
        nro_pf: 'PF-ALFA',
        rv_viagem: 101,
        data_emissao: '01/10/2026',
        cliente_nome: 'Alfa',
        placa_veiculo: 'ABC-1D23',
        motorista_id: 7,
        motorista_nome: 'João Silva',
        status_pedido: 'Concluída',
        tipo_servico: 'A',
        total_frete: 987654
      },
      {
        empresa: 'CRC',
        pf_id: 2,
        nro_pf: 'PF-BETA',
        rv_viagem: 102,
        data_emissao: '02/10/2026',
        cliente_nome: 'Beta',
        placa_veiculo: 'DEF-4G56',
        motorista_id: 8,
        motorista_nome: 'José Lima',
        tipo_servico: 'B'
      },
      {
        empresa: 'Ideallog',
        pf_id: 1,
        nro_pf: 'PF-IDEAL',
        rv_viagem: 201,
        data_emissao: '01/10/2026',
        cliente_nome: 'Ideal Cliente'
      }
    ],
    sources: { pedidos: true }
  };
  globalThis.fetch = async url => ({
    ok: true,
    status: 200,
    json: async () =>
      String(url).includes('/api/login')
        ? {
            token: 'token-teste',
            user: { username: 'operador', role: 'operacional' },
            permissions: { operacional: true, financeiro: false, admin: false }
          }
        : projectPortalOverview({ data }, 'operacional', new URL(url).searchParams.get('company') || 'costalog', {
            includeCompanies: true
          })
  });
  const tick = ms => new Promise(resolve => setTimeout(resolve, ms || 25));
  const click = (selector, dataset) =>
    events.click({ target: { closest: name => (name === selector ? { dataset } : null) } });
  const change = (id, value) => events.change({ target: { id, value, dataset: {} } });
  const input = async (id, value) => {
    events.input({ target: { id, value, selectionStart: value.length } });
    await tick(190);
  };
  const table = () => root.innerHTML.slice(root.innerHTML.indexOf('<tbody>'));
  await import('../src/app.js?hub-filters=1');
  assert(root.innerHTML.includes('MEU PAINEL'));
  assert(root.innerHTML.includes('data-nav="relatorios"'));
  click('[data-action]', { action: 'connect' });
  events.submit({ target: { id: 'loginForm' }, preventDefault() {} });
  await tick();
  change('from', '2026-10-01');
  change('to', '2026-10-22');
  click('[data-action]', { action: 'refresh' });
  await tick();
  assert(root.innerHTML.includes('MEU PAINEL'));
  assert(!root.innerHTML.includes('data-nav="administracao"'));
  click('[data-action]', { action: 'toggle-advanced-filters' });
  change('filterClient', 'Alfa');
  assert(root.innerHTML.includes('<div class="v-extra-filters">'));
  assert(!root.innerHTML.includes('<details id="advancedFilters"'), 'Não deve existir um segundo controle de filtros avançados');
  assert(root.innerHTML.includes('value="Beta"'), 'Outra opção de cliente precisa continuar disponível');
  click('[data-nav]', { nav: 'ctes' });
  assert(table().includes('PF-ALFA'));
  assert(!table().includes('PF-BETA'));
  click('[data-action]', { action: 'save-filter' });
  change('filterClient', 'Beta');
  assert(table().includes('PF-BETA'));
  change('savedPreset', 'Filtro Alfa');
  assert(table().includes('PF-ALFA'));
  assert(!table().includes('PF-BETA'));
  click('[data-action]', { action: 'clear-filters' });
  assert(table().includes('PF-BETA'));
  await input('searchInput', 'joao abc1d23');
  assert(table().includes('PF-ALFA'));
  assert(!table().includes('PF-BETA'));
  click('[data-action]', { action: 'clear-table-search' });
  change('recordStatusFilter', 'Concluída');
  assert(table().includes('PF-ALFA'));
  assert(!table().includes('PF-BETA'));
  click('[data-action]', { action: 'clear-filters' });
  click('[data-nav]', { nav: 'relatorios' });
  change('reportSelected', 'pedidos');
  change('filterClient', 'Alfa');
  click('[data-action]', { action: 'csv-advanced' });
  assert.equal(downloads.length, 1);
  const csv = await downloads[0].text();
  assert(csv.includes('PF-ALFA'));
  assert(!csv.includes('PF-BETA'));
  assert(!csv.includes('PF-IDEAL'));
  assert(!csv.includes('987654'));
  assert(anchors[0].download.startsWith('COSTALOG_pedidos_'));
  await input('searchInput', 'JOAO');
  assert(root.innerHTML.includes('data-search-result="viagens:acdacosta~1"'));
  click('[data-action]', { action: 'switch-company' });
  await tick();
  assert(root.innerHTML.includes('Relatórios IDEALLOG'));
  assert(!root.innerHTML.includes('PF-ALFA'));
  change('reportSelected', 'pedidos');
  click('[data-action]', { action: 'csv-advanced' });
  const idealCsv = await downloads[1].text();
  assert(idealCsv.includes('PF-IDEAL'));
  assert(!idealCsv.includes('PF-ALFA'));
  assert.equal(alerts.length, 0);
});
