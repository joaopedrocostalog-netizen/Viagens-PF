/**
 * Proxy privado DSS -> Portal COSTALOG.
 * Node.js >=20. Nunca guardar credenciais DSS no frontend.
 * Caminhos e parâmetros são configurados após validar o Swagger.
 */
import http from 'node:http';
import {createPrivateState} from './private-state.mjs';
import {createPreferencesStore} from './preferences-store.mjs';
import {createPortalSessions} from './portal-sessions.mjs';
import {portalResponse} from './portal-render.mjs';
import {validCompany} from '../src/companies.mjs';
import {createWorkflowStore} from './workflow-store.mjs';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {timingSafeEqual} from 'node:crypto';
import {gzip} from 'node:zlib';
import {configuredUsers,login,authenticate,logout,listAccounts,createAccount,updateAccount,changeOwnPassword,AccountError} from './auth.mjs';
import {projectOverview,projectPortalOverview,permissionsFor} from './access.mjs';
import {monthWindows,mergeDssRows} from './dss-periods.mjs';
import {createPeriodStore} from './period-store.mjs';
import {createMariaDbPeriodStore} from './mariadb-store.mjs';
const env=process.env;
const useAccounts=configuredUsers();
const allowLegacy=env.PORTAL_ALLOW_LEGACY_TOKEN==='true';
const port=Number(env.PORT||3001);
const base=env.DSS_BASE_URL||'';
const origins=(env.PORTAL_ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
const timeout=Math.min(38000,Math.max(1000,Number(env.DSS_TIMEOUT_MS||32000)));
const cacheMaxAge=Math.min(3600000,Math.max(0,Number(env.API_CACHE_SECONDS??60)*1000));
const CACHE=new Map(),CACHE_LIMIT=3; // Render Free: evitar manter dezenas de respostas DSS enormes em memória.
const periodStore=env.MARIADB_ENABLED==='true'?createMariaDbPeriodStore({env}):createPeriodStore({dir:env.DSS_PERIOD_CACHE_DIR||'',ttlMs:Math.max(60000,Number(env.DSS_PERIOD_CACHE_HOURS||24)*3600000)});
const workflowFile=env.PORTAL_WORKFLOW_FILE||(env.PORTAL_USERS_FILE?join(dirname(env.PORTAL_USERS_FILE),'viagens-pf-workflow.json'):'');
const privateState=createPrivateState({env});
const preferencesStore=createPreferencesStore(privateState);
const workflowStore=createWorkflowStore(privateState.enabled?{documents:privateState}:{file:workflowFile});
const workflowStorage={kind:privateState.enabled?privateState.driver:'file',durable:privateState.durable};
const portalSessions=createPortalSessions({synchronize});
const INFLIGHT=new Map(); // Reutilizar consultas idênticas que chegam ao mesmo tempo.
const rateTable=new Map();
const rateLimit=Math.max(10,Number(env.PORTAL_REQUESTS_PER_MINUTE||120));
let apiStats={success:0,failed:0,cached:0,lastSuccess:null,lastFailure:null};
function allowedRate(req){
 const remote=req.socket.remoteAddress||'unknown';
 const now=Date.now(),row=rateTable.get(remote);
 if(!row||now-row.start>=60000){rateTable.set(remote,{start:now,count:1});return true;}
 row.count++;return row.count<=rateLimit;
}
function cacheGet(key){
 if(!cacheMaxAge)return null;
 const entry=CACHE.get(key);
 if(!entry)return null;
 if(Date.now()-entry.time>cacheMaxAge){CACHE.delete(key);return null;}
 return entry.data;
}
function cachePut(key,data){
 if(!cacheMaxAge)return;
 // Uma única consulta pode ter dezenas de milhares de linhas: cache com no máximo 3 períodos.
 if(CACHE.has(key))CACHE.delete(key);
 while(CACHE.size>=CACHE_LIMIT)CACHE.delete(CACHE.keys().next().value);
 CACHE.set(key,{time:Date.now(),data});
}
function config(name){
 const k='DSS_'+name.toUpperCase();
 return {path:env[k+'_PATH']||({DSS_VIAGENS:'/listarViagens',DSS_PEDIDOS:'/listarPedidosFrete'}[k]||''),method:(env[k+'_METHOD']||'GET').toUpperCase(),from:env[k+'_QUERY_FROM']||(name==='viagens'||name==='pedidos'?'data_inicio':''),to:env[k+'_QUERY_TO']||(name==='viagens'||name==='pedidos'?'data_fim':''),body:env[k+'_BODY_TEMPLATE']||'',dataPath:env[k+'_DATA_PATH']||(name==='viagens'||name==='pedidos'?'registros':'')};
}
const cfg=Object.fromEntries(['viagens','pedidos','ctes','mdfes'].map(k=>[k,config(k)]));
/** Catálogo opcional de motoristas. Uma falha aqui não invalida viagens/pedidos. */
const driversPath=env.DSS_MOTORISTAS_PATH??'/listarMotoristas';
const optionalCatalogs=[{name:'ocorrencias',path:env.DSS_OCORRENCIAS_PATH??'/listarOcorrencias',fields:['empresa','rv_id','nro_rv','pf_id','nro_mdf','ocorrencia_id','data_ocorrencia','descricao','veiculo_id','placa_veiculo','ocorrencia_de','relato','causa_raiz','providencia_tomada','responsavel_atendimento','envolvido','data','status']},{name:'rotas',path:env.DSS_ROTAS_PATH??'/listarRotas',fields:['empresa','rota_id','km_previsto_rota','dsc_rota','cidade_origem_rota','cidade_destino_rota']},
 {name:'programacoes',path:env.DSS_PROGRAMACOES_PATH??'/listarProgramacoes',fields:['empresa','programacao_id','nro_programacao','rv_id','nro_rv','pf_id','motorista_id','veiculo_id','data_emissao','nro_cte','total_frete_pedido_frete']}];
const optionalCache=new Map();
async function optionalCatalog(c,from,to,signal){
 if(!c.path)return [];
 const key=c.name+'|'+(c.name==='rotas'?'catalogo':from+'|'+to),saved=optionalCache.get(key);
 if(saved&&saved.expires>Date.now())return saved.rows;
 const url=new URL(c.path.startsWith('/')?c.path.slice(1):c.path,base.endsWith('/')?base:base+'/');
 if(url.origin!==new URL(base).origin)throw Error('Origem de catálogo inválida');
 if(c.name==='programacoes'||c.name==='ocorrencias'){
  const format=d=>d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4);
  url.searchParams.set('data_inicio',format(from));url.searchParams.set('data_fim',format(to));
 }
 const response=await fetch(url,{headers:{Accept:'application/json',...dssAuthHeaders()},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(Math.min(timeout,6000))]):AbortSignal.timeout(Math.min(timeout,6000)),redirect:'error'});
 if(!response.ok)throw Error(c.name+' HTTP '+response.status);
 const json=await response.json();
 if(typeof json?.status==='number'&&json.status!==200)throw Error(c.name+' status DSS '+json.status);
 const list=listFrom(json.registros);
 if(!Array.isArray(list))throw Error(c.name+' resposta sem registros');
 const rows=list.map(record=>Object.fromEntries(c.fields.filter(field=>Object.hasOwn(record,field)).map(field=>[field,record[field]])));
 optionalCache.set(key,{rows,expires:Date.now()+10*60_000});
 if(optionalCache.size>8)optionalCache.delete(optionalCache.keys().next().value);
 console.info('[DSS] catálogo',c.name,'obtidos',rows.length);
 return rows;
}

let driverCatalog={expires:0,items:[],status:'disabled'};
async function driverNames(signal){
 if(!driversPath)return driverCatalog.items;
 if(Date.now()<driverCatalog.expires)return driverCatalog.items;
 const endpoint=new URL(driversPath.startsWith('/')?driversPath.slice(1):driversPath,base.endsWith('/')?base:base+'/');
 if(endpoint.origin!==new URL(base).origin)throw Error('Origem de motoristas inválida');
 const req=await fetch(endpoint,{headers:{Accept:'application/json',...dssAuthHeaders()},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(Math.min(timeout,12000))]):AbortSignal.timeout(Math.min(timeout,12000)),redirect:'error'});
 if(!req.ok)throw Error('listarMotoristas HTTP '+req.status);
 const raw=await req.json();
 if(typeof raw?.status==='number'&&raw.status!==200)throw Error('listarMotoristas status DSS '+raw.status);
 const rows=listFrom(getPath(raw,env.DSS_MOTORISTAS_DATA_PATH||'registros'));
 if(!Array.isArray(rows))throw Error('listarMotoristas: registros não encontrados, confira DATA_PATH');
 const idField=env.DSS_MOTORISTAS_ID_FIELD||'id',nameField=env.DSS_MOTORISTAS_NAME_FIELD||'nome_motorista';
 const names=new Map();
 for(const item of rows){
  const id=String(item?.[idField]??'').trim(),name=String(item?.[nameField]??'').trim();
  if(id&&name&&name.toLowerCase()!=='null'&&!name.toLowerCase().startsWith('motorista id ')&&name.length<=150){
   if(names.has(id)&&names.get(id)!==name)names.set(id,null);
   else if(!names.has(id))names.set(id,name);
  }
 }
 driverCatalog={items:[...names].filter(([,name])=>name),expires:Date.now()+15*60_000,status:'ok'};
 console.info('[DSS] motoristas: catálogo atualizado, IDs com nome',driverCatalog.items.length);
 return driverCatalog.items;
}
function attachDriverNames(data,names){
 const lookup=new Map(names);
 for(const kind of ['viagens','pedidos']){
  for(const row of data[kind]||[]){
   const id=String(row.motorista_id??'').trim();
   if(id&&lookup.has(id)&&!String(row.motorista_nome??'').trim())
    row.motorista_nome=lookup.get(id);
  }
 }
}

/** Auth do DSS e auth do portal são diferentes.
 * DSS: Basic Auth (somente backend). Portal: token Bearer de acesso à nossa API.
 */
const authType=(env.DSS_AUTH_TYPE||'basic').toLowerCase();
function dssCredentialsReady(){
 if(authType==='basic')return !!(env.DSS_USERNAME&&env.DSS_PASSWORD);
 if(authType==='header')return !!(env.DSS_AUTH_HEADER&&env.DSS_AUTH_VALUE);
 return false;
}
function dssAuthHeaders(){
 if(authType==='basic'){
  if(!dssCredentialsReady())throw Error('Basic Auth do DSS não configurado no servidor: defina DSS_USERNAME e DSS_PASSWORD.');
  if(env.DSS_USERNAME.includes(':'))throw Error('DSS_USERNAME inválido: o caractere dois-pontos não é permitido no usuário Basic Auth.');
  return {Authorization:'Basic '+Buffer.from(env.DSS_USERNAME+':'+env.DSS_PASSWORD,'utf8').toString('base64')};
 }
 if(authType==='header'){
  if(!dssCredentialsReady())throw Error('Cabeçalho de autenticação DSS não configurado.');
  return {[env.DSS_AUTH_HEADER]:env.DSS_AUTH_VALUE};
 }
 throw Error('DSS_AUTH_TYPE inválido. Use basic ou header.');
}
function reply(res,code,body,origin,acceptEncoding=''){
 const str=JSON.stringify(body),h={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 if(origin&&origins.includes(origin)){h['Access-Control-Allow-Origin']=origin;h['Vary']='Origin';h['Access-Control-Allow-Headers']='Authorization, Content-Type';h['Access-Control-Allow-Methods']='GET, POST, PATCH, OPTIONS';}
 // Compactar só respostas grandes. Browser descomprime gzip automaticamente.
 if(str.length>50000&&/\bgzip\b/i.test(acceptEncoding)){
  h.Vary=h.Vary?'Origin, Accept-Encoding':'Accept-Encoding';
  return gzip(str,{level:4},(error,data)=>{
   if(res.destroyed||res.writableEnded)return;
   if(!error){h['Content-Encoding']='gzip';h['Content-Length']=data.length;res.writeHead(code,h);res.end(data);}
   else {h['Content-Length']=Buffer.byteLength(str);res.writeHead(code,h);res.end(str);}
  });
 }
 h['Content-Length']=Buffer.byteLength(str);res.writeHead(code,h);res.end(str);
}
function legacyAuthorized(req){
 const s=env.PORTAL_ACCESS_TOKEN;
 if(!s)return false;
 const a=Buffer.from(s),b=Buffer.from((req.headers.authorization||'').replace(/^Bearer\s+/i,''));
 return a.length===b.length&&timingSafeEqual(a,b);
}
function bearer(req){return (req.headers.authorization||'').replace(/^Bearer\s+/i,'');}
function identify(req){
 if(useAccounts)return authenticate(bearer(req));
 if(allowLegacy&&legacyAuthorized(req))return {username:'legado-admin',displayName:'Administrador',role:'administrador',permissions:permissionsFor('administrador')};
 return null;
}
async function bodyJSON(req,maxBytes=8192){
 const parts=[];let size=0;
 for await(const chunk of req){
  size+=chunk.length;if(size>maxBytes)throw Error('Corpo da requisição excede o limite permitido.');
  parts.push(chunk);
 }
 return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
const loginAttempts=new Map();
function canTryLogin(req){
 const ip=req.socket.remoteAddress||'none',now=Date.now(),record=loginAttempts.get(ip);
 if(!record||now-record.start>600000){loginAttempts.set(ip,{start:now,n:1});return true;}
 record.n++;return record.n<=12;
}
function getPath(value,path){return path?path.split('.').filter(Boolean).reduce((x,k)=>x?.[k],value):value;}
function listFrom(v){
 if(Array.isArray(v))return v;
 if(!v||typeof v!=='object')return null;
 for(const k of Object.keys(v)){if(['data','dados','result','results','items','lista','registros','retorno','content'].includes(k.toLowerCase())){const r=listFrom(v[k]);if(r)return r;}}
 return null;
}
async function queryDss(name,from,to,signal){
 const c=cfg[name];if(!c.path)return null;
 if(!['GET','POST'].includes(c.method))throw Error('Método inválido em '+name);
 if(!base)throw Error('DSS_BASE_URL não informado');
 const url=new URL(c.path.replace(/^\//,''),base.replace(/\/?$/,'/'));
 if(url.origin!==new URL(base).origin)throw Error('Origem DSS inválida');
 const fmt=(name==='viagens'||name==='pedidos')?d=>d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):d=>d;
 if(c.from)url.searchParams.set(c.from,fmt(from));
 if(c.to)url.searchParams.set(c.to,fmt(to));
 const headers={Accept:'application/json',...dssAuthHeaders()};
 let body;
 if(c.method==='POST'){headers['Content-Type']='application/json';body=(c.body||'{}').replaceAll('{{from}}',from).replaceAll('{{to}}',to);JSON.parse(body);}
 let r;
 const startedAt=Date.now();
 try{
  r=await fetch(url,{method:c.method,headers,body,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout),redirect:'error'});
 }catch(err){
  const reason=err?.name==='TimeoutError'||err?.name==='AbortError'?'tempo limite':'falha de conexão';
  console.error('[DSS] serviço',name,reason,'após',Date.now()-startedAt,'ms','tipo',err?.name||'Error');
  throw Error('Serviço '+name+': '+reason+' após '+Math.round((Date.now()-startedAt)/1000)+'s. Verifique acesso de rede, liberação de IP/VPN e desempenho do DSS.');
 }
 console.info('[DSS] serviço',name,'HTTP',r.status,'em',Date.now()-startedAt,'ms');
 if(!r.ok){
  if(r.status===401)throw Error('DSS recusou o usuário ou senha (HTTP 401). Confira DSS_USERNAME e DSS_PASSWORD no servidor privado.');
  if(r.status===403)throw Error('DSS negou acesso à operação (HTTP 403). Confira permissões e o módulo tms_integr_prog_pg_motorista.');
  if(r.status===404)throw Error('Rota '+name+' não encontrada no DSS (HTTP 404). Confira DSS_BASE_URL e DSS_'+name.toUpperCase()+'_PATH.');
  throw Error('Consulta '+name+' retornou HTTP '+r.status);
 }
 let v;
 try{v=await r.json();}
 catch{
  // DSS eventualmente responde HTML/texto com HTTP 200 (gateway/proxy), não um JSON.
  // Não aceitar esse conteúdo como lista vazia, nem registrar payload potencialmente sensível.
  console.warn('[DSS] serviço',name,'resposta inválida HTTP',r.status,'content-type',String(r.headers.get('content-type')||'não informado').slice(0,80));
  throw Error('DSS devolveu conteúdo inválido em '+name+' (HTTP '+r.status+', não é JSON). Tente um período menor ou novamente em alguns minutos.');
 }
 if(v&&typeof v.status==='number'&&v.status!==200)throw Error('DSS '+name+' recusou a consulta (status '+v.status+'): '+String(v.mensagemErro||'verifique permissões e credenciais').slice(0,180));
 const list=listFrom(getPath(v,c.dataPath));
 if(!list)throw Error('Resposta '+name+' não contém lista; confira o DATA_PATH.');
 if(Number.isInteger(v?.qtd_registros)&&v.qtd_registros>list.length)throw Error('DSS '+name+' indicou '+v.qtd_registros+' registros, mas retornou '+list.length+'. Verifique a paginação antes de gerar relatórios.');
 return list;
}
// Repetir apenas falhas transitórias de transporte ou resposta inválida; não repetir 401/403.
async function queryDssResilient(name,from,to,signal){
 try{return await queryDss(name,from,to,signal);}
 catch(error){
  signal?.throwIfAborted();
  const message=String(error?.message||'');
  const retry=/não é JSON|conteúdo inválido|tempo limite|falha de conexão|HTTP 50[0234]/i.test(message);
  if(!retry)throw error;
  console.warn('[DSS] repetindo serviço',name,'período',from,to,'causa',message.slice(0,130));
  await new Promise((resolve,reject)=>{const timer=setTimeout(done,800);function done(){signal?.removeEventListener('abort',abort);resolve();}function abort(){clearTimeout(timer);reject(signal.reason);}signal?.addEventListener('abort',abort,{once:true});});
  signal?.throwIfAborted();
  return queryDss(name,from,to,signal);
 }
}
/** Frontend local no MESMO servidor e origem da API.
 * Lista explícita: nunca servir .env, private/, api/ ou outros arquivos do disco.
 */
const webRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const staticFiles=new Map([
 ['/','index.html'],
 ['/index.html','index.html'],
 ['/styles.css','styles.css'],
 ['/logo-costalog-sem-fundo-1024x876.png','logo-costalog-sem-fundo-1024x876.png'],
 ['/Ideallog.png','Ideallog.png'],
 ...['portal-client.mjs','rv-stage-filter.mjs','date-controls.mjs','rv-status.mjs','portal-links.mjs','programming.mjs','programming-data.mjs','mobile-tables.mjs','rv-checklist.mjs','view-cache.mjs','workflow.mjs','workflow-ui.mjs','trip-timeline.mjs','data-quality.mjs','report-templates.mjs','filtering.mjs','companies.mjs','app.js','dss-mapping.mjs','operational.mjs','reporting.mjs','advanced-ui.mjs','access-ui.mjs','admin-users.mjs','site-config.mjs','visual-dashboard.mjs','intelligence.mjs','intelligence-ui.mjs'].map(name=>['/src/'+name,'src/'+name])
]);
async function serveLocalFrontend(req,res,url){
 if(req.method!=='GET'&&req.method!=='HEAD')return false;
 const path=staticFiles.get(url.pathname);
 if(!path)return false;
 const mime=path.endsWith('.css')?'text/css; charset=utf-8':path.endsWith('.js')||path.endsWith('.mjs')?'text/javascript; charset=utf-8':path.endsWith('.png')?'image/png':'text/html; charset=utf-8';
 try{
  const bytes=await readFile(join(webRoot,path));
  res.writeHead(200,{'Content-Type':mime,'Content-Length':bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"});
  res.end(req.method==='HEAD'?undefined:bytes);
 }catch(err){
  if(err.code==='ENOENT')reply(res,404,{error:'Arquivo da interface não encontrado. Execute o projeto na pasta completa Viagens-PF, não somente api/.'});
  else reply(res,500,{error:'Falha ao carregar a interface local.'});
 }
 return true;
}
async function synchronize(from,to,{refreshMode='recent',syncTo=to,signal,onProgress=()=>{}}={}){
 const started=Date.now();
   const windows=monthWindows(from,to);
   if(windows.length>12)throw Error('Período muito longo: selecione até 12 meses.');
   const combined=Object.fromEntries(Object.keys(cfg).map(k=>[k,[]]));
   const quality={periods:[],sources:[]};
   for(const window of windows)for(const name of Object.keys(cfg).filter(name=>cfg[name].path))onProgress({key:window.from+':'+name,label:({viagens:'Viagens / RV',pedidos:'Pedidos de frete',ctes:'CT-e',mdfes:'MDF-e'})[name],period:window.from.slice(0,7),status:'pending'});
   for(const name of [...optionalCatalogs.map(c=>c.name),'motoristas'])onProgress({key:name,label:({rotas:'Rotas',ocorrencias:'Ocorrências',programacoes:'Programações',motoristas:'Motoristas'})[name],status:'pending'});
   // Lotes de até 2 meses: impede que dez meses sejam processados em serie
   // sem disparar dezenas de chamadas simultaneas ao DSS.
   for(let offset=0;offset<windows.length;offset+=2){
    const batch=windows.slice(offset,offset+2);
    const results=await Promise.all(batch.map(async window=>{
     // Modo incremental: períodos encerrados anteriores aos dois meses mais recentes usam cache,
     // quando disponível. Meses recentes sempre buscam a DSS.
     signal?.throwIfAborted();
     const anchor=/^\d{4}-\d{2}-\d{2}$/.test(syncTo)&&syncTo>=to?syncTo:to;
     const recentBoundary=new Date(Date.UTC(Number(anchor.slice(0,4)),Number(anchor.slice(5,7))-2,1)).toISOString().slice(0,10);
     const refreshWindow=refreshMode==='1'||(refreshMode==='recent'&&window.to>=recentBoundary);
     let result=refreshWindow?null:await periodStore.read(window.from,window.to);const reused=!!result;
     if(result){
      console.info('[DSS] mês reutilizado do cache privado',window.from,window.to);
     }else{
      const pairs=await Promise.all(Object.keys(cfg).filter(name=>cfg[name].path).map(async name=>{const key=window.from+':'+name;onProgress({key,label:({viagens:'Viagens / RV',pedidos:'Pedidos de frete',ctes:'CT-e',mdfes:'MDF-e'})[name],period:window.from.slice(0,7),status:'running'});const rows=await queryDssResilient(name,window.from,window.to,signal);onProgress({key,status:'done'});return [name,rows];}));
      result={...Object.fromEntries(pairs),_syncedAt:new Date().toISOString()};
      // Só guardar o mês se todos os serviços principais terminaram com sucesso.
      await periodStore.write(window.from,window.to,result);
      console.info('[DSS] mês consultado',window.from,window.to);
     }
     if(reused)for(const name of Object.keys(cfg).filter(name=>cfg[name].path))onProgress({key:window.from+':'+name,label:({viagens:'Viagens / RV',pedidos:'Pedidos de frete',ctes:'CT-e',mdfes:'MDF-e'})[name],period:window.from.slice(0,7),status:'reused'});
     quality.periods.push({from:window.from,to:window.to,syncedAt:result._syncedAt||null,reused});
     return Object.entries(result).filter(([name])=>Object.hasOwn(combined,name));
    }));
    for(const result of results)for(const [name,rows] of result)combined[name].push(rows||[]);
   }
   const data=Object.fromEntries(Object.entries(combined).map(([name,groups])=>[name,mergeDssRows(groups,name)]));
   for(const catalog of optionalCatalogs){
    signal?.throwIfAborted();onProgress({key:catalog.name,label:({rotas:'Rotas',ocorrencias:'Ocorrências',programacoes:'Programações'})[catalog.name],status:'running'});
    if(!catalog.path){quality.sources.push({name:catalog.name,status:'disabled'});onProgress({key:catalog.name,status:'disabled'});continue;}
    try{
     if(catalog.name==='rotas')data.rotas=await optionalCatalog(catalog,from,to,signal);
     else if(catalog.name==='ocorrencias'){
      // Consulta adicional limitada a um mês para evitar atrasar o painel principal.
      if(monthWindows(from,to).length>1){quality.sources.push({name:catalog.name,status:'skipped'});onProgress({key:catalog.name,status:'skipped'});continue;}
      data.ocorrencias=await optionalCatalog(catalog,from,to,signal);
     }
     else{
      // Programacoes sao enriquecimento opcional e muito custoso em periodos longos.
      if(monthWindows(from,to).length>1){quality.sources.push({name:catalog.name,status:'skipped'});onProgress({key:catalog.name,status:'skipped'});continue;}
      const windows=monthWindows(from,to);
      const sets=[];
      sets.push(...await Promise.all(windows.map(win=>optionalCatalog(catalog,win.from,win.to,signal))));
      const ids=new Set();
      data.programacoes=sets.flat().filter(row=>{
       const id=String(row.empresa??'')+'~'+String(row.programacao_id??'');
       if(!row.programacao_id)return true;
       if(ids.has(id))return false;ids.add(id);return true;
      });
     }
     quality.sources.push({name:catalog.name,status:'ok'});onProgress({key:catalog.name,status:'done'});
    }catch(err){signal?.throwIfAborted();onProgress({key:catalog.name,status:'unavailable'});quality.sources.push({name:catalog.name,status:'unavailable'});console.warn('[DSS] catálogo opcional',catalog.name,'indisponível:',String(err.message).slice(0,110));}
   }
   signal?.throwIfAborted();onProgress({key:'motoristas',label:'Motoristas',status:'running'});
   if(driversPath){
    try{const names=await driverNames(signal);attachDriverNames(data,names);quality.sources.push({name:'motoristas',status:'ok'});}
    catch(err){quality.sources.push({name:'motoristas',status:'unavailable'});driverCatalog.expires=Date.now()+60_000;console.warn('[DSS] listarMotoristas indisponível:',err.name||'Error',String(err.message).slice(0,120));attachDriverNames(data,driverCatalog.items);}
   }
   signal?.throwIfAborted();onProgress({key:'motoristas',status:quality.sources.find(s=>s.name==='motoristas')?.status==='ok'?'done':driversPath?'unavailable':'disabled'});
   if(!driversPath)quality.sources.push({name:'motoristas',status:'disabled'});
   quality.sources.push({name:'viagens',status:'ok'},{name:'pedidos',status:'ok'},{name:'mdfes',status:cfg.mdfes.path?'ok':'reference'});
   const payload={mode:'live',quality,updatedAt:new Date().toISOString(),cacheHit:false,data:{viagens:data.viagens||[],pedidos:data.pedidos||[],ctes:data.ctes||[],mdfes:data.mdfes||[],rotas:data.rotas||[],programacoes:data.programacoes||[],ocorrencias:data.ocorrencias||[],sources:{viagens:true,pedidos:true,ctes:!!cfg.ctes.path,mdfes:!!cfg.mdfes.path,programacoes:quality.sources.some(s=>s.name==='programacoes'&&s.status==='ok'),ocorrencias:quality.sources.some(s=>s.name==='ocorrencias'&&s.status==='ok')}}};
   signal?.throwIfAborted();
   cachePut(from+'|'+to,payload);
   apiStats.success++;apiStats.lastSuccess=payload.updatedAt;
   console.info('[DSS] consulta concluída','período',from,to,'duração(ms)',Date.now()-started,'RVs',payload.data.viagens.length,'PFs',payload.data.pedidos.length);
   return payload;
}
const server=http.createServer(async(req,res)=>{
 const origin=req.headers.origin||'';
 if(req.method==='OPTIONS'){
  if(origin&&!origins.includes(origin))return reply(res,403,{error:'Origem não permitida'});
  res.writeHead(204,origin?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, PATCH, OPTIONS','Vary':'Origin'}:{});res.end();return;
 }
 let url;try{url=new URL(req.url,'http://localhost');}catch{return reply(res,400,{error:'Requisição inválida'},origin);}
 if(await serveLocalFrontend(req,res,url))return;
 const company=url.searchParams.get('company')||'costalog';
 if(['/api/overview','/api/records'].includes(url.pathname)&&!validCompany(company))return reply(res,400,{error:'Empresa inválida.'},origin);
 if(url.pathname==='/api/login'){
  if(req.method!=='POST')return reply(res,405,{error:'Método não permitido'},origin);
  if(!useAccounts)return reply(res,503,{error:'Login individual indisponível: configure PORTAL_USERS_FILE no servidor privado.'},origin);
  if(!canTryLogin(req))return reply(res,429,{error:'Tentativas de login excedidas. Aguarde 10 minutos.'},origin);
  try{
   const body=await bodyJSON(req);
   const session=login(body.username,body.password);
   if(!session)return reply(res,401,{error:'Usuário ou senha inválidos.'},origin);
   return reply(res,200,{...session,portalVersion:2,workflowStorage},origin);
  }catch{return reply(res,400,{error:'Dados de login inválidos.'},origin);}
 }
 if(url.pathname==='/api/logout'){
  if(req.method!=='POST')return reply(res,405,{error:'Método não permitido'},origin);
  const exiting=identify(req);if(exiting)portalSessions.release(exiting);
  if(useAccounts)logout(bearer(req));
  return reply(res,200,{ok:true},origin);
 }
 // Administração: apenas sessões individuais no servidor e role de administrador.
 if(url.pathname==='/api/change-password'){
  if(req.method!=='POST')return reply(res,405,{error:'Método não permitido'},origin);
  const user=useAccounts?identify(req):null;
  if(!user)return reply(res,401,{error:'Sessão inválida ou expirada.'},origin);
  if(!allowedRate(req))return reply(res,429,{error:'Aguarde antes de realizar outra tentativa.'},origin);
  try{
   const input=await bodyJSON(req);
   changeOwnPassword(user.username,input.currentPassword,input.newPassword);
   return reply(res,200,{ok:true,message:'Senha alterada. Faça login novamente.'},origin);
  }catch(err){return reply(res,err instanceof AccountError?err.status:400,{error:err instanceof AccountError?err.message:'Não foi possível alterar a senha.'},origin);}
 }
 if(url.pathname==='/api/users'||url.pathname.startsWith('/api/users/')){
  const user=useAccounts?identify(req):null;
  if(!user)return reply(res,401,{error:'Sessão inválida ou expirada.'},origin);
  if(!user.permissions.admin)return reply(res,403,{error:'Apenas administradores podem gerenciar contas.'},origin);
  if(user.mustChangePassword)return reply(res,403,{error:'Altere sua senha provisória antes de gerenciar usuários.'},origin);
  if(!allowedRate(req))return reply(res,429,{error:'Limite de solicitações atingido.'},origin);
  try{
   if(url.pathname==='/api/users'){
    if(req.method==='GET')return reply(res,200,{users:listAccounts()},origin);
    if(req.method==='POST'){
     const input=await bodyJSON(req);
     const created=createAccount(input);
     console.info('[USERS]',user.username,'criou',created.username,'perfil',created.role);
     return reply(res,201,{user:created},origin);
    }
   }else if(req.method==='PATCH'){
    const target=decodeURIComponent(url.pathname.slice('/api/users/'.length));
    if(target.includes('/')||!target)return reply(res,400,{error:'Nome de usuário inválido.'},origin);
    const input=await bodyJSON(req);
    const updated=updateAccount(target,input.action,input,user.username);
    console.info('[USERS]',user.username,'alterou',updated.username,'ação',input.action);
    return reply(res,200,{user:updated},origin);
   }
   return reply(res,405,{error:'Método não permitido.'},origin);
  }catch(err){
   if(err instanceof AccountError)return reply(res,err.status,{error:err.message},origin);
   if(err.message?.includes('Senha precisa'))return reply(res,400,{error:err.message},origin);
   console.error('[USERS] falha ao atualizar contas:',err.code||err.name);
   return reply(res,500,{error:'Não foi possível salvar as contas. Verifique permissões do volume privado no servidor.'},origin);
  }
 }
 if(url.pathname==='/api/workflow'){
  const user=identify(req);
  if(!user)return reply(res,401,{error:'Sessão inválida ou expirada.'},origin);
  if(user.mustChangePassword)return reply(res,403,{error:'Altere sua senha provisória.'},origin);
  if(!user.permissions.operacional)return reply(res,403,{error:'Acesso operacional necessário.'},origin);
  if(!validCompany(company))return reply(res,400,{error:'Empresa inválida.'},origin);
  if(!allowedRate(req))return reply(res,429,{error:'Limite de solicitações atingido.'},origin);
  try{
   if(req.method==='GET'){
    const key=url.searchParams.get('key')||'';
    const result=await workflowStore.get(company,key);
    return reply(res,200,key?{task:result,storage:workflowStorage}:{tasks:result,storage:workflowStorage},origin);
   }
   if(req.method==='PATCH'){
    const input=await bodyJSON(req).catch(()=>{const error=Error('Dados do tratamento inválidos.');error.status=400;throw error;});
    const task=await workflowStore.save(company,input.key,input,user.username);
    return reply(res,200,{task,storage:workflowStorage},origin);
   }
   return reply(res,405,{error:'Método não permitido.'},origin);
  }catch(error){
   const status=error.status||(/inválid|Prazo|Responsável|Situação|Histórico|Versão/.test(error.message)?400:500);
   return reply(res,status,{error:status===500?'Não foi possível acessar os tratamentos no armazenamento privado.':error.message},origin);
  }
 }
 if(url.pathname.startsWith('/api/portal/')||url.pathname==='/api/preferences'){
  const user=identify(req);
  if(!user)return reply(res,401,{error:'Sessão inválida ou expirada.'},origin);
  if(user.mustChangePassword||!user.permissions.operacional)return reply(res,403,{error:'Acesso operacional necessário e senha provisória deve ser alterada.'},origin);
  if(!validCompany(company))return reply(res,400,{error:'Empresa inválida.'},origin);
  if(!allowedRate(req))return reply(res,429,{error:'Limite de consultas atingido. Aguarde.'},origin);
  try{
   if(url.pathname==='/api/preferences'){
    if(req.method==='GET')return reply(res,200,privateState.enabled?{...await preferencesStore.get(company,user.username),storage:'server',durable:true}:{revision:0,values:{},storage:'browser',durable:false},origin);
    if(req.method==='PATCH'){if(!privateState.enabled)return reply(res,409,{error:'As preferências deste ambiente são salvas no navegador, por usuário e empresa.',code:'BROWSER_PREFERENCES'},origin);return reply(res,200,await preferencesStore.save(company,user.username,await bodyJSON(req,110000)),origin);}
   }
   if(url.pathname==='/api/portal/sync'){
    if(req.method==='POST')return reply(res,202,portalSessions.start(await bodyJSON(req),user),origin);
    if(req.method==='GET')return reply(res,200,portalSessions.status(url.searchParams.get('id'),user),origin);
    if(req.method==='PATCH')return reply(res,200,portalSessions.cancel((await bodyJSON(req)).id,user),origin);
   }
   if(req.method==='POST'&&['/api/portal/view','/api/portal/metrics','/api/portal/detail','/api/portal/export','/api/portal/compare','/api/portal/import'].includes(url.pathname)){
    const input=await bodyJSON(req,110000),snapshot=portalSessions.get(input.snapshot,user);
    const result=await portalResponse({action:url.pathname.split('/').at(-1),input,snapshot,user,company,workflowStore,portalSessions});
    return reply(res,200,result,origin,req.headers['accept-encoding']||'');
   }
   return reply(res,405,{error:'Método não permitido.'},origin);
  }catch(error){console.warn('[PORTAL] falha',error.code||error.name);return reply(res,error.status||503,{error:error.status&&error.status<500?error.message:'Serviço indisponível. Verifique o armazenamento privado ou tente novamente.'},origin);}
 }
 if(req.method!=='GET')return reply(res,405,{error:'Método não permitido'},origin);
 if(url.pathname==='/api/health')return reply(res,200,{status:'ok',configured:!!(base&&cfg.viagens.path&&cfg.pedidos.path&&dssCredentialsReady()&&(useAccounts||(allowLegacy&&env.PORTAL_ACCESS_TOKEN))),accounts:useAccounts},origin);
 const user=identify(req);
 if(url.pathname==='/api/me'){
  if(!user)return reply(res,401,{error:'Sessão inválida ou expirada'},origin);
  return reply(res,200,{user:{username:user.username,displayName:user.displayName,role:user.role,mustChangePassword:!!user.mustChangePassword},permissions:user.permissions},origin);
 }
 if(url.pathname==='/api/status'){
  if(!user)return reply(res,401,{error:'Não autorizado'},origin);
  if(user.mustChangePassword)return reply(res,403,{error:'Altere a senha provisória.'},origin);
  if(!user.permissions.admin)return reply(res,403,{error:'Somente administradores podem consultar diagnósticos.'},origin);
  return reply(res,200,{status:'ok',configured:!!(base&&dssCredentialsReady()),lastSuccess:apiStats.lastSuccess,lastFailure:apiStats.lastFailure,counters:{...apiStats},cacheEntries:CACHE.size,cacheSeconds:cacheMaxAge/1000,periodStoreEnabled:periodStore.enabled,privateState:{driver:privateState.driver,durable:privateState.durable},periodStoreType:env.MARIADB_ENABLED==='true'?'mariadb':env.DSS_PERIOD_CACHE_DIR?'file':'disabled'},origin);
 }
 if(url.pathname==='/api/records'){
  if(!user)return reply(res,401,{error:'Sessão inválida ou expirada'},origin);
  if(user.mustChangePassword)return reply(res,403,{error:'Altere sua senha antes de consultar registros.'},origin);
  if(!allowedRate(req))return reply(res,429,{error:'Muitas consultas. Tente novamente.'},origin);
  const from=url.searchParams.get('from')||'',to=url.searchParams.get('to')||'',kind=url.searchParams.get('kind')||'viagens';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)return reply(res,400,{error:'Período inválido'},origin);
  if(!['viagens','pedidos'].includes(kind))return reply(res,400,{error:'Tipo inválido'},origin);
  const page=Math.max(1,Number.parseInt(url.searchParams.get('page')||'1',10)||1);
  const size=Math.min(100,Math.max(1,Number.parseInt(url.searchParams.get('page_size')||'15',10)||15));
  const search=String(url.searchParams.get('search')||'').trim().toLocaleLowerCase('pt-BR').slice(0,100);
  const sortField=url.searchParams.get('sort')||'',sortDir=url.searchParams.get('direction')==='asc'?1:-1;
  const permittedSort=kind==='viagens'?['data_inicio','nro_rv','cliente_nome','placa_veiculo']:['nro_pf','nro_cte','total_frete'];
  if(sortField&&!permittedSort.includes(sortField))return reply(res,400,{error:'Ordenação inválida'},origin);
  const months=monthWindows(from,to);
  if(months.length>12)return reply(res,400,{error:'Selecione no máximo 12 meses'},origin);
  const source={viagens:[],pedidos:[]};
  for(const month of months){
   const cachedMonth=await periodStore.read(month.from,month.to);
   if(!cachedMonth)return reply(res,409,{error:'Dados deste período ainda não sincronizados. Use Atualizar dados da DSS.',missingPeriod:month},origin);
   for(const type of ['viagens','pedidos'])source[type].push(cachedMonth[type]||[]);
  }
  // Primeiro aplicar projeção por perfil, antes de pesquisar, ordenar ou devolver registros.
  const scoped=projectOverview({data:{viagens:mergeDssRows(source.viagens,'viagens'),pedidos:mergeDssRows(source.pedidos,'pedidos'),ctes:[],mdfes:[],rotas:[],programacoes:[],ocorrencias:[],sources:{}}},user.role,company).data[kind];
  let rows=scoped;
  if(search)rows=rows.filter(record=>Object.values(record).some(v=>(typeof v==='string'||typeof v==='number')&&String(v).toLocaleLowerCase('pt-BR').includes(search)));
  if(sortField)rows=[...rows].sort((a,b)=>{const x=a[sortField],y=b[sortField];return (String(x??'').localeCompare(String(y??''),'pt-BR',{numeric:true}))*sortDir;});
  const total=rows.length,pages=Math.max(1,Math.ceil(total/size));
  return reply(res,200,{kind,company,from,to,page:Math.min(page,pages),pageSize:size,total,pages,rows:rows.slice((Math.min(page,pages)-1)*size,Math.min(page,pages)*size),source:'cache'},origin,req.headers['accept-encoding']||'');
 }
 if(url.pathname!=='/api/overview')return reply(res,404,{error:'Rota não encontrada'},origin);
 if(!user)return reply(res,401,{error:'Sessão inválida ou expirada'},origin);
 if(user.mustChangePassword)return reply(res,403,{error:'Altere sua senha provisória antes de consultar o DSS.',code:'PASSWORD_CHANGE_REQUIRED'},origin);
 if(!allowedRate(req))return reply(res,429,{error:'Limite de consultas atingido. Aguarde um minuto e tente novamente.'},origin);
 if(!base)return reply(res,503,{error:'DSS_BASE_URL não configurado no servidor privado.'},origin);
 if(!dssCredentialsReady())return reply(res,503,{error:'Basic Auth do DSS não configurado no backend. Informe DSS_USERNAME e DSS_PASSWORD no arquivo .env privado.'},origin);
 const from=url.searchParams.get('from')||'',to=url.searchParams.get('to')||'';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)return reply(res,400,{error:'Intervalo de datas inválido'},origin);
 const refreshMode=url.searchParams.get('refresh')||'';
 const forceRefresh=refreshMode==='1'||refreshMode==='recent';
 const cacheKey=from+'|'+to+(forceRefresh?'|refresh':'');
 const includeCompanies=url.searchParams.get('include_companies')==='1';
 const cached=forceRefresh?null:cacheGet(cacheKey);
 if(cached){apiStats.cached++;return reply(res,200,projectPortalOverview({...cached,cacheHit:true},user.role,company,{includeCompanies}),origin,req.headers['accept-encoding']||'');}
 const started=Date.now();
 let pending=INFLIGHT.get(cacheKey);
 if(!pending){
  pending=(async()=>{
   return synchronize(from,to,{refreshMode,syncTo:url.searchParams.get('sync_to')||to});
  })();
  INFLIGHT.set(cacheKey,pending);
  pending.finally(()=>{if(INFLIGHT.get(cacheKey)===pending)INFLIGHT.delete(cacheKey);}).catch(()=>{});
 }else console.info('[DSS] consulta idêntica reutilizada, período',from,to);
 try{
  const payload=await pending;
  return reply(res,200,projectPortalOverview(payload,user.role,company,{includeCompanies}),origin,req.headers['accept-encoding']||'');
 }catch(err){
  apiStats.failed++;apiStats.lastFailure=new Date().toISOString();
  console.error('[DSS]',err.name,err.message);
  return reply(res,502,{error:'Falha na consulta ao DSS: '+err.message},origin);
 }
});
server.listen(port,'0.0.0.0',()=>console.log('Portal COSTALOG API na porta '+port));
