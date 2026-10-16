/** COSTALOG - índices e análises baseadas exclusivamente em listarViagens/listarPedidosFrete.
 * Qualquer cálculo de lucro, status fiscal ou rastreamento requer outras fontes.
 */
const ok = x => x !== null && x !== undefined && x !== '';
const value = x => Number.isFinite(x) ? x : null;
const uniq = arr => [...new Set(arr.filter(ok))];
const lc = x => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const km = x => Number.isFinite(x) ? x : 0;
const add = (rows,key,amount) => rows.reduce((n,r)=>n+(Number.isFinite(amount(r))?amount(r):0),0);
const known = (rows,fn) => rows.filter(v=>Number.isFinite(fn(v)));
const result = (rows,fn) => ({sum:add(rows,null,fn),known:known(rows,fn).length,total:rows.length});
const dateKey = d => String(d||'').slice(0,7);
const realStatus = x => lc(x.status||'');
export function groupRows(rows,keyFn){
 const map=new Map();
 rows.forEach(v=>{const key=String(keyFn(v)||'Não informado').trim()||'Não informado';const arr=map.get(key)||[];arr.push(v);map.set(key,arr);});
 return [...map].map(([name,items])=>({name,items,count:items.length}));
}
export function sortRecords(rows,key='data',dir='desc'){
 const flip=dir==='asc'?1:-1;
 return [...rows].sort((a,b)=>{
  const x=a[key],y=b[key];
  if(x===null||x===undefined||x==='')return 1;
  if(y===null||y===undefined||y==='')return -1;
  if(typeof x==='number'&&typeof y==='number')return flip*(x-y);
  return flip*String(x).localeCompare(String(y),'pt-BR',{numeric:true,sensitivity:'base'});
 });
}
export function searchRecords(rows,term,fields){
 const q=lc(String(term||'').trim());
 if(!q)return rows;
 return rows.filter(r=>(fields||Object.keys(r)).some(k=>lc(r[k]).includes(q)));
}
export function monthsOverview(viagens,pedidos,year){
 const start=Number(year);
 return Array.from({length:12},(_,i)=>{
  const key=String(start)+'-'+String(i+1).padStart(2,'0');
  const trips=viagens.filter(v=>dateKey(v.data)===key);
  const orders=pedidos.filter(p=>dateKey(p.data)===key);
  return {month:key,trips:trips.length,orders:orders.length,ctes:orders.filter(p=>p.isCte).length,freight:add(orders,null,p=>p.valor),fuel:add(trips,null,v=>v.abastecimento),km:add(trips,null,v=>v.kmRodados)};
 });
}
export function makeAlerts(data,{asOf=new Date().toISOString().slice(0,10),lateDays=2}={}){
 const trips=data.viagens||[],orders=data.pedidos||[];
 const alerts=[];
 const push=(type,level,recordId,title,detail,view,refDate)=>alerts.push({type,level,recordId,title,detail,view,refDate});
 for(const p of orders){
  if(!p.isCte)push('cte_pendente','high',p.id,'Pedido sem número de CT-e','PF '+(p.pedidoNumero||p.id)+' • '+p.cliente,'ctes',p.data);
  if(p.isCte&&!p.viagemId)push('cte_sem_rv','warning',p.id,'CT-e sem RV localizada na consulta','CT-e '+(p.cteNumero||p.numero)+' • PF '+(p.pedidoNumero||p.id),'ctes',p.data);
  if(p.rvReferencia&&!p.viagemId)push('rv_nao_localizada','warning',p.id,'RV não localizada na consulta','PF '+(p.pedidoNumero||p.id)+' • referência '+p.rvReferencia,'ctes',p.data);
  if(p.ambiguous)push('rv_ambigua','warning',p.id,'Vínculo da RV ambíguo','PF '+(p.pedidoNumero||p.id),'ctes',p.data);
  if(p.entregaConcluida===true&&p.comprovanteEntrega===false)push('comprovante_pendente','high',p.id,'Entrega sem comprovante','PF '+(p.pedidoNumero||p.id)+' • '+p.cliente,'ctes',p.data);
  if(p.liberadoFaturamento===true&&!p.numeroFatura)push('sem_fatura','warning',p.id,'Pedido liberado sem número de fatura','PF '+(p.pedidoNumero||p.id)+' • '+p.cliente,'ctes',p.data);
  if(ok(p.ocorrencia))push('ocorrencia','info',p.id,'Ocorrência registrada','PF '+(p.pedidoNumero||p.id)+' • '+String(p.ocorrencia).slice(0,85),'ctes',p.data);
 }
 for(const v of trips){
  // Não concluir que a viagem não tem pedido: ele pode ter sido emitido fora das datas consultadas.
  if(data.sources?.pedidos===true&&!orders.some(p=>p.viagemId===v.id)){
   push('rv_sem_pedido','info',v.id,'RV sem pedido PF localizado','RV '+v.numero+' • confira também outros períodos de emissão','viagens',v.data);
  }
  const status=realStatus(v),complete=/encerr|conclu|finaliz|entreg/.test(status);
  const active=/inici|transito|andamento|viagem|rota|rodando/.test(status) && !complete;
  if(v.data&&!v.dataTermino&&active){
   const age=(Date.parse(asOf+'T12:00:00Z')-Date.parse(v.data+'T12:00:00Z'))/86400000;
   if(Number.isFinite(age)&&age>lateDays)push('rv_sem_termino','warning',v.id,'RV iniciada sem término informado',v.numero+' • '+Math.floor(age)+' dias desde o início','viagens',v.data);
  }
  if(Number.isFinite(v.kmRodados)&&Number.isFinite(v.kmPrevisto)&&v.kmPrevisto>0&&v.kmRodados>v.kmPrevisto*1.15){
   push('km_acima','info',v.id,'Quilometragem acima do previsto','RV '+v.numero+' • '+Math.round((v.kmRodados/v.kmPrevisto-1)*100)+'% acima','viagens',v.data);
  }
 }
 return sortRecords(alerts,'refDate','desc');
}
export function buildInsights(data,opts={}){
 const viagens=data.viagens||[],pedidos=data.pedidos||[];
 const docs=pedidos.filter(x=>x.isCte);
 const vTotal=new Map((data.allViagens||viagens).map(v=>[v.id,v]));
 const inProgress=viagens.filter(v=>/andamento|inici|transito|rodando|rota/.test(realStatus(v))&&!/conclu|encerr|finaliz/.test(realStatus(v)));
 const finished=viagens.filter(v=>/encerr|conclu|finaliz|entreg/.test(realStatus(v)));
 const withoutTrip=docs.filter(p=>!p.viagemId),withoutCT=pedidos.filter(p=>!p.isCte);
 const missingDelivery=pedidos.filter(p=>p.entregaConcluida===true&&p.comprovanteEntrega===false);
 const readyToInvoice=pedidos.filter(p=>p.liberadoFaturamento===true);
 const withoutInvoice=readyToInvoice.filter(p=>!p.numeroFatura);
 const freight=result(pedidos,p=>p.valor),fuel=result(viagens,v=>v.abastecimento),planned=result(viagens,v=>v.kmPrevisto),actual=result(viagens,v=>v.kmRodados);
 const periodMonths=monthsOverview(viagens,pedidos,opts.year||new Date().getFullYear());
 const customers=groupRows(pedidos,p=>p.cliente).map(g=>{
  const vals=result(g.items,p=>p.valor);
  return {name:g.name,orders:g.count,ctes:g.items.filter(p=>p.isCte).length,freight:vals.sum,freightKnown:vals.known,linkedTrips:uniq(g.items.map(p=>p.viagemId)).length,ticket:vals.known?vals.sum/vals.known:null};
 }).sort((a,b)=>b.freight-a.freight);
 const routes=groupRows(viagens,v=>(v.origem||'Não informado')+' → '+(v.destino||'Não informado')).map(g=>({
  name:g.name,viagens:g.count,km:add(g.items,null,v=>v.kmRodados),fuel:add(g.items,null,v=>v.abastecimento),
  freight:add(g.items,null,v=>v.receita),ids:g.items.map(x=>x.id)
 })).sort((a,b)=>b.viagens-a.viagens);
 const vehicles=groupRows(viagens,v=>v.placa||('Veículo ID '+(v.veiculoId||'?'))).map(g=>({
  name:g.name,viagens:g.count,km:add(g.items,null,v=>v.kmRodados),fuel:add(g.items,null,v=>v.abastecimento),
  freight:add(g.items,null,v=>v.receita),ids:g.items.map(x=>x.id)
 })).sort((a,b)=>b.viagens-a.viagens);
 // motoristas em duas fontes; se o ID não consta na RV, contar apenas pedidos.
 const drivers=groupRows(pedidos,p=>p.motoristaId?('ID '+p.motoristaId+' · '+(p.motoristaNome||'nome não disponível')):p.motoristaNome||'Não informado').map(g=>({
  name:g.name,orders:g.count,freight:add(g.items,null,p=>p.valor),ctes:g.items.filter(p=>p.isCte).length
 })).sort((a,b)=>b.orders-a.orders);
 const containers=groupRows([...viagens.map(v=>({container:v.container,kind:'RV',id:v.id,data:v.data})),...pedidos.map(p=>({container:p.container,kind:'PF',id:p.id,data:p.data}))].filter(x=>ok(x.container)),x=>x.container).map(g=>({
  name:g.name,viagens:g.items.filter(x=>x.kind==='RV').length,pedidos:g.items.filter(x=>x.kind==='PF').length,
  lastDate:g.items.reduce((last,x)=>x.data>last?x.data:last,'')
 })).sort((a,b)=>b.viagens+b.pedidos-a.viagens-a.pedidos);
 const serviceTypes=groupRows(pedidos,p=>p.tipoServico||p.operacaoTransporte).map(g=>({name:g.name,orders:g.count,freight:add(g.items,null,p=>p.valor)})).sort((a,b)=>b.orders-a.orders);
 const insured=pedidos.filter(p=>ok(p.numeroAverbacao)),averbacao=result(pedidos,p=>p.valorAverbacao);
 const alerts=makeAlerts(data,{lateDays:opts.lateDays??2});
 return {totals:{trips:viagens.length,ongoing:inProgress.length,completed:finished.length,orders:pedidos.length,ctes:docs.length,withoutCT:withoutCT.length,withoutTrip:withoutTrip.length,missingDelivery:missingDelivery.length,readyToInvoice:readyToInvoice.length,withoutInvoice:withoutInvoice.length,freight,fuel,planned,actual,kmDifference:actual.known===viagens.length&&planned.known===viagens.length&&viagens.length?actual.sum-planned.sum:null,insured:insured.length,averbacao,uniqueContainers:containers.length,uniqueVehicles:vehicles.filter(v=>v.name!=='Veículo ID ?').length},months:periodMonths,customers,routes,vehicles,drivers,containers,serviceTypes,alerts,uniqueClients:uniq(pedidos.map(p=>p.cliente)).length};
}
export function extractRows(type,data){
 const v=data.viagens||[],p=data.pedidos||[],m=data.mdfes||[],i=buildInsights(data);
 switch(type){
 case 'viagens':return {
  title:'Relatório de viagens (RV)',columns:[['numero','RV'],['data','Início'],['dataTermino','Término'],['cliente','Cliente'],['placa','Placa'],['motoristaId','Motorista ID'],['container','Container'],['nroMdf','Ref. MDF-e'],['origem','Origem'],['destino','Destino'],['kmPrevisto','KM previsto'],['kmRodados','KM rodado'],['desvioKm','Desvio de KM'],['custoAbastecimentoKm','Abastecimento por KM (R$)'],['abastecimento','Abastecimento (R$)'],['receita','Pedidos vinculados (R$)'],['status','Situação']],rows:v};
 case 'pedidos':return {title:'Pedidos de frete e CT-e',columns:[['pedidoNumero','Pedido'],['cteNumero','CT-e'],['data','Emissão'],['dataCte','Emissão CT-e'],['cliente','Cliente'],['motoristaNome','Motorista'],['placa','Placa'],['container','Container'],['rvReferencia','Referência RV'],['nroMdf','Referência MDF-e'],['valor','Frete (R$)'],['valorReceber','A receber (R$)'],['liberadoFaturamento','Liberado faturamento'],['numeroFatura','Fatura'],['entregaConcluida','Entrega concluída'],['comprovanteEntrega','Comprovante'],['ocorrencia','Ocorrência'],['status','Situação']],rows:p};
 case 'ctes':return {title:'CT-e identificados',columns:[['pedidoNumero','Pedido'],['cteNumero','CT-e'],['dataCte','Emissão CT-e'],['cliente','Cliente'],['rvReferencia','Referência RV'],['viagemId','RV vinculada ID'],['nroMdf','MDF-e'],['valor','Frete (R$)'],['status','Situação']],rows:p.filter(x=>x.isCte)};
 case 'clientes':return {title:'Resumo por cliente',columns:[['name','Cliente'],['orders','Pedidos'],['ctes','CT-e'],['linkedTrips','Viagens vinculadas'],['freight','Total fretes (R$)'],['ticket','Ticket médio (R$)']],rows:i.customers};
 case 'rotas':return {title:'Resumo por rota',columns:[['name','Rota'],['viagens','Viagens'],['km','KM rodados'],['fuel','Abastecimento (R$)'],['freight','Fretes vinculados (R$)']],rows:i.routes};
 case 'veiculos':return {title:'Resumo da frota',columns:[['name','Veículo'],['viagens','Viagens'],['km','KM rodados'],['fuel','Abastecimento (R$)'],['freight','Fretes vinculados (R$)']],rows:i.vehicles};
 case 'motoristas':return {title:'Pedidos por motorista',columns:[['name','Motorista'],['orders','Pedidos'],['ctes','CT-e'],['freight','Fretes (R$)']],rows:i.drivers};
 case 'containers':return {title:'Histórico por container',columns:[['name','Container'],['viagens','Registros RV'],['pedidos','Pedidos'],['lastDate','Último registro']],rows:i.containers};
 case 'mdfes':return {title:'Referências de MDF-e',columns:[['numero','MDF-e'],['data','Data'],['viagemId','RV ID'],['placa','Placa'],['status','Situação declarada']],rows:m};
 case 'pendencias':return {title:'Pendências operacionais',columns:[['type','Tipo'],['level','Prioridade'],['recordId','Registro'],['title','Ocorrência'],['detail','Detalhes'],['refDate','Data']],rows:i.alerts};
 case 'mensal':return {title:'Indicadores por mês',columns:[['month','Mês'],['trips','Viagens'],['orders','Pedidos'],['ctes','CT-e'],['freight','Fretes (R$)'],['fuel','Abastecimento (R$)'],['km','KM rodado']],rows:i.months};
 default:throw Error('Relatório desconhecido: '+type);
 }
}
export const REPORT_TYPES=['viagens','pedidos','ctes','clientes','rotas','veiculos','motoristas','containers','mdfes','pendencias','mensal'];
