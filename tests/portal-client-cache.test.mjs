import test from 'node:test';
import assert from 'node:assert/strict';
import { createPortalClient } from '../src/portal-client.mjs';

const tick = () => new Promise(resolve => setTimeout(resolve, 10));
function setup() {
  const calls = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input),
      body = JSON.parse(options.body || '{}');
    calls.push(url.pathname);
    if (url.pathname === '/api/portal/detail')
      return { ok: true, status: 200, json: async () => ({ html: '<aside>ficha</aside>' }) };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        html: '<section>' + body.state.view + ' p' + body.state.page + '</section>',
        page: body.state.page
      })
    };
  };
  const state = {
    serverMode: true,
    token: 't',
    company: 'costalog',
    apiUrl: 'https://api.teste',
    remoteSnapshot: 'snap',
    loadedRange: { from: '2026-10-01', to: '2026-10-26' },
    from: '2026-10-01',
    to: '2026-10-26',
    view: 'viagens',
    page: 1
  };
  let client;
  const render = () => client.observe();
  client = createPortalClient(state, render);
  return { state, client, calls, views: () => calls.filter(p => p === '/api/portal/view').length };
}

test('pages already seen return from cache without a new server request', async () => {
  const { state, client, views } = setup();
  client.observe();
  await tick();
  assert.equal(client.contents(), '<section>viagens p1</section>');
  state.page = 2;
  client.observe();
  await tick();
  assert.equal(client.contents(), '<section>viagens p2</section>');
  assert.equal(views(), 2);
  state.page = 1;
  client.observe();
  assert.equal(client.contents(), '<section>viagens p1</section>', 'cached page is immediate');
  assert.equal(views(), 2, 'no request for a page already seen');
  client.invalidate();
  client.observe();
  await tick();
  assert.equal(views(), 3, 'invalidate clears the cache');
});

test('opening a record fetches only the detail, not the list page again', async () => {
  const { state, client, calls, views } = setup();
  client.observe();
  await tick();
  const before = views();
  state.selected = 'viagens:costalog~1';
  client.observe();
  await tick();
  assert.equal(views(), before, 'list is not reloaded');
  assert(calls.includes('/api/portal/detail'));
  assert.equal(client.contents(), '<section>viagens p1</section>');
});

test('painel and pendencias are never served from cache', async () => {
  const { state, client, calls } = setup();
  const metrics = () => calls.filter(p => p === '/api/portal/metrics').length;
  state.view = 'painel';
  client.observe();
  await tick();
  state.view = 'viagens';
  client.observe();
  await tick();
  state.view = 'painel';
  client.observe();
  await tick();
  assert.equal(metrics(), 2);
});
