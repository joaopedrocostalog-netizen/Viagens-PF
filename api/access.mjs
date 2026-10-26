import { scopeCompanyData } from '../src/companies.mjs';
/** Projeção de resposta DSS por papel: proteção acontece ANTES da resposta HTTP. */
export const ROLE_PERMISSIONS = Object.freeze({
  operacional: Object.freeze({ operacional: true, financeiro: false, admin: false }),
  financeiro: Object.freeze({ operacional: true, financeiro: false, admin: false }),
  administrador: Object.freeze({ operacional: true, financeiro: false, admin: true })
});
export function permissionsFor(role) {
  return ROLE_PERMISSIONS[role] || null;
}
export const OPERATIONAL_VIEWS = Object.freeze([
  'painel',
  'programacao',
  'comparativos',
  'relatorios',
  'viagens',
  'ctes',
  'entregas',
  'pendencias',
  'rotas',
  'veiculos',
  'motoristas',
  'mdfes',
  'ocorrencias'
]);
export const FINANCIAL_VIEWS = Object.freeze([]);
export const ADMIN_VIEWS = Object.freeze([]);
export const OPERATIONAL_REPORTS = Object.freeze([
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
export const FINANCIAL_REPORTS = Object.freeze([]); // Este portal publica somente relatórios operacionais.
export function canView(role, view) {
  const p = permissionsFor(role);
  if (!p) return false;
  if (ADMIN_VIEWS.includes(view)) return p.admin;
  if (FINANCIAL_VIEWS.includes(view)) return p.financeiro;
  return p.operacional && OPERATIONAL_VIEWS.includes(view);
}
export function canReport(role, type) {
  return OPERATIONAL_REPORTS.includes(type)
    ? !!permissionsFor(role)?.operacional
    : FINANCIAL_REPORTS.includes(type)
      ? !!permissionsFor(role)?.financeiro
      : false;
}
export const OP_TRIPS = Object.freeze([
  'rv_id',
  'nro_rv',
  'tipo_rv',
  'cliente_nome',
  'cidade_inicial',
  'cidade_final',
  'status_rv',
  'data_inicio',
  'data_termino',
  'veiculo_id',
  'motorista_id',
  'motorista_nome',
  'carreta1_id',
  'carreta2_id',
  'carreta3_id',
  'rota_mdf',
  'km_previsto',
  'nro_mdf',
  'total_km_rodados',
  'programacao_id',
  'nro_programacao',
  'rota_id',
  'empresa',
  'cliente_predominante',
  'nro_container',
  'placa_veiculo',
  'proprietario',
  'created_on'
]);
export const OP_ORDERS = Object.freeze([
  'pf_id',
  'nro_pf',
  'nro_cte',
  'tipo_cte',
  'status_pedido',
  'data_emissao',
  'veiculo_id',
  'motorista_id',
  'motorista_nome',
  'operacao_transporte',
  'entrega_concluida',
  'comprovante_entrega',
  'ocorrencia',
  'nro_mdf',
  'tipo_servico',
  'programacao_id',
  'nro_programacao',
  'processo_id',
  'numero_processo',
  'cliente_nome',
  'cidade_origem',
  'cidade_destino',
  'tipo_documento',
  'nro_documento',
  'placa_veiculo',
  'empresa',
  'data_emissao_cte',
  'remetente',
  'destinatario',
  'nro_container',
  'local_coleta',
  'produto_predominante',
  'nro_ref_cliente',
  'rv_viagem'
]);
function project(row, allowed) {
  const result = {};
  if (!row || typeof row !== 'object') return result;
  for (const field of allowed) if (Object.hasOwn(row, field)) result[field] = row[field];
  return result;
}
export function projectOverview(raw, role, company = null) {
  const permissions = permissionsFor(role);
  if (!permissions) throw new Error('Papel de acesso inválido');
  const payload = company ? scopeCompanyData(raw?.data || {}, company) : raw?.data || {};
  const cleaned = {
    viagens: (payload.viagens || []).map(x => project(x, OP_TRIPS)),
    pedidos: (payload.pedidos || []).map(x => project(x, OP_ORDERS)),
    ctes: (payload.ctes || []).map(x => project(x, OP_ORDERS)),
    mdfes: (payload.mdfes || []).map(x =>
      project(x, [
        'empresa',
        'nro_mdf',
        'numero',
        'numeroMDFe',
        'nroMDFe',
        'nrMDFe',
        'data_emissao',
        'data',
        'rv_id',
        'viagemId',
        'idViagem',
        'rv_viagem',
        'placa_veiculo',
        'placa',
        'status',
        'situacao'
      ])
    ),
    rotas: (payload.rotas || []).map(x =>
      project(x, ['rota_id', 'km_previsto_rota', 'dsc_rota', 'cidade_origem_rota', 'cidade_destino_rota'])
    ),
    programacoes: (payload.programacoes || []).map(x =>
      project(x, [
        'empresa',
        'programacao_id',
        'nro_programacao',
        'rv_id',
        'nro_rv',
        'pf_id',
        'motorista_id',
        'veiculo_id',
        'data_emissao',
        'nro_cte'
      ])
    ),
    ocorrencias: (payload.ocorrencias || []).map(x =>
      project(x, [
        'empresa',
        'rv_id',
        'nro_rv',
        'pf_id',
        'nro_mdf',
        'ocorrencia_id',
        'data_ocorrencia',
        'descricao',
        'veiculo_id',
        'placa_veiculo',
        'ocorrencia_de',
        'relato',
        'causa_raiz',
        'providencia_tomada',
        'responsavel_atendimento',
        'envolvido',
        'data',
        'status'
      ])
    ),
    sources: payload.sources
  };
  const { quality, ...publicRaw } = raw || {};
  return {
    ...publicRaw,
    ...(permissions.admin ? { quality } : {}),
    permissions,
    role,
    ...(company ? { company } : {}),
    data: cleaned
  };
}

/** A única consulta DSS já contém as duas empresas; projetar cada conjunto antes de enviar. */
export function projectPortalOverview(raw, role, company, { includeCompanies = false } = {}) {
  const { companions, ...payload } = raw || {};
  const primary = projectOverview(payload, role, company);
  if (!includeCompanies) return primary;
  const other = company === 'costalog' ? 'ideallog' : 'costalog';
  return { ...primary, companions: { [other]: projectOverview(payload, role, other) } };
}
