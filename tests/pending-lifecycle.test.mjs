import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorkflowStore } from '../api/workflow-store.mjs';
import { createPendingService } from '../api/pending-service.mjs';
import { alertReferences } from '../src/operational.mjs';
import { archivePage, pendingNotices, emptyPolicy } from '../src/pending-data.mjs';
import { renderPendingArchive } from '../src/pending-ui.mjs';
const key = 'comprovante_pendente:ctes:crc~1',
  range = { from: '2026-10-01', to: '2026-10-31' };
const data = (proof = false) => ({
  viagens: [{ id: 'crc~9', rvId: '9', numero: 'RV9', status: 'Finalizado', data: '2026-10-01' }],
  pedidos: [
    {
      id: 'crc~1',
      pedidoNumero: 'PF1',
      cliente: 'Cliente CRC',
      data: '2026-10-01',
      viagemId: 'crc~9',
      isCte: true,
      entregaConcluida: true,
      comprovanteEntrega: proof
    }
  ],
  sources: { pedidos: true }
});
async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), 'pending-lifecycle-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'workflow.json');
  return { file, store: createWorkflowStore({ file }) };
}
const observe = (store, d, at, freshPeriods = [range], coverage = range) =>
  store.observe('costalog', { data: d, references: alertReferences(d), at, freshPeriods, coverage });
const save = (store, previous, patch = {}) =>
  store.save(
    'costalog',
    key,
    {
      owner: 'João',
      ownerUsername: 'joao',
      due: previous.due || '',
      status: 'tratamento',
      priority: 'high',
      comment: '',
      revision: previous.revision,
      ...patch
    },
    'joao',
    undefined,
    previous.lastObservedAt ? new Date(Date.parse(previous.lastObservedAt) + 1000).toISOString() : undefined
  );
test('per-type deadlines start at first portal observation, survive reopening and preserve manual dates', async t => {
  const { store, file } = await setup(t);
  await store.savePolicy('costalog', { ...emptyPolicy(), days: { comprovante_pendente: 2 } }, 'admin');
  await observe(store, data(), '2026-10-23T01:00:00Z');
  let task = await store.get('costalog', key);
  assert.equal(task.due, '2026-10-24', 'São Paulo first observation is Oct 22, not the old emission date');
  assert.equal(task.dueOrigin, 'policy');
  task = await save(store, task, { due: '2026-11-10' });
  assert.equal(task.dueOrigin, 'manual');
  await store.savePolicy(
    'costalog',
    { revision: 1, days: { comprovante_pendente: 0 }, applyUnscheduled: true },
    'admin'
  );
  assert.equal((await createWorkflowStore({ file }).get('costalog', key)).due, '2026-11-10');
  await assert.rejects(
    store.savePolicy('costalog', { revision: 1, days: { comprovante_pendente: 400 } }, 'admin'),
    /Prazo/
  );
});
test('resolution requires a reason; continuous DSS alert does not repeatedly reopen it', async t => {
  const { store } = await setup(t);
  await observe(store, data(), '2026-10-22T15:00:00Z');
  let task = await store.get('costalog', key);
  await assert.rejects(save(store, task, { status: 'resolvida', resolutionReason: '' }), /motivo da resolução/);
  task = await save(store, task, {
    status: 'resolvida',
    resolutionReason: 'Comprovante conferido na origem',
    comment: 'Verificado'
  });
  await observe(store, data(), '2026-10-23T15:00:00Z');
  task = await store.get('costalog', key);
  assert.equal(task.status, 'resolvida');
  assert.equal(task.recurrenceCount, 0);
  assert.equal(task.resolutions.length, 1);
  assert.equal(task.resolutions[0].reason, 'Comprovante conferido na origem');
  assert.equal(archivePage(await store.get('costalog'), {}).total, 1);
});
test('confirmed absence followed by a newer fresh recurrence reopens and retains resolution history', async t => {
  const { store } = await setup(t);
  await observe(store, data(), '2026-10-20T15:00:00Z');
  let task = await store.get('costalog', key);
  await save(store, task, { status: 'resolvida', resolutionReason: 'Documento recebido' });
  await observe(store, data(true), '2026-10-21T15:00:00Z');
  assert.equal((await store.get('costalog', key)).presence, 'absent');
  await observe(store, data(), '2026-10-22T15:00:00Z');
  task = await store.get('costalog', key);
  assert.equal(task.status, 'aberta');
  assert.equal(task.recurrenceCount, 1);
  assert.equal(task.resolutions[0].reason, 'Documento recebido');
  await observe(store, data(), '2026-10-22T15:00:00Z');
  assert.equal((await store.get('costalog', key)).recurrenceCount, 1, 'same observation is idempotent');
  await observe(store, data(), '2026-10-19T15:00:00Z');
  assert.equal((await store.get('costalog', key)).recurrenceCount, 1, 'older response ignored');
});
test('missing records, missing proof fields, reused months and incomplete coverage cannot manufacture recurrence', async t => {
  const { store } = await setup(t);
  await observe(store, data(), '2026-10-20T15:00:00Z');
  let task = await store.get('costalog', key);
  await save(store, task, { status: 'resolvida', resolutionReason: 'Recebido' });
  await observe(store, { ...data(), pedidos: [] }, '2026-10-21T15:00:00Z');
  assert.equal((await store.get('costalog', key)).presence, 'present');
  await observe(store, data(null), '2026-10-22T15:00:00Z');
  assert.equal((await store.get('costalog', key)).presence, 'present');
  await observe(store, data(true), '2026-10-23T15:00:00Z', []);
  assert.equal((await store.get('costalog', key)).presence, 'present');
  const rvKey = 'rv_sem_pedido:viagens:crc~9';
  await observe(store, { ...data(), pedidos: [] }, '2026-10-24T15:00:00Z');
  await observe(store, data(), '2026-10-25T15:00:00Z');
  assert.equal((await store.get('costalog', rvKey)).presence, 'absent');
  const before = (await store.get('costalog', rvKey)).recurrenceCount;
  await observe(store, { ...data(), pedidos: [] }, '2026-10-26T15:00:00Z', [{ from: '2026-10-01', to: '2026-10-10' }], {
    from: '2026-10-01',
    to: '2026-10-10'
  });
  assert.equal((await store.get('costalog', rvKey)).recurrenceCount, before);
});
test('batch preview changes nothing, conflict rolls back the whole batch, confirmation is company/user scoped', async t => {
  const { store } = await setup(t);
  const other = 'cte_pendente:ctes:crc~2';
  let task = { owner: '', due: '', priority: 'high', status: 'aberta', comment: '', revision: 0 };
  await store.save('costalog', key, task, 'joao');
  await store.save('costalog', other, task, 'joao');
  const service = createPendingService({ store }),
    user = { username: 'joao', displayName: 'João', permissions: { admin: false } },
    items = [
      { key, revision: 1 },
      { key: other, revision: 1 }
    ];
  const preview = await service.action(
    'costalog',
    { action: 'preview-batch', items, changes: { status: 'resolvida', resolutionReason: 'Conferidos' } },
    user
  );
  assert.equal((await store.get('costalog', key)).status, 'aberta');
  await assert.rejects(service.action('ideallog', { action: 'apply-batch', token: preview.token }, user), {
    status: 409
  });
  await assert.rejects(
    service.action('costalog', { action: 'apply-batch', token: preview.token }, { ...user, username: 'outro' }),
    { status: 409 }
  );
  await store.save('costalog', other, { ...task, revision: 1, owner: 'Outra pessoa' }, 'ana');
  await assert.rejects(service.action('costalog', { action: 'apply-batch', token: preview.token }, user), {
    status: 409
  });
  assert.equal((await store.get('costalog', key)).revision, 1, 'no partial update');
  const next = await service.action(
    'costalog',
    {
      action: 'preview-batch',
      items: [{ key, revision: 1 }],
      changes: { status: 'resolvida', resolutionReason: 'Conferido' }
    },
    user
  );
  await service.action('costalog', { action: 'apply-batch', token: next.token }, user);
  assert.equal((await store.get('costalog', key)).status, 'resolvida');
  await assert.rejects(service.action('costalog', { action: 'apply-batch', token: next.token }, user), { status: 409 });
  await assert.rejects(service.action('costalog', { action: 'save-rules', policy: emptyPolicy() }, user), {
    status: 403
  });
});
test('archive remains paginated outside current dates, escapes reasons and filters entity; notices avoid duplicate totals', () => {
  const tasks = Object.fromEntries(
    Array.from({ length: 63 }, (_, i) => [
      'cte_pendente:ctes:' + (i === 62 ? 'comex' : 'crc') + '~' + i,
      {
        status: i === 0 ? 'aberta' : 'resolvida',
        owner: i === 0 ? 'João' : 'Equipe',
        ownerUsername: i === 0 ? 'joao' : '',
        due: '2020-01-01',
        handledAt: '2026-10-01',
        updatedAt: '2026-10-23',
        recurrenceCount: i === 0 ? 1 : 0,
        resolutionReason: '<img src=x>',
        source: { entity: i === 62 ? 'comex' : 'crc', number: 'PF' + i, customer: 'Cliente', refDate: '2020-01-01' }
      }
    ])
  );
  const first = archivePage(tasks, { from: '2026-10-01', to: '2026-10-23', legalEntity: 'crc' });
  assert.equal(first.total, 62);
  assert.equal(first.rows.length, 25);
  assert.equal(archivePage(tasks, { page: 3, legalEntity: 'crc' }).rows.length, 12);
  const html = renderPendingArchive(first, {});
  assert(!html.includes('<img'));
  assert(html.includes('&lt;img'));
  assert.equal((html.match(/data-alert-manage/g) || []).length, 25);
  const notice = pendingNotices(tasks, { username: 'joao', displayName: 'João' }, 'crc');
  assert.equal(notice.counts.vencidas, 1);
  assert.equal(notice.counts.reincidentes, 1);
  assert.equal(notice.total, 1);
});

test('occurrence recurrence needs an explicitly cleared DSS field; an omitted field is insufficient', async t => {
  const { store } = await setup(t),
    service = createPendingService({ store }),
    occurrenceKey = 'ocorrencia:ctes:crc~1';
  const payload = (ocorrencia, at) => ({
    updatedAt: at,
    quality: { periods: [{ ...range, reused: false }] },
    data: {
      viagens: [],
      pedidos: [
        {
          empresa: 'CRC',
          pf_id: 1,
          nro_pf: 'PF1',
          nro_cte: 10,
          data_emissao: '01/10/2026',
          ...(ocorrencia === undefined ? {} : { ocorrencia })
        }
      ],
      sources: { pedidos: true }
    }
  });
  await service.observed(payload('Conferir documento', '2026-10-20T15:00:00Z'), range);
  await service.observed(payload(undefined, '2026-10-21T15:00:00Z'), range);
  assert.equal((await store.get('costalog', occurrenceKey)).presence, 'present');
  await service.observed(payload('', '2026-10-22T15:00:00Z'), range);
  assert.equal((await store.get('costalog', occurrenceKey)).presence, 'absent');
  await service.observed(payload('Documento voltou a divergir', '2026-10-23T15:00:00Z'), range);
  assert.equal((await store.get('costalog', occurrenceKey)).recurrenceCount, 1);
});
