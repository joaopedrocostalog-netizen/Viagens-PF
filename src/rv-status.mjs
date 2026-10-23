export const RV_STATUSES=Object.freeze(['Incluído','Escalado','Viajando','Finalizado','Encerrado']);
const text=value=>String(value??'').trim();
const norm=value=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const statusNames=Object.freeze({incluido:'Incluído',incluida:'Incluído',escalado:'Escalado',escalada:'Escalado',viajando:'Viajando',finalizado:'Finalizado',finalizada:'Finalizado',encerrado:'Encerrado',encerrada:'Encerrado'});
/** Standardize spelling/gender only. Unknown codes and ambiguous completion labels stay as supplied. */
export function rvStatus(value){
 const key=norm(value);
 return Object.hasOwn(statusNames,key)?statusNames[key]:text(value)||'Não informado';
}
export const tripCompleted=value=>/conclu|encerr|finaliz|entreg/.test(norm(value));
export const tripActive=value=>/viajando|em viagem|andamento|inici|transit|rodando|em rota/.test(norm(value))&&!tripCompleted(value)&&!/cancel/.test(norm(value));
export const tripPlanned=value=>['Incluído','Escalado'].includes(rvStatus(value))||/planej|program|previst|aguard/.test(norm(value));
export function rvStatusCounts(rows){const counts=Object.create(null);for(const row of rows){const key=rvStatus(row.status);counts[key]=(counts[key]||0)+1;}return counts;}
const h=v=>text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderRvStatusStages(counts,selected='',{readonly=false}={}){
 const current=selected?rvStatus(selected):'';
 const stages=[...RV_STATUSES,...Object.keys(counts).filter(key=>!RV_STATUSES.includes(key)).sort()];
 return '<div class="rv-status-stages" '+(readonly?'aria-label="Situação informada da RV"':'role="group" aria-label="Filtrar situação da RV"')+'>'+
 (!readonly?'<button type="button" class="rv-status-step '+(!selected?'active':'')+'" data-rv-status="" aria-pressed="'+!selected+'">Todas <span>'+Object.values(counts).reduce((sum,n)=>sum+n,0)+'</span></button>':'')+
 stages.map(stage=>readonly?'<span class="rv-status-step '+(current===stage?'active':'')+'" '+(current===stage?'aria-current="step"':'')+'>'+h(stage)+'</span>':'<button type="button" class="rv-status-step '+(current===stage?'active':'')+'" data-rv-status="'+h(stage)+'" aria-pressed="'+(current===stage)+'">'+h(stage)+' <span>'+(counts[stage]||0)+'</span></button>').join('')+'</div>';
}
