/** Explicit import only. Does not create tables, delete source data or overwrite existing documents. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createPrivateState} from './private-state.mjs';
import {validTaskKey} from '../src/workflow.mjs';
export async function importWorkflow({file,documents}){
 if(!documents.enabled)throw Error('Configure armazenamento persistente antes de importar.');
 const text=await readFile(file,'utf8'),value=JSON.parse(text);
 if(value.version!==1||!value.companies)throw Error('Arquivo de tratamentos inválido.');
 for(const company of ['costalog','ideallog'])for(const key of Object.keys(value.companies[company]||{}))if(!validTaskKey(key,company))throw Error('Arquivo contém chave inválida para a empresa.');
 const backup=file+'.backup-'+Date.now();await writeFile(backup,text,{mode:0o600,flag:'wx',flush:true});
 for(const company of ['costalog','ideallog']){
  const incoming=value.companies[company]||{};
  await documents.transact('workflow:'+company,existing=>{
   if(existing&&Object.keys(existing).length)throw Error('Destino já contém tratamentos. Importação interrompida sem sobrescrever dados.');
   return incoming;
  });
 }
 return {backup};
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 try{const file=process.env.PORTAL_WORKFLOW_FILE;if(!file)throw Error('Defina PORTAL_WORKFLOW_FILE com o arquivo privado de origem.');await importWorkflow({file,documents:createPrivateState()});console.info('Tratamentos importados; backup privado mantido junto à origem.');}
 catch(error){console.error('Importação não concluída:',error.code||error.message);process.exitCode=1;}
}
