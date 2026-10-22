/** Regras visuais: segurança real é aplicada em api/access.mjs no servidor. */
export const OP_VIEWS=['viagens','ctes','entregas','pendencias','rotas','veiculos','motoristas','mdfes','ocorrencias'];
export const FIN_VIEWS=[];
export const ADMIN_VIEWS=[];
export const OP_REPORTS=['viagens','pedidos','mdfes'];
const OP_COLUMNS={
 viagens:['numero','data','dataTermino','cliente','placa','motoristaId','container','nroMdf','origem','destino','kmPrevisto','kmRodados','desvioKm','status'],
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
 return ['operacional','financeiro','administrador'].includes(role)?OP_REPORTS.slice():[];
}
export function secureReport(report,type,role){
 if(!reportTypesFor(role).includes(type))throw Error('Relatório não permitido para este perfil.');
 const columns=report.columns.filter(([key])=>OP_COLUMNS[type]?.includes(key));
 const rows=report.rows.map(row=>Object.fromEntries(columns.map(([key])=>[key,row[key]])));
 return {...report,columns,rows};
}
export function safeView(role,view){return permittedView(role,view)?view:'viagens';}

/** Mesmo em demonstração ou conectado a um backend antigo, este portal não mostra finanças. */
export function operationalPermissions(permissions={}){
 return {...permissions,financeiro:false};
}
const TRIP_DETAILS=[...OP_COLUMNS.viagens,'id','rvId','motoristaNome','pedidosVinculados','tipoRv','veiculoId','carreta1Id','carreta2Id','carreta3Id','rotaMdf','solicitacaoMonitoramento','programacaoId','nroProgramacao','rotaId','kmPrevistoFonte','empresa','clientePredominante','proprietario','createdOn'];
const ORDER_DETAILS=[...OP_COLUMNS.pedidos,'id','numero','viagemId','isCte','origem','destino','tipoCte','tipoDocumento','numeroPf','veiculoId','motoristaId','operacaoTransporte','tipoServico','processoId','numeroProcesso','nroProgramacao','programacaoId','empresa','remetente','destinatario','localColeta','produtoPredominante','refCliente','numeroDocumento','matchMethod','ambiguous'];
function operationalRow(row,keys){return Object.fromEntries(keys.filter(key=>Object.hasOwn(row,key)).map(key=>[key,row[key]]));}
export function operationalDataset(data){
 return {...data,viagens:(data.viagens||[]).map(row=>operationalRow(row,TRIP_DETAILS)),
  pedidos:(data.pedidos||[]).map(row=>operationalRow(row,ORDER_DETAILS)),
  ctes:(data.ctes||[]).map(row=>operationalRow(row,ORDER_DETAILS))};
}
