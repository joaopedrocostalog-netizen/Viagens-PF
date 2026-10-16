/** Regras visuais: segurança real é aplicada em api/access.mjs no servidor. */
export const OP_VIEWS=['painel','graficos','viagens','ctes','entregas','pendencias','rotas','veiculos','motoristas','containers','mdfes','relatorios'];
export const FIN_VIEWS=['faturamento','clientes','analises'];
export const ADMIN_VIEWS=['administracao','integracoes'];
export const OP_REPORTS=['viagens','pedidos','ctes','rotas','veiculos','motoristas','containers','mdfes','pendencias','mensal'];
const OP_COLUMNS={
 viagens:['numero','data','dataTermino','cliente','placa','motoristaId','container','nroMdf','origem','destino','kmPrevisto','kmRodados','status'],
 pedidos:['pedidoNumero','cteNumero','data','dataCte','cliente','motoristaNome','placa','container','rvReferencia','nroMdf','entregaConcluida','comprovanteEntrega','ocorrencia','status'],
 ctes:['pedidoNumero','cteNumero','dataCte','cliente','rvReferencia','viagemId','nroMdf','status'],
 rotas:['name','viagens','km'],
 veiculos:['name','viagens','km'],
 motoristas:['name','orders','ctes'],
 containers:['name','viagens','pedidos','lastDate'],
 mdfes:['numero','data','viagemId','placa','status'],
 pendencias:['type','level','recordId','title','detail','refDate'],
 mensal:['month','trips','orders','ctes','km']
};
export function permittedView(role,view){
 if(ADMIN_VIEWS.includes(view))return role==='administrador';
 if(FIN_VIEWS.includes(view))return role==='financeiro'||role==='administrador';
 return OP_VIEWS.includes(view)&&['operacional','financeiro','administrador'].includes(role);
}
export function reportTypesFor(role){
 return role==='financeiro'||role==='administrador'?[...OP_REPORTS,'clientes']:OP_REPORTS.slice();
}
export function secureReport(report,type,role){
 if(!reportTypesFor(role).includes(type))throw Error('Relatório não permitido para este perfil.');
 if(role==='financeiro'||role==='administrador')return report;
 const columns=report.columns.filter(([key])=>OP_COLUMNS[type]?.includes(key));
 return {...report,columns};
}
export function safeView(role,view){return permittedView(role,view)?view:'painel';}
