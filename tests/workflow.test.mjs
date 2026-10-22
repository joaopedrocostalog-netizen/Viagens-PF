import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,stat,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createWorkflowStore} from '../api/workflow-store.mjs';
import {createAlertPager} from '../src/operational.mjs';
import {alertKey,validTaskKey} from '../src/workflow.mjs';
import {renderTaskDrawer} from '../src/workflow-ui.mjs';

const key='cte_pendente:ctes:crc~8';
const input={revision:0,owner:'João',due:'2026-10-25',priority:'warning',status:'tratamento',comment:'Aguardando documento'};
test('Tratamentos sobrevivem à reabertura do arquivo, isolam empresas e não carregam comentários no índice',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'viagens-workflow-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=join(dir,'private','workflow.json'),store=createWorkflowStore({file});
 const first=await store.save('costalog',key,input,'operador');
 assert.equal(first.revision,1);assert.equal(first.comments[0].author,'operador');
 const reopened=createWorkflowStore({file});
 const summary=(await reopened.get('costalog'))[key];
 assert.equal(summary.owner,'João');assert.equal(summary.comments,undefined);assert.equal(summary.history,undefined);
 assert.deepEqual(await reopened.get('ideallog'),{});
 assert.equal((await reopened.get('costalog',key)).comments[0].text,input.comment);
 assert.equal((await stat(file)).mode&0o777,0o600);
 assert(!String(await readFile(file)).includes('DSS_PASSWORD'));
});
test('Escritas concorrentes rejeitam a versão antiga sem perder o comentário vencedor',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'viagens-concurrent-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=createWorkflowStore({file:join(dir,'workflow.json')});
 await store.save('costalog',key,input,'operador');
 const results=await Promise.allSettled([
  store.save('costalog',key,{...input,revision:1,status:'resolvida',comment:'Conferido'},'ana'),
  store.save('costalog',key,{...input,revision:1,comment:'Versão antiga'},'joao')
 ]);
 assert.equal(results[0].status,'fulfilled');assert.equal(results[1].reason.status,409);
 const task=await store.get('costalog',key);
 assert.equal(task.status,'resolvida');assert.equal(task.revision,2);assert.equal(task.comments.length,2);
 assert.equal(task.comments[1].text,'Conferido');assert.equal(task.history[1].changes.status.to,'resolvida');
});
test('Validação bloqueia empresas inválidas, chaves cruzadas e datas inexistentes',async t=>{
 assert(!validTaskKey('cte_pendente:ctes:ideallog~8','costalog'));
 assert(!validTaskKey('sem_fatura:ctes:crc~8','costalog'));
 const dir=await mkdtemp(join(tmpdir(),'viagens-validation-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=createWorkflowStore({file:join(dir,'workflow.json')});
 await assert.rejects(store.save('costalog',key,{...input,due:'2026-02-30'},'joao'),/Prazo inválido/);
 await assert.rejects(store.save('costalog',key,{...input,status:'qualquer'},'joao'),/Situação/);
 await assert.rejects(store.get('outra'),/Empresa/);
 await assert.rejects(createWorkflowStore().get('costalog'),{status:503});
});
test('Prioridade, situação e responsável filtram pendências mantendo paginação e contagem coerentes',()=>{
 const data={viagens:[],pedidos:Array.from({length:61},(_,i)=>({id:'crc~'+i,pedidoNumero:'PF-'+i,data:'2026-10-01',cliente:'Cliente'}))};
 const pager=createAlertPager(data),row=pager.getPage().rows[0];
 const tasks={[alertKey(row)]:{...input,revision:1,status:'resolvida'}};
 const resolved=pager.getPage({tasks,status:'resolvida',owner:'joao'});
 assert.equal(resolved.total,1);assert.equal(resolved.rows[0].level,'warning');
 assert.equal(resolved.counts.high,60);assert.equal(resolved.counts.warning,1);
 const open=pager.getPage({tasks,status:'aberta',page:3});
 assert.equal(open.total,60);assert.equal(open.rows.length,10);
 assert.equal(pager.getPage({tasks,priority:'warning'}).total,1);
 const html=renderTaskDrawer({taskSelected:row,taskDetail:{...input,comments:[{author:'<script>',text:'<img src=x onerror=alert(1)>',at:'2026-10-22'}]}});
 assert(!html.includes('<img'));assert(html.includes('&lt;img'));assert(html.includes('taskForm'));
});
