import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';

function listen(server){
 return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server.address().port));});
}
async function waitPort(port){
 for(let i=0;i<100;i++){
  try{const r=await fetch('http://127.0.0.1:'+port+'/api/health');if(r.ok)return;}catch{}
  await new Promise(resolve=>setTimeout(resolve,50));
 }
 throw Error('Backend não inicializou no prazo esperado');
}
test('backend DSS converte filtros para dd/mm/aaaa, lê registros e mantém autenticação',async(t)=>{
 const calls=[];
 const user='dss-teste',pass='senha-simulada';
 const expectedDssAuthorization='Basic '+Buffer.from(user+':'+pass).toString('base64');
 const upstream=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');calls.push({path:url.pathname,query:Object.fromEntries(url.searchParams),accept:req.headers.accept,authorization:req.headers.authorization});
  res.writeHead(200,{'Content-Type':'application/json'});
  if(url.pathname==='/wsdss/listarViagens')res.end(JSON.stringify({status:200,apiVersion:1,mensagemErro:'',qtd_registros:1,registros:[{rv_id:5,nro_rv:12,cliente_nome:'Teste',data_inicio:'15/10/2026',motorista_id:7}]}));
  else if(url.pathname==='/wsdss/listarPedidosFrete')res.end(JSON.stringify({status:200,apiVersion:1,mensagemErro:'',qtd_registros:1,registros:[{pf_id:8,nro_pf:'PF',nro_cte:44,rv_viagem:12}]}));
  else if(url.pathname==='/wsdss/listarMotoristas')res.end(JSON.stringify({status:200,apiVersion:1,qtd_registros:1,registros:[{id:7,nome_motorista:'Motorista de Teste',cnpj_cpf:'00000000000'}]}));
  else res.end(JSON.stringify({status:404,registros:[]}));
 });
 const uport=await listen(upstream);
 t.after(()=>new Promise(resolve=>upstream.close(resolve)));
 const port=32500+(process.pid%10000);
 const child=spawn(process.execPath,['api/server.mjs'],{env:{...process.env,PORT:String(port),PORTAL_ACCESS_TOKEN:'local-test-token',PORTAL_ALLOW_LEGACY_TOKEN:'true',PORTAL_ALLOWED_ORIGINS:'http://127.0.0.1',DSS_BASE_URL:'http://127.0.0.1:'+uport+'/wsdss',
  DSS_AUTH_TYPE:'basic',DSS_USERNAME:user,DSS_PASSWORD:pass,DSS_AUTH_HEADER:'',DSS_AUTH_VALUE:'',DSS_VIAGENS_PATH:'/listarViagens',DSS_PEDIDOS_PATH:'/listarPedidosFrete',DSS_CTES_PATH:'',DSS_MDFES_PATH:'',DSS_ROTAS_PATH:'',DSS_PROGRAMACOES_PATH:'',DSS_MOTORISTAS_PATH:'/listarMotoristas',DSS_MOTORISTAS_ID_FIELD:'id',DSS_MOTORISTAS_NAME_FIELD:'nome_motorista'},
  stdio:['ignore','pipe','pipe']});
 t.after(()=>child.kill('SIGTERM'));
 await waitPort(port);
 const noAuth=await fetch('http://127.0.0.1:'+port+'/api/overview?from=2026-10-15&to=2026-10-16');
 assert.equal(noAuth.status,401);
 const ok=await fetch('http://127.0.0.1:'+port+'/api/overview?from=2026-10-15&to=2026-10-16',{headers:{Authorization:'Bearer local-test-token'}});
 assert.equal(ok.status,200);
 const body=await ok.json();
 assert.equal(body.data.viagens[0].rv_id,5);
 assert.equal(body.data.pedidos[0].nro_cte,44);
 assert.equal(body.data.viagens[0].motorista_nome,'Motorista de Teste');
 assert(!JSON.stringify(body).includes('00000000000'),'Dados pessoais do cadastro não devem ir ao portal');
 assert.equal(calls.length,3);
 assert.deepEqual(calls.map(x=>x.path).sort(),['/wsdss/listarMotoristas','/wsdss/listarPedidosFrete','/wsdss/listarViagens']);
 assert(calls.filter(x=>x.path!=='/wsdss/listarMotoristas').every(x=>x.query.data_inicio==='15/10/2026'&&x.query.data_fim==='16/10/2026'));
 assert(!calls.find(x=>x.path==='/wsdss/listarMotoristas').query.data_inicio);
 assert(calls.every(x=>x.accept==='application/json'));
 assert(calls.every(x=>x.authorization===expectedDssAuthorization),'DSS deve receber Basic Auth, nunca o token Bearer do portal');
});
