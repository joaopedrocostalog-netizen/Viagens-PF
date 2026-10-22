export const TASK_STATUSES=Object.freeze({aberta:'Aberta',tratamento:'Em tratamento',resolvida:'Resolvida'});
export const TASK_PRIORITIES=Object.freeze({high:'Alta',warning:'Verificação',info:'Informativa'});
export const alertKey=alert=>[alert.type,alert.view,alert.recordId].join(':');
export function taskFor(alert,tasks={}){
 const saved=tasks[alertKey(alert)]||{};
 return {key:alertKey(alert),owner:'',due:'',status:'aberta',revision:0,...saved,priority:saved.priority||alert.level};
}
export function validTaskKey(key,company){
 if(typeof key!=='string'||key.length>240)return false;
 const match=key.match(/^(cte_pendente|cte_sem_rv|rv_nao_localizada|rv_ambigua|comprovante_pendente|ocorrencia|rv_sem_pedido|rv_sem_termino|km_acima):(ctes|viagens):([^:\s]+)$/);
 if(!match)return false;
 if(match[2]!==(['rv_sem_pedido','rv_sem_termino','km_acima'].includes(match[1])?'viagens':'ctes'))return false;
 const entity=match[3].split('~')[0];
 return !match[3].includes('~')||(company==='ideallog'?entity==='ideallog':['acdacosta','crc','comex','costalog'].includes(entity));
}
export function validateTask(input){
 if(!input||typeof input!=='object')throw Error('Tratamento inválido.');
 const {owner='',due='',priority,status,comment='',revision}=input;
 if(typeof owner!=='string'||owner.length>100||typeof comment!=='string'||comment.length>2000)throw Error('Responsável: até 100 caracteres. Comentário: até 2.000 caracteres.');
 if(!Object.hasOwn(TASK_STATUSES,status)||!Object.hasOwn(TASK_PRIORITIES,priority))throw Error('Situação ou prioridade inválida.');
 if(typeof due!=='string'||(due&&(!/^\d{4}-\d{2}-\d{2}$/.test(due)||!Number.isFinite(Date.parse(due+'T12:00:00Z'))||new Date(due+'T12:00:00Z').toISOString().slice(0,10)!==due)))throw Error('Prazo inválido.');
 if(!Number.isSafeInteger(revision)||revision<0)throw Error('Versão inválida. Reabra a pendência.');
 return {owner:owner.trim(),due,priority,status,comment:comment.trim(),revision};
}
export function updateTask(previous,input,actor,now=new Date().toISOString()){
 const value=validateTask(input);
 if((previous?.revision||0)!==value.revision){const error=Error('Outra pessoa atualizou esta pendência. Reabra para ver a versão atual.');error.status=409;throw error;}
 const {comment,revision,...fields}=value;
 const changes=Object.keys(fields).filter(key=>fields[key]!==previous?.[key]);
 const entry={...fields,revision:revision+1,updatedAt:now,updatedBy:actor,
  comments:[...(previous?.comments||[]),...(comment?[{text:comment,author:actor,at:now}]:[])],
  history:[...(previous?.history||[]),{author:actor,at:now,changes:Object.fromEntries(changes.map(key=>[key,{from:previous?.[key]??'',to:fields[key]}]))}]};
 if(entry.comments.length>500||entry.history.length>2000)throw Error('Histórico atingiu o limite deste tratamento.');
 return entry;
}
export function taskSummary(task){const {comments,history,...summary}=task;return summary;}
