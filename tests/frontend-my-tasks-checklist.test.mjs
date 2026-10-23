import {projectPortalOverview} from '../api/access.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {operationalToday,updateTask,taskSummary} from '../src/workflow.mjs';

test('Painel pessoal, atribuição à conta e checklist abrem/exportam somente os PFs da RV escolhida',async t=>{
 const events={},storage=new Map(),downloads=[],messages=[],fields={loginUser:{value:'joao.pedro'},loginPassword:{value:'senha-teste'},taskOwner:{value:'João Pedro'},taskDue:{value:operationalToday()},taskPriority:{value:'high'},taskStatus:{value:'tratamento'},taskComment:{value:'Conferir documento'}};
 const root={innerHTML:'',addEventListener:(type,callback)=>events[type]=callback};
 globalThis.document={getElementById:id=>id==='app'?root:fields[id]||null,querySelector(){return null;},addEventListener(){},body:{appendChild(){}},createElement(){return {click(){},remove(){}};}};
 globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
 globalThis.window={location:{protocol:'file:',origin:'https://teste.local'}};
 globalThis.alert=message=>messages.push(message);globalThis.confirm=()=>true;
 const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;
 URL.createObjectURL=blob=>{downloads.push(blob);return 'blob:checklist';};URL.revokeObjectURL=()=>{};
 t.after(()=>{URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;});
 const tasks={costalog:{'cte_pendente:ctes:crc~1':{owner:'João Pedro',ownerUsername:'outro.usuario',status:'aberta',due:operationalToday(),priority:'high',revision:1,comments:[],history:[]}},ideallog:{}};
 const data={viagens:[
  {empresa:'CRC',rv_id:1,nro_rv:100,cliente_nome:'Cliente RV CRC',data_inicio:'01/10/2026',status_rv:'Em andamento'},
  {empresa:'CRC',rv_id:2,nro_rv:101,cliente_nome:'Outro Cliente CRC',data_inicio:'01/10/2026'},
  {empresa:'Comex',rv_id:1,nro_rv:100,cliente_nome:'Cliente Comex',data_inicio:'01/10/2026'},
  {empresa:'Ideallog',rv_id:1,nro_rv:100,cliente_nome:'Cliente Ideal',data_inicio:'01/10/2026'}],pedidos:[
  {empresa:'CRC',pf_id:1,nro_pf:'PF-CRC-1',rv_viagem:100,cliente_nome:'Cliente diferente da RV',data_emissao:'01/10/2026',nro_cte:0,entrega_concluida:false,comprovante_entrega:null},
  {empresa:'CRC',pf_id:2,nro_pf:'PF-CRC-2',rv_viagem:101,cliente_nome:'Outro Cliente CRC',data_emissao:'01/10/2026',nro_cte:0},
  {empresa:'Comex',pf_id:1,nro_pf:'PF-COMEX',rv_viagem:100,cliente_nome:'Cliente Comex',data_emissao:'01/10/2026',nro_cte:0},
  {empresa:'Ideallog',pf_id:1,nro_pf:'PF-IDEAL',rv_viagem:100,cliente_nome:'Cliente Ideal',data_emissao:'01/10/2026',nro_cte:0}],sources:{pedidos:true}};
 const response=body=>({ok:true,status:200,json:async()=>body}),calls=[];
 globalThis.fetch=async (input,options={})=>{
  const url=new URL(input);calls.push(url.pathname);const company=url.searchParams.get('company')||'costalog';
  if(url.pathname==='/api/login')return response({token:'teste',user:{username:'joao.pedro',displayName:'João Pedro',role:'operacional'},permissions:{operacional:true,financeiro:false,admin:false}});
  if(url.pathname==='/api/workflow'){
   if(options.method==='PATCH'){const body=JSON.parse(options.body);tasks[company][body.key]=updateTask(tasks[company][body.key],body,'joao.pedro');return response({task:tasks[company][body.key]});}
   const key=url.searchParams.get('key');return response(key?{task:tasks[company][key]||null}:{tasks:Object.fromEntries(Object.entries(tasks[company]).map(([key,value])=>[key,taskSummary(value)]))});
  }
  return response(projectPortalOverview({data},'operacional',company,{includeCompanies:true}));
 };
 const click=(selector,dataset)=>events.click({target:{closest:name=>name===selector?{dataset}:null}}),change=(id,value)=>events.change({target:{id,value,dataset:{}}}),tick=()=>new Promise(resolve=>setTimeout(resolve,20));
 await import('../src/app.js?my-tasks-checklist=1');
 click('[data-action]',{action:'connect'});events.submit({target:{id:'loginForm'},preventDefault(){}});await tick();
 assert(root.innerHTML.includes('Atualize os dados da DSS'));assert.equal(calls.filter(path=>path==='/api/overview').length,0,'O painel pessoal não consulta a DSS automaticamente');
 change('from','2026-10-01');change('to','2026-10-22');click('[data-action]',{action:'refresh'});await tick();
 assert(root.innerHTML.includes('data-mine-due="hoje"'));
 click('[data-mine-due]',{mineDue:'hoje'});assert(root.innerHTML.includes('MINHAS PENDÊNCIAS'));assert(!root.innerHTML.includes('data-alert-manage="cte_pendente:ctes:crc~1"'),'Homônimo com outra conta não pertence ao usuário');
 click('[data-alert-scope]',{alertScope:'todos'});change('legalEntityFilter','crc');
 const key='cte_pendente:ctes:crc~1';click('[data-alert-manage]',{alertManage:key});await tick();
 click('[data-action]',{action:'assign-task-to-me'});events.submit({target:{id:'taskForm'},preventDefault(){}});await tick();
 assert.equal(tasks.costalog[key].ownerUsername,'joao.pedro');assert.equal(tasks.costalog[key].revision,2);
 click('[data-alert-scope]',{alertScope:'mine'});change('alertDueFilter','hoje');
 assert(root.innerHTML.includes('data-alert-manage="'+key+'"'));assert(!root.innerHTML.includes('data-alert-manage="cte_pendente:ctes:crc~2"'));assert(root.innerHTML.includes('Em tratamento'));
 change('alertDueFilter','vencidas');assert(!root.innerHTML.includes('data-alert-manage="'+key+'"'));
 click('[data-nav]',{nav:'viagens'});change('filterClient','Cliente RV CRC');
 click('[data-detail]',{detail:'viagens:crc~1'});
 assert(root.innerHTML.includes('Checklist de encerramento da RV'));assert(root.innerHTML.includes('1 PF(s) vinculados nesta consulta.'));
 assert(root.innerHTML.includes('Pedidos de frete: 1'),'A ficha usa todos os PFs da RV, inclusive os de outro cliente da mesma empresa/período');
 click('[data-checklist-open]',{checklistOpen:'ctes:crc~1'});
 const table=()=>root.innerHTML.slice(root.innerHTML.indexOf('<tbody>'));
 assert(table().includes('PF-CRC-1'));assert(!table().includes('PF-CRC-2'));assert(!table().includes('PF-COMEX'));assert(!table().includes('PF-IDEAL'));
 click('[data-action]',{action:'csv'});const csv=await downloads[0].text();assert(csv.includes('PF-CRC-1'));assert(!csv.includes('PF-CRC-2'));assert(!csv.includes('PF-COMEX'));
 click('[data-action]',{action:'clear-trip-focus'});assert(table().includes('PF-CRC-2'));
 click('[data-action]',{action:'switch-company'});await tick();assert(table().includes('PF-IDEAL'));assert(!table().includes('PF-CRC-1'));
 assert.equal(messages.length,0);
});
