import {renderDateControl} from './date-controls.mjs';
import {dayTrips,dailyStatus} from './programming-data.mjs';
import {memoView} from './view-cache.mjs';
import {searchOperationalData} from './filtering.mjs';
import {renderGrid} from './advanced-ui.mjs';
const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderDayProgramming(data,state){
 const date=state.dayDate,source=memoView('day-search',[data,state.search],()=>searchOperationalData(data,state.search));
 const rows=memoView('day-trips',[source,date],()=>dayTrips(source,date));
 const counts=rows.reduce((acc,row)=>{const label=dailyStatus(row);acc[label]=(acc[label]||0)+1;return acc;},{});
 const outside=state.mode==='live'&&(!state.loadedRange||date<state.loadedRange.from||date>state.loadedRange.to||date<state.from||date>state.to);
 const controls='<div class="day-toolbar"><div class="filter"><label for="dayDate">Data da programação</label>'+renderDateControl('dayDate',date,{label:'Data da programação'})+'</div><button class="btn btn-sm" data-action="day-today">Hoje</button></div>';
 const note=outside?'<p class="ins-inline-error" role="status">Esta data está fora do período carregado ou selecionado. Ajuste o período e atualize os dados para consultar.</p>':'';
 const cards='<div class="ins-kpi-row">'+['Planejadas','Em andamento','Concluídas','Situação não informada','Outras situações'].map(label=>'<div class="ins-kpi"><div>'+label+'</div><strong>'+(outside?'—':counts[label]||0)+'</strong></div>').join('')+'</div>';
 const columns=[{key:'numero',label:'RV',detail:'viagens'},{key:'placa',label:'Placa'},{key:'status',label:'Situação'},{key:'motoristaNome',label:'Motorista'},{key:'cliente',label:'Cliente'},{key:'origem',label:'Origem'},{key:'destino',label:'Destino'},{key:'data',label:'Início',format:'date'},{key:'dataTermino',label:'Término',format:'date'}];
 const programs=(source.programacoes||[]).filter(row=>row.data===date);
 // Independent pagination; supplementary rows render only when opened.
 const programState={...state,listFilters:'',page:state.programPage||1};
 const programTable=state.dayProgramsOpen&&source.sources?.programacoes?renderGrid('Programações emitidas',programs,[{key:'numero',label:'Programação'},{key:'data',label:'Emissão',format:'date'},{key:'rvReferencia',label:'RV ref.'},{key:'motoristaId',label:'Motorista ID'},{key:'veiculoId',label:'Veículo ID'}],programState,'programacoes').replaceAll('data-action="prev"','data-action="program-prev"').replaceAll('data-action="next"','data-action="program-next"'):'';
 state.programPage=programState.page;
 const extra='<details class="day-programs" '+(state.dayProgramsOpen?'open':'')+' id="dayPrograms"><summary>Programações emitidas na data '+(source.sources?.programacoes?'('+programs.length+')':'· fonte indisponível ou não informada')+'</summary>'+(state.dayProgramsOpen?(source.sources?.programacoes?'<p class="help">Data de emissão da programação. A saída prevista não foi informada pela fonte.</p>'+programTable:'<p role="status">As programações não estão disponíveis nesta consulta. A lista de RVs continua disponível.</p>'):'')+'</details>';
 return controls+note+cards+renderGrid('Viagens do dia',outside?[]:rows,columns,state,'programacao')+extra;
}
