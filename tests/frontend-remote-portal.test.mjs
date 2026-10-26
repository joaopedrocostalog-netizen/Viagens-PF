import test from 'node:test';
import assert from 'node:assert/strict';

test('frontend uses remote pages and metrics, swaps companies without sync and saves account preferences', async () => {
  const events = {},
    calls = [],
    saved = { costalog: { revision: 0, values: {} }, ideallog: { revision: 0, values: {} } };
  const fields = {
    loginUser: { value: 'operador' },
    loginPassword: { value: 'password' },
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
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.window = { location: { protocol: 'file:', origin: 'https://teste.local' } };
  globalThis.alert = message => {
    throw Error(message);
  };
  globalThis.prompt = () => null;
  const reply = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });
  let defer = false,
    finish;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input),
      body = options.body ? JSON.parse(options.body) : null,
      company = url.searchParams.get('company') || 'costalog';
    calls.push({ path: url.pathname, body, company });
    if (url.pathname === '/api/login')
      return reply({
        portalVersion: 2,
        token: 'token',
        user: { username: 'operador', role: 'operacional' },
        permissions: { operacional: true, financeiro: false, admin: false }
      });
    if (url.pathname === '/api/workflow/actions')
      return reply({ total: 0, counts: { vencidas: 0, hoje: 0, sem_responsavel: 0, reincidentes: 0 } });
    if (url.pathname === '/api/logout') return reply({});
    if (url.pathname === '/api/preferences') {
      if (options.method === 'PATCH') {
        assert.equal(body.revision, saved[company].revision);
        saved[company] = { revision: body.revision + 1, values: body.values };
      }
      return reply(saved[company]);
    }
    if (url.pathname === '/api/portal/sync')
      return reply({ id: 'job', status: 'complete', snapshot: 'snapshot', steps: [], completed: 0, total: 0 }, 202);
    if (['/api/portal/view', '/api/portal/metrics', '/api/portal/compare'].includes(url.pathname)) {
      const response = reply({
        html: '<section>' + company + ' ' + body.state.view + ' página ' + body.state.page + '</section>',
        hero: '<div>Consulta preparada</div>',
        page: body.state.page,
        visibleAlerts: []
      });
      if (defer) {
        defer = false;
        return new Promise(resolve => (finish = () => resolve(response)));
      }
      return response;
    }
    if (url.pathname === '/api/portal/detail')
      return reply({ html: '<aside class="drawer">Documento ' + company + '</aside>' });
    assert.fail('Unexpected endpoint: ' + url.pathname);
  };
  const click = (selector, dataset) =>
      events.click({ target: { closest: key => (key === selector ? { dataset } : null) } }),
    tick = () => new Promise(resolve => setTimeout(resolve, 30));
  await import('../src/app.js?remote-portal=1');
  click('[data-action]', { action: 'connect' });
  events.submit({ target: { id: 'loginForm' }, preventDefault() {} });
  await tick();
  assert.equal(calls.filter(c => c.path === '/api/portal/sync').length, 0, 'login must not call DSS');
  click('[data-action]', { action: 'refresh' });
  await tick();
  assert(root.innerHTML.includes('costalog painel página 1'));
  assert(calls.some(c => c.path === '/api/portal/metrics'));
  assert(!calls.some(c => c.path === '/api/overview'));
  click('[data-nav]', { nav: 'viagens' });
  await tick();
  assert(root.innerHTML.includes('costalog viagens página 1'));
  const before = calls.filter(c => c.path === '/api/portal/view').length;
  await tick();
  assert.equal(calls.filter(c => c.path === '/api/portal/view').length, before, 'no future page prefetch');
  click('[data-action]', { action: 'next' });
  await tick();
  assert(root.innerHTML.includes('costalog viagens página 2'));
  defer = true;
  click('[data-action]', { action: 'next' });
  await tick();
  assert(root.innerHTML.includes('Atualizando…'), 'a discreet loading bar is shown');
  assert(
    /<div class="stale-view" inert aria-busy="true"><section>costalog viagens página 2<\/section>/.test(root.innerHTML),
    'previous page stays visible only as inert, dimmed content'
  );
  assert(
    !/costalog viagens página 2/.test(root.innerHTML.replace(/<div class="stale-view"[\s\S]*?<\/section><\/div>/, '')),
    'old page is never shown as current'
  );
  click('[data-action]', { action: 'switch-company' });
  await tick();
  assert(root.innerHTML.includes('ideallog viagens página 1'));
  finish();
  await tick();
  assert(!root.innerHTML.includes('costalog viagens página 3'));
  assert.equal(calls.filter(c => c.path === '/api/portal/sync').length, 1, 'company change reuses server snapshot');
  events.change({ target: { id: 'reportFormat', value: 'csv', dataset: {} } });
  await new Promise(resolve => setTimeout(resolve, 680));
  assert.equal(saved.ideallog.values.reportFormat, 'csv');
  assert.equal(saved.costalog.values.reportFormat, undefined);
  click('[data-action]', { action: 'logout' });
  await tick();
  assert(!root.innerHTML.includes('ideallog viagens página 1'));
});
