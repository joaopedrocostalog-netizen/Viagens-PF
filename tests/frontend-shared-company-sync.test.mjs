import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPortalOverview } from '../api/access.mjs';
import { OP_VIEWS } from '../src/access-ui.mjs';

test('Uma sincronização prepara as duas empresas; troca, busca e subperíodo não repetem DSS; falha e logout preservam isolamento', async () => {
  const events = {},
    storage = new Map(),
    calls = [],
    fields = {
      loginUser: { value: 'operador' },
      loginPassword: { value: 'senha-teste' },
      searchInput: { focus() {}, setSelectionRange() {} }
    };
  const root = { innerHTML: '', addEventListener: (type, callback) => (events[type] = callback) };
  globalThis.document = {
    getElementById: id => (id === 'app' ? root : fields[id] || null),
    querySelector() {
      return null;
    },
    addEventListener() {}
  };
  globalThis.localStorage = {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
  };
  globalThis.window = { location: { protocol: 'file:', origin: 'https://teste.local' } };
  globalThis.alert = message => {
    throw Error(message);
  };
  globalThis.prompt = () => null;
  let fail = false,
    defer = false,
    version = 1,
    pending = [];
  const reply = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });
  globalThis.fetch = async input => {
    const url = new URL(input);
    if (url.pathname === '/api/login')
      return reply({
        token: 'token-teste',
        user: { username: 'operador', role: 'operacional' },
        permissions: { operacional: true, financeiro: false, admin: false }
      });
    if (url.pathname === '/api/workflow') return reply({ tasks: {} });
    if (url.pathname === '/api/logout') return reply({});
    assert.equal(url.pathname, '/api/overview');
    calls.push(url);
    assert.equal(url.searchParams.get('include_companies'), '1');
    const month = url.searchParams.get('from').slice(0, 7),
      date = month.slice(5) + '/2026',
      day = '01/' + date;
    const data = {
      viagens: ['CRC', 'Ideallog'].map(empresa => ({
        empresa,
        rv_id: month,
        nro_rv: empresa === 'CRC' ? '88888' : '77777',
        data_inicio: day,
        cliente_nome: empresa + '-' + month + '-V' + version
      })),
      pedidos: ['CRC', 'Ideallog'].map(empresa => ({
        empresa,
        pf_id: month,
        nro_pf: empresa === 'CRC' ? 'DOC-COSTA-UNICO' : 'DOC-IDEAL-UNICO',
        data_emissao: day,
        cliente_nome: empresa + '-' + month + '-V' + version
      })),
      sources: { viagens: true, pedidos: true }
    };
    const response =
      fail && month === '2026-10'
        ? reply({ error: 'Falha simulada' }, 502)
        : reply(
            projectPortalOverview({ data }, 'operacional', url.searchParams.get('company'), { includeCompanies: true })
          );
    if (defer) return new Promise(resolve => pending.push(() => resolve(response)));
    return response;
  };
  const click = (selector, dataset) =>
      events.click({ target: { closest: key => (key === selector ? { dataset } : null) } }),
    change = (id, value) => events.change({ target: { id, value, dataset: {} } }),
    tick = () => new Promise(resolve => setTimeout(resolve, 25));
  const input = async value => {
    events.input({ target: { id: 'searchInput', value, selectionStart: value.length } });
    await new Promise(resolve => setTimeout(resolve, 180));
  };
  await import('../src/app.js?shared-company-sync=1');
  for (const view of OP_VIEWS) {
    click('[data-nav]', { nav: view });
    assert.equal((root.innerHTML.match(/type="search"/g) || []).length, 1);
    assert(!root.innerHTML.includes('id="searchScope"'));
    assert(!root.innerHTML.includes('Nesta aba'));
  }
  click('[data-action]', { action: 'connect' });
  events.submit({ target: { id: 'loginForm' }, preventDefault() {} });
  await tick();
  change('from', '2026-09-01');
  change('to', '2026-10-23');
  click('[data-action]', { action: 'refresh' });
  await tick();
  assert.equal(calls.length, 2);
  click('[data-nav]', { nav: 'viagens' });
  assert(root.innerHTML.includes('CRC-2026-09-V1'));
  assert(root.innerHTML.includes('CRC-2026-10-V1'));
  assert(!root.innerHTML.includes('Ideallog-2026-10-V1'));
  click('[data-action]', { action: 'switch-company' });
  assert.equal(calls.length, 2);
  assert(root.innerHTML.includes('Ideallog-2026-09-V1'));
  assert(root.innerHTML.includes('Ideallog-2026-10-V1'));
  assert(!root.innerHTML.includes('CRC-2026-10-V1'));
  await input('DOC-IDEAL-UNICO');
  assert(root.innerHTML.includes('data-search-result="pedidos:ideallog~2026-10"'));
  assert(!root.innerHTML.includes('DOC-COSTA-UNICO'));
  assert.equal(calls.length, 2);
  click('[data-action]', { action: 'clear-table-search' });
  change('from', '2026-10-01');
  click('[data-action]', { action: 'switch-company' });
  assert(root.innerHTML.includes('CRC-2026-10-V1'));
  assert(!root.innerHTML.includes('CRC-2026-09-V1'));
  assert.equal(calls.length, 2);
  change('from', '2026-08-01');
  click('[data-action]', { action: 'switch-company' });
  assert.equal(calls.length, 2);
  assert(root.innerHTML.includes('O período selecionado precisa ser consultado'));
  assert(!root.innerHTML.includes('Ideallog-2026-10-V1'));
  change('from', '2026-09-01');
  click('[data-action]', { action: 'switch-company' });
  assert(root.innerHTML.includes('CRC-2026-09-V1'));
  version = 2;
  fail = true;
  click('[data-action]', { action: 'refresh' });
  await tick();
  assert(root.innerHTML.includes('CRC-2026-09-V1'));
  assert(!root.innerHTML.includes('CRC-2026-09-V2'));
  click('[data-action]', { action: 'switch-company' });
  assert(root.innerHTML.includes('Ideallog-2026-10-V1'));
  assert(!root.innerHTML.includes('Ideallog-2026-09-V2'));
  assert.equal(calls.length, 4);
  fail = false;
  defer = true;
  click('[data-action]', { action: 'refresh' });
  await tick();
  assert.equal(pending.length, 2);
  click('[data-action]', { action: 'logout' });
  for (const finish of pending) finish();
  await tick();
  assert(!root.innerHTML.includes('Ideallog-2026-09-V2'));
  click('[data-action]', { action: 'connect' });
  events.submit({ target: { id: 'loginForm' }, preventDefault() {} });
  await tick();
  click('[data-nav]', { nav: 'viagens' });
  click('[data-action]', { action: 'switch-company' });
  assert(!root.innerHTML.includes('CRC-2026-10-V1'));
  assert.equal(calls.length, 6, 'Logout elimina as duas cópias e trocar empresa continua sem consultar a DSS');
});
