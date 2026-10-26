import test from 'node:test';
import assert from 'node:assert/strict';
import { createAlertPager, makeAlerts } from '../src/operational.mjs';
import { renderAlertsHub } from '../src/intelligence-ui.mjs';

const orders = count =>
  Array.from({ length: count }, (_, i) => ({
    id: 'p' + i,
    pedidoNumero: 'PF-' + i,
    cliente: 'CLIENTE-' + i,
    data: '2026-10-01',
    isCte: false
  }));
test('Pendências geram os detalhes de 25 itens somente quando sua página é solicitada', () => {
  const accessed = [];
  const pedidos = orders(61).map((row, i) => ({
    ...row,
    get cliente() {
      accessed.push(i);
      return 'CLIENTE-' + i;
    }
  }));
  const pager = createAlertPager({ pedidos, viagens: [] });
  assert.deepEqual(accessed, [], 'Preparação não deve gerar os detalhes de nenhuma página');
  const first = pager.getPage({ page: 1 });
  assert.deepEqual(
    accessed,
    Array.from({ length: 25 }, (_, i) => i)
  );
  assert.equal(first.total, 61);
  assert.equal(first.pages, 3);
  assert.equal(first.rows.length, 25);
  accessed.length = 0;
  const second = pager.getPage({ page: 2 });
  assert.deepEqual(
    accessed,
    Array.from({ length: 25 }, (_, i) => i + 25),
    'Não gera detalhes das páginas anterior ou seguinte'
  );
  assert.equal(second.rows[0].recordId, 'p25');
  accessed.length = 0;
  const last = pager.getPage({ page: 999 });
  assert.equal(last.page, 3);
  assert.equal(last.rows.length, 11);
  assert.deepEqual(
    accessed,
    Array.from({ length: 11 }, (_, i) => i + 50)
  );
});
test('Páginas mantêm ordenação, regras e totais das pendências existentes', () => {
  const data = {
    pedidos: orders(31).map((p, i) => ({
      ...p,
      data: i % 2 ? '2026-10-20' : '2026-10-01',
      entregaConcluida: true,
      comprovanteEntrega: false,
      ocorrencia: 'Evento',
      liberadoFaturamento: true
    })),
    viagens: [{ id: 'rv1', numero: 1, data: '2026-10-10', status: 'Em andamento', kmPrevisto: 100, kmRodados: 130 }],
    sources: { pedidos: true }
  };
  const options = { asOf: '2026-10-22' };
  const expected = makeAlerts(data, options),
    pager = createAlertPager(data, options);
  const first = pager.getPage({ financial: true }),
    all = [];
  for (let page = 1; page <= first.pages; page++) all.push(...pager.getPage({ page, financial: true }).rows);
  assert.deepEqual(all, expected);
  const filtered = pager.getPage({ priority: 'high', kind: 'comprovante_pendente' });
  assert.equal(filtered.total, 31);
  assert.equal(filtered.rows.length, 25);
  assert(filtered.rows.every(row => row.type === 'comprovante_pendente'));
  const hidden = pager.getPage({ kind: 'sem_fatura' });
  assert.equal(hidden.total, 0);
  assert.deepEqual(hidden.rows, []);
  assert(!hidden.types.includes('sem_fatura'));
});
test('Somente cartões da página ativa entram no HTML; navegação respeita primeira e última páginas', () => {
  const data = { pedidos: orders(61), viagens: [] };
  const state = { permissions: { financeiro: false }, page: 1, alertPriority: 'todos', alertKind: 'todos' };
  const first = renderAlertsHub(data, state);
  assert.equal((first.match(/class="ins-alert-item"/g) || []).length, 25);
  assert(first.includes('data-alert-detail="ctes:p0"'));
  assert(!first.includes('data-alert-detail="ctes:p25"'));
  assert(first.includes('Página 1 de 3'));
  assert(first.includes('data-action="prev" disabled'));
  state.page = 2;
  const second = renderAlertsHub(data, state);
  assert(second.includes('data-alert-detail="ctes:p25"'));
  assert(!second.includes('data-alert-detail="ctes:p0"'));
  assert(!second.includes('data-alert-detail="ctes:p50"'));
  state.page = 3;
  const last = renderAlertsHub(data, state);
  assert.equal((last.match(/class="ins-alert-item"/g) || []).length, 11);
  assert(last.includes('data-action="next" disabled'));
  assert(!last.includes('primeiras 100'));
});
test('RV sem pedido usa índice de vínculos em vez de percorrer todos os pedidos por RV', () => {
  let reads = 0;
  const data = {
    pedidos: orders(200).map((p, i) => ({
      ...p,
      get viagemId() {
        reads++;
        return 'rv' + i;
      }
    })),
    viagens: Array.from({ length: 200 }, (_, i) => ({ id: 'rv' + i, status: 'Concluída' })),
    sources: { pedidos: true }
  };
  const alerts = makeAlerts(data);
  assert(!alerts.some(row => row.type === 'rv_sem_pedido'));
  assert.equal(reads, 200, 'Cada vínculo deve ser lido uma vez para preparar o índice');
});

test('Botões e filtros navegam nas páginas; troca de empresa não mantém pendências anteriores', async () => {
  const events = {},
    store = new Map(),
    fields = { loginUser: { value: 'operador' }, loginPassword: { value: 'senha-teste' } };
  const root = { innerHTML: '', addEventListener: (type, fn) => (events[type] = fn) };
  globalThis.document = {
    getElementById: id => (id === 'app' ? root : fields[id] || null),
    querySelector() {
      return null;
    },
    addEventListener() {}
  };
  globalThis.localStorage = {
    getItem: key => store.get(key) || null,
    setItem: (key, value) => store.set(key, value),
    removeItem: key => store.delete(key)
  };
  globalThis.window = { location: { protocol: 'file:', origin: 'https://teste.local' } };
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
        : {
            data: {
              viagens: [],
              pedidos: Array.from({ length: 60 }, (_, i) => ({
                empresa: 'AC da Costa',
                pf_id: i + 1,
                nro_pf: 'PF-' + (i + 1),
                data_emissao: '01/10/2026',
                nro_cte: 0
              })),
              sources: { pedidos: true }
            }
          }
  });
  const tick = () => new Promise(resolve => setTimeout(resolve, 20));
  const click = (selector, dataset) =>
    events.click({ target: { closest: name => (name === selector ? { dataset } : null) } });
  const change = (id, value) => events.change({ target: { id, value, dataset: {} } });
  await import('../src/app.js?alert-pagination=1');
  click('[data-action]', { action: 'connect' });
  events.submit({ target: { id: 'loginForm' }, preventDefault() {} });
  await tick();
  change('from', '2026-10-01');
  change('to', '2026-10-22');
  click('[data-action]', { action: 'refresh' });
  await tick();
  click('[data-nav]', { nav: 'pendencias' });
  assert(root.innerHTML.includes('Página 1 de 3'));
  assert.equal((root.innerHTML.match(/class="ins-alert-item"/g) || []).length, 25);
  click('[data-action]', { action: 'next' });
  assert(root.innerHTML.includes('Página 2 de 3'));
  assert(root.innerHTML.includes('data-alert-detail="ctes:acdacosta~26"'));
  assert(!root.innerHTML.includes('data-alert-detail="ctes:acdacosta~1"'));
  change('alertKindFilter', 'cte_pendente');
  assert(root.innerHTML.includes('Página 1 de 3'), 'Filtro deve voltar à primeira página');
  click('[data-action]', { action: 'next' });
  click('[data-action]', { action: 'next' });
  assert.equal((root.innerHTML.match(/class="ins-alert-item"/g) || []).length, 10);
  assert(root.innerHTML.includes('data-action="next" disabled'));
  click('[data-action]', { action: 'prev' });
  assert(root.innerHTML.includes('Página 2 de 3'));
  change('alertPriorityFilter', 'info');
  assert(root.innerHTML.includes('Página 1 de 1'));
  assert(!root.innerHTML.includes('class="ins-alert-item"'));
  change('alertPriorityFilter', 'todos');
  click('[data-action]', { action: 'switch-company' });
  await tick();
  assert(root.innerHTML.includes('Trocar para Costalog'));
  assert(!root.innerHTML.includes('class="ins-alert-item"'));
  assert(root.innerHTML.includes('Página 1 de 1'));
});
