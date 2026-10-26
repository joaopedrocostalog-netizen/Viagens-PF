import test from 'node:test';
import assert from 'node:assert/strict';
import { companyOf, scopeCompanyData } from '../src/companies.mjs';
import { normalizeOverview } from '../src/dss-mapping.mjs';
import { mergeDssRows } from '../api/dss-periods.mjs';
import { projectOverview } from '../api/access.mjs';

test('AC da Costa, CRC e Comex pertencem à Costalog; cliente nunca define empresa', () => {
  for (const empresa of [
    'A.C. da Costa Transportes Ltda',
    'CRC DA COSTA',
    'COMEX',
    'Comércio Exterior Costa Log LTDA',
    'COSTALOG'
  ])
    assert.equal(companyOf({ empresa }), 'costalog', empresa);
  for (const empresa of ['IDEALLOG TRANSPORTES LTDA', 'Ideal Log']) assert.equal(companyOf({ empresa }), 'ideallog');
  for (const row of [{}, { empresa: 17 }, { empresa: 'Outra empresa' }, { cliente_nome: 'IDEALLOG' }])
    assert.equal(companyOf(row), null);
});
const raw = {
  viagens: [
    { rv_id: 1, nro_rv: 100, empresa: 'AC da Costa', nro_mdf: 700 },
    { rv_id: 1, nro_rv: 100, empresa: 'Ideallog', nro_mdf: 800 },
    { rv_id: 2, nro_rv: 200, empresa: 'CRC', nro_mdf: 900 },
    { rv_id: 3, nro_rv: 300, empresa: 'Comex' },
    { rv_id: 4, nro_rv: 400, empresa: 'Desconhecida' }
  ],
  pedidos: [
    { pf_id: 1, nro_pf: 'AC-1', empresa: 'AC da Costa', rv_viagem: 100, nro_cte: 50 },
    { pf_id: 1, nro_pf: 'IDEAL-1', empresa: 'Ideallog', rv_viagem: 100, nro_cte: 50 },
    { pf_id: 2, nro_pf: 'HERDADO-CRC', rv_viagem: 200 },
    { pf_id: 3, nro_pf: 'AMBIGUO', rv_viagem: 100 },
    { pf_id: 4, nro_pf: 'SEM-EMPRESA', cliente_nome: 'AC DA COSTA' }
  ],
  mdfes: [{ numero: 700 }, { numero: 800 }, { numero: 900 }],
  ocorrencias: [
    { ocorrencia_id: 1, empresa: 'Ideallog' },
    { ocorrencia_id: 2, rv_id: 2 },
    { ocorrencia_id: 3, rv_id: 1 },
    { ocorrencia_id: 4, placa_veiculo: 'ABC1234' }
  ]
};
test('Separa registros, documentos e ocorrências; vínculos ambíguos ficam fora', () => {
  const costa = scopeCompanyData(raw, 'costalog'),
    ideal = scopeCompanyData(raw, 'ideallog');
  assert.deepEqual(
    costa.viagens.map(v => v.empresa),
    ['AC da Costa', 'CRC', 'Comex']
  );
  assert.deepEqual(
    costa.pedidos.map(p => p.nro_pf),
    ['AC-1', 'HERDADO-CRC']
  );
  assert.deepEqual(
    ideal.pedidos.map(p => p.nro_pf),
    ['IDEAL-1']
  );
  assert.deepEqual(
    costa.mdfes.map(m => m.numero),
    [700, 900]
  );
  assert.deepEqual(
    ideal.mdfes.map(m => m.numero),
    [800]
  );
  assert.deepEqual(
    costa.ocorrencias.map(o => o.ocorrencia_id),
    [2]
  );
  assert.deepEqual(
    ideal.ocorrencias.map(o => o.ocorrencia_id),
    [1]
  );
  assert.throws(() => scopeCompanyData(raw, 'todas'));
  for (const company of ['costalog', 'ideallog']) {
    const response = projectOverview({ data: raw }, 'administrador', company);
    assert.equal(response.company, company);
    assert.deepEqual(response.data.pedidos, scopeCompanyData(raw, company).pedidos);
  }
});
test('IDs e números iguais de empresas diferentes sobrevivem ao cache e à normalização', () => {
  const rows = mergeDssRows([raw.viagens, raw.viagens], 'viagens');
  assert.equal(rows.length, 5);
  const sameGroup = {
    viagens: [
      { rv_id: 1, nro_rv: 100, empresa: 'CRC' },
      { rv_id: 1, nro_rv: 100, empresa: 'Comex' }
    ],
    pedidos: [
      { pf_id: 1, nro_pf: 'CRC-PF', nro_cte: 50, empresa: 'CRC', rv_viagem: 100 },
      { pf_id: 1, nro_pf: 'COMEX-PF', nro_cte: 50, empresa: 'Comex', rv_viagem: 100 }
    ]
  };
  const normalized = normalizeOverview({ data: sameGroup });
  assert.equal(normalized.viagens.length, 2);
  assert.equal(normalized.pedidos.length, 2);
  assert.equal(normalized.ctes.length, 2);
  assert.equal(normalized.pedidos[0].viagemId, 'crc~1');
  assert.equal(normalized.pedidos[1].viagemId, 'comex~1');
});
