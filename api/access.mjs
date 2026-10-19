/** Projeção de resposta DSS por papel: proteção acontece ANTES da resposta HTTP. */
export const ROLE_PERMISSIONS=Object.freeze({
  operacional:Object.freeze({operacional:true,financeiro:false,admin:false}),
  financeiro:Object.freeze({operacional:true,financeiro:true,admin:false}),
  administrador:Object.freeze({operacional:true,financeiro:true,admin:true})
});
export function permissionsFor(role){return ROLE_PERMISSIONS[role]||null;}
export const OPERATIONAL_VIEWS=Object.freeze(['painel','viagens','ctes','entregas','pendencias','rotas','veiculos','motoristas','containers','mdfes','relatorios']);
export const FINANCIAL_VIEWS=Object.freeze(['faturamento','clientes','analises']);
export const ADMIN_VIEWS=Object.freeze(['administracao','integracoes']);
export const OPERATIONAL_REPORTS=Object.freeze(['viagens','pedidos','ctes','rotas','veiculos','motoristas','containers','mdfes','pendencias','mensal']);
export const FINANCIAL_REPORTS=Object.freeze(['clientes']); // Exportações de operações terão ainda colunas financeiros removidas no navegador
export function canView(role,view){
 const p=permissionsFor(role);if(!p)return false;
 if(ADMIN_VIEWS.includes(view))return p.admin;
 if(FINANCIAL_VIEWS.includes(view))return p.financeiro;
 return p.operacional && OPERATIONAL_VIEWS.includes(view);
}
export function canReport(role,type){
 return OPERATIONAL_REPORTS.includes(type)?!!permissionsFor(role)?.operacional:FINANCIAL_REPORTS.includes(type)?!!permissionsFor(role)?.financeiro:false;
}
export const OP_TRIPS=Object.freeze([
 'rv_id','nro_rv','tipo_rv','cliente_nome','cidade_inicial','cidade_final','status_rv',
 'data_inicio','data_termino','veiculo_id','motorista_id','motorista_nome','carreta1_id','carreta2_id',
 'carreta3_id','rota_mdf','km_previsto','nro_mdf','total_km_rodados',
 'programacao_id','nro_programacao','rota_id','empresa','cliente_predominante',
 'nro_container','placa_veiculo','proprietario','created_on'
]);
export const OP_ORDERS=Object.freeze([
 'pf_id','nro_pf','nro_cte','tipo_cte','status_pedido','data_emissao',
 'veiculo_id','motorista_id','motorista_nome','operacao_transporte',
 'entrega_concluida','comprovante_entrega','ocorrencia','nro_mdf','tipo_servico',
 'programacao_id','nro_programacao','processo_id','numero_processo',
 'cliente_nome','cidade_origem','cidade_destino','tipo_documento','nro_documento',
 'placa_veiculo','empresa','data_emissao_cte','remetente','destinatario',
 'nro_container','local_coleta','produto_predominante','nro_ref_cliente','rv_viagem'
]);
const PII=new Set(['motorista_cpf','cliente_cnpjcpf','created_by']);
function project(row,allowed){
 const result={};
 if(!row||typeof row!=='object')return result;
 for(const field of allowed)if(Object.hasOwn(row,field))result[field]=row[field];
 return result;
}
export function projectOverview(raw,role){
 const permissions=permissionsFor(role);
 if(!permissions)throw new Error('Papel de acesso inválido');
 const payload=raw?.data||{};
 const operationalOnly=!permissions.financeiro;
 const cleaned={
  viagens:(payload.viagens||[]).map(x=>operationalOnly?project(x,OP_TRIPS):Object.fromEntries(Object.entries(x).filter(([k])=>!PII.has(k)))),
  pedidos:(payload.pedidos||[]).map(x=>operationalOnly?project(x,OP_ORDERS):Object.fromEntries(Object.entries(x).filter(([k])=>!PII.has(k)))),
  ctes:(payload.ctes||[]).map(x=>operationalOnly?project(x,OP_ORDERS):Object.fromEntries(Object.entries(x).filter(([k])=>!PII.has(k)))),
  mdfes:(payload.mdfes||[]).map(x=>operationalOnly?project(x,['nro_mdf','numero','numeroMDFe','nroMDFe','nrMDFe','data_emissao','data','rv_id','viagemId','idViagem','rv_viagem','placa_veiculo','placa','status','situacao']):Object.fromEntries(Object.entries(x).filter(([k])=>!PII.has(k)))),
  sources:payload.sources
 };
 return {...raw,permissions,role,data:cleaned};
}
