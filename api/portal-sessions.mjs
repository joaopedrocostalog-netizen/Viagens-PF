import {randomUUID} from 'node:crypto';
import {parseEditableDate} from '../src/date-controls.mjs';
import {monthWindows} from './dss-periods.mjs';
const fail=(message,status)=>Object.assign(Error(message),{status});
/** Jobs carry no rows in status responses. Snapshots publish atomically after ALL sources finish. */
export function createPortalSessions({synchronize,maxSnapshots=6,maxJobs=20,ttlMs=2*3600000}={}){
 const jobs=new Map(),snapshots=new Map();
 const owned=(map,id,user)=>{const v=map.get(id);if(!v||v.username!==user.username)throw fail('Consulta não encontrada ou expirada. Atualize os dados.',404);return v;};
 const publicJob=j=>({id:j.id,status:j.status,from:j.from,to:j.to,steps:j.steps,completed:j.steps.filter(s=>['done','unavailable','reused','disabled','skipped'].includes(s.status)).length,total:j.steps.length,snapshot:j.snapshot||null,error:j.error||''});
 const prune=()=>{for(const map of [jobs,snapshots])for(const [id,v] of map)if(Date.now()-v.touched>ttlMs&&v.status!=='running')map.delete(id);};
 return {
  start(input,user){
   prune();const {from,to}=input;
   if(!from||!to||parseEditableDate(from)!==from||parseEditableDate(to)!==to||from>to||monthWindows(from,to).length>12)throw fail('Período inválido. Selecione até 12 meses.',400);
   if([...jobs.values()].filter(j=>j.status==='running'&&j.username===user.username).length>=2||[...jobs.values()].filter(j=>j.status==='running').length>=4)throw fail('Já existe uma consulta em andamento. Cancele ou aguarde.',429);
   while(jobs.size>=maxJobs){const old=[...jobs.values()].find(j=>j.status!=='running');if(!old)throw fail('Consultas ocupadas. Aguarde.',429);jobs.delete(old.id);}
   const j={id:randomUUID(),username:user.username,from,to,status:'running',steps:[],touched:Date.now(),controller:new AbortController()};jobs.set(j.id,j);
   const progress=step=>{if(j.status!=='running')return;const old=j.steps.find(s=>s.key===step.key);if(old)Object.assign(old,step);else j.steps.push(step);j.touched=Date.now();};
   Promise.resolve().then(()=>synchronize(from,to,{signal:j.controller.signal,onProgress:progress,refreshMode:input.refresh==='cached'?'':'recent',syncTo:to})).then(payload=>{
    if(j.status!=='running'||j.controller.signal.aborted)return;
    const id=randomUUID();while(snapshots.size>=maxSnapshots)snapshots.delete(snapshots.keys().next().value);
    snapshots.set(id,{id,username:j.username,from,to,payload,touched:Date.now()});j.snapshot=id;j.status='complete';j.touched=Date.now();
   }).catch(error=>{if(j.status==='cancelled')return;j.controller.abort();j.status='failed';j.error='Não foi possível concluir a consulta. Os dados anteriores foram mantidos.';j.touched=Date.now();console.warn('[SYNC] consulta interrompida',error.code||error.name);});
   return publicJob(j);
  },
  status(id,user){const j=owned(jobs,id,user);j.touched=Date.now();return publicJob(j);},
  cancel(id,user){const j=owned(jobs,id,user);if(j.status==='running'){j.status='cancelled';j.controller.abort();j.touched=Date.now();}return publicJob(j);},
  get(id,user){prune();const s=owned(snapshots,id,user);s.touched=Date.now();return s;},
  release(user){for(const j of jobs.values())if(j.username===user.username&&j.status==='running'){j.status='cancelled';j.controller.abort();}for(const [id,s] of snapshots)if(s.username===user.username)snapshots.delete(id);}
 };
}
