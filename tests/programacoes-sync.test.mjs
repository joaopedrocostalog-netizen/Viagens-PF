import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {passwordHash} from '../api/auth.mjs';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));

async function portal(t,programacoes){
 const dir=await mkdtemp(join(process.cwd(),'test-private-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const password='test-password-very-private';
 await writeFile(join(dir,'users.json'),JSON.stringify({users:[{username:'operador',role:'operacional',...passwordHash(password)}]}));
 const upstream=http.createServer((req,res)=>{
  const json=body=>{if(!res.destroyed){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(body));}};
  if(req.url.includes('listarProgramacoes'))return programacoes(req,res,json);
  json({status:200,registros:[req.url.includes('listarViagens')?{empresa:'CRC',rv_id:1,nro_rv:'RV-1',data_inicio:'10/10/2026',status_rv:'Escalado'}:{empresa:'CRC',pf_id:1,nro_pf:'PF-1',rv_viagem:'RV-1',data_emissao:'10/10/2026'}]});
 });
 const source=await listen(upstream);t.after(()=>{upstream.closeAllConnections();upstream.close();});
 const reserve=http.createServer();const port=await listen(reserve);await new Promise(resolve=>reserve.close(resolve));
 const child=spawn(process.execPath,['api/server.mjs'],{env:{...process.env,PORT:String(port),PORTAL_USERS_FILE:join(dir,'users.json'),PORTAL_DATA_DIR:dir,RENDER:'',DSS_BASE_URL:'http://127.0.0.1:'+source,DSS_USERNAME:'test',DSS_PASSWORD:'private',DSS_TIMEOUT_MS:'15000',DSS_CTES_PATH:'',DSS_MDFES_PATH:'',DSS_OCORRENCIAS_PATH:'',DSS_ROTAS_PATH:'',DSS_MOTORISTAS_PATH:'',DSS_PROGRAMACOES_PATH:'/listarProgramacoes'},stdio:['ignore','pipe','pipe']});
 t.after(()=>child.kill());
 const base='http://127.0.0.1:'+port;
 for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await pause(30);}
 const {token}=await(await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'operador',password})})).json();
 const request=(path,body)=>fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}).then(r=>r.json());
 let job=await request('/api/portal/sync',{from:'2026-10-01',to:'2026-10-23'});
 for(let i=0;i<60&&job.status==='running';i++){await pause(1000);job=await request('/api/portal/sync?id='+job.id);}
 return job;
}

test('Programações que demoram mais de 6 s (antigo limite) são carregadas',async t=>{
 const job=await portal(t,(req,res,json)=>{const timer=setTimeout(()=>json({status:200,registros:[{empresa:'CRC',programacao_id:9,nro_programacao:'P-9',nro_rv:'RV-1',data_emissao:'10/10/2026'}]}),6500);res.once('close',()=>clearTimeout(timer));});
 assert.equal(job.status,'complete',JSON.stringify(job));
 assert.equal(job.steps.find(s=>s.key==='programacoes').status,'done');
});

test('Falha das programações mostra o motivo e não derruba a consulta',async t=>{
 const job=await portal(t,(req,res)=>{res.writeHead(500);res.end('erro');});
 assert.equal(job.status,'complete','viagens e pedidos continuam disponíveis');
 const step=job.steps.find(s=>s.key==='programacoes');
 assert.equal(step.status,'unavailable');assert.equal(step.detail,'DSS respondeu HTTP 500');
 assert(!JSON.stringify(job).includes('private'),'sem credenciais na resposta');
});
