const plain = html =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/[↕↑↓▲▼]/g, '')
    .trim();
const h = text => text.replace(/"/g, '&quot;');
/** Enhance only rendered rows: no copy of the dataset and no future-page markup. */
export function mobileTables(html) {
  return html.replace(/<table>([\s\S]*?)<\/table>/g, (_, table) => {
    const head = table.match(/<thead>([\s\S]*?)<\/thead>/)?.[1];
    if (!head) return '<table>' + table + '</table>';
    const labels = [...head.matchAll(/<th(?:\s[^>]*)?>([\s\S]*?)<\/th>/g)].map(match => plain(match[1]));
    const chosen = new Set(labels.length <= 4 ? labels.map((_, i) => i) : [0]);
    for (const [i, label] of labels.entries())
      if (
        chosen.size < 4 &&
        /^(?:Nº RV|RV|Pedido PF|Pedido|Placa|Veículo|Situação|Entrega concluída|Responsável|Indicador|Atual|Anterior)/i.test(
          label
        )
      )
        chosen.add(i);
    const body = table.replace(
      /<tbody>([\s\S]*?)<\/tbody>/,
      (_, rows) =>
        '<tbody>' +
        rows.replace(/<tr>([\s\S]*?)<\/tr>/g, (_, cells) => {
          if (/colspan=/.test(cells)) return '<tr>' + cells + '</tr>';
          let index = 0;
          const enhanced = cells.replace(/<td(\s[^>]*)?>([\s\S]*?)<\/td>/g, (_, attributes = '', content) => {
            const i = index++;
            return (
              '<td' +
              attributes +
              ' data-label="' +
              h(labels[i] || '') +
              '" data-mobile-primary="' +
              chosen.has(i) +
              '">' +
              content +
              '</td>'
            );
          });
          return (
            '<tr>' +
            enhanced +
            (labels.length > chosen.size
              ? '<td class="mobile-row-toggle"><button type="button" class="btn btn-sm" data-mobile-row aria-expanded="false">Mais detalhes <span aria-hidden="true">⌄</span></button></td>'
              : '') +
            '</tr>'
          );
        }) +
        '</tbody>'
    );
    return '<table class="mobile-record-table">' + body + '</table>';
  });
}
