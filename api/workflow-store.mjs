import {readFile,mkdir,writeFile,rename,unlink} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {validCompany} from '../src/companies.mjs';
import {validTaskKey,updateTask,taskSummary} from '../src/workflow.mjs';

/** Arquivo privado independente da DSS. Escritas serializadas e substituição atômica. */
export function createWorkflowStore({file='',documents}={}){
 if(documents)return {enabled:documents.enabled,
  async get(company,key=''){if(!validCompany(company)||key&&!validTaskKey(key,company))throw Object.assign(Error('Empresa ou pendência inválida.'),{status:400});const tasks=await documents.read('workflow:'+company)||{};return key?(tasks[key]||null):Object.fromEntries(Object.entries(tasks).map(([k,v])=>[k,taskSummary(v)]));},
  async save(company,key,input,actor){if(!validCompany(company)||!validTaskKey(key,company))throw Object.assign(Error('Empresa ou pendência inválida.'),{status:400});let task;await documents.transact('workflow:'+company,tasks=>{tasks||={};task=updateTask(tasks[key],input,actor);return {...tasks,[key]:task};});return task;}
 };
 let queue=Promise.resolve();
 const ready=()=>{if(!file){const e=Error('Armazenamento de tratamentos indisponível. Configure PORTAL_WORKFLOW_FILE em um volume privado persistente.');e.status=503;throw e;}};
 async function read(){ready();try{const data=JSON.parse(await readFile(file,'utf8'));if(data.version!==1||!data.companies)throw Error('Formato inválido');return data;}catch(e){if(e.code==='ENOENT')return {version:1,companies:{costalog:{},ideallog:{}}};throw e;}}
 function validate(company,key){if(!validCompany(company)||(key&&!validTaskKey(key,company))){const e=Error('Empresa ou pendência inválida.');e.status=400;throw e;}}
 return {enabled:!!file,
  async get(company,key=''){
   validate(company,key);await queue;const data=await read(),tasks=data.companies[company]||{};
   return key?(tasks[key]||null):Object.fromEntries(Object.entries(tasks).map(([key,task])=>[key,taskSummary(task)]));
  },
  save(company,key,input,actor){
   const operation=queue.then(async()=>{
    validate(company,key);if(!key){const e=Error('Pendência inválida.');e.status=400;throw e;}
    const data=await read();data.companies[company]||={};
    const task=updateTask(data.companies[company][key],input,actor);data.companies[company][key]=task;
    await mkdir(dirname(file),{recursive:true,mode:0o700});
    const temp=join(dirname(file),'.workflow-'+randomBytes(10).toString('hex')+'.tmp');
    try{await writeFile(temp,JSON.stringify(data),{mode:0o600,flag:'wx'});await rename(temp,file);}catch(e){await unlink(temp).catch(()=>{});throw e;}
    return task;
   });
   queue=operation.catch(()=>{});return operation;
  }
 };
}
