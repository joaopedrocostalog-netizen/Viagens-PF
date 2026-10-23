import {operationalToday,taskBelongsToUser,taskDueBucket,taskSummary} from './workflow.mjs';
import {matchesSearch} from './filtering.mjs';
import {tripCompleted} from './rv-status.mjs';
export const PENDING_TYPES=Object.freeze({cte_pendente:'Pedido sem CT-e',cte_sem_rv:'CT-e sem RV',rv_nao_localizada:'RV não localizada',rv_ambigua:'Vínculo ambíguo',comprovante_pendente:'Comprovante ausente',ocorrencia:'Ocorrência',rv_sem_pedido:'RV sem PF',rv_sem_termino:'RV sem término',km_acima:'Excesso de KM'});
export const emptyPolicy=()=>({revision:0,days:Object.fromEntries(Object.keys(PENDING_TYPES).map(type=>[type,null]))});
export function dueFromPolicy(type,firstSeenAt,policy){
 const days=policy?.days?.[type];if(days===null||days===undefined)return '';
 const day=operationalToday(new Date(firstSeenAt)),date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);
}
export function archivedAlert(key,task){
 const [type,view,recordId]=key.split(':'),source=task.source||{};
 return {type,view,recordId,title:PENDING_TYPES[type]||type,detail:[source.number,source.customer,source.plate].filter(Boolean).join(' · ')||recordId,refDate:source.refDate||'',level:task.priority||'warning',...taskSummary(task),key};
}
export function archivePage(tasks,state={},pageSize=25){
 const matches=Object.entries(tasks).filter(([,task])=>state.alertAllTracked||task.handledAt||task.updatedBy&&task.updatedBy!=='DSS').filter(([key,task])=>{
  const [type,view,recordId]=key.split(':'),source=task.source||{},entity=source.entity||recordId?.split('~')[0];
  return (!state.legalEntity||entity===state.legalEntity)&&(!state.customer||source.customer===state.customer)&&(!state.vehicle||source.plate===state.vehicle)&&(!state.serviceType||source.serviceType===state.serviceType)&&(!state.tripFocus||source.tripId===state.tripFocus||recordId===state.tripFocus)&&(!state.rvStage||source.rvStage===state.rvStage)&&(!state.alertKind||state.alertKind==='todos'||type===state.alertKind)&&(!state.alertStatus||state.alertStatus==='todos'||state.alertStatus==='ativas'&&task.status!=='resolvida'||task.status===state.alertStatus)&&(!state.alertPriority||state.alertPriority==='todos'||task.priority===state.alertPriority)&&(!state.alertScope||state.alertScope!=='mine'||taskBelongsToUser(task,state.user))&&(!state.alertRelevant||!task.owner||taskBelongsToUser(task,state.user))&&(!state.alertUnassigned||!task.owner)&&(!state.alertRecurrent||task.recurrenceCount>0)&&(!state.alertDue||state.alertDue==='todos'||taskDueBucket(task)===state.alertDue)&&(!state.alertOwner||matchesSearch({owner:task.owner},state.alertOwner))&&matchesSearch({type,recordId,title:PENDING_TYPES[type],owner:task.owner,status:task.status,due:task.due,resolutionReason:task.resolutionReason,number:source.number,customer:source.customer,plate:source.plate,refDate:source.refDate},state.search||'');
 }).sort(([a,x],[b,y])=>String(y.updatedAt||y.lastSeenAt||'').localeCompare(String(x.updatedAt||x.lastSeenAt||''))||a.localeCompare(b));
 const total=matches.length,pages=pageSize===Infinity?1:Math.max(1,Math.ceil(total/pageSize)),page=Math.min(pages,Math.max(1,Math.floor(Number(state.page)||1)));
 const selected=pageSize===Infinity?matches:matches.slice((page-1)*pageSize,page*pageSize);
 return {total,pages,page,pageSize,rows:selected.map(([key,task])=>archivedAlert(key,task))};
}
export function pendingNotices(tasks,user,entity=''){
 const counts={vencidas:0,hoje:0,sem_responsavel:0,reincidentes:0};let total=0;
 for(const [key,t] of Object.entries(tasks)){
  if(t.status==='resolvida'||entity&&(t.source?.entity||key.split(':')[2]?.split('~')[0])!==entity)continue;
  const mine=taskBelongsToUser(t,user),unassigned=!String(t.owner||'').trim(),bucket=taskDueBucket(t);
  if(mine&&['vencidas','hoje'].includes(bucket)||unassigned||(mine||unassigned)&&t.recurrenceCount>0)total++;
  if(mine&&bucket==='vencidas')counts.vencidas++;if(mine&&bucket==='hoje')counts.hoje++;
  if(unassigned)counts.sem_responsavel++;if((mine||unassigned)&&t.recurrenceCount>0)counts.reincidentes++;
 }
 return {counts,total};
}
/** An absent field or a record outside the query is never proof that an alert disappeared. */
export function absenceConclusive(type,row,data,index={}){
 if(!row)return false;
 if(type==='cte_pendente')return row.isCte===true;
 if(['cte_sem_rv','rv_nao_localizada','rv_ambigua'].includes(type))return !!row.viagemId&&!row.ambiguous&&(index.tripIds?index.tripIds.has(row.viagemId):(data.viagens||[]).some(trip=>trip.id===row.viagemId));
 if(type==='comprovante_pendente')return row.comprovanteEntrega===true||row.entregaConcluida===false;
 if(type==='ocorrencia')return data.clearedOccurrenceIds?.has(row.id)===true;
 if(type==='rv_sem_pedido')return data.sources?.pedidos===true&&(index.linkedTripIds?index.linkedTripIds.has(row.id):(data.pedidos||[]).some(order=>order.viagemId===row.id));
 if(type==='rv_sem_termino')return !!row.dataTermino||tripCompleted(row.status);
 if(type==='km_acima')return Number.isFinite(row.kmRodados)&&Number.isFinite(row.kmPrevisto)&&row.kmPrevisto>0&&row.kmRodados<=row.kmPrevisto*1.15;
 return false;
}
