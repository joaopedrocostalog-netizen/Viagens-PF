/**
 * Navegador real contra o SERVIDOR real (api/server.mjs) e uma DSS simulada com os dados de demonstração.
 * Cobre o caminho de produção: login, Atualizar dados da DSS, páginas vindas do servidor, filtros e ficha.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { passwordHash } from '../../api/auth.mjs';
import { demoPayload } from '../../src/demo-data.mjs';
import { launch } from './harness.mjs';

const PASSWORD = 'senha-do-teste-servidor-123';
const today = new Date().toISOString().slice(0, 10);
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const iso = br => br.split('/').reverse().join('-');
let browser,
  base,
  dir,
  child,
  dss,
  dssCalls = 0;

before(async () => {
  dir = await mkdtemp(join(process.cwd(), 'test-private-'));
  await writeFile(
    join(dir, 'users.json'),
    JSON.stringify({ users: [{ username: 'operador', role: 'operacional', ...passwordHash(PASSWORD) }] })
  );
  const raw = demoPayload(today).data;
  dss = http.createServer((req, res) => {
    dssCalls++;
    const url = new URL(req.url, 'http://dss'),
      from = iso(url.searchParams.get('data_inicio') || '01/01/2000'),
      to = iso(url.searchParams.get('data_fim') || '31/12/2999');
    const inRange = date => !date || (iso(date) >= from && iso(date) <= to);
    const rows = url.pathname.includes('listarViagens')
      ? raw.viagens.filter(v => inRange(v.data_inicio))
      : url.pathname.includes('listarPedidosFrete')
        ? raw.pedidos.filter(p => inRange(p.data_emissao))
        : url.pathname.includes('listarProgramacoes')
          ? raw.programacoes.filter(p => inRange(p.data_emissao))
          : url.pathname.includes('listarOcorrencias')
            ? raw.ocorrencias.filter(o => inRange(o.data_ocorrencia))
            : [];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 200, registros: rows }));
  });
  const dssPort = await listen(dss);
  const reserve = http.createServer();
  const port = await listen(reserve);
  await new Promise(resolve => reserve.close(resolve));
  child = spawn(process.execPath, ['api/server.mjs'], {
    env: {
      ...process.env,
      PORT: String(port),
      PORTAL_USERS_FILE: join(dir, 'users.json'),
      PORTAL_DATA_DIR: dir,
      RENDER: '',
      DSS_BASE_URL: 'http://127.0.0.1:' + dssPort,
      DSS_USERNAME: 'teste',
      DSS_PASSWORD: 'privada',
      DSS_CTES_PATH: '',
      DSS_MDFES_PATH: '',
      DSS_ROTAS_PATH: '',
      DSS_MOTORISTAS_PATH: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  base = 'http://127.0.0.1:' + port;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + '/api/health')).ok) break;
    } catch {}
    await pause(50);
  }
  browser = await launch();
});
after(async () => {
  await browser?.close();
  child?.kill();
  dss?.closeAllConnections();
  dss?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
});

async function open(t) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Em produção o site aponta para o Render; aqui, para este servidor local.
  await page.route(base + '/src/site-config.mjs', async route => {
    const body = await readFile('src/site-config.mjs', 'utf8');
    await route.fulfill({
      body: body.replace(/^export const API_BASE_URL = '[^']*';/m, "export const API_BASE_URL = '';"),
      contentType: 'text/javascript'
    });
  });
  t.after(async () => {
    await mkdir('test-results', { recursive: true });
    await page
      .screenshot({ path: 'test-results/servidor-' + t.name.replace(/\W+/g, '-').slice(0, 60) + '.png' })
      .catch(() => {});
    await context.close();
  });
  await page.goto(base + '/');
  if ((await page.locator('#loginUser').count()) === 0) await page.click('[data-action="connect"]');
  await page.fill('#loginUser', 'operador');
  await page.fill('#loginPassword', PASSWORD);
  await page.locator('#loginForm').evaluate(form => form.requestSubmit());
  await page.waitForSelector('.v-username');
  return { page, errors };
}
const count = async page =>
  Number((await page.locator('.pagination span').first().textContent()).match(/(\d+)\s+registros/)[1]);

test('servidor: atualizar a DSS, navegar, filtrar e abrir a ficha', async t => {
  const { page, errors } = await open(t);
  const before = dssCalls;
  await page.click('[data-action="refresh"]');
  await page.waitForSelector('[data-updated-at]', { timeout: 60000 });
  assert(dssCalls > before, 'Atualizar consultou a DSS simulada');
  assert.match(await page.locator('.last-sync').textContent(), /Atualizado (agora|há)/);
  await page.click('[data-nav="viagens"]');
  await page.waitForSelector('.rv-status-stages');
  const total = await count(page);
  assert(total > 5);
  await page.click('[data-rv-status="Viajando"]');
  await page.waitForFunction(
    n =>
      !document.querySelector('.stale-view') &&
      document.querySelector('.pagination span')?.textContent.match(/(\d+) registros/)?.[1] != n,
    total
  );
  assert((await count(page)) < total);
  // Volta para todas: vem do cache do navegador, sem esperar o servidor.
  await page.click('[data-rv-status=""]');
  assert.equal(await page.locator('.page-loading').count(), 0);
  assert.equal(await count(page), total);
  // Filtros avançados abrem e fecham também quando a página vem do servidor.
  await page.click('#advancedFilters summary');
  await page.waitForSelector('#filterClient');
  await page.click('#advancedFilters summary');
  await page.waitForTimeout(800);
  assert.equal(await page.locator('#advancedFilters').evaluate(el => el.open), false);
  await page.click('.row-link');
  await page.waitForSelector('.drawer h3');
  assert.match(await page.locator('.drawer').innerText(), /linha do tempo da viagem/i);
  assert.deepEqual(errors, []);
});

test('servidor: segundo acesso já abre com a última consulta, sem chamar a DSS', async t => {
  const { page, errors } = await open(t);
  const before = dssCalls;
  await page.waitForSelector('[data-updated-at]', { timeout: 15000 });
  assert.match(await page.locator('.last-sync').textContent(), /consulta compartilhada/);
  await page.click('[data-nav="programacao"]');
  await page.waitForSelector('.day-cards');
  assert.equal(dssCalls, before, 'nenhuma chamada nova à DSS');
  assert.deepEqual(errors, []);
});

test('servidor: "Desde o início" busca o histórico e ajusta o período ao início real', async t => {
  const { page, errors } = await open(t);
  page.on('dialog', dialog => dialog.accept());
  await page.click('[data-action="refresh-all"]');
  await page.waitForFunction(() => /Histórico completo da DSS/.test(document.body.innerText), null, { timeout: 90000 });
  const from = await page.inputValue('#from');
  assert.match(from, /^\d{2}\/\d{2}\/\d{4}$/);
  assert.notEqual(from, '01/01/2026', 'De foi ajustado ao início real dos dados');
  assert.deepEqual(errors, []);
});
