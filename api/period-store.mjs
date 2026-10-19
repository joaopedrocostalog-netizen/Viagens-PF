import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

/** Cache de períodos completos, em arquivo privado. NUNCA persistir projeções por usuário. */
export function createPeriodStore({dir='',ttlMs=86400000}={}){
 const root=String(dir||'').trim();
 const enabled=!!root;
 const keyOf=(from,to)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))throw Error('Período inválido');return from+'_'+to;};
 const path=(from,to)=>join(root,keyOf(from,to)+'.json');
 return {
  enabled,
  async read(from,to){
   if(!enabled)return null;
   try{
    const parsed=JSON.parse(await readFile(path(from,to),'utf8'));
    if(parsed?.version!==1||parsed.from!==from||parsed.to!==to||!Number.isFinite(parsed.at)||Date.now()-parsed.at>ttlMs)return null;
    if(!Array.isArray(parsed.data?.viagens)||!Array.isArray(parsed.data?.pedidos))return null;
    return parsed.data;
   }catch(err){if(err.code==='ENOENT')return null;console.warn('[CACHE] leitura inválida',err.code||err.name);return null;}
  },
  async write(from,to,data){
   if(!enabled)return false;
   const filename=path(from,to),tmp=filename+'.'+randomUUID()+'.tmp';
   try{
    await mkdir(root,{recursive:true,mode:0o700});
    await writeFile(tmp,JSON.stringify({version:1,from,to,at:Date.now(),data}),{mode:0o600,flag:'wx'});
    await rename(tmp,filename);
    return true;
   }catch(err){console.warn('[CACHE] gravação indisponível',err.code||err.name);return false;}
  }
 };
}
