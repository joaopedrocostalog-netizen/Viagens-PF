import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {passwordHash} from '../api/auth.mjs';
const delay=()=>new Promise(resolve=>setTimeout(resolve,30));
test('Render without database keeps existing workflow file and explicitly selects browser preferences',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'portal-no-db-'));
 const probe=http.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 const password='only-test-password-123';await writeFile(join(dir,'users.json'),JSON.stringify({users:[{username:'operador',role:'operacional',...passwordHash(password)}]}));
 const task={revision:1,status:'tratamento',owner:'Anterior',priority:'high',due:'',comments:[],history:[]},key='cte_sem_rv:ctes:crc~1';
 await writeFile(join(dir,'workflow.json'),JSON.stringify({version:1,companies:{costalog:{[key]:task},ideallog:{}}}));
 const child=spawn(process.execPath,['api/server.mjs'],{env:{...process.env,PORT:String(port),RENDER:'true',PORTAL_USERS_FILE:join(dir,'users.json'),PORTAL_WORKFLOW_FILE:join(dir,'workflow.json'),PORTAL_STATE_DRIVER:'',PORTAL_DATA_DIR:'',MARIADB_ENABLED:'false',DSS_BASE_URL:'',PORTAL_ALLOW_LEGACY_TOKEN:'false'},stdio:['ignore','ignore','pipe']});
 t.after(async()=>{child.kill();await once(child,'exit').catch(()=>{});await rm(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+port;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await delay();}
 const login=await(await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'operador',password})})).json();assert.equal(login.portalVersion,2);assert.equal(login.workflowStorage.durable,false);
 const request=(path,body)=>fetch(base+path,{method:body?'PATCH':'GET',headers:{Authorization:'Bearer '+login.token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const old=await(await request('/api/workflow?company=costalog')).json();assert.equal(old.tasks[key].owner,'Anterior');assert.equal(old.storage.durable,false);
 const updated=await request('/api/workflow?company=costalog',{key,revision:1,owner:'João',priority:'high',due:'2026-10-25',status:'tratamento',comment:'Conferido'});assert.equal(updated.status,200);assert.equal((await updated.json()).storage.durable,false);
 assert.equal((await(await request('/api/workflow?company=costalog&key='+encodeURIComponent(key))).json()).task.comments[0].text,'Conferido');
 assert.deepEqual((await(await request('/api/workflow?company=ideallog')).json()).tasks,{});
 const preferences=await(await request('/api/preferences?company=costalog')).json();assert.equal(preferences.storage,'browser');assert.equal(preferences.durable,false);assert.equal((await request('/api/preferences?company=costalog',{revision:0,values:{reportFormat:'csv'}})).status,409);
});
