/**
 * Proxy privado DSS -> Portal COSTALOG.
 * Node.js >=20. Nunca guardar credenciais DSS no frontend.
 * Caminhos e parâmetros são configurados após validar o Swagger.
 */
import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';
const env=process.env;
const port=Number(env.PORT||3001);
const base=env.DSS_BASE_URL||'';
const origins=(env.PORTAL_ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
const timeout=Math.max(1000,Number(env.DSS_TIMEOUT_MS||20000));
function config(name){
 const k='DSS_'+name.toUpperCase();
 return {path:env[k+'_PATH']||({DSS_VIAGENS:'/listarViagens',DSS_PEDIDOS:'/listarPedidosFrete'}[k]||''),method:(env[k+'_METHOD']||'GET').toUpperCase(),from:env[k+'_QUERY_FROM']||(name==='viagens'||name==='pedidos'?'data_inicio':''),to:env[k+'_QUERY_TO']||(name==='viagens'||name==='pedidos'?'data_fim':''),body:env[k+'_BODY_TEMPLATE']||'',dataPath:env[k+'_DATA_PATH']||(name==='viagens'||name==='pedidos'?'registros':'')};
}
const cfg=Object.fromEntries(['viagens','pedidos','ctes','mdfes'].map(k=>[k,config(k)]));
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
function reply(res,code,body,origin){
 const str=JSON.stringify(body),h={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':Buffer.byteLength(str),'X-Content-Type-Options':'nosniff'};
 if(origin&&origins.includes(origin)){h['Access-Control-Allow-Origin']=origin;h['Vary']='Origin';h['Access-Control-Allow-Headers']='Authorization, Content-Type';h['Access-Control-Allow-Methods']='GET, OPTIONS';}
 res.writeHead(code,h);res.end(str);
}
function authorized(req){
 const s=env.PORTAL_ACCESS_TOKEN;
 if(!s)return false;
 const a=Buffer.from(s),b=Buffer.from((req.headers.authorization||'').replace(/^Bearer\s+/i,''));
 return a.length===b.length&&timingSafeEqual(a,b);
}
function getPath(value,path){return path?path.split('.').filter(Boolean).reduce((x,k)=>x?.[k],value):value;}
function listFrom(v){
 if(Array.isArray(v))return v;
 if(!v||typeof v!=='object')return null;
 for(const k of Object.keys(v)){if(['data','dados','result','results','items','lista','registros','retorno','content'].includes(k.toLowerCase())){const r=listFrom(v[k]);if(r)return r;}}
 return null;
}
async function queryDss(name,from,to){
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
 const r=await fetch(url,{method:c.method,headers,body,signal:AbortSignal.timeout(timeout),redirect:'error'});
 if(!r.ok){
  if(r.status===401)throw Error('DSS recusou o usuário ou senha (HTTP 401). Confira DSS_USERNAME e DSS_PASSWORD no servidor privado.');
  if(r.status===403)throw Error('DSS negou acesso à operação (HTTP 403). Confira permissões e o módulo tms_integr_prog_pg_motorista.');
  if(r.status===404)throw Error('Rota '+name+' não encontrada no DSS (HTTP 404). Confira DSS_BASE_URL e DSS_'+name.toUpperCase()+'_PATH.');
  throw Error('Consulta '+name+' retornou HTTP '+r.status);
 }
 let v;try{v=await r.json();}catch{throw Error('Resposta '+name+' não é JSON');}
 if(v&&typeof v.status==='number'&&v.status!==200)throw Error('DSS '+name+' recusou a consulta (status '+v.status+'): '+String(v.mensagemErro||'verifique permissões e credenciais').slice(0,180));
 const list=listFrom(getPath(v,c.dataPath));
 if(!list)throw Error('Resposta '+name+' não contém lista; confira o DATA_PATH.');
 if(Number.isInteger(v?.qtd_registros)&&v.qtd_registros>list.length)throw Error('DSS '+name+' indicou '+v.qtd_registros+' registros, mas retornou '+list.length+'. Verifique a paginação antes de gerar relatórios.');
 return list;
}
const server=http.createServer(async(req,res)=>{
 const origin=req.headers.origin||'';
 if(req.method==='OPTIONS'){
  if(origin&&!origins.includes(origin))return reply(res,403,{error:'Origem não permitida'});
  res.writeHead(204,origin?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, OPTIONS','Vary':'Origin'}:{});res.end();return;
 }
 let url;try{url=new URL(req.url,'http://localhost');}catch{return reply(res,400,{error:'Requisição inválida'},origin);}
 if(req.method!=='GET')return reply(res,405,{error:'Método não permitido'},origin);
 if(url.pathname==='/api/health')return reply(res,200,{status:'ok',configured:!!(base&&cfg.viagens.path&&cfg.pedidos.path&&env.PORTAL_ACCESS_TOKEN&&dssCredentialsReady())},origin);
 if(url.pathname!=='/api/overview')return reply(res,404,{error:'Rota não encontrada'},origin);
 if(!authorized(req))return reply(res,401,{error:'Acesso ao portal não autorizado'},origin);
 if(!base)return reply(res,503,{error:'DSS_BASE_URL não configurado no servidor privado.'},origin);
 if(!dssCredentialsReady())return reply(res,503,{error:'Basic Auth do DSS não configurado no backend. Informe DSS_USERNAME e DSS_PASSWORD no arquivo .env privado.'},origin);
 const from=url.searchParams.get('from')||'',to=url.searchParams.get('to')||'';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)return reply(res,400,{error:'Intervalo de datas inválido'},origin);
 try{
  const result=await Promise.all(Object.keys(cfg).map(async name=>[name,await queryDss(name,from,to)]));
  const data=Object.fromEntries(result);
  return reply(res,200,{mode:'live',updatedAt:new Date().toISOString(),data:{viagens:data.viagens||[],pedidos:data.pedidos||[],ctes:data.ctes||[],mdfes:data.mdfes||[],sources:{viagens:true,pedidos:true,ctes:!!cfg.ctes.path,mdfes:!!cfg.mdfes.path}}},origin);
 }catch(err){
  console.error('[DSS]',err.name,err.message); // Nunca imprimir tokens/payloads DSS.
  return reply(res,502,{error:'Falha na consulta ao DSS: '+(err.name==='TimeoutError'?'tempo limite':err.message)},origin);
 }
});
server.listen(port,'0.0.0.0',()=>console.log('Portal COSTALOG API na porta '+port));
