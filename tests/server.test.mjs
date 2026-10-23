import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
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
 const cacheDir=mkdtempSync(join(tmpdir(),'viagens-company-cache-'));
 t.after(()=>rmSync(cacheDir,{recursive:true,force:true}));
 const user='dss-teste',pass='senha-simulada';
 const expectedDssAuthorization='Basic '+Buffer.from(user+':'+pass).toString('base64');
 const upstream=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');calls.push({path:url.pathname,query:Object.fromEntries(url.searchParams),accept:req.headers.accept,authorization:req.headers.authorization});
  res.writeHead(200,{'Content-Type':'application/json'});
  if(url.pathname==='/wsdss/listarViagens')res.end(JSON.stringify({status:200,apiVersion:1,mensagemErro:'',qtd_registros:2,registros:[{empresa:'AC da Costa',rv_id:5,nro_rv:12,cliente_nome:'Teste',data_inicio:'15/10/2026',motorista_id:7},{empresa:'Ideallog',rv_id:5,nro_rv:12,cliente_nome:'Cliente da Ideal',data_inicio:'15/10/2026'}]}));
  else if(url.pathname==='/wsdss/listarPedidosFrete')res.end(JSON.stringify({status:200,apiVersion:1,mensagemErro:'',qtd_registros:2,registros:[{empresa:'AC da Costa',pf_id:8,nro_pf:'PF',nro_cte:44,rv_viagem:12},{empresa:'Ideallog',pf_id:8,nro_pf:'PF-IDEAL',nro_cte:44,rv_viagem:12,total_frete:9999}]}));
  else if(url.pathname==='/wsdss/listarMotoristas')res.end(JSON.stringify({status:200,apiVersion:1,qtd_registros:1,registros:[{id:7,nome_motorista:'Motorista de Teste',cnpj_cpf:'00000000000'}]}));
  else res.end(JSON.stringify({status:404,registros:[]}));
 });
 const uport=await listen(upstream);
 t.after(()=>new Promise(resolve=>upstream.close(resolve)));
 const port=32500+(process.pid%10000);
 const child=spawn(process.execPath,['api/server.mjs'],{env:{...process.env,PORT:String(port),DSS_PERIOD_CACHE_DIR:cacheDir,PORTAL_WORKFLOW_FILE:join(cacheDir,'workflow.json'),PORTAL_ACCESS_TOKEN:'local-test-token',PORTAL_ALLOW_LEGACY_TOKEN:'true',PORTAL_ALLOWED_ORIGINS:'http://127.0.0.1',DSS_BASE_URL:'http://127.0.0.1:'+uport+'/wsdss',
  DSS_AUTH_TYPE:'basic',DSS_USERNAME:user,DSS_PASSWORD:pass,DSS_AUTH_HEADER:'',DSS_AUTH_VALUE:'',DSS_VIAGENS_PATH:'/listarViagens',DSS_PEDIDOS_PATH:'/listarPedidosFrete',DSS_CTES_PATH:'',DSS_MDFES_PATH:'',DSS_ROTAS_PATH:'',DSS_PROGRAMACOES_PATH:'',DSS_OCORRENCIAS_PATH:'/listarOcorrencias',DSS_MOTORISTAS_PATH:'/listarMotoristas',DSS_MOTORISTAS_ID_FIELD:'id',DSS_MOTORISTAS_NAME_FIELD:'nome_motorista'},
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
 assert.equal(body.data.viagens.length,1);
 assert.equal(body.company,'costalog');
 assert(body.quality.periods[0].syncedAt,'Informar a data da sincronização do mês, inclusive depois de reutilizar cache');
 assert(body.quality.sources.some(source=>source.name==='motoristas'&&source.status==='ok'));
 assert(body.quality.sources.some(source=>source.name==='ocorrencias'&&source.status==='unavailable'));
 const request=path=>fetch('http://127.0.0.1:'+port+path,{headers:{Authorization:'Bearer local-test-token'}});
 const shared=await(await request('/api/overview?from=2026-10-15&to=2026-10-16&company=costalog&include_companies=1')).json();
 assert.equal(shared.company,'costalog');assert.equal(shared.companions.ideallog.company,'ideallog');
 assert.equal(shared.data.viagens.length,1);assert.equal(shared.companions.ideallog.data.viagens.length,1);
 assert.equal(shared.data.viagens[0].empresa,'AC da Costa');assert.equal(shared.companions.ideallog.data.viagens[0].empresa,'Ideallog');
 assert(!JSON.stringify(shared.companions.ideallog).includes('9999'));
 assert.equal(calls.length,4,'A segunda empresa usa a consulta existente sem chamar nenhuma fonte DSS novamente');
 const ideal=await(await request('/api/overview?from=2026-10-15&to=2026-10-16&company=ideallog')).json();
 assert.equal(ideal.company,'ideallog');
 assert.equal(ideal.cacheHit,true);
 assert.equal(ideal.data.viagens.length,1);
 assert.equal(ideal.data.pedidos[0].nro_pf,'PF-IDEAL');
 assert.equal(ideal.data.pedidos[0].total_frete,undefined);
 assert(!JSON.stringify(ideal).includes('AC da Costa'));
 for(const company of ['costalog','ideallog'])for(const kind of ['viagens','pedidos']){
  const response=await request('/api/records?from=2026-10-15&to=2026-10-16&company='+company+'&kind='+kind);
  assert.equal(response.status,200);
  const records=await response.json();
  assert.equal(records.total,1);
  assert.equal(records.company,company);
  assert.equal(records.rows[0].empresa,company==='costalog'?'AC da Costa':'Ideallog');
 }
 const costaSearch=await(await request('/api/records?from=2026-10-15&to=2026-10-16&company=costalog&kind=pedidos&search=PF-IDEAL')).json();
 assert.equal(costaSearch.total,0);
 assert.equal((await request('/api/overview?from=2026-10-15&to=2026-10-16&company=todas')).status,400);
 assert.equal((await request('/Ideallog.png')).status,200);
 assert.equal((await request('/src/companies.mjs')).status,200);
 for(const name of ['date-controls.mjs','rv-status.mjs','portal-links.mjs','programming.mjs','programming-data.mjs','mobile-tables.mjs','rv-checklist.mjs','view-cache.mjs','workflow.mjs','workflow-ui.mjs','trip-timeline.mjs','data-quality.mjs','report-templates.mjs'])assert.equal((await request('/src/'+name)).status,200,name);
 assert.equal((await fetch('http://127.0.0.1:'+port+'/api/workflow?company=costalog')).status,401);
 const patch=input=>fetch('http://127.0.0.1:'+port+'/api/workflow?company=costalog',{method:'PATCH',headers:{Authorization:'Bearer local-test-token','Content-Type':'application/json'},body:JSON.stringify(input)});
 const taskInput={key:'cte_sem_rv:ctes:acdacosta~8',owner:'João',ownerUsername:'joao.pedro',due:'2026-10-25',priority:'high',status:'tratamento',comment:'Conferir referência',revision:0};
 assert.equal((await patch(taskInput)).status,200);
 const index=await(await request('/api/workflow?company=costalog')).json();
 assert.equal(index.tasks[taskInput.key].owner,'João');assert.equal(index.tasks[taskInput.key].ownerUsername,'joao.pedro');assert.equal(index.tasks[taskInput.key].comments,undefined);
 const detail=await(await request('/api/workflow?company=costalog&key='+encodeURIComponent(taskInput.key))).json();
 assert.equal(detail.task.comments[0].text,'Conferir referência');
 assert.equal((await patch(taskInput)).status,409,'Não sobrescrever a versão de outro funcionário');
 assert.equal((await patch({...taskInput,key:'cte_sem_rv:ctes:ideallog~8'})).status,400);
 assert.equal((await patch({...taskInput,ownerUsername:'../conta'})).status,400);
 assert.deepEqual((await(await request('/api/workflow?company=ideallog')).json()).tasks,{});
 assert.equal((await request('/api/workflow?company=todas')).status,400);

 assert.equal(calls.length,4);
 assert.deepEqual(calls.map(x=>x.path).sort(),['/wsdss/listarMotoristas','/wsdss/listarOcorrencias','/wsdss/listarPedidosFrete','/wsdss/listarViagens']);
 assert(calls.filter(x=>x.path!=='/wsdss/listarMotoristas').every(x=>x.query.data_inicio==='15/10/2026'&&x.query.data_fim==='16/10/2026'));
 assert(!calls.find(x=>x.path==='/wsdss/listarMotoristas').query.data_inicio);
 assert(calls.every(x=>x.accept==='application/json'));
 assert(calls.every(x=>x.authorization===expectedDssAuthorization),'DSS deve receber Basic Auth, nunca o token Bearer do portal');
});
