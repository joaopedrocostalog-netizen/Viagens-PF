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
 return {path:env[k+'_PATH'],method:(env[k+'_METHOD']||'GET').toUpperCase(),from:env[k+'_QUERY_FROM'],to:env[k+'_QUERY_TO'],body:env[k+'_BODY_TEMPLATE']||'',dataPath:env[k+'_DATA_PATH']||''};
}
const cfg=Object.fromEntries(['viagens','pedidos','ctes','mdfes'].map(k=>[k,config(k)]));
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
 if(c.from)url.searchParams.set(c.from,from);
 if(c.to)url.searchParams.set(c.to,to);
 const headers={Accept:'application/json'};
 if(env.DSS_AUTH_HEADER&&env.DSS_AUTH_VALUE)headers[env.DSS_AUTH_HEADER]=env.DSS_AUTH_VALUE;
 let body;
 if(c.method==='POST'){headers['Content-Type']='application/json';body=(c.body||'{}').replaceAll('{{from}}',from).replaceAll('{{to}}',to);JSON.parse(body);}
 const r=await fetch(url,{method:c.method,headers,body,signal:AbortSignal.timeout(timeout),redirect:'error'});
 if(!r.ok)throw Error('Consulta '+name+' retornou HTTP '+r.status);
 let v;try{v=await r.json();}catch{throw Error('Resposta '+name+' não é JSON');}
 const list=listFrom(getPath(v,c.dataPath));
 if(!list)throw Error('Resposta '+name+' não contém lista; confira o DATA_PATH.');
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
 if(url.pathname==='/api/health')return reply(res,200,{status:'ok',configured:!!(base&&cfg.viagens.path&&cfg.pedidos.path&&env.PORTAL_ACCESS_TOKEN)},origin);
 if(url.pathname!=='/api/overview')return reply(res,404,{error:'Rota não encontrada'},origin);
 if(!authorized(req))return reply(res,401,{error:'Acesso ao portal não autorizado'},origin);
 if(!base||!cfg.viagens.path||!cfg.pedidos.path)return reply(res,503,{error:'DSS ainda não configurado com os endpoints validados.'},origin);
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
