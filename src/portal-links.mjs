import {validCompany,COSTALOG_ENTITIES} from './companies.mjs';
import {OP_VIEWS,OP_REPORTS} from './access-ui.mjs';
const day=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const id=value=>/^[a-zA-Z0-9~_.-]{1,180}$/.test(value);
const fields={searchScope:'pesquisa',from:'de',to:'ate',search:'q',customer:'cliente',vehicle:'placa',serviceType:'servico',status:'situacao',filter:'vinculo',tripFocus:'foco',drilldown:'indicador',alertPriority:'prioridade',alertKind:'tipo_pendencia',alertStatus:'situacao_pendencia',alertDue:'prazo_pendencia',alertOwner:'responsavel',alertGroup:'grupo',alertGrouping:'agrupamento',alertScope:'escopo',reportSelected:'relatorio',sortKey:'campo',sortDir:'ordem',dayDate:'dia',compareCurrentFrom:'a_de',compareCurrentTo:'a_ate',comparePreviousFrom:'b_de',comparePreviousTo:'b_ate'};
const choices={searchScope:['aba','portal'],filter:['todos','vinculado','pendente'],drilldown:['viagens','andamento','concluidas','pedidos','ctes','sem_cte','sem_rv','entregas','km'],alertPriority:['todos','high','warning','info'],alertStatus:['todos','ativas','aberta','tratamento','resolvida'],alertDue:['todos','vencidas','hoje','proximas','sem_prazo'],alertScope:['todos','mine'],alertGrouping:['lista','rv'],sortDir:['asc','desc'],reportSelected:OP_REPORTS};
function valid(field,value){
 if(!value||value.length>200)return false;
 if(choices[field])return choices[field].includes(value);
 if(['from','to','dayDate','compareCurrentFrom','compareCurrentTo','comparePreviousFrom','comparePreviousTo'].includes(field)){try{return day(value);}catch{return false;}}
 if(field==='tripFocus')return id(value);
 if(field==='alertGroup')return /^(rv|pf):/.test(value)&&id(value.slice(3));
 if(field==='sortKey'||field==='alertKind')return /^[a-zA-Z][a-zA-Z0-9_]{0,60}$/.test(value);
 return !/[\u0000-\u001f]/.test(value);
}
function allowedId(value,company,entity){
 if(!value.includes('~'))return true;
 const prefix=value.split('~')[0];return entity?prefix===entity:company==='ideallog'?prefix==='ideallog':['costalog','acdacosta','crc','comex'].includes(prefix);
}
export function parsePortalLink(input){
 const url=new URL(typeof input==='string'?input:input.href||((input.origin||'https://portal.invalid')+(input.pathname||'/')+(input.search||'')),'https://portal.invalid');
 const q=url.searchParams,company=validCompany(q.get('empresa'))?q.get('empresa'):'costalog';
 const legalEntity=company==='costalog'&&Object.hasOwn(COSTALOG_ENTITIES,q.get('entidade'))?q.get('entidade'):'';
 const result={company,legalEntity,view:OP_VIEWS.includes(q.get('aba'))?q.get('aba'):'painel'};
 for(const [field,param] of Object.entries(fields)){const value=q.get(param);if(valid(field,value))result[field]=value;}
 for(const field of ['tripFocus','alertGroup'])if(result[field]&&!allowedId(field==='alertGroup'?result[field].slice(3):result[field],company,legalEntity))delete result[field];
 for(const [from,to] of [['from','to'],['compareCurrentFrom','compareCurrentTo'],['comparePreviousFrom','comparePreviousTo']])if(result[from]&&result[to]&&result[from]>result[to]){delete result[from];delete result[to];}
 const record=q.get('registro')||'',at=record.indexOf(':'),kind=record.slice(0,at),recordId=record.slice(at+1);
 if(['viagens','ctes','mdfes'].includes(kind)&&id(recordId)&&allowedId(recordId,company,legalEntity)){result.pendingRecord=record;result.view=kind;}
 return {hasLink:q.has('aba')||q.has('registro'),state:result};
}
/** Only allowlisted filters/IDs leave the page; no tokens, API address, tasks or row payloads. */
export function portalLink(input,state,{record=''}={}){
 const base=typeof input==='string'?input:input.href||((input.origin||'https://portal.invalid')+(input.pathname||'/')+(input.search||''));
 const url=new URL(base,'https://portal.invalid');url.search='';url.hash='';
 url.searchParams.set('empresa',validCompany(state.company)?state.company:'costalog');
 url.searchParams.set('aba',OP_VIEWS.includes(state.view)?state.view:'painel');
 if(state.company==='costalog'&&Object.hasOwn(COSTALOG_ENTITIES,state.legalEntity))url.searchParams.set('entidade',state.legalEntity);
 for(const [field,param] of Object.entries(fields)){const value=String(state[field]||'');if(valid(field,value))url.searchParams.set(param,value);}
 if(record)url.searchParams.set('registro',record);
 // Parse again to validate record namespace and every emitted parameter.
 const checked=parsePortalLink(url.href);if(record&&!checked.state.pendingRecord)url.searchParams.delete('registro');
 return url.href;
}
