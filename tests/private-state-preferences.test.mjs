import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {createPrivateState} from '../api/private-state.mjs';
import {createPreferencesStore} from '../api/preferences-store.mjs';
import {createWorkflowStore} from '../api/workflow-store.mjs';

test('private workflow and per-user preferences survive reopening and reject concurrent revisions',async t=>{
 const dir=await mkdtemp(join(process.cwd(),'test-private-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const env={PORTAL_DATA_DIR:dir};
 const first=createPrivateState({env}),tasks=createWorkflowStore({documents:first}),prefs=createPreferencesStore(first);
 const input={revision:0,status:'tratamento',owner:'João',due:'2026-10-25',priority:'high',comment:'Persistir'};
 await tasks.save('costalog','cte_sem_rv:ctes:crc~1',input,'operador');
 await prefs.save('costalog','operador',{revision:0,values:{metricLayout:['viagens','pedidos'],presets:{'Minha consulta':{customer:'Cliente'}},reportTemplates:{}}});
 const reopened=createPrivateState({env});const second=createPreferencesStore(reopened);
 assert.equal((await createWorkflowStore({documents:reopened}).get('costalog','cte_sem_rv:ctes:crc~1')).comments[0].text,'Persistir');
 assert.equal((await second.get('costalog','operador')).values.presets['Minha consulta'].customer,'Cliente');
 assert.deepEqual((await second.get('costalog','outra.conta')).values,{});assert.deepEqual((await second.get('ideallog','operador')).values,{});
 const results=await Promise.allSettled([prefs.save('costalog','operador',{revision:1,values:{reportFormat:'csv'}}),prefs.save('costalog','operador',{revision:1,values:{reportFormat:'xlsx'}})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
 await assert.rejects(()=>second.save('costalog','operador',{revision:2,values:JSON.parse('{"__proto__":{"admin":true}}')}));
});
test('ephemeral Render configuration never acknowledges a durable save',async()=>{
 const store=createPrivateState({env:{RENDER:'true',PORTAL_DATA_DIR:'/tmp/private',PORTAL_DATA_PERSISTENT:'true'}});assert.equal(store.durable,false);
 await assert.rejects(()=>createPreferencesStore(store).save('costalog','operador',{revision:0,values:{reportFormat:'csv'}}),{status:503});
});

test('MariaDB private state uses locked transactions and never performs DDL or touches the cache',async()=>{
 const records=new Map(),sql=[],transactions=[];
 const execute=async(query,args)=>{sql.push(query);assert(query.includes('viagens_pf_portal_state'));assert(!/CREATE|ALTER|DROP/i.test(query));const key=query.startsWith('UPDATE')?args[1]:args[0];if(query.startsWith('INSERT')){if(!records.has(key))records.set(key,'null');return [{}];}if(query.startsWith('SELECT'))return [[...(records.has(key)?[{payload_json:records.get(key)}]:[])]];if(query.startsWith('UPDATE')){records.set(key,args[0]);return [{}];}throw Error('Unexpected SQL');};
 const connection={execute,async beginTransaction(){transactions.push('begin');},async commit(){transactions.push('commit');},async rollback(){transactions.push('rollback');},release(){}};
 const pool={execute,getConnection:async()=>connection};
 const first=createPreferencesStore(createPrivateState({env:{PORTAL_STATE_DRIVER:'mariadb'},pool}));
 await first.save('costalog','operador',{revision:0,values:{reportFormat:'xlsx'}});
 const reopened=createPreferencesStore(createPrivateState({env:{PORTAL_STATE_DRIVER:'mariadb'},pool}));
 assert.equal((await reopened.get('costalog','operador')).values.reportFormat,'xlsx');
 await assert.rejects(()=>reopened.save('costalog','operador',{revision:0,values:{reportFormat:'csv'}}),{status:409});
 assert(sql.some(q=>q.includes('FOR UPDATE')));assert.deepEqual(transactions,['begin','commit','begin','rollback']);
 const broken=createPrivateState({env:{PORTAL_STATE_DRIVER:'mariadb'},pool:{execute:async()=>{throw Error('database offline');}}});
 await assert.rejects(()=>broken.read('preferences:costalog:operador'));
});
