import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPortalOverview } from '../api/access.mjs';
import { RV_STATUSES } from '../src/rv-status.mjs';

test('Digitar datas não interrompe o ano, calendário usa o mesmo campo e filtros de etapas mantêm Finalizado/Encerrado separados', async () => {
  const events = {},
    storage = new Map(),
    calls = [];
  let opens = 0;
  const fields = { loginUser: { value: 'operador' }, loginPassword: { value: 'senha-teste' } };
  const root = { innerHTML: '', addEventListener: (type, fn) => (events[type] = fn) };
  globalThis.document = {
    activeElement: null,
    getElementById: id => (id === 'app' ? root : fields[id] || null),
    querySelector() {
      return null;
    },
    addEventListener() {}
  };
  const makeField = (id, value) => ({
    id,
    value,
    dataset: { editDate: id },
    selectionStart: value.length,
    setCustomValidity(v) {
      this.validity = v;
    },
    setAttribute() {},
    focus() {
      document.activeElement = this;
    },
    setSelectionRange(start) {
      this.selectionStart = start;
    },
    reportValidity() {}
  });
  fields.from = makeField('from', '01/01/2026');
  fields.to = makeField('to', '23/10/2026');
  fields.fromCalendar = {
    showPicker() {
      opens++;
    }
  };
  globalThis.window = { location: { protocol: 'file:', origin: 'https://teste.local' } };
  globalThis.localStorage = {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
  };
  globalThis.alert = message => {
    throw Error(message);
  };
  const reply = body => ({ ok: true, status: 200, json: async () => body });
  globalThis.fetch = async input => {
    const url = new URL(input);
    if (url.pathname === '/api/login')
      return reply({
        token: 'teste',
        user: { username: 'operador', role: 'operacional' },
        permissions: { operacional: true, admin: false, financeiro: false }
      });
    if (url.pathname === '/api/workflow') return reply({ tasks: {} });
    calls.push(url);
    return reply(
      projectPortalOverview(
        {
          data: {
            viagens: RV_STATUSES.map((status, i) => ({
              empresa: 'CRC',
              rv_id: i + 1,
              nro_rv: 100 + i,
              tipo_rv: 'RODO',
              data_inicio: '01/10/2026',
              status_rv: status
            })),
            pedidos: [],
            sources: { pedidos: true }
          }
        },
        'operacional',
        'costalog',
        { includeCompanies: true }
      )
    );
  };
  const click = (selector, dataset) =>
      events.click({ target: { closest: key => (key === selector ? { dataset } : null) } }),
    tick = () => new Promise(resolve => setTimeout(resolve, 25));
  const type = (id, value) => {
    fields[id].value = value;
    fields[id].selectionStart = value.length;
    events.input({ target: fields[id] });
  };
  const enter = id => events.keydown({ key: 'Enter', target: fields[id], preventDefault() {} });
  await import('../src/app.js?editable-dates=1');
  click('[data-action]', { action: 'connect' });
  events.submit({ target: { id: 'loginForm' }, preventDefault() {} });
  await tick();
  fields.from.focus();
  type('from', '01/10/2');
  assert.equal(fields.from.value, '01/10/2');
  click('[data-nav]', { nav: 'viagens' });
  assert(root.innerHTML.includes('value="01/10/2"'));
  assert.equal(document.activeElement, fields.from);
  click('[data-action]', { action: 'refresh' });
  await tick();
  assert.equal(calls.length, 0, 'Ano incompleto não consulta a DSS nem altera para ano 0002');
  type('from', '31/02/2026');
  enter('from');
  assert(fields.from.validity);
  click('[data-action]', { action: 'refresh' });
  assert.equal(calls.length, 0);
  type('from', '01102026');
  assert.equal(fields.from.value, '01/10/2026');
  enter('from');
  click('[data-open-calendar]', { openCalendar: 'from' });
  assert.equal(opens, 1);
  events.change({ target: { id: 'toCalendar', dataset: { datePicker: 'to' }, value: '2026-10-23' } });
  assert.equal(fields.to.value, '23/10/2026');
  click('[data-action]', { action: 'refresh' });
  await tick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].searchParams.get('from'), '2026-10-01');
  assert.equal(calls[0].searchParams.get('to'), '2026-10-23');
  assert(root.innerHTML.includes('Tipo de RV'));
  for (const status of RV_STATUSES) assert(root.innerHTML.includes('data-rv-status="' + status + '"'));
  click('[data-rv-status]', { rvStatus: 'Finalizado' });
  let table = root.innerHTML.slice(root.innerHTML.indexOf('<tbody>'));
  assert(table.includes('viagens:crc~4'));
  assert(!table.includes('viagens:crc~5'));
  click('[data-rv-status]', { rvStatus: 'Encerrado' });
  table = root.innerHTML.slice(root.innerHTML.indexOf('<tbody>'));
  assert(table.includes('viagens:crc~5'));
  assert(!table.includes('viagens:crc~4'));
  assert.equal(calls.length, 1, 'Filtrar etapas é local e não repete sincronização');
  click('[data-detail]', { detail: 'viagens:crc~5' });
  assert(root.innerHTML.includes('aria-current="step">Encerrado'));
});
