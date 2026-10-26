/** Importação manual de MDF-e por arquivo CSV (separador ; ou ,), com cabeçalhos tolerantes a acentos/caixa. */
function normalKey(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}
function pick(o, aliases) {
  if (!o || typeof o !== 'object') return undefined;
  const keys = Object.keys(o);
  for (const a of aliases) {
    const k = keys.find(x => normalKey(x) === normalKey(a));
    if (k && o[k] !== null && o[k] !== '') return o[k];
  }
  return undefined;
}
function toDay(v) {
  if (!v) return '';
  const s = String(v);
  const match = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) return match[3] + '-' + match[2] + '-' + match[1];
  return s.slice(0, 10);
}
function str(v) {
  return v === undefined || v === null ? '' : String(v);
}
export function normalizeMdfe(v, i) {
  const n = str(pick(v, ['numeroMDFe', 'nroMDFe', 'nrMDFe', 'numero', 'id']));
  return {
    id: n || String(i + 1),
    numero: n || '—',
    empresa: str(pick(v, ['empresa', 'company', 'nomeEmpresa'])),
    data: toDay(pick(v, ['dataEmissao', 'dtEmissao', 'data'])),
    viagemId: str(pick(v, ['idViagem', 'numeroViagem', 'nroViagem', 'nrViagem', 'viagemId', 'viagem'])) || null,
    placa: str(pick(v, ['placaVeiculo', 'placa', 'placaTracao'])),
    status: str(pick(v, ['situacao', 'status'])) || 'Não informado'
  };
}
export function parseCsv(content) {
  const text = content.replace(/^\uFEFF/, '').replace(/\r/g, '');
  const rows = text.split('\n').filter(x => x.trim());
  if (rows.length < 2) return [];
  const sep = rows[0].includes(';') ? ';' : ',';
  function parseLine(l) {
    const out = [];
    let token = '',
      quoted = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"' && l[i + 1] === '"' && quoted) {
        token += '"';
        i++;
      } else if (c === '"') {
        quoted = !quoted;
      } else if (c === sep && !quoted) {
        out.push(token);
        token = '';
      } else token += c;
    }
    out.push(token);
    return out;
  }
  const headers = parseLine(rows.shift()).map(normalKey);
  return rows
    .map((l, i) => {
      const fields = parseLine(l);
      const v = {};
      headers.forEach((h, j) => (v[h] = fields[j] || ''));
      return normalizeMdfe(v, i);
    })
    .filter(x => x.numero !== '—');
}
