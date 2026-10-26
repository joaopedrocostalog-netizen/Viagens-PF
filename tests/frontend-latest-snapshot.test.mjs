import test from 'node:test';
import assert from 'node:assert/strict';
import { updatedAgo, updatedIsOld } from '../src/date-controls.mjs';

test('texto "Atualizado há X" no fuso de São Paulo', () => {
  const now = Date.parse('2026-10-26T12:30:00Z');
  assert.equal(updatedAgo('2026-10-26T12:29:40Z', now), 'Atualizado agora (09:29)');
  assert.equal(updatedAgo('2026-10-26T12:18:00Z', now), 'Atualizado há 12 min (09:18)');
  assert.equal(updatedAgo('2026-10-26T09:30:00Z', now), 'Atualizado há 3 h (06:30)');
  assert.equal(updatedAgo('2026-10-24T12:12:00Z', now), 'Atualizado em 24/10 às 09:12');
  assert.equal(updatedAgo('', now), '');
  assert.equal(updatedIsOld('2026-10-26T12:00:00Z', now), false);
  assert.equal(updatedIsOld('2026-10-26T11:00:00Z', now), true);
});

test('ao entrar, o portal abre com a última consulta pronta, sem chamar a DSS', async () => {
  const events = {},
    calls = [];
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
  const reply = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input),
      body = options.body ? JSON.parse(options.body) : null;
    calls.push(url.pathname);
    if (url.pathname === '/api/login')
      return reply({
        portalVersion: 2,
        token: 'token',
        user: { username: 'operador', role: 'operacional' },
        permissions: { operacional: true, financeiro: false, admin: false }
      });
    if (url.pathname === '/api/workflow/actions') return reply({ total: 0, counts: {} });
    if (url.pathname === '/api/preferences') return reply({ revision: 0, values: {}, storage: 'browser' });
    if (url.pathname === '/api/portal/latest')
      return reply({
        snapshot: {
          id: 'pronta',
          from: '2026-10-01',
          to: '2026-10-26',
          updatedAt: new Date(Date.now() - 5 * 60000).toISOString()
        }
      });
    if (['/api/portal/view', '/api/portal/metrics'].includes(url.pathname))
      return reply({ html: '<section>consulta ' + body.snapshot + '</section>', page: 1, visibleAlerts: [] });
    assert.fail('Endpoint inesperado: ' + url.pathname);
  };
  const click = (selector, dataset) =>
      events.click({ target: { closest: key => (key === selector ? { dataset } : null) } }),
    tick = () => new Promise(resolve => setTimeout(resolve, 40));
  await import('../src/app.js?latest-snapshot=1');
  click('[data-action]', { action: 'connect' });
  events.submit({ target: { id: 'loginForm' }, preventDefault() {} });
  await tick();
  await tick();
  assert(root.innerHTML.includes('consulta pronta'), 'painel usa a consulta já preparada');
  assert(!calls.includes('/api/portal/sync'), 'não consulta a DSS ao entrar');
  assert.match(root.innerHTML, /Atualizado há 5 min/);
  assert.match(root.innerHTML, /consulta compartilhada/);
});
