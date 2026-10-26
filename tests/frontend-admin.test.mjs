import test from 'node:test';
import assert from 'node:assert/strict';

function fakeBrowser() {
  const store = new Map(),
    events = {},
    fields = {
      apiUrl: { value: 'https://api.interno.exemplo' },
      loginUser: { value: 'admin' },
      loginPassword: { value: 'senha-local-de-teste-2026' },
      adminNewName: { value: 'Funcionário Financeiro' },
      adminNewUsername: { value: 'financeiro02' },
      adminNewRole: { value: 'financeiro' },
      adminNewPassword: { value: 'provisoria-super-forte-2026' }
    };
  const root = {
    innerHTML: '',
    addEventListener(name, cb) {
      events[name] = cb;
    }
  };
  globalThis.document = {
    getElementById(id) {
      return id === 'app' ? root : fields[id] || null;
    },
    addEventListener() {},
    visibilityState: 'visible'
  };
  globalThis.localStorage = {
    getItem: key => store.get(key) || null,
    setItem: (key, val) => store.set(key, val),
    removeItem: key => store.delete(key)
  };
  globalThis.window = { location: { protocol: 'file:', origin: 'https://api.exemplo.local' } };
  globalThis.alert = () => {};
  globalThis.confirm = () => true;
  return { events, fields, root };
}
const tick = () => new Promise(r => setTimeout(r, 40));
test('Administração permanece oculta inclusive para administradores e não busca lista de contas', async () => {
  const { events, root } = fakeBrowser(),
    calls = [];
  globalThis.fetch = async url => {
    calls.push(String(url));
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          token: 'token-admin',
          user: { username: 'admin', role: 'administrador' },
          permissions: { operacional: true, financeiro: false, admin: true }
        };
      }
    };
  };
  await import('../src/app.js?admin-hidden=1');
  events.click({ target: { closest: name => (name === '[data-action]' ? { dataset: { action: 'connect' } } : null) } });
  events.submit({ target: { id: 'loginForm' }, preventDefault() {} });
  await tick();
  assert(!root.innerHTML.includes('data-nav="administracao"'));
  events.click({ target: { closest: name => (name === '[data-nav]' ? { dataset: { nav: 'administracao' } } : null) } });
  assert(!root.innerHTML.includes('Cadastrar funcionário'));
  assert(!calls.some(url => url.includes('/api/users')));
  assert(root.innerHTML.includes('data-nav="entregas"'));
});
test('Usuário com senha provisória não consulta dados reais antes de alterá-la', async () => {
  const { events, fields, root } = fakeBrowser();
  let overviews = 0,
    changed = 0;
  fields.loginUser.value = 'financeiro02';
  fields.currentPortalPassword = { value: 'temporaria123456' };
  fields.newPortalPassword = { value: 'nova-senha-pessoal-2026' };
  fields.confirmPortalPassword = { value: 'nova-senha-pessoal-2026' };
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url);
    const reply = data => ({
      ok: true,
      status: 200,
      async json() {
        return data;
      }
    });
    if (path.includes('/api/login'))
      return reply({
        token: 'token-provisorio',
        user: { username: 'financeiro02', role: 'financeiro', mustChangePassword: true },
        permissions: { operacional: true, financeiro: true, admin: false }
      });
    if (path.includes('/api/overview')) {
      overviews++;
      return reply({});
    }
    if (path.includes('/api/change-password')) {
      changed++;
      assert.equal(options.method, 'POST');
      return reply({ ok: true });
    }
    return reply({ ok: true });
  };
  await import('../src/app.js?temporary-ui-test=2');
  events.click({ target: { closest: name => (name === '[data-action]' ? { dataset: { action: 'connect' } } : null) } });
  events.submit({ target: { id: 'loginForm' }, preventDefault() {} });
  await tick();
  assert(root.innerHTML.includes('Defina sua senha pessoal'));
  assert.equal(overviews, 0);
  events.submit({ target: { id: 'forcePasswordChange' }, preventDefault() {} });
  await tick();
  assert.equal(changed, 1);
  assert(root.innerHTML.includes('loginUser'));
  assert.equal(overviews, 0);
});
