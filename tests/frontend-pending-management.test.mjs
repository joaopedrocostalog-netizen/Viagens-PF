import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createWorkflowStore} from '../api/workflow-store.mjs';
import {createPendingService} from '../api/pending-service.mjs';
import {portalResponse} from '../api/portal-render.mjs';
import {permissionsFor} from '../api/access.mjs';
test('portal UI previews a page-only batch, opens archive and notices without DSS, and isolates company switches',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'pending-ui-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=createWorkflowStore({file:join(dir,'workflow.json')}),user={username:'admin',displayName:'João',role:'administrador',permissions:permissionsFor('administrador')};
 const range={from:'2026-10-01',to:'2026-10-23'},payload={updatedAt:new Date().toISOString(),quality:{periods:[{...range,reused:false}]},data:{viagens:[],pedidos:Array.from({length:63},(_,i)=>({empresa:i===62?'Ideallog':'CRC',pf_id:i+1,nro_pf:'PF-'+i,cliente_nome:i===62?'Cliente Ideal':'Cliente CRC',data_emissao:'01/10/2026'})),sources:{viagens:true,pedidos:true}}};
 const snapshot={...range,payload},sessions={get:()=>snapshot},service=createPendingService({store,sessions});
 const events={},storage=new Map(),fields={loginUser:{value:'admin'},loginPassword:{value:'password'},pendingSelectionCount:{textContent:''},pendingBatchButton:{disabled:true},batchStatus:{value:'resolvida'},batchPriority:{value:''},batchComment:{value:''},batchResolutionReason:{value:'Conferência de lote'},batchChangeOwner:{checked:false},batchChangeDue:{checked:false},policyApplyUnscheduled:{checked:true}};
 const root={innerHTML:'',addEventListener:(type,callback)=>events[type]=callback};
 globalThis.document={getElementById:id=>id==='app'?root:fields[id]||null,querySelector(){return null;},querySelectorAll(){return [];},addEventListener(){}};
 globalThis.window={location:{protocol:'file:',origin:'https://teste.local'}};globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
 globalThis.alert=message=>assert.fail(message);globalThis.prompt=()=>null;
 let syncCalls=0;const calls=[];
 const reply=(body,status=200)=>({ok:status<300,status,json:async()=>body});
 globalThis.fetch=async(url,options={})=>{
  const u=new URL(url),company=u.searchParams.get('company')||'costalog',body=options.body?JSON.parse(options.body):{};calls.push(u.pathname);
  if(u.pathname==='/api/login')return reply({portalVersion:2,token:'token',user,permissions:user.permissions,workflowStorage:{durable:false}});
  if(u.pathname==='/api/logout')return reply({});
  if(u.pathname==='/api/preferences')return reply({storage:'browser',revision:0,values:{}});
  if(u.pathname==='/api/portal/sync'){syncCalls++;await service.observed(payload,{...range});return reply({status:'complete',snapshot:'snapshot',id:'job'},202);}
  if(u.pathname==='/api/workflow/actions'){try{return reply(await service.action(company,body,user));}catch(e){return reply({error:e.message},e.status||400);}}
  if(u.pathname.startsWith('/api/portal/'))return reply(await portalResponse({action:u.pathname.split('/').at(-1),input:body,snapshot,user,company,workflowStore:store,portalSessions:sessions}));
  assert.fail(u.pathname);
 };
 const tick=()=>new Promise(resolve=>setTimeout(resolve,50)),click=(selector,dataset)=>events.click({target:{closest:key=>key===selector?{dataset}:null}}),change=(id,value)=>events.change({target:{id,value,dataset:{}}}),submit=id=>events.submit({target:{id},preventDefault(){}});
 await import('../src/app.js?pending-management=1');click('[data-action]',{action:'connect'});submit('loginForm');await tick();
 change('from',range.from);change('to',range.to);click('[data-action]',{action:'refresh'});await tick();
 click('[data-nav]',{nav:'pendencias'});await tick();assert(root.innerHTML.includes('Prazos por tipo'));assert.equal((root.innerHTML.match(/data-alert-manage/g)||[]).length,25);
 events.change({target:{dataset:{},checked:true,hasAttribute:key=>key==='data-pending-select-page'}});assert.equal(fields.pendingSelectionCount.textContent,'25 selecionadas');assert.equal(fields.pendingBatchButton.disabled,false);
 click('[data-pending-action]',{pendingAction:'batch'});submit('pendingBatchForm');await tick();assert(root.innerHTML.includes('Confirmar aplicação'));assert.equal((await store.get('costalog','cte_pendente:ctes:crc~1')).status,'aberta');
 click('[data-pending-action]',{pendingAction:'apply-batch'});await tick();assert.equal((await store.get('costalog','cte_pendente:ctes:crc~1')).status,'resolvida');assert.equal((await store.get('costalog','cte_pendente:ctes:crc~26')).status,'aberta');
 click('[data-pending-tab]',{pendingTab:'archive'});await tick();assert(root.innerHTML.includes('ARQUIVO DE PENDÊNCIAS TRATADAS'));assert(root.innerHTML.includes('Conferência de lote'));assert.equal((root.innerHTML.match(/data-alert-manage/g)||[]).length,25);assert.equal(syncCalls,1);
 click('[data-pending-action]',{pendingAction:'rules'});await tick();events.change({target:{dataset:{pendingRule:'cte_pendente'},value:'3'}});submit('pendingRulesForm');await tick();assert.equal((await store.policy('costalog')).days.cte_pendente,3);assert((await store.get('costalog','cte_pendente:ctes:crc~26')).due);
 click('[data-pending-action]',{pendingAction:'notices'});await tick();assert(root.innerHTML.includes('Sem responsável'));
 click('[data-pending-notice]',{pendingNotice:'sem_responsavel'});await tick();assert(root.innerHTML.includes('AVISOS DA OPERAÇÃO'));assert(root.innerHTML.includes('37 registros'));assert.equal(syncCalls,1);
 click('[data-action]',{action:'switch-company'});await tick();assert(root.innerHTML.includes('Cliente Ideal'));assert(!root.innerHTML.includes('Conferência de lote'));assert.equal(syncCalls,1);
});
