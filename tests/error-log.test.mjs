import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { passwordHash } from '../api/auth.mjs';
import { createErrorLog, clientErrorInput } from '../api/error-log.mjs';

test('registro agrupa repetições, limpa dados sensíveis e limita o aviso externo', async () => {
  const sent = [];
  let clock = Date.parse('2026-10-26T12:00:00Z');
  const log = createErrorLog({
    webhook: 'https://hooks.exemplo/abc',
    fetchImpl: async (url, options) => sent.push(JSON.parse(options.body)),
    now: () => clock
  });
  log.record('servidor', 'Falha Bearer abc.def.ghi em https://api.x/y?token=123&senha=9', {
    where: '/api/portal/view'
  });
  log.record('servidor', 'Falha Bearer abc.def.ghi em https://api.x/y?token=123&senha=9', {
    where: '/api/portal/view'
  });
  const [entry] = log.list();
  assert.equal(entry.count, 2);
  assert.doesNotMatch(entry.message, /abc\.def|token=123|senha=9/);
  assert.match(entry.message, /Bearer \[oculto\]/);
  assert.equal(sent.length, 1, 'mesmo erro avisa no máximo 1 vez por hora');
  assert.match(sent[0].text, /Portal COSTALOG · servidor/);
  log.record('dss', 'Fonte opcional indisponível: rotas', { level: 'aviso' });
  assert.equal(sent.length, 1, 'avisos (nível aviso) não disparam o webhook');
  clock += 3600001;
  log.record('servidor', 'Falha Bearer abc.def.ghi em https://api.x/y?token=123&senha=9', {
    where: '/api/portal/view'
  });
  assert.equal(sent.length, 2);
  for (let i = 0; i < 150; i++) log.record('navegador', 'erro ' + i);
  assert.equal(log.list().length, 100, 'guarda só os 100 mais recentes');
  assert.equal(clientErrorInput({ message: '' }), null);
  assert.deepEqual(
    clientErrorInput({
      message: 'x is not defined',
      source: 'https://site/viagens/src/app.js?v=2',
      line: 42,
      view: 'painel'
    }).where,
    'app.js:42 · tela painel'
  );
});

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
test('HTTP: navegador registra erro sem login; só administrador vê a lista; fonte da DSS que falha aparece', async t => {
  const dir = await mkdtemp(join(process.cwd(), 'test-private-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const password = 'test-password-very-private';
  await writeFile(
    join(dir, 'users.json'),
    JSON.stringify({
      users: [
        { username: 'operador', role: 'operacional', ...passwordHash(password) },
        { username: 'admin', role: 'administrador', ...passwordHash(password) }
      ]
    })
  );
  const upstream = http.createServer((req, res) => {
    if (req.url.includes('listarProgramacoes')) {
      res.writeHead(500);
      return res.end('x');
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 200, registros: [] }));
  });
  const source = await listen(upstream);
  t.after(() => {
    upstream.closeAllConnections();
    upstream.close();
  });
  const reserve = http.createServer();
  const port = await listen(reserve);
  await new Promise(resolve => reserve.close(resolve));
  const child = spawn(process.execPath, ['api/server.mjs'], {
    env: {
      ...process.env,
      PORT: String(port),
      PORTAL_USERS_FILE: join(dir, 'users.json'),
      PORTAL_DATA_DIR: dir,
      RENDER: '',
      DSS_BASE_URL: 'http://127.0.0.1:' + source,
      DSS_USERNAME: 'test',
      DSS_PASSWORD: 'private',
      DSS_CTES_PATH: '',
      DSS_MDFES_PATH: '',
      DSS_OCORRENCIAS_PATH: '',
      DSS_ROTAS_PATH: '',
      DSS_MOTORISTAS_PATH: '',
      DSS_PROGRAMACOES_PATH: '/listarProgramacoes',
      ERROR_WEBHOOK_URL: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => child.kill());
  const base = 'http://127.0.0.1:' + port;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + '/api/health')).ok) break;
    } catch {}
    await pause(30);
  }
  const post = (path, body, token) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: JSON.stringify(body)
    });
  assert.equal(
    (await post('/api/client-error', { message: 'x is not defined', source: 'src/app.js', line: 7 })).status,
    202
  );
  const login = async username => (await (await post('/api/login', { username, password })).json()).token;
  const operador = await login('operador'),
    admin = await login('admin');
  const errors = token => fetch(base + '/api/errors', { headers: { Authorization: 'Bearer ' + token } });
  assert.equal((await errors(operador)).status, 403);
  let job = await (await post('/api/portal/sync', { from: '2026-10-01', to: '2026-10-23' }, admin)).json();
  for (let i = 0; i < 30 && job.status === 'running'; i++) {
    await pause(1000);
    job = await (
      await fetch(base + '/api/portal/sync?id=' + job.id, { headers: { Authorization: 'Bearer ' + admin } })
    ).json();
  }
  const list = (await (await errors(admin)).json()).errors;
  assert(list.some(e => e.kind === 'navegador' && e.message === 'x is not defined' && e.where === 'app.js:7'));
  assert(
    list.some(
      e => e.kind === 'dss' && e.level === 'aviso' && /programacoes/.test(e.message) && /HTTP 500/.test(e.detail)
    )
  );
  assert(!JSON.stringify(list).includes('private'), 'sem credenciais');
});
