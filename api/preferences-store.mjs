import {validCompany} from '../src/companies.mjs';
const KEYS=new Set(['metricLayout','hiddenColumns','presets','reportTemplates','tableSort','reportColumnOrder','reportFormat']);
function clean(value,depth=0){
 if(depth>12)throw Error('Preferências muito complexas.');
 if(value===null||typeof value==='boolean'||typeof value==='number')return value;
 if(typeof value==='string'){if(value.length>500)throw Error('Texto muito longo.');return value;}
 if(Array.isArray(value)){if(value.length>100)throw Error('Limite de preferências atingido.');return value.map(v=>clean(v,depth+1));}
 if(value&&typeof value==='object'){const entries=Object.entries(value);if(entries.length>100)throw Error('Limite de preferências atingido.');return Object.fromEntries(entries.map(([k,v])=>{if(['__proto__','prototype','constructor'].includes(k)||k.length>100)throw Error('Preferência inválida.');return [k,clean(v,depth+1)];}));}
 throw Error('Preferência inválida.');
}
export function createPreferencesStore(documents){
 const key=(company,username)=>{if(!validCompany(company)||!/^[a-z0-9._-]{3,60}$/.test(username))throw Object.assign(Error('Usuário ou empresa inválido.'),{status:400});return 'preferences:'+company+':'+username;};
 return {
  async get(company,username){return await documents.read(key(company,username))||{revision:0,values:{}};},
  async save(company,username,input){
   if(!input||!Number.isSafeInteger(input.revision)||input.revision<0||!input.values||Array.isArray(input.values))throw Object.assign(Error('Preferências inválidas.'),{status:400});
   const values=Object.fromEntries(Object.entries(input.values).map(([k,v])=>{if(!KEYS.has(k))throw Object.assign(Error('Preferência não permitida.'),{status:400});return [k,clean(v)];}));
   if(Buffer.byteLength(JSON.stringify(values))>100000)throw Object.assign(Error('Preferências excedem o limite.'),{status:400});
   return documents.transact(key(company,username),previous=>{
    if((previous?.revision||0)!==input.revision)throw Object.assign(Error('Preferências alteradas em outro acesso. Recarregue e tente novamente.'),{status:409});
    return {revision:input.revision+1,values:{...previous?.values,...values},updatedAt:new Date().toISOString()};
   });
  }
 };
}
