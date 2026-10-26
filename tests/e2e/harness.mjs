/**
 * Ambiente de teste de navegador: abre o portal em modo DEMONSTRAÇÃO (sem backend e sem DSS) num Chromium real.
 * As requisições para https://costalog.github.io/viagens/ são atendidas com os arquivos deste repositório,
 * e site-config.mjs é servido com API_BASE_URL vazio, como no GitHub Pages de demonstração.
 * Uma conta de demonstração é criada só no armazenamento desse navegador temporário.
 */
import { readFile } from 'node:fs/promises';
import { pbkdf2Sync } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.png': 'image/png'
};
export const ORIGIN = 'https://costalog.github.io/viagens/';
export const PASSWORD = 'senha-de-teste-e2e-123';
const SALT = '00112233445566778899aabbccddeeff';
const HASH = pbkdf2Sync(PASSWORD, Buffer.from(SALT, 'hex'), 120000, 32, 'sha256').toString('hex');

export async function launch() {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
  return chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
}

export async function openPortal(browser, { viewport = { width: 1440, height: 1000 } } = {}) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => message.type() === 'error' && errors.push(message.text()));
  await page.route(ORIGIN + '**', async route => {
    let file = new URL(route.request().url()).pathname.replace(/^\/viagens\//, '/');
    if (file === '/') file = '/index.html';
    const full = path.join(ROOT, file);
    if (!full.startsWith(ROOT)) return route.fulfill({ status: 403, body: '' });
    try {
      let body = await readFile(full);
      if (file === '/src/site-config.mjs')
        body = Buffer.from(
          String(body).replace(/^export const API_BASE_URL = '[^']*';/m, "export const API_BASE_URL = '';")
        );
      await route.fulfill({ body, contentType: TYPES[path.extname(file)] || 'application/octet-stream' });
    } catch {
      await route.fulfill({ status: 404, body: '' });
    }
  });
  await page.addInitScript(
    ([salt, hash]) => {
      if (!localStorage.getItem('costalog_demo_users_v1'))
        localStorage.setItem(
          'costalog_demo_users_v1',
          JSON.stringify([
            {
              username: 'teste',
              name: 'Teste',
              role: 'administrador',
              salt,
              hash,
              disabled: false,
              mustChangePassword: false
            }
          ])
        );
    },
    [SALT, HASH]
  );
  await page.goto(ORIGIN);
  return { page, errors, context };
}

export async function login(page) {
  if ((await page.locator('#loginUser').count()) === 0) await page.click('[data-action="connect"]');
  await page.fill('#loginUser', 'teste');
  await page.fill('#loginPassword', PASSWORD);
  await page.locator('#loginForm').evaluate(form => form.requestSubmit());
  await page.waitForSelector('.v-username', { timeout: 30000 });
}

export async function go(page, view) {
  await page.click('[data-nav="' + view + '"]');
  await page.waitForTimeout(150);
}
