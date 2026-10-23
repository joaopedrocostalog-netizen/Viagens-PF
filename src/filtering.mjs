import {rvStatus,tripActive,tripCompleted} from './rv-status.mjs';
import {companyIdentity} from './companies.mjs';
/** Busca comum: ignora acentos e separadores de placas/documentos; aceita vários termos. */
export const normalizeSearch=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const compact=value=>normalizeSearch(value).replace(/[^a-z0-9]/g,'');
export function matchesSearch(row,query,fields=Object.keys(row).filter(key=>!['empresa','matchMethod','createdOn','isCte','ambiguous','viagemId'].includes(key)&&!(key==='id'&&(row.numero||row.pedidoNumero)))){
 const terms=normalizeSearch(query).replace(/\b(?:rv|cte|mdfe)\s*[:#-]?\s*(?=\d)/g,'').split(/\s+/).filter(Boolean);
 if(!terms.length)return true;
 const values=fields.flatMap(key=>{
  const value=row[key];if(value==null||typeof value==='object')return [];
  if(typeof value==='boolean')return value?['sim','true']:['nao','false'];
  const text=normalizeSearch(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text)?[text,text.slice(8)+'/'+text.slice(5,7)+'/'+text.slice(0,4)]:[text];
 });
 return terms.every(term=>values.some(value=>value.includes(term)||(compact(term)&&compact(value).includes(compact(term)))));
}
export const inPeriod=(row,from,to)=>!row.data||((!from||row.data>=from)&&(!to||row.data<=to));
/** Empresa já deve ter sido delimitada antes deste filtro. */
export function filterOperationalData(data,{from='',to='',customer='',vehicle='',serviceType='',status='',view='',reportSelected='',drilldown='',tripFocus=''}={}){
 const dates=rows=>(rows||[]).filter(row=>inPeriod(row,from,to));
 const focused=tripFocus?(data.viagens||[]).find(row=>row.id===tripFocus):null;
 const focusEntity=focused?companyIdentity(focused):'';
 const uniqueNumber=focused?(data.viagens||[]).filter(row=>companyIdentity(row)===focusEntity&&row.numero===focused.numero).length===1:false;
 const focusRelated=row=>!!focused&&(row.viagemId===tripFocus||!!focusEntity&&companyIdentity(row)===focusEntity&&(row.rv_id!=null?String(row.rv_id)===String(focused.rvId):uniqueNumber&&row.nro_rv!=null&&String(row.nro_rv)===String(focused.numero)));
 const target=view==='relatorios'?reportSelected:view;
 const statusMatches=(row,kind)=>!status||(['viagens','ctes','pedidos','entregas','mdfes','ocorrencias'].includes(target)&&kind!==(target==='ctes'||target==='entregas'?'pedidos':target))||(kind==='viagens'?rvStatus(row.status)===rvStatus(status):row.status===status);
 const base=row=>(!customer||row.cliente===customer)&&(!vehicle||row.placa===vehicle);
 const drillOrder=row=>drilldown==='sem_cte'?!row.isCte:drilldown==='sem_rv'?row.isCte&&!row.viagemId:drilldown==='entregas'?row.entregaConcluida===true&&row.comprovanteEntrega===false:drilldown==='ctes'?row.isCte:true;
 const drillTrip=row=>{return drilldown==='andamento'?tripActive(row.status):drilldown==='concluidas'?tripCompleted(row.status):drilldown==='km'?Number.isFinite(row.kmRodados):true;};
 const pedidos=dates(data.pedidos).filter(row=>(!tripFocus||!!focused&&row.viagemId===tripFocus)&&drillOrder(row)&&base(row)&&statusMatches(row,'pedidos')&&(!serviceType||row.tipoServico===serviceType));
 const ctes=dates(data.ctes).filter(row=>(!tripFocus||!!focused&&row.viagemId===tripFocus)&&drillOrder(row)&&base(row)&&statusMatches(row,'pedidos')&&(!serviceType||row.tipoServico===serviceType));
 const serviceTrips=new Set([...pedidos,...ctes].map(row=>row.viagemId).filter(Boolean));
 const viagens=dates(data.viagens).filter(row=>(!tripFocus||row.id===tripFocus)&&drillTrip(row)&&base(row)&&statusMatches(row,'viagens')&&(!serviceType||serviceTrips.has(row.id)));
 const tripIds=new Set(viagens.map(row=>row.id)),tripRefs=new Set(viagens.flatMap(row=>[row.id,row.rvId,row.numero]).filter(Boolean).map(String));
 const orderIds=new Set(pedidos.flatMap(row=>[row.id,row.pedidoNumero]).filter(Boolean).map(String));
 const documents=new Set([...viagens,...pedidos,...ctes].map(row=>row.nroMdf).filter(Boolean).map(String));
 const related=row=>tripIds.has(row.viagemId)||[row.rv_id,row.nro_rv].some(id=>id!=null&&tripRefs.has(String(id)))||[row.pf_id,row.pedidoNumero].some(id=>id!=null&&orderIds.has(String(id)))||[row.numero,row.nroMdf,row.nro_mdf].some(id=>id!=null&&documents.has(String(id)));
 const relatedFilter=(row,kind)=>(!tripFocus||focusRelated(row))&&(!vehicle||row.placa===vehicle)&&statusMatches(row,kind)&&(!(customer||serviceType)||related(row));
 return {...data,viagens,pedidos,ctes,mdfes:dates(data.mdfes).filter(row=>relatedFilter(row,'mdfes')),programacoes:dates(data.programacoes).filter(row=>(!tripFocus||row.viagemId===tripFocus)&&(!(customer||vehicle||serviceType)||tripIds.has(row.viagemId))),ocorrencias:dates(data.ocorrencias).filter(row=>relatedFilter(row,'ocorrencias')),allViagens:data.viagens||[],allPedidos:data.pedidos||[]};
}
export function searchOperationalData(data,query){
 if(!normalizeSearch(query))return data;
 const tripMatches=new Set((data.viagens||[]).filter(row=>matchesSearch(row,query)).map(row=>row.id));
 const orderMatches=new Set((data.pedidos||[]).filter(row=>matchesSearch(row,query)).map(row=>row.id));
 const linked=new Set((data.pedidos||[]).filter(row=>orderMatches.has(row.id)).map(row=>row.viagemId).filter(Boolean));
 return {...data,viagens:(data.viagens||[]).filter(row=>tripMatches.has(row.id)||linked.has(row.id)),
  pedidos:(data.pedidos||[]).filter(row=>orderMatches.has(row.id)||tripMatches.has(row.viagemId)),
  ctes:(data.ctes||[]).filter(row=>orderMatches.has(row.id)||tripMatches.has(row.viagemId)),
  mdfes:(data.mdfes||[]).filter(row=>matchesSearch(row,query)||tripMatches.has(row.viagemId)),
  programacoes:(data.programacoes||[]).filter(row=>matchesSearch(row,query)||tripMatches.has(row.viagemId)),
  ocorrencias:(data.ocorrencias||[]).filter(row=>matchesSearch(row,query))};
}
export function filterLinkedRows(rows,kind,data,filter='todos'){
 if(!['vinculado','pendente'].includes(filter))return rows;
 const connected=new Set([...(data.pedidos||[]),...(data.ctes||[]),...(data.mdfes||[])].map(row=>row.viagemId).filter(Boolean));
 const trips=new Set((data.allViagens||data.viagens||[]).map(row=>row.id));
 return rows.filter(row=>{
  const linked=kind==='viagens'?connected.has(row.id):!!row.viagemId&&(kind!=='mdfes'||trips.has(row.viagemId));
  return filter==='vinculado'?linked:!linked;
 });
}
