import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import http from 'node:http';
import {passwordHash} from '../api/auth.mjs';

async function availablePort(){const server=http.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const n=server.address().port;await new Promise(r=>server.close(r));return n;}
async function ready(port){for(let i=0;i<80;i++){try{if((await fetch('http://127.0.0.1:'+port+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,45));}throw Error('Servidor não iniciado.');}
test('Primeira conta administrador é criada SOMENTE pelo terminal privado, sem senha no código',()=>{
 const dir=mkdtempSync(join(tmpdir(),'costalog-bootstrap-'));try{
  const path=join(dir,'portal-users.json');
  const options={env:{...process.env,PORTAL_USERS_FILE:path,PORTAL_NEW_PASSWORD:'uma-senha-temporaria-segura-2026'},encoding:'utf8'};
  const first=spawnSync(process.execPath,['api/users.mjs','bootstrap','admin'],options);
  assert.equal(first.status,0,first.stderr);
  const users=JSON.parse(readFileSync(path,'utf8')).users;
  assert.equal(users.length,1);
  assert.equal(users[0].username,'admin');
  assert.equal(users[0].role,'administrador');
  assert(users[0].hash&&!readFileSync(path,'utf8').includes('uma-senha-temporaria-segura-2026'));
  const duplicate=spawnSync(process.execPath,['api/users.mjs','bootstrap','outro'],options);
  assert.notEqual(duplicate.status,0);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('Admin gerencia usuários, libera faturamento, redefine senha e bloqueia sem expor hashes',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'costalog-admin-crud-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const path=join(dir,'portal-users.json');
 const root={username:'admin',name:'Administrador',role:'administrador',disabled:false,...passwordHash('senha-admin-inicial-2026')};
 writeFileSync(path,JSON.stringify({users:[root]}));
 const port=await availablePort();
 const child=spawn(process.execPath,['api/server.mjs'],{env:{...process.env,PORT:String(port),PORTAL_USERS_FILE:path,PORTAL_ACCESS_TOKEN:'token-antigo-nao-deve-funcionar',DSS_BASE_URL:'http://127.0.0.1:1/wsdss'},stdio:['ignore','pipe','pipe']});
 t.after(()=>child.kill('SIGTERM'));
 await ready(port);const host='http://127.0.0.1:'+port;
 const login=async(name,password)=>fetch(host+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:name,password})});
 const adminResp=await login('admin','senha-admin-inicial-2026');assert.equal(adminResp.status,200);
 const adminToken=(await adminResp.json()).token;
 const api=async(path,method='GET',token=adminToken,body)=>{
  const response=await fetch(host+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json()};
 };
 assert.equal((await api('/api/users')).status,200);
 assert.equal((await api('/api/users','GET','token-antigo-nao-deve-funcionar')).status,401);
 assert.equal((await api('/api/users','POST',adminToken,{username:'financeiro01',name:'Financeiro Teste',role:'financeiro',password:'senha-provisoria-forte-2026'})).status,201);
 assert.equal((await api('/api/users','POST',adminToken,{username:'op01',name:'Operador Teste',role:'operacional',password:'senha-operacional-forte-2026'})).status,201);
 const opLogin=await login('op01','senha-operacional-forte-2026');assert.equal(opLogin.status,200);
 const opToken=(await opLogin.json()).token;
 assert.equal((await api('/api/users','GET',opToken)).status,403);
 const list=await api('/api/users');
 assert.equal(list.data.users.length,3);
 assert(!JSON.stringify(list.data).includes('hash')&&!JSON.stringify(list.data).includes('salt')&&!JSON.stringify(list.data).includes('senha-provisoria-forte-2026'));
 const provisional=await login('financeiro01','senha-provisoria-forte-2026');assert.equal(provisional.status,200);
 const provisionalJson=await provisional.json();
 assert.equal(provisionalJson.user.mustChangePassword,true);
 assert.equal(provisionalJson.permissions.financeiro,true);
 assert.equal((await api('/api/overview?from=2026-10-01&to=2026-10-15','GET',provisionalJson.token)).status,403);
 assert.equal((await api('/api/users','GET',provisionalJson.token)).status,403);
 const change=await api('/api/change-password','POST',provisionalJson.token,{currentPassword:'senha-provisoria-forte-2026',newPassword:'nova-senha-pessoal-forte-2026'});
 assert.equal(change.status,200);
 assert.equal((await api('/api/me','GET',provisionalJson.token)).status,401);
 const afterLogin=await login('financeiro01','nova-senha-pessoal-forte-2026');assert.equal(afterLogin.status,200);
 const financial=(await afterLogin.json());assert.equal(financial.user.mustChangePassword,false);
 assert.equal(financial.user.role,'financeiro');
 assert.equal((await api('/api/users','GET',financial.token)).status,403);
 const disabled=await api('/api/users/financeiro01','PATCH',adminToken,{action:'disable'});assert.equal(disabled.status,200);
 assert.equal((await api('/api/me','GET',financial.token)).status,401);
 assert.equal((await login('financeiro01','nova-senha-pessoal-forte-2026')).status,401);
 assert.equal((await api('/api/users/financeiro01','PATCH',adminToken,{action:'enable'})).status,200);
 assert.equal((await api('/api/users/op01','PATCH',adminToken,{action:'role',role:'financeiro'})).status,200);
 assert.equal((await api('/api/users/admin','PATCH',adminToken,{action:'disable'})).status,409);
 assert.equal((await api('/api/users/admin','PATCH',adminToken,{action:'role',role:'operacional'})).status,409);
 assert.equal((await api('/api/users/financeiro01','PATCH',adminToken,{action:'reset-password',password:'senha-redefinida-forte-2026'})).status,200);
 const reset=await login('financeiro01','senha-redefinida-forte-2026');assert.equal(reset.status,200);
 assert.equal((await reset.json()).user.mustChangePassword,true);
 const json=readFileSync(path,'utf8');assert(!json.includes('senha-redefinida-forte-2026'));
});
