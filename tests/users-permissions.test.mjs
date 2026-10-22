import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {passwordHash} from '../api/auth.mjs';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function listen(server){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server.address().port));});}
async function freePort(){const s=http.createServer();const port=await listen(s);await new Promise(r=>s.close(r));return port;}
async function waitHealth(port){
 for(let i=0;i<100;i++){try{const res=await fetch('http://127.0.0.1:'+port+'/api/health');if(res.ok)return;}catch{}await delay(50);}
 throw Error('O backend não iniciou');
}
test('Login individual, projeção por perfil, revogação e bloqueio de status financeiro',async(t)=>{
 const dir=mkdtempSync(join(tmpdir(),'costalog-accounts-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const userFile=join(dir,'portal-users.json');
 const makeUser=(username,role)=>({username,role,name:username,disabled:false,...passwordHash('senha-forte-2026!')});
 const users=[makeUser('operador','operacional'),makeUser('financeiro','financeiro'),makeUser('diretoria','administrador')];
 const save=()=>writeFileSync(userFile,JSON.stringify({users}));
 save();
 const upstream=http.createServer((req,res)=>{
  res.writeHead(200,{'Content-Type':'application/json'});
  if(req.url.startsWith('/wsdss/listarViagens')){
   res.end(JSON.stringify({status:200,qtd_registros:1,registros:[{empresa:'AC da Costa',rv_id:10,nro_rv:123,placa_veiculo:'ABC123',motorista_id:5,cliente_nome:'Cliente',
    valor_total_abastecido:1870,valor_liquido_vf:390,cliente_cnpjcpf:'11111111111',data_inicio:'15/10/2026'}]}));
  }else res.end(JSON.stringify({status:200,qtd_registros:1,registros:[{empresa:'AC da Costa',pf_id:2,nro_pf:'PF9',nro_cte:44,rv_viagem:123,cliente_nome:'Cliente',
   total_frete:9999,valor_receber:9990,nro_fatura:'FATURA-PRIVADA',liberado_para_faturamento:true,entrega_concluida:true,comprovante_entrega:false}]}));
 });
 const upPort=await listen(upstream);t.after(()=>new Promise(r=>upstream.close(r)));
 const port=await freePort();
 const child=spawn(process.execPath,['api/server.mjs'],{env:{...process.env,PORT:String(port),PORTAL_USERS_FILE:userFile,
  PORTAL_ACCESS_TOKEN:'token-legado-nao-deve-passar',DSS_BASE_URL:'http://127.0.0.1:'+upPort+'/wsdss',
  DSS_AUTH_TYPE:'basic',DSS_USERNAME:'usuario-simulado',DSS_PASSWORD:'senha-simulada',
  DSS_CTES_PATH:'',DSS_MDFES_PATH:''},stdio:['ignore','pipe','pipe']});
 t.after(()=>child.kill('SIGTERM'));
 await waitHealth(port);
 const base='http://127.0.0.1:'+port;
 // Interface e API compartilham a mesma origem no modo local, sem CORS.
 const index=await fetch(base+'/');assert.equal(index.status,200);
 assert((await index.text()).includes('COSTALOG'));
 const js=await fetch(base+'/src/app.js');assert.equal(js.status,200);
 assert((await js.text()).includes("renderConnect"));
 const privateFiles=['/.env','/private/portal-users.json','/api/server.mjs'];
 for(const path of privateFiles){
  const result=await fetch(base+path);
  assert.equal(result.status,404,'Servidor nunca pode servir '+path);
 }
 const login=async username=>{
  const r=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:'senha-forte-2026!'})});
  assert.equal(r.status,200);
  return (await r.json()).token;
 };
 const old=await fetch(base+'/api/overview?from=2026-10-01&to=2026-10-31',{headers:{Authorization:'Bearer token-legado-nao-deve-passar'}});
 assert.equal(old.status,401,'Token administrativo legado não pode abrir dados quando existe arquivo de usuários');
 const op=await login('operador');
 const req=token=>fetch(base+'/api/overview?from=2026-10-01&to=2026-10-31',{headers:{Authorization:'Bearer '+token}});
 const operational=await req(op);assert.equal(operational.status,200);
 const data=await operational.json();
 assert.equal(data.role,'operacional');assert.equal(data.permissions.financeiro,false);
 assert.equal(data.data.viagens[0].nro_rv,123);
 assert.equal(data.data.viagens[0].valor_total_abastecido,undefined);
 assert.equal(data.data.pedidos[0].total_frete,undefined);
 assert.equal(data.data.pedidos[0].entrega_concluida,true);
 const payload=JSON.stringify(data);
 for(const forbidden of ['1870','9999','9990','FATURA-PRIVADA','11111111111'])assert(!payload.includes(forbidden));
 assert.equal((await fetch(base+'/api/status',{headers:{Authorization:'Bearer '+op}})).status,403);
 const finance=await login('financeiro');
 const financial=await req(finance);assert.equal(financial.status,200);
 const f=await financial.json();assert.equal(f.data.pedidos[0].total_frete,undefined);
 assert.equal(f.data.viagens[0].valor_total_abastecido,undefined);
 assert.equal((await fetch(base+'/api/status',{headers:{Authorization:'Bearer '+finance}})).status,403);
 // Uma segunda consulta deve usar cache bruto projetado por role, nunca o JSON de outro funcionário.
 const opAgain=await(await req(op)).json();
 assert.equal(opAgain.data.pedidos[0].total_frete,undefined,'Cache vazou valores financeiros.');
 const admin=await login('diretoria');
 const adminData=await(await req(admin)).json();
 assert.equal(adminData.data.pedidos[0].nro_pf,'PF9');
 assert.equal(adminData.data.pedidos[0].total_frete,undefined);
 assert.equal(adminData.data.viagens[0].valor_total_abastecido,undefined);
 assert.equal((await fetch(base+'/api/status',{headers:{Authorization:'Bearer '+admin}})).status,200);
 await fetch(base+'/api/logout',{method:'POST',headers:{Authorization:'Bearer '+op}});
 assert.equal((await req(op)).status,401,'Logout precisa revogar sessão');
 users[1].disabled=true;save();
 assert.equal((await req(finance)).status,401,'Desativação do usuário deve valer antes do término de sessão.');
});
