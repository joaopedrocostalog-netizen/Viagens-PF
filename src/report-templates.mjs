import { OP_REPORTS, OP_COLUMNS } from './access-ui.mjs';
import { COSTALOG_ENTITIES } from './companies.mjs';
const FLAGS = ['alertArchive', 'alertAllTracked', 'alertRelevant', 'alertUnassigned', 'alertRecurrent'];
const FILTERS = [
  'rvStage',
  'from',
  'to',
  'customer',
  'vehicle',
  'serviceType',
  'status',
  'filter',
  'search',
  'sortKey',
  'sortDir',
  'legalEntity',
  'alertKind',
  'alertPriority',
  'alertStatus',
  'alertOwner',
  'alertScope',
  'alertDue',
  'alertGroup',
  'alertGrouping',
  'tripFocus',
  'drilldown'
];
export function reportTemplate(state) {
  const type = state.reportSelected;
  if (!OP_REPORTS.includes(type)) throw Error('Relatório inválido.');
  const allowed = OP_COLUMNS[type],
    hidden = state.hiddenColumns?.['report-' + type] || [];
  const ordered = [...new Set([...(state.reportColumnOrder?.[type] || []), ...allowed])].filter(
    key => allowed.includes(key) && !hidden.includes(key)
  );
  if (!ordered.length) throw Error('Selecione pelo menos uma coluna.');
  return {
    version: 1,
    type,
    company: state.company,
    filters: {
      ...Object.fromEntries(FILTERS.map(key => [key, state[key] || ''])),
      ...Object.fromEntries(FLAGS.map(key => [key, !!state[key]]))
    },
    columns: ordered,
    format: ['xlsx', 'csv', 'pdf'].includes(state.reportFormat) ? state.reportFormat : 'xlsx',
    multi: !!state.reportMulti
  };
}
export function applyReportTemplate(template, state) {
  if (template?.version !== 1 || template.company !== state.company || !OP_REPORTS.includes(template.type))
    throw Error('Modelo incompatível com a empresa ativa.');
  const type = template.type,
    allowed = OP_COLUMNS[type];
  const columns = [...new Set((template.columns || []).filter(key => allowed.includes(key)))];
  if (!columns.length) throw Error('Modelo sem colunas operacionais válidas.');
  const filters = Object.fromEntries(
    FILTERS.filter(key => typeof template.filters?.[key] === 'string').map(key => [key, template.filters[key]])
  );
  if (filters.legalEntity && (state.company !== 'costalog' || !Object.hasOwn(COSTALOG_ENTITIES, filters.legalEntity)))
    throw Error('Empresa inválida no modelo.');
  return {
    ...filters,
    ...Object.fromEntries(FLAGS.map(key => [key, template.filters?.[key] === true])),
    reportSelected: type,
    reportFormat: ['xlsx', 'csv', 'pdf'].includes(template.format) ? template.format : 'xlsx',
    reportMulti: !!template.multi,
    hiddenColumns: { ...state.hiddenColumns, ['report-' + type]: allowed.filter(key => !columns.includes(key)) },
    reportColumnOrder: { ...state.reportColumnOrder, [type]: columns },
    page: 1
  };
}
