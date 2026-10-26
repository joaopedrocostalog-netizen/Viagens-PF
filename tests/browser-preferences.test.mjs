import test from 'node:test';
import assert from 'node:assert/strict';
import { createPortalClient } from '../src/portal-client.mjs';
import { renderTaskDrawer } from '../src/workflow-ui.mjs';
test('without database, account preferences stay isolated in browser and never pretend to sync to server', async () => {
  const saved = new Map(),
    calls = [];
  globalThis.localStorage = { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) };
  globalThis.fetch = async (url, options) => {
    calls.push(options.method);
    assert.equal(options.method, 'GET');
    return { ok: true, json: async () => ({ storage: 'browser', durable: false, revision: 0, values: {} }) };
  };
  const make = (username = 'joao', company = 'costalog', apiUrl = 'https://api.example') => {
    const state = { serverMode: true, token: 'session', company, apiUrl, user: { username } };
    return { state, client: createPortalClient(state, () => {}) };
  };
  const first = make();
  await first.client.loadPreferences();
  assert.equal(first.state.preferenceStorage, 'browser');
  assert(!first.state.preferencesError);
  first.state.reportTemplates = { Operacao: { company: 'costalog', columns: ['numero'] } };
  first.state.metricLayout = ['pedidos'];
  assert.equal(await first.client.flushPreferences(), true);
  const reopened = make();
  await reopened.client.loadPreferences();
  assert.deepEqual(reopened.state.metricLayout, ['pedidos']);
  assert(reopened.state.reportTemplates.Operacao);
  for (const other of [
    make('outra.conta'),
    make('joao', 'ideallog'),
    make('joao', 'costalog', 'https://outra-api.example')
  ]) {
    await other.client.loadPreferences();
    assert.deepEqual(other.state.reportTemplates, {});
    assert.equal(other.state.metricLayout, null);
  }
  // Only allowlisted preference keys may be restored from editable browser storage.
  const key = [...saved.keys()][0];
  saved.set(key, JSON.stringify({ role: 'administrador', token: 'injetado', reportFormat: 'csv' }));
  await reopened.client.loadPreferences();
  assert.equal(reopened.state.token, 'session');
  assert.equal(reopened.state.role, undefined);
  assert.equal(reopened.state.reportFormat, 'csv');
  assert(calls.every(method => method === 'GET'));
  globalThis.localStorage.setItem = () => {
    throw Error('Quota exceeded');
  };
  reopened.state.reportFormat = 'xlsx';
  assert.equal(await reopened.client.flushPreferences(), false);
  assert.match(reopened.state.preferencesError, /não salvas/);
});
test('task drawer explains temporary storage where the user saves a treatment', () => {
  const state = {
    taskSelected: { title: 'Conferir CT-e', detail: 'Documento pendente', level: 'high' },
    user: { username: 'joao' },
    workflowStorage: { durable: false }
  };
  assert.match(renderTaskDrawer(state), /armazenamento temporário/);
  assert(!renderTaskDrawer({ ...state, workflowStorage: { durable: true } }).includes('armazenamento temporário'));
});
