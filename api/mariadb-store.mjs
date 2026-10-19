/** Repositório opcional no MariaDB já compartilhado pela empresa.
 * Acessa EXCLUSIVAMENTE viagens_pf_period_cache. Nunca executa DDL automaticamente.
 */
const TABLE='viagens_pf_period_cache';
export function mariaDbSettings(env=process.env){
 const enabled=env.MARIADB_ENABLED==='true';
 return {enabled,host:env.MARIADB_HOST||'127.0.0.1',port:Number(env.MARIADB_PORT||3306),database:env.MARIADB_DATABASE||'',user:env.MARIADB_USER||'',password:env.MARIADB_PASSWORD||'',ssl:env.MARIADB_SSL==='true'};
}
export function createMariaDbPeriodStore({env=process.env,connect}={}){
 const cfg=mariaDbSettings(env),valid=!!(cfg.database&&cfg.user&&cfg.password);
 let poolPromise=null;
 const getPool=async()=>{
  if(!cfg.enabled)throw Error('MariaDB desativado');
  if(!valid)throw Error('MariaDB habilitado sem MARIADB_DATABASE, MARIADB_USER ou MARIADB_PASSWORD');
  if(!poolPromise)poolPromise=(async()=>{
   const driver=connect?null:await import('mysql2/promise');
   return connect?connect(cfg):driver.createPool({host:cfg.host,port:cfg.port,database:cfg.database,user:cfg.user,password:cfg.password,ssl:cfg.ssl?{}:undefined,waitForConnections:true,connectionLimit:3,queueLimit:10,connectTimeout:8000,decimalNumbers:false});
  })().catch(e=>{poolPromise=null;throw e;});
  return poolPromise;
 };
 const check=(a,b)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(a)||!/^\d{4}-\d{2}-\d{2}$/.test(b)||a>b)throw Error('Período inválido');};
 return {
  enabled:cfg.enabled,
  async read(from,to){
   if(!cfg.enabled)return null;
   check(from,to);
   try{
    const db=await getPool();
    const [rows]=await db.execute('SELECT payload_json FROM '+TABLE+' WHERE period_from=? AND period_to=? AND expires_at>UTC_TIMESTAMP() LIMIT 1',[from,to]);
    if(!rows.length)return null;
    const payload=JSON.parse(rows[0].payload_json);
    if(!payload||typeof payload!=='object'||!Array.isArray(payload.viagens)||!Array.isArray(payload.pedidos))return null;
    return payload;
   }catch(err){console.warn('[MARIADB] leitura indisponível:',err.code||err.name);return null;}
  },
  async write(from,to,data){
   if(!cfg.enabled)return false;
   check(from,to);
   if(!Array.isArray(data?.viagens)||!Array.isArray(data?.pedidos))return false;
   try{
    const db=await getPool();
    const ttl=Math.max(1,Math.min(720,Number(env.MARIADB_CACHE_HOURS||24)));
    const expires=new Date(Date.now()+ttl*3600000).toISOString().slice(0,19).replace('T',' ');
    await db.execute('INSERT INTO '+TABLE+' (period_from,period_to,payload_json,expires_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE payload_json=VALUES(payload_json),expires_at=VALUES(expires_at),updated_at=CURRENT_TIMESTAMP',[from,to,JSON.stringify(data),expires]);
    return true;
   }catch(err){console.warn('[MARIADB] gravação indisponível:',err.code||err.name);return false;}
  }
 };
}
