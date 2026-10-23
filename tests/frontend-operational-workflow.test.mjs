import {projectPortalOverview} from '../api/access.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {taskSummary,updateTask} from '../src/workflow.mjs';

test('Fluxo completo: atalho, empresa interna, tratamento compartilhado e modelo de relatório',async t=>{
 const events={},storage=new Map(),fields={loginUser:{value:'operador'},loginPassword:{value:'senha-teste'},taskOwner:{value:'João'},taskDue:{value:'2026-10-25'},taskPriority:{value:'warning'},taskStatus:{value:'resolvida'},taskComment:{value:'Documento conferido'}};
 const root={innerHTML:'',addEventListener:(type,fn)=>events[type]=fn},downloads=[],alerts=[],tasks={costalog:{},ideallog:{}};
 globalThis.document={getElementById:id=>id==='app'?root:fields[id]||null,querySelector(){return null;},addEventListener(){},body:{appendChild(){}},createElement(){return {click(){},remove(){}};}};
 globalThis.window={location:{protocol:'file:',origin:'https://teste.local'}};
 globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
 globalThis.alert=message=>alerts.push(message);globalThis.prompt=()=> 'Conferência CRC';globalThis.confirm=()=>true;
 const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;
 URL.createObjectURL=blob=>{downloads.push(blob);return 'blob:teste';};URL.revokeObjectURL=()=>{};
 t.after(()=>{URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;});
 const reply=value=>({ok:true,status:200,json:async()=>value});
 globalThis.fetch=async (input,options={})=>{
  const url=new URL(input),company=url.searchParams.get('company')||'costalog';
  if(url.pathname==='/api/login')return reply({token:'teste',user:{username:'operador',role:'operacional'},permissions:{operacional:true,financeiro:false,admin:false}});
  if(url.pathname==='/api/workflow'){
   if(options.method==='PATCH'){const patch=JSON.parse(options.body),task=updateTask(tasks[company][patch.key],patch,'operador');tasks[company][patch.key]=task;return reply({task});}
   const key=url.searchParams.get('key');return reply(key?{task:tasks[company][key]||null}:{tasks:Object.fromEntries(Object.entries(tasks[company]).map(([key,value])=>[key,taskSummary(value)]))});
  }
  return reply(projectPortalOverview({data:{viagens:['AC da Costa','CRC','Comex','Ideallog'].map(empresa=>({empresa,rv_id:1,nro_rv:100,data_inicio:'01/10/2026',cliente_nome:empresa,placa_veiculo:'ABC-1234',status_rv:'Em andamento'})),pedidos:['AC da Costa','CRC','Comex','Ideallog'].map(empresa=>({empresa,pf_id:1,nro_pf:'PF-'+empresa,rv_viagem:100,data_emissao:'01/10/2026',cliente_nome:empresa,nro_cte:0})),sources:{pedidos:true}}},'operacional',company,{includeCompanies:true}));
 };
 const tick=()=>new Promise(resolve=>setTimeout(resolve,20)),click=(selector,dataset)=>events.click({target:{closest:name=>name===selector?{dataset}:null}}),change=(id,value)=>events.change({target:{id,value,dataset:{}}});
 await import('../src/app.js?operational-workflow=1');
 click('[data-action]',{action:'connect'});events.submit({target:{id:'loginForm'},preventDefault(){}});await tick();
 change('from','2026-10-01');change('to','2026-10-22');click('[data-action]',{action:'refresh'});await tick();
 click('[data-metric-open]',{metricOpen:'sem_cte'});
 assert(root.innerHTML.includes('Filtro do painel:'));assert(root.innerHTML.includes('PF-CRC'));
 change('legalEntityFilter','crc');
 const table=()=>root.innerHTML.slice(root.innerHTML.indexOf('<tbody>'));
 assert(table().includes('PF-CRC'));assert(!table().includes('PF-Comex'));assert(!table().includes('PF-AC da Costa'));
 click('[data-nav]',{nav:'pendencias'});await tick();
 const key='cte_pendente:ctes:crc~1';assert(root.innerHTML.includes('data-alert-manage="'+key+'"'));
 click('[data-alert-manage]',{alertManage:key});await tick();
 assert(root.innerHTML.includes('id="taskForm"'));
 events.submit({target:{id:'taskForm'},preventDefault(){}});await tick();
 assert.equal(tasks.costalog[key].status,'resolvida');assert.equal(tasks.costalog[key].comments[0].text,'Documento conferido');
 change('alertStatusFilter','resolvida');assert(root.innerHTML.includes('Resolvida · João'));assert(root.innerHTML.includes('1 registros'));
 click('[data-alert-manage]',{alertManage:key});await tick();assert(root.innerHTML.includes('Documento conferido'));
 click('[data-action]',{action:'close-task'});
 click('[data-nav]',{nav:'relatorios'});change('reportSelected','pedidos');change('reportFormat','csv');
 click('[data-report-column-move]',{reportColumnMove:'cliente:-1'});
 click('[data-action]',{action:'save-report-template'});
 const savedKey=[...storage.keys()].find(key=>key.startsWith('viagens_pf_report_templates_v1:costalog:portal:operador'));
 assert(savedKey);assert.equal(JSON.parse(storage.get(savedKey))['Conferência CRC'].filters.legalEntity,'crc');
 change('legalEntityFilter','comex');assert(table().includes('PF-Comex'));
 change('reportTemplateSelect','Conferência CRC');assert(table().includes('PF-CRC'));assert(!table().includes('PF-Comex'));
 click('[data-action]',{action:'export-report-template'});assert.equal(downloads.length,1);
 const csv=await downloads[0].text();assert(csv.includes('PF-CRC'));assert(!csv.includes('PF-Comex'));assert(!csv.includes('PF-Ideallog'));
 click('[data-action]',{action:'switch-company'});await tick();
 assert(!root.innerHTML.includes('Conferência CRC'));assert(!root.innerHTML.includes('legalEntityFilter'));assert(table().includes('PF-Ideallog'));assert(!table().includes('PF-CRC'));
 assert.equal(alerts.length,0);
});
