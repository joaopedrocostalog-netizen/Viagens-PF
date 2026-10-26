import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { passwordHash } from '../api/auth.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const iso = br => br.split('/').reverse().join('-');
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;

/** DSS simulada: 1 RV e 1 PF por dia a partir de `start`; opcionalmente lenta para períodos longos. */
async function portal(t, { start = '2024-03-10', slowOver = 0, env = {} } = {}) {
  const dir = await mkdtemp(join(process.cwd(), 'test-private-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const password = 'test-password-very-private';
  await writeFile(
    join(dir, 'users.json'),
    JSON.stringify({ users: [{ username: 'operador', role: 'operacional', ...passwordHash(password) }] })
  );
  const calls = [];
  const upstream = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://dss'),
      from = iso(url.searchParams.get('data_inicio')),
      to = iso(url.searchParams.get('data_fim'));
    calls.push({ path: url.pathname, from, to });
    if (!/listarViagens|listarPedidosFrete/.test(url.pathname)) {
      res.writeHead(404);
      return res.end('');
    }
    if (slowOver && days(from, to) > slowOver) await pause(2500); // mês inteiro "pesado" estoura o tempo
    if (res.destroyed) return;
    const rows = [];
    for (let d = from; d <= to; d = new Date(Date.parse(d) + 86400000).toISOString().slice(0, 10)) {
      if (d < start) continue;
      const n = Number(d.replaceAll('-', ''));
      const br = d.split('-').reverse().join('/');
      rows.push(
        url.pathname.includes('listarViagens')
          ? {
              empresa: 'CRC',
              rv_id: n,
              nro_rv: String(n),
              status_rv: 'Encerrado',
              data_inicio: br,
              campo_grande: 'x'.repeat(200)
            }
          : {
              empresa: 'CRC',
              pf_id: n,
              nro_pf: String(n),
              rv_viagem: String(n),
              data_emissao: br,
              campo_grande: 'x'.repeat(200)
            }
      );
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 200, registros: rows }));
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
      DSS_PROGRAMACOES_PATH: '',
      ...env
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
  const { token } = await (
    await fetch(base + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'operador', password })
    })
  ).json();
  const request = (path, body) =>
    fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    }).then(r => r.json());
  const sync = async body => {
    let job = await request('/api/portal/sync', body);
    if (job.error && !job.id) return job;
    for (let i = 0; i < 120 && job.status === 'running'; i++) {
      await pause(1000);
      job = await request('/api/portal/sync?id=' + job.id);
    }
    return job;
  };
  return { sync, request, calls };
}

test('período de 2 anos é aceito (antes o limite era 12 meses) e vem do mês mais recente para o mais antigo', async t => {
  const { sync, calls } = await portal(t);
  const job = await sync({ from: '2024-11-01', to: '2026-10-20' });
  assert.equal(job.status, 'complete', JSON.stringify(job).slice(0, 300));
  assert.deepEqual(job.range, { from: '2024-11-01', to: '2026-10-20' });
  const months = calls.filter(c => c.path.includes('listarViagens')).map(c => c.from.slice(0, 7));
  assert.equal(months.length, 24);
  assert.equal(months[0], '2026-10');
  assert.equal(months.at(-1), '2024-11');
});

test('"Desde o início": volta mês a mês até não haver mais dados e informa o início real', async t => {
  const { sync, request } = await portal(t, { start: '2025-06-15' });
  const job = await sync({ to: '2026-10-20', history: 'all' });
  assert.equal(job.status, 'complete');
  assert.deepEqual(job.range, { from: '2025-06-01', to: '2026-10-20' });
  assert.match(job.notice, /Histórico completo da DSS: dados desde 01\/06\/2025/);
  const view = await request('/api/portal/view', {
    snapshot: job.snapshot,
    state: { ...job.range, view: 'viagens', page: 1 }
  });
  // 15/06/2025 a 20/10/2026 = 493 dias = 493 RVs
  assert.match(view.html, /493 registros/);
});

test('se não couber na memória, carrega os meses mais recentes e avisa — sem derrubar o servidor', async t => {
  const { sync } = await portal(t, { env: { PORTAL_MAX_ROWS: '200' } });
  const job = await sync({ from: '2026-01-01', to: '2026-10-20' });
  assert.equal(job.status, 'complete');
  assert.equal(job.range.to, '2026-10-20');
  assert(job.range.from > '2026-01-01' && job.range.from <= '2026-08-01', job.range.from);
  assert.match(job.notice, /não cabe na memória deste servidor/);
  assert(job.steps.some(s => s.status === 'skipped'));
});

test('mês pesado que estoura o tempo é buscado em partes menores, sem falhar a consulta', async t => {
  const { sync, calls } = await portal(t, { slowOver: 16, env: { DSS_TIMEOUT_MS: '1000' } });
  const job = await sync({ from: '2026-09-01', to: '2026-09-30' });
  assert.equal(job.status, 'complete', job.error);
  const pieces = calls.filter(c => c.path.includes('listarViagens') && days(c.from, c.to) <= 16);
  assert(pieces.length >= 2, 'dividiu o mês');
  assert.equal(pieces[0].from, '2026-09-01');
  assert.equal(pieces.at(-1).to, '2026-09-30');
});

test('erro definitivo da DSS informa o mês e o motivo', async t => {
  const { sync } = await portal(t, { slowOver: 0, env: { DSS_VIAGENS_PATH: '/naoExiste' } });
  const job = await sync({ from: '2026-09-01', to: '2026-10-20' });
  assert.equal(job.status, 'failed');
  assert.match(job.error, /Mês 10\/2026/);
});
