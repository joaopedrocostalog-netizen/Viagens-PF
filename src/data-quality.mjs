import { KM_FROM_API } from './data-availability.mjs';
import { COMPANIES, COSTALOG_ENTITIES } from './companies.mjs';
import { memoView } from './view-cache.mjs';
const h = value =>
  String(value ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const dt = value => (value ? new Date(value).toLocaleString('pt-BR') : 'Não informada');
const day = value => (value ? value.slice(8, 10) + '/' + value.slice(5, 7) + '/' + value.slice(0, 4) : '—');
function renderQualityBody(state, data) {
  const company = COMPANIES[state.company]?.label || 'Costalog',
    entity = COSTALOG_ENTITIES[state.legalEntity];
  const details = memoView('quality', [data], () => ({
    missingDrivers: (data.viagens || []).filter(v => !v.motoristaNome).length,
    missingKm: (data.viagens || []).filter(v => !Number.isFinite(v.kmRodados)).length,
    missingLink: (data.pedidos || []).filter(p => !p.viagemId).length
  }));
  const labels = {
    viagens: 'Viagens',
    pedidos: 'Pedidos',
    motoristas: 'Cadastro de motoristas',
    ocorrencias: 'Ocorrências',
    rotas: 'Cadastro de rotas',
    programacoes: 'Programações',
    mdfes: 'MDF-e'
  };
  const statuses = {
    ok: 'Consultada',
    disabled: 'Não configurada',
    unavailable: 'Indisponível',
    skipped: 'Não consultada',
    reference: 'Somente referências'
  };
  const metadata = state.syncMetadata || [],
    sources = new Map();
  for (const window of metadata)
    for (const source of window.sources || []) {
      const values = sources.get(source.name) || new Set();
      values.add(source.status);
      sources.set(source.name, values);
    }
  const partial = [...sources.values()].some(values => [...values].some(v => ['unavailable', 'skipped'].includes(v)));
  const periods = metadata.flatMap(window => window.periods || []).sort((a, b) => a.from.localeCompare(b.from));
  const range = state.loadedRange;
  return (
    '<section class="data-quality" aria-label="Atualização e qualidade dos dados"><div class="data-quality-summary"><strong>' +
    h(company + (entity ? ' · ' + entity : '')) +
    '</strong><span>Consulta: ' +
    h(day(state.from)) +
    ' a ' +
    h(day(state.to)) +
    '</span><span>' +
    (state.mode === 'demo' ? 'Demonstração · dados fictícios' : 'Última consulta concluída: ' + h(dt(state.lastSync))) +
    '</span>' +
    (state.mode === 'live'
      ? '<span class="pill ' +
        (state.error || partial ? 'yellow' : 'gray') +
        '">' +
        (state.error
          ? 'Atualização falhou'
          : partial
            ? 'Fontes complementares incompletas'
            : state.lastSync
              ? 'Dados consultados'
              : 'Aguardando consulta') +
        '</span>'
      : '') +
    '</div>' +
    '<div class="quality-details"><p class="help">' +
    (range
      ? 'Período carregado: ' + h(day(range.from)) + ' a ' + h(day(range.to)) + '.'
      : 'Nenhum período real carregado.') +
    ' Data da consulta não significa que todos os meses foram renovados na DSS.</p>' +
    '<div class="quality-sources">' +
    [...sources]
      .map(
        ([name, values]) =>
          '<div><strong>' +
          h(labels[name] || name) +
          '</strong><span>' +
          h([...values].map(v => statuses[v] || 'Não informada').join(' / ')) +
          '</span></div>'
      )
      .join('') +
    '</div>' +
    (state.mode === 'live' && !sources.size
      ? '<p class="help">O servidor não informou a disponibilidade das fontes complementares. Uma lista vazia não confirma ausência de registros.</p>'
      : '') +
    (periods.length
      ? '<ul class="quality-periods">' +
        periods
          .map(
            p => '<li>' + h(day(p.from)) + ' a ' + h(day(p.to)) + ' · Atualizado na DSS: ' + h(dt(p.syncedAt)) + '</li>'
          )
          .join('') +
        '</ul>'
      : '') +
    '<p class="help">Nos dados exibidos: ' +
    details.missingDrivers +
    ' RVs sem nome do motorista; ' +
    (KM_FROM_API ? details.missingKm + ' RVs sem KM informado; ' : '') +
    details.missingLink +
    ' pedidos sem RV localizada no período.</p></div></section>'
  );
}

const notes = {
  ctes: 'CT-e é identificado por número válido informado na DSS. Uma RV não localizada pode estar fora do período consultado; isso não comprova irregularidade fiscal.',
  mdfes:
    'Referências de MDF-e não comprovam autorização ou situação fiscal. A conciliação usa somente vínculos documentais disponíveis.',
  pendencias:
    'Os alertas são calculados sobre os registros consultados. O tratamento é registrado no portal e não altera a situação oficial na DSS.',
  rotas:
    'KM médio considera somente RVs com quilometragem informada. Não há localização GPS nem produtividade presumida.',
  motoristas: 'Agrupamento por ID ou nome fornecido. KM médio considera somente RVs com KM informado.',
  painel:
    'Indicadores usam os registros da empresa, período e filtros ativos. Preferências do painel são separadas por usuário e empresa.',
  relatorios:
    'Modelos guardam somente preferências por usuário e empresa. CSV/Excel/PDF respeitam os filtros; a prévia exibe 25 registros por página.',
  comparativos:
    'Variação percentual não é calculada quando o período anterior é zero. Quilometragem ausente não equivale a zero.'
};
export function renderDataQuality(state, data) {
  if (!state.user || state.role !== 'administrador' || !state.permissions?.admin) return '';
  return (
    '<details id="technicalInfo" class="technical-footer" ' +
    (state.technicalOpen ? 'open' : '') +
    '><summary aria-label="Informações técnicas e qualidade dos dados" title="Informações técnicas"><span aria-hidden="true">⌄</span><span class="sr-only">Informações técnicas e qualidade dos dados</span></summary>' +
    (state.technicalOpen
      ? '<h2>Informações técnicas</h2>' +
        renderQualityBody(state, data) +
        (notes[state.view] ? '<p class="help">' + h(notes[state.view]) + '</p>' : '') +
        (state.error ? '<p class="help">Última falha: ' + h(state.error) + '</p>' : '')
      : '') +
    '</details>'
  );
}
