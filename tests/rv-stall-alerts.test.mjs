import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeAlerts, alertReferences } from '../src/operational.mjs';
import { emptyPolicy, stallRules, absenceConclusive } from '../src/pending-data.mjs';
import { validTaskKey } from '../src/workflow.mjs';
import { createWorkflowStore } from '../api/workflow-store.mjs';

const trip = (id, status, data) => ({
  id: 'crc~' + id,
  numero: String(id),
  empresa: 'CRC',
  status,
  data,
  cliente: 'Cliente'
});
const data = {
  viagens: [
    trip(1, 'Escalado', '2026-10-16'), // 10 dias
    trip(2, 'Escalado', '2026-10-24'), // 2 dias
    trip(3, 'Incluído', '2026-10-20'), // 6 dias
    trip(4, 'Viajando', '2026-10-21'), // 5 dias, sem término
    trip(5, 'Encerrado', '2026-10-01')
  ],
  pedidos: [],
  sources: {}
};
const types = alerts => alerts.map(a => a.type + ':' + a.recordId).sort();
const asOf = '2026-10-26';

test('sem regra salva: só "viajando sem término" com os 2 dias de antes; Incluído/Escalado desligados', () => {
  assert.deepEqual(types(makeAlerts(data, { asOf })), ['rv_sem_termino:crc~4']);
});

test('com prazos: Escalado > 7 dias e Incluído > 5 dias geram alerta; Viajando segue o prazo salvo', () => {
  const stall = { incluido: 5, escalado: 7, viajando: 10 };
  assert.deepEqual(types(makeAlerts(data, { asOf, stall })), ['rv_parada_escalado:crc~1', 'rv_parada_incluido:crc~3']);
  const titles = makeAlerts(data, { asOf, stall }).map(a => a.title + ' | ' + a.detail);
  assert(titles.some(t => /RV ainda em Escalado \| RV 1 • início há 10 dias/.test(t)));
  // Prazo vazio desliga até o alerta de viajando sem término.
  assert.deepEqual(types(makeAlerts(data, { asOf, stall: { incluido: null, escalado: null, viajando: null } })), []);
  assert.equal([...alertReferences(data, { asOf, stall })].length, 2);
});

test('tratamento aceita os tipos novos só para RV; some quando a RV muda de etapa', () => {
  assert(validTaskKey('rv_parada_escalado:viagens:crc~1', 'costalog'));
  assert(!validTaskKey('rv_parada_escalado:ctes:crc~1', 'costalog'));
  assert.equal(absenceConclusive('rv_parada_escalado', trip(1, 'Viajando', '2026-10-16'), {}), true);
  assert.equal(absenceConclusive('rv_parada_escalado', trip(1, 'escalada', '2026-10-16'), {}), false);
});

test('regras de RV parada são salvas, validadas e preservadas por clientes antigos', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'stall-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = createWorkflowStore({ file: join(dir, 'workflow.json') });
  assert.deepEqual((await store.policy('costalog')).stall, { incluido: null, escalado: null, viajando: 2 });
  await store.savePolicy('costalog', { ...emptyPolicy(), stall: { incluido: 3, escalado: 7, viajando: 4 } }, 'admin');
  assert.deepEqual((await store.policy('costalog')).stall, { incluido: 3, escalado: 7, viajando: 4 });
  // Cliente antigo (sem "stall") não apaga os prazos de RV parada.
  await store.savePolicy('costalog', { revision: 1, days: { comprovante_pendente: 2 } }, 'admin');
  assert.deepEqual((await store.policy('costalog')).stall, { incluido: 3, escalado: 7, viajando: 4 });
  await assert.rejects(store.savePolicy('costalog', { revision: 2, days: {}, stall: { escalado: 999 } }, 'admin'), {
    status: 400
  });
  assert.deepEqual(stallRules(null), { incluido: null, escalado: null, viajando: 2 });
  // Empresas separadas.
  assert.deepEqual((await store.policy('ideallog')).stall, { incluido: null, escalado: null, viajando: 2 });
});
