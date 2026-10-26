import test from 'node:test';
import assert from 'node:assert/strict';
import { secureReport, reportTypesFor } from '../src/access-ui.mjs';
import { extractRows } from '../src/operational.mjs';
import { buildXlsx, printReport } from '../src/reporting.mjs';

test('CSV, Excel e PDF de viagens/PF usam somente campos operacionais para todos os perfis', () => {
  const data = {
    viagens: [{ numero: 'RV-TESTE', receita: 87654, abastecimento: 98765 }],
    pedidos: [{ pedidoNumero: 'PF-TESTE', valor: 87654, numeroFatura: 'FAT-PRIVADA', liberadoFaturamento: true }],
    ctes: [],
    mdfes: []
  };
  const forbidden = ['87654', '98765', 'FAT-PRIVADA', 'Abastecimento', 'Frete (R$)', 'Liberado faturamento', 'Fatura'];
  for (const role of ['operacional', 'financeiro', 'administrador']) {
    assert.deepEqual(reportTypesFor(role), [
      'viagens',
      'pedidos',
      'ctes',
      'entregas',
      'rotas',
      'veiculos',
      'motoristas',
      'mdfes',
      'pendencias',
      'ocorrencias',
      'mensal'
    ]);
    assert.throws(() => secureReport(extractRows('clientes', data), 'clientes', role));
    const models = ['viagens', 'pedidos'].map(type => secureReport(extractRows(type, data), type, role));
    const csv = models
      .map(r => [r.columns.map(c => c[1]), ...r.rows.map(row => r.columns.map(c => row[c[0]]))].join('\n'))
      .join('\n');
    const xlsx = new TextDecoder().decode(buildXlsx(models));
    let html = '';
    globalThis.window = {
      open: () => ({
        document: {
          open() {},
          write(value) {
            html = value;
          },
          close() {}
        },
        focus() {},
        print() {}
      })
    };
    printReport(models);
    for (const output of [JSON.stringify(models), csv, xlsx, html]) {
      assert(output.includes('RV-TESTE'));
      assert(output.includes('PF-TESTE'));
      for (const secret of forbidden) assert(!output.includes(secret), role + ': ' + secret);
    }
  }
});
