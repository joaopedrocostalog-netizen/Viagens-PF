import {companyIdentity} from './companies.mjs';
import {normalizeSearch} from './filtering.mjs';
const text=v=>String(v??'').trim();
const key=v=>text(v).replace(/^0+(?=\d)/,'');
const day=v=>{const s=text(v),m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);return m?`${m[3]}-${m[2]}-${m[1]}`:/^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):'';};
/** Only explicit references may associate a program with a trip. Emission is not a planned departure. */
export function normalizePrograms(rows,trips,orders){
 const indexes=Object.fromEntries(['rvId','numero','programacaoId'].map(field=>{const map=new Map();for(const trip of trips){const id=key(trip[field]);if(id){const list=map.get(id)||[];list.push(trip);map.set(id,list);}}return [field,map];}));
 const byTrip=new Map(trips.map(trip=>[trip.id,trip]));
 const byOrder=new Map();for(const order of orders){const id=key(order.id?.split('~').at(-1));if(id){const list=byOrder.get(id)||[];list.push(order);byOrder.set(id,list);}}
 const seen=new Set();
 return rows.map((row,i)=>{
  const entity=companyIdentity(row),candidates=new Map();
  const add=trip=>{if(trip&&(!entity||companyIdentity(trip)===entity))candidates.set(trip.id,trip);};
  for(const [field,value] of [['rvId',row.rv_id],['numero',row.nro_rv],['programacaoId',row.programacao_id]])if(key(value))for(const trip of indexes[field].get(key(value))||[])add(trip);
  for(const order of byOrder.get(key(row.pf_id))||[])if(!entity||companyIdentity(order)===entity){const trip=byTrip.get(order.viagemId);add(trip);}
  const trip=candidates.size===1?[...candidates.values()][0]:null;
  const empresa=row.empresa||trip?.empresa||'Costalog';
  return {id:(companyIdentity({empresa})||'unknown')+'~programa-'+(key(row.programacao_id)||i),empresa,numero:text(row.nro_programacao)||text(row.programacao_id)||'—',data:day(row.data_emissao),viagemId:trip?.id||null,rvReferencia:text(row.nro_rv),motoristaId:text(row.motorista_id),veiculoId:text(row.veiculo_id)};
 }).filter(row=>{if(seen.has(row.id))return false;seen.add(row.id);return true;});
}
export function dayTrips(data,date){
 return (data.viagens||[]).filter(row=>{
  if(row.data===date||row.dataTermino===date)return true;
  const status=normalizeSearch(row.status),active=/andamento|inici|transito|rodando|em rota/.test(status)&&!/conclu|encerr|finaliz|cancel/.test(status);
  return active&&row.data&&row.data<=date&&(!row.dataTermino||row.dataTermino>=date);
 });
}
export function dailyStatus(row){
 const status=normalizeSearch(row.status);
 return /cancel/.test(status)?'Outras situações':/conclu|encerr|finaliz|entreg/.test(status)?'Concluídas':/andamento|inici|transito|rodando|em rota/.test(status)?'Em andamento':/planej|program|previst/.test(status)?'Planejadas':'Situação não informada';
}
