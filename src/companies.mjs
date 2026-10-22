/** Separação operacional por empresa. Nunca inferir empresa pelo nome do cliente. */
const norm=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const text=value=>String(value??'').trim();
export const COMPANIES=Object.freeze({
 costalog:{name:'COSTALOG',label:'Costalog',description:'AC da Costa · CRC · Comex',logo:'logo-costalog-sem-fundo-1024x876.png'},
 ideallog:{name:'IDEALLOG',label:'Ideallog',description:'Ideallog',logo:'Ideallog.png'}
});
export const validCompany=value=>Object.hasOwn(COMPANIES,value);
export function companyIdentity(row){
 const value=row?.empresa;
 const name=norm(value&&typeof value==='object'?(value.nome??value.razao_social??value.sigla??''):value);
 if(/\bideal\s*log\b/.test(name))return 'ideallog';
 if(/\bac\s*(da\s*)?costa\b/.test(name)||/\ba c (da )?costa\b/.test(name))return 'acdacosta';
 if(/\bcrc\b/.test(name)||/\bc r c\b/.test(name))return 'crc';
 if(/\bcomex\b/.test(name)||(/\bcomercio exterior\b/.test(name)&&/\bcosta\b/.test(name)))return 'comex';
 if(/\bcosta\s*log\b/.test(name))return 'costalog';
 return name;
}
export function companyOf(row){
 const entity=companyIdentity(row);
 if(entity==='ideallog')return 'ideallog';
 return ['acdacosta','crc','comex','costalog'].includes(entity)?'costalog':null;
}
const key=value=>text(value).replace(/^0+(?=\d)/,'');
function index(rows,fields,group){
 const result=new Map();
 for(const row of rows)for(const field of fields){
  const id=key(row[field]);if(!id)continue;
  if(!result.has(id))result.set(id,new Set());
  result.get(id).add(group(row));
 }
 return result;
}
function linkedGroup(row,links){
 const groups=new Set();
 for(const [fields,lookup] of links)for(const field of fields){
  const found=lookup.get(key(row[field]));if(found)for(const company of found)groups.add(company);
 }
 return groups.size===1?[...groups][0]:null;
}
/** Funciona sobre respostas DSS ou dados já normalizados. Vínculos ambíguos ficam de fora. */
export function scopeCompanyData(data,company){
 if(!validCompany(company))throw Error('Empresa inválida.');
 const trips=data.viagens||[],orders=data.pedidos||[],ctes=data.ctes||[];
 const tripIndex=index(trips,['rv_id','nro_rv','id','rvId','numero'],companyOf);
 const tripLinks=[[['rv_viagem','rvReferencia','viagemId','rv_id','nro_rv','idViagem'],tripIndex]];
 const groupOrder=row=>companyIdentity(row)?companyOf(row):linkedGroup(row,tripLinks);
 const orderIndex=index([...orders,...ctes],['pf_id','nro_pf','id','pedidoNumero'],groupOrder);
 const tripSet=new Set(trips);
 const documentIndex=index([...trips,...orders,...ctes],['nro_mdf','nroMdf'],row=>tripSet.has(row)?companyOf(row):groupOrder(row));
 const related=(row,mdfe=false)=>companyIdentity(row)?companyOf(row):linkedGroup(row,[...tripLinks,[['pf_id','nro_pf','pedidoNumero'],orderIndex],[(mdfe?['nro_mdf','nroMdf','numeroMDFe','numero']:['nro_mdf','nroMdf']),documentIndex]]);
 const viagens=trips.filter(row=>companyOf(row)===company);
 const routeIds=new Set(viagens.map(row=>key(row.rota_id??row.rotaId)).filter(Boolean));
 return {...data,viagens,pedidos:orders.filter(row=>groupOrder(row)===company),ctes:ctes.filter(row=>groupOrder(row)===company),
  mdfes:(data.mdfes||[]).filter(row=>related(row,true)===company),
  ocorrencias:(data.ocorrencias||[]).filter(row=>related(row)===company),
  programacoes:(data.programacoes||[]).filter(row=>related(row)===company),
  rotas:(data.rotas||[]).filter(row=>companyIdentity(row)?companyOf(row)===company:routeIds.has(key(row.rota_id??row.rotaId))),
  company};
}
