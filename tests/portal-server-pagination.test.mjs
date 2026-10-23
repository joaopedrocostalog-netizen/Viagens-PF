import test from 'node:test';
import assert from 'node:assert/strict';
import {portalResponse} from '../api/portal-render.mjs';
import {createPortalSessions} from '../api/portal-sessions.mjs';
import {permissionsFor} from '../api/access.mjs';
const user={username:'operador',displayName:'Operador',role:'operacional',permissions:permissionsFor('operacional')};
const range={from:'2026-10-01',to:'2026-10-23'};
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
const workflowStore={get:async()=>({})};
const payload={updatedAt:'2026-10-23T15:00:00Z',data:{
 viagens:Array.from({length:151},(_,i)=>({empresa:i===150?'Ideallog':'CRC',rv_id:i+1,nro_rv:'RV-'+String(i+1).padStart(3,'0'),status_rv:i%2?'Viajando':'Finalizado',tipo_rv:'RODO',cliente_nome:'CLIENTE-'+i,placa_veiculo:'ABC'+String(i).padStart(4,'0'),data_inicio:'10/10/2026',cidade_inicial:'Santos'+i,cidade_final:'São Paulo',motorista_id:i+1,motorista_nome:'Motorista '+i,total_frete:999999})),
 pedidos:Array.from({length:151},(_,i)=>({empresa:i===150?'Ideallog':'CRC',pf_id:i+1,nro_pf:'PF-'+String(i+1).padStart(3,'0'),nro_cte:i+10,rv_viagem:'RV-'+String(i+1).padStart(3,'0'),cliente_nome:'CLIENTE-'+i,data_emissao:'10/10/2026',entrega_concluida:true,comprovante_entrega:false,total_frete:888888,nro_mdf:i+1,motorista_id:i+1})),sources:{viagens:true,pedidos:true,ctes:false,mdfes:false,ocorrencias:false,programacoes:false}}};
const snapshot={...range,payload};
function response(view,{page=1,company='costalog',...state}={}){return portalResponse({action:view==='painel'?'metrics':'view',input:{state:{...range,view,page,sortDir:'asc',filter:'todos',alertPriority:'todos',alertKind:'todos',reportSelected:'viagens',dayDate:'2026-10-10',...state}},snapshot,user,company,workflowStore});}

test('all portal lists paginate on server; next pages and other company records never leave response',async()=>{
 for(const view of ['viagens','ctes','entregas','mdfes','pendencias','rotas','veiculos','motoristas','programacao','relatorios','ocorrencias']){
  const first=await response(view);
  assert(!JSON.stringify(first).includes('999999'));assert(!JSON.stringify(first).includes('888888'));assert(!JSON.stringify(first).includes('CLIENTE-150'),view);
  assert.equal(first.page,1);assert(first.html.length<180000,view);
  if(['viagens','ctes','entregas','programacao','relatorios'].includes(view)){
   assert.equal((first.html.match(/<tbody>/g)||[]).length,1,view);
   const tbody=first.html.split('<tbody>')[1].split('</tbody>')[0];assert.equal((tbody.match(/<tr>/g)||[]).length,25,view);
   const second=await response(view,{page:2});assert.equal(second.page,2);assert.notEqual(second.html,first.html,view);
  }
 }
 const ideal=await response('viagens',{company:'ideallog'});assert(ideal.html.includes('CLIENTE-150'));assert(!ideal.html.includes('CLIENTE-149'));
});
test('metrics, filters, RV stages and explicit full exports use the same server dataset',async()=>{
 const panel=await response('painel');assert(panel.html.includes('150'));assert(!panel.html.includes('CLIENTE-100'));assert(!panel.html.includes('<tbody><tr><td><button class="row-link"'));
 const stage=await response('ctes',{rvStage:'Viajando'});assert(stage.hero.includes('75 RVs'));assert(stage.hero.includes('75 pedidos'));
 const filtered=await response('ctes',{customer:'CLIENTE-101',filtersOpen:true});assert(filtered.html.includes('PF-102'));assert(!filtered.html.includes('PF-101'));
 const exported=await portalResponse({action:'export',input:{type:'viagens',state:{...range,view:'viagens',sortDir:'asc'}},snapshot,user,company:'costalog',workflowStore});assert.equal(exported.models[0].rows.length,150);assert(!JSON.stringify(exported).includes('999999'));
 const hidden=await response('ctes');assert(!hidden.technical.includes('Informações técnicas'));assert(!JSON.stringify(hidden).includes('quality'));
});
test('sync jobs publish atomically, enforce ownership and really abort their source',async()=>{
 let finish,signal;
 const sessions=createPortalSessions({synchronize:async(a,b,options)=>{signal=options.signal;options.onProgress({key:'rv',label:'Viagens',status:'running'});return new Promise(resolve=>{finish=resolve;});}});
 const job=sessions.start(range,user);await tick();assert.equal(sessions.status(job.id,user).status,'running');assert.throws(()=>sessions.status(job.id,{username:'outro'}),{status:404});
 sessions.cancel(job.id,user);assert(signal.aborted);finish(payload);await tick();assert.equal(sessions.status(job.id,user).snapshot,null);
 const completed=sessions.start(range,user);await tick();finish(payload);await tick();const status=sessions.status(completed.id,user);assert.equal(status.status,'complete');assert.equal(sessions.get(status.snapshot,user).payload,payload);assert.throws(()=>sessions.get(status.snapshot,{username:'outro'}),{status:404});
 assert.throws(()=>sessions.start({from:'2026-02-30',to:'2026-03-01'},user),{status:400});
});

test('RV stage links occurrences only by unambiguous entity references, never by plate',async()=>{
 const {filterRvStage}=await import('../src/rv-stage-filter.mjs');
 const source={viagens:[{id:'crc~1',rvId:'1',numero:'10',empresa:'CRC',status:'Viajando',placa:'ABC1234'},{id:'comex~1',rvId:'1',numero:'10',empresa:'Comex',status:'Finalizado',placa:'ABC1234'}],pedidos:[],ctes:[],mdfes:[],ocorrencias:[{id:'a',empresa:'CRC',rv_id:1},{id:'b',empresa:'Comex',rv_id:1},{id:'c',empresa:'CRC',placa:'ABC1234'},{id:'d',empresa:'',rv_id:1}]};
 assert.deepEqual(filterRvStage(source,'Viajando').ocorrencias.map(o=>o.id),['a']);
});

test('server detail renderer opens an authorized RV without exposing another company',async()=>{
 const result=await portalResponse({action:'detail',input:{state:{...range,view:'viagens',selected:'viagens:crc~1',timelinePage:1}},snapshot,user,company:'costalog',workflowStore});
 assert(result.html.includes('Detalhes'));assert(result.html.includes('RV-001'));assert(!result.html.includes('CLIENTE-150'));
});
