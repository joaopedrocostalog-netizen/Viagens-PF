import test from 'node:test';
import assert from 'node:assert/strict';
import { serviceTypeLabel, filterOperationalData } from '../src/filtering.mjs';
import { operationalFilters } from '../src/advanced-ui.mjs';

test('Tipo de serviço da DSS aparece com grafia correta, sem mudar o significado', () => {
  assert.equal(serviceTypeLabel('normal'), 'Normal');
  assert.equal(serviceTypeLabel('subcontratacao'), 'Subcontratação');
  assert.equal(serviceTypeLabel('vinculado a multimodal'), 'Vinculado a multimodal');
  assert.equal(serviceTypeLabel('Rodoviário'), 'Rodoviário');
  assert.equal(serviceTypeLabel(''), '');
});

test('Filtro salvo com o valor antigo da DSS continua encontrando os pedidos', () => {
  const data = {
    viagens: [],
    pedidos: [{ id: 'a', data: '2026-10-05', tipoServico: 'Subcontratação' }],
    ctes: [],
    mdfes: [],
    ocorrencias: []
  };
  assert.equal(filterOperationalData(data, { serviceType: 'subcontratacao' }).pedidos.length, 1);
  assert.equal(filterOperationalData(data, { serviceType: 'Subcontratação' }).pedidos.length, 1);
});

test('Filtros avançados mudam com a aba: só o que faz sentido para os registros dela', () => {
  const data = {
    viagens: [{ cliente: 'Cliente RV', placa: 'RV-0001', status: 'Viajando' }],
    pedidos: [{ cliente: 'Cliente PF', placa: 'PF-0001', tipoServico: 'Normal', status: 'Emitido' }],
    mdfes: [{ placa: 'MDF-0001', status: 'Autorizado' }],
    ocorrencias: [{ placa: 'OC-0001', status: 'Aberta' }]
  };
  const labels = html => [...html.matchAll(/<span>([^<]+)<\/span><select/g)].map(m => m[1]);
  const viagens = operationalFilters(data, { view: 'viagens', filter: 'todos' });
  assert.deepEqual(labels(viagens), ['Cliente', 'Placa', 'Pedido vinculado', 'Ordem']);
  assert(viagens.includes('Cliente RV') && !viagens.includes('Cliente PF'), 'opções vêm das RVs');
  assert.match(viagens, /<label class="filter filter-compact"><span>Pedido vinculado<\/span><select id="statusFilter"/);
  assert.deepEqual(labels(operationalFilters(data, { view: 'ctes' })), [
    'Cliente',
    'Placa',
    'Tipo de serviço',
    'Situação do pedido',
    'RV vinculada',
    'Ordem'
  ]);
  const mdfes = operationalFilters(data, { view: 'mdfes' });
  assert.deepEqual(labels(mdfes), ['Placa', 'Situação do MDF-e', 'RV vinculada', 'Ordem']);
  assert(mdfes.includes('MDF-0001') && !mdfes.includes('RV-0001'));
  assert.deepEqual(labels(operationalFilters(data, { view: 'painel' })), ['Cliente', 'Placa', 'Tipo de serviço']);
  assert.deepEqual(labels(operationalFilters(data, { view: 'relatorios', reportSelected: 'mdfes' })), labels(mdfes));
  assert(!viagens.includes('Período rápido'));
});
