import { companyIdentity } from '../src/companies.mjs';
/** Quebra calendárica de consultas DSS e junção sem duplicar chaves documentais. */
export function monthWindows(from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to)
    throw Error('Intervalo inválido');
  const windows = [];
  let year = Number(from.slice(0, 4)),
    month = Number(from.slice(5, 7));
  while (year < Number(to.slice(0, 4)) || (year === Number(to.slice(0, 4)) && month <= Number(to.slice(5, 7)))) {
    const start = String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0') + '-01';
    const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    windows.push({ from: windows.length === 0 ? from : start, to: end < to ? end : to });
    if (windows.length > 400) throw Error('Intervalo longo demais');
    month++;
    if (month === 13) {
      month = 1;
      year++;
    }
  }
  return windows;
}
export function mergeDssRows(groups, name) {
  const keys = {
    viagens: ['rv_id', 'nro_rv'],
    pedidos: ['pf_id', 'nro_pf'],
    ctes: ['pf_id', 'nro_cte'],
    mdfes: ['mdfe_id', 'nro_mdf']
  };
  const found = new Set(),
    joined = [];
  for (const rows of groups) {
    for (const row of rows || []) {
      let key = '';
      for (const field of keys[name] || []) {
        if (row?.[field] != null && String(row[field]).trim()) {
          key = companyIdentity(row) + '|' + field + ':' + String(row[field]).trim();
          break;
        }
      }
      if (key && found.has(key)) continue;
      if (key) found.add(key);
      joined.push(row);
    }
  }
  return joined;
}
