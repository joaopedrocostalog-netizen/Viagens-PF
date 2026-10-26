/**
 * Testes de navegador (Chromium real) no modo demonstração. Rodar: npm run test:e2e
 * Cobrem o que testes de Node não alcançam: <details>, arrastar e soltar, foco, eventos reais do navegador.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launch, openPortal, login, go } from './harness.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});

async function portal(t) {
  const session = await openPortal(browser);
  t.after(async () => {
    // Captura de cada caso: o GitHub Actions publica a pasta quando algum teste falha.
    const name = t.name
      .normalize('NFD')
      .replace(/[^\w]+/g, '-')
      .slice(0, 80);
    await mkdir('test-results', { recursive: true });
    await session.page.screenshot({ path: 'test-results/' + name + '.png', fullPage: true }).catch(() => {});
    await session.context.close();
  });
  await login(session.page);
  return session;
}
const text = page => page.evaluate(() => document.body.innerText);
const tableCount = async page => {
  const label = await page.locator('.pagination span').first().textContent();
  return Number(label.match(/(\d+)\s+registros/)?.[1]);
};

test('painel abre sem erros e sem nenhum dado de KM', async t => {
  const { page, errors } = await portal(t);
  await page.waitForSelector('.ins-metric-grid');
  assert.equal((await page.locator('.ins-metric-card').count()) > 0, true);
  assert.doesNotMatch(await text(page), /\bKM\b/i);
  assert.deepEqual(errors, []);
});

test('viagens: etapas e ficha da RV vêm do renderizador único', async t => {
  const { page, errors } = await portal(t);
  await go(page, 'viagens');
  await page.waitForSelector('.rv-status-stages');
  const total = await tableCount(page);
  assert(total > 10, 'demonstração tem RVs no período');
  await page.click('[data-rv-status="Escalado"]');
  await page.waitForTimeout(150);
  const escalados = await tableCount(page);
  assert(escalados > 0 && escalados < total);
  await page.click('.row-link');
  await page.waitForSelector('.drawer');
  const drawer = await page.locator('.drawer').innerText();
  assert.match(drawer, /Linha do tempo da viagem/i);
  assert.doesNotMatch(drawer, /KM previsto|KM rodado/i);
  assert.deepEqual(errors, []);
});

test('filtros avançados abrem e fecham sem reabrir sozinhos', async t => {
  const { page } = await portal(t);
  await go(page, 'viagens');
  await page.click('#advancedFilters summary');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#advancedFilters').evaluate(el => el.open), true);
  await page.click('#advancedFilters summary');
  await page.waitForTimeout(600);
  assert.equal(await page.locator('#advancedFilters').evaluate(el => el.open), false);
});

test('programação do dia: barra de etapas soma o mesmo que a tabela', async t => {
  const { page, errors } = await portal(t);
  await go(page, 'programacao');
  await page.waitForSelector('.related-rv-stages');
  const todas = Number(await page.locator('[data-related-rv-stage=""] span').textContent());
  assert(todas > 0, 'há RVs hoje na demonstração');
  assert.equal(todas, await tableCount(page));
  assert.deepEqual(errors, []);
});

test('personalizar cartões: arrastar com o mouse muda e salva a ordem', async t => {
  const { page } = await portal(t);
  await page.waitForSelector('.ins-metric-grid');
  const order = () => page.$$eval('.ins-metric-card small', els => els.map(e => e.textContent));
  assert.equal(await page.locator('[data-metric-move], [draggable="true"]').count(), 0);
  await page.click('[data-ins-action="customize"]');
  const before = await order();
  await page.dragAndDrop('[data-metric-card]:nth-child(1)', '[data-metric-card]:nth-child(3)', {
    targetPosition: { x: 200, y: 60 }
  });
  await page.waitForTimeout(200);
  const after = await order();
  assert.deepEqual(after.slice(0, 3), [before[1], before[2], before[0]]);
});

test('programação do dia: ◀ ▶ trocam o dia e os cartões filtram a tabela', async t => {
  const { page, errors } = await portal(t);
  await go(page, 'programacao');
  await page.waitForSelector('.day-cards');
  const date = () => page.inputValue('#dayDate');
  const today = await date();
  await page.click('[data-action="day-prev"]');
  await page.waitForTimeout(150);
  assert.notEqual(await date(), today);
  await page.click('[data-action="day-next"]');
  await page.waitForTimeout(150);
  assert.equal(await date(), today);
  const total = await tableCount(page);
  const planned = Number(await page.locator('[data-day-category="Planejadas"] strong').textContent());
  assert(planned > 0 && planned < total, 'demonstração tem RVs planejadas e outras hoje');
  await page.click('[data-day-category="Planejadas"]');
  await page.waitForTimeout(150);
  assert.equal(await tableCount(page), planned);
  assert.equal(await page.locator('[data-day-category="Planejadas"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.filter-chip').count(), 1, 'etiqueta mostra o filtro ativo');
  // Barra de etapas acompanha o filtro: "Todas" = linhas da tabela.
  assert.equal(Number(await page.locator('[data-related-rv-stage=""] span').textContent()), planned);
  await page.click('[data-clear-filter="dayCategory"]');
  await page.waitForTimeout(150);
  assert.equal(await tableCount(page), total);
  assert.deepEqual(errors, []);
});

test('programação do dia: exportar Excel baixa o arquivo do dia', async t => {
  const { page, errors } = await portal(t);
  await go(page, 'programacao');
  await page.waitForSelector('[data-export-day="xlsx"]');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-export-day="xlsx"]')]);
  assert.match(download.suggestedFilename(), /\.xlsx$/);
  assert.deepEqual(errors, []);
});

test('modo TV esconde menus e filtros e volta pelo botão', async t => {
  const { page, errors } = await portal(t);
  await go(page, 'programacao');
  await page.click('[data-action="tv-mode"]');
  await page.waitForSelector('.tv-mode .tv-bar');
  assert.equal(await page.locator('.v-main-nav').isVisible(), false);
  assert.equal(await page.locator('.v-tools-row').isVisible(), false);
  assert.equal(await page.locator('.day-cards').isVisible(), true);
  await page.click('.tv-bar [data-action="tv-mode"]');
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.tv-mode').count(), 0);
  assert.equal(await page.locator('.v-main-nav').isVisible(), true);
  assert.deepEqual(errors, []);
});

test('etiquetas de filtros ativos explicam a lista e removem o filtro', async t => {
  const { page, errors } = await portal(t);
  await go(page, 'viagens');
  const total = await tableCount(page);
  await page.click('#advancedFilters summary');
  await page.waitForSelector('#filterClient');
  const client = await page.locator('#filterClient option').nth(1).getAttribute('value');
  await page.selectOption('#filterClient', client);
  await page.waitForTimeout(200);
  await page.click('[data-rv-status="Encerrado"]');
  await page.waitForTimeout(200);
  const filtered = await tableCount(page);
  assert(filtered < total);
  assert.equal(await page.locator('.filter-chip').count(), 2, 'Cliente e Situação');
  assert.match(await page.locator('.active-filters').innerText(), new RegExp('Cliente: ' + client));
  await page.click('[data-clear-filter="*"]');
  await page.waitForTimeout(200);
  assert.equal(await tableCount(page), total);
  assert.equal(await page.locator('.filter-chip').count(), 0);
  assert.deepEqual(errors, []);
});

test('linhas por página: 50 mostra mais linhas e fica salvo', async t => {
  const { page } = await portal(t);
  await go(page, 'viagens');
  const visible = () => page.locator('.table-wrap tbody tr').count();
  assert.equal(await visible(), 25);
  await page.selectOption('[data-page-size]', '50');
  await page.waitForTimeout(200);
  assert(Number(await visible()) > 25);
  await go(page, 'ctes');
  assert.equal(await page.inputValue('[data-page-size]'), '50');
});

test('comparativos: tabela de etapas da RV entre os períodos A e B', async t => {
  const { page, errors } = await portal(t);
  await go(page, 'comparativos');
  await page.waitForSelector('table.stage-compare');
  const stages = await page.$$eval('table.stage-compare tbody tr td:first-child', els => els.map(e => e.textContent));
  assert.deepEqual(stages.slice(0, 5), ['Incluído', 'Escalado', 'Viajando', 'Finalizado', 'Encerrado']);
  assert.match(await page.locator('.ins-module').last().innerText(), /não mostra quantas RVs passaram/i);
  assert.deepEqual(errors, []);
});
