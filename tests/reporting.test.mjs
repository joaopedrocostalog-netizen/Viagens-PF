import test from 'node:test';
import assert from 'node:assert/strict';
import { buildXlsx } from '../src/reporting.mjs';
const decode = new TextDecoder();
function entries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    out = [];
  let i = 0;
  while (i + 30 < bytes.length && view.getUint32(i, true) === 0x04034b50) {
    const nlen = view.getUint16(i + 26, true),
      elen = view.getUint16(i + 28, true),
      size = view.getUint32(i + 18, true);
    const name = decode.decode(bytes.slice(i + 30, i + 30 + nlen));
    const start = i + 30 + nlen + elen;
    out.push({ name, content: decode.decode(bytes.slice(start, start + size)) });
    i = start + size;
  }
  return out;
}
test('Exportação XLSX tem assinatura ZIP e partes Office Open XML completas', () => {
  const zip = buildXlsx(
    [
      {
        title: 'Viagens por período',
        columns: [
          ['numero', 'RV'],
          ['abastecimento', 'Abastecimento']
        ],
        rows: [{ numero: 'RV-01', abastecimento: 145.25 }]
      }
    ],
    { mode: 'live', from: '2026-10-01', to: '2026-10-15' }
  );
  assert.equal(zip[0], 0x50);
  assert.equal(zip[1], 0x4b);
  const fs = entries(zip);
  const names = fs.map(x => x.name);
  for (const n of [
    '[Content_Types].xml',
    'xl/workbook.xml',
    'xl/worksheets/sheet1.xml',
    'xl/styles.xml',
    'xl/_rels/workbook.xml.rels'
  ])
    assert(names.includes(n), n);
  const sheet = fs.find(x => x.name === 'xl/worksheets/sheet1.xml').content;
  assert(sheet.includes('RV-01'));
  assert(sheet.includes('<v>145.25</v>'));
  assert(sheet.includes('autoFilter'));
  assert(!sheet.includes('<f>'), 'nenhuma fórmula executável deve ser escrita a partir do DSS');
});
test('Exportação Excel multiabas mantém caracteres especiais e valores como texto não executável', () => {
  const zip = buildXlsx(
    [
      { title: 'Viagens', columns: [['text', 'Texto']], rows: [{ text: '=HYPERLINK("https://bad.test")' }] },
      { title: 'Clientes', columns: [['name', 'Cliente']], rows: [{ name: 'COSTALOG & parceiros <Brasil>' }] }
    ],
    { mode: 'demo' }
  );
  const fs = entries(zip);
  const sheet1 = fs.find(x => x.name === 'xl/worksheets/sheet1.xml').content;
  const sheet2 = fs.find(x => x.name === 'xl/worksheets/sheet2.xml').content;
  assert(sheet1.includes('t="inlineStr"'));
  assert(sheet1.includes('=HYPERLINK('));
  assert(!sheet1.includes('<f>'));
  assert(sheet2.includes('COSTALOG &amp; parceiros &lt;Brasil&gt;'));
});
