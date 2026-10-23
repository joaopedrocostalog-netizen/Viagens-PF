import {normalizeOverview} from '../src/dss-mapping.mjs';
import {scopeCompanyData,companyIdentity} from '../src/companies.mjs';
import {projectOverview} from './access.mjs';
import {permittedView,operationalDataset,buildOperationalReport,reportTypesFor,OP_VIEWS} from '../src/access-ui.mjs';
import {filterOperationalData,searchOperationalData,filterLinkedRows} from '../src/filtering.mjs';
import {filterRvStage,renderRelatedRvStages} from '../src/rv-stage-filter.mjs';
import {rvStatusCounts,renderRvStatusStages} from '../src/rv-status.mjs';
import {memoView,clearViewCache} from '../src/view-cache.mjs';
import {searchRecords} from '../src/operational.mjs';
import {renderGrid,renderAdvanced,renderReportHub,operationalFilters} from '../src/advanced-ui.mjs';
import {renderGlobalSearch,renderCustomDashboard,renderMyTasksSummary,renderAlertsHub,renderDriverRouteDetails,renderComparison} from '../src/intelligence-ui.mjs';
import {renderHero,renderSummary,renderTripsHeader,renderReportsHeader} from '../src/visual-dashboard.mjs';
import {renderDayProgramming} from '../src/programming.mjs';
import {renderTripChecklist} from '../src/rv-checklist.mjs';
import {createTripTimeline} from '../src/trip-timeline.mjs';
import {renderDataQuality} from '../src/data-quality.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const attr=esc,number=n=>new Intl.NumberFormat('pt-BR').format(n),money=()=> '—',icon=()=> '×';
const dateBR=v=>/^\d{4}-\d{2}-\d{2}/.test(String(v||''))?v.slice(8,10)+'/'+v.slice(5,7)+'/'+v.slice(0,4):esc(v||'—');
const button=(action,label,extra='')=>'<button type="button" class="btn '+extra+'" data-action="'+action+'">'+label+'</button>';
const stateFields=['alertUnassigned','alertRecurrent','alertAllTracked','alertArchive','preferenceStorage','view','from','to','legalEntity','customer','vehicle','serviceType','status','rvStage','search','filter','sortKey','sortDir','page','detailPage','timelinePage','routeSelected','driverSelected','reportSelected','reportMulti','hiddenColumns','reportColumnOrder','reportTemplates','templateSelected','reportFormat','presets','metricLayout','showMetricOptions','tableSort','alertPriority','alertKind','alertStatus','alertOwner','alertScope','alertDue','alertGrouping','alertGroup','tripFocus','dayDate','dayProgramsOpen','programPage','filtersOpen','technicalOpen','drilldown','selected','compareCurrentFrom','compareCurrentTo','comparePreviousFrom','comparePreviousTo'];
function cleanState(input){
 const state=Object.fromEntries(stateFields.filter(key=>Object.hasOwn(input,key)).map(key=>[key,input[key]]));
 for(const key of ['page','detailPage','timelinePage','programPage'])state[key]=Math.max(1,Math.min(1000000,Math.floor(Number(state[key])||1)));
 for(const [k,v] of Object.entries(state))if(typeof v==='string'&&v.length>500)state[k]=v.slice(0,500);
 if(!OP_VIEWS.includes(state.view))throw Object.assign(Error('Área não permitida.'),{status:400});
 return state;
}
function companyData(snapshot,company,role){
 const key=company;snapshot.normalized||=new Map();
 if(!snapshot.normalized.has(key))snapshot.normalized.set(key,operationalDataset(normalizeOverview(projectOverview(snapshot.payload,'operacional',company))));
 return snapshot.normalized.get(key);
}
export async function portalResponse({action,input,snapshot,user,company,workflowStore,portalSessions}){
 const state=cleanState(input.state||{});
 const full=companyData(snapshot,company,user.role);
 Object.assign(state,{company,role:user.role,user,mode:'live',permissions:{...user.permissions,financeiro:false},loadedRange:{from:snapshot.from,to:snapshot.to},lastSync:snapshot.payload.updatedAt,dataset:full,tasks:{},taskIndexLoaded:false,taskIndexError:'',syncMetadata:user.permissions.admin?[snapshot.payload.quality||{}]:[]});
 if(action!=='compare'&&(!state.from||!state.to||state.from<snapshot.from||state.to>snapshot.to||state.from>state.to))throw Object.assign(Error('Período fora da consulta carregada. Atualize os dados da DSS.'),{status:409});
 if(action==='metrics'||state.view==='pendencias'||state.view==='relatorios'&&state.reportSelected==='pendencias'||action==='export'){
  try{state.tasks=await workflowStore.get(company);state.taskIndexLoaded=true;}catch{state.taskIndexError='Tratamentos indisponíveis. Configure o armazenamento persistente ou tente novamente.';}
 }
 // No await while rendering: shared memo consumers are cleared between user requests.
 clearViewCache();
 const period=filterOperationalData(scopeCompanyData(full,company,state.legalEntity),{from:state.from,to:state.to});
 const stageBase=filterOperationalData(period,{...state,status:state.view==='viagens'?'':state.status});
 const staged=filterRvStage(period,state.rvStage||'');
 const d=filterOperationalData(staged,state);
 const filterOptionsData=()=>period;
 const searchRows=rows=>searchRecords(rows,state.search);
 state.listFilters='<details id="advancedFilters" class="v-extra-filters" '+(state.filtersOpen?'open':'')+'><summary>Filtros avançados</summary>'+(state.filtersOpen?operationalFilters(period,state):'')+'</details>';
function renderViagens(d,s){
 const rows=memoView('trip-rows',[d,state.search,state.filter],()=>filterLinkedRows(searchRows(d.viagens),'viagens',d,state.filter));
 const cols=[
  {key:'numero',label:'Nº RV',detail:'viagens'},{key:'tipoRv',label:'Tipo de RV'},{key:'data',label:'Início',format:'date'},{key:'dataTermino',label:'Término',format:'date'},
  {key:'cliente',label:'Cliente'},{key:'placa',label:'Placa'},{key:'motoristaId',label:'Motorista ID'},{key:'motoristaNome',label:'Motorista'},
  {key:'container',label:'Container'},{key:'nroMdf',label:'Referência MDF-e'},
  {key:'origem',label:'Origem'},{key:'destino',label:'Destino'},
  {key:'kmPrevisto',label:'KM previsto',format:'number'},{key:'kmRodados',label:'KM rodado',format:'number'},{key:'desvioKm',label:'Desvio KM',format:'number'},{key:'custoAbastecimentoKm',label:'Abastecimento/km',format:'money'},
  {key:'receita',label:state.mode==='live'?'Fretes vinculados':'Receita',format:'money'},
  {key:state.mode==='live'?'abastecimento':'custo',label:state.mode==='live'?'Abastecimento (parcial)':'Custo',format:'money'},
  {key:'status',label:'Situação'}];
 return renderGrid('Viagens cadastradas',rows,state.permissions.financeiro?cols:cols.filter(x=>!['receita','abastecimento','custo','custoAbastecimentoKm'].includes(x.key)),state,'viagens','Clique no número da RV para consultar a ficha completa e os pedidos relacionados.');
}
function renderCtes(d){
 const rows=memoView('order-rows',[d,state.search,state.filter],()=>filterLinkedRows(searchRows(d.pedidos),'pedidos',d,state.filter));
 const cols=[
  {key:'pedidoNumero',label:'Pedido PF',detail:'ctes'},
  {key:'cteNumero',label:'CT-e'},{key:'data',label:'Emissão',format:'date'},{key:'dataCte',label:'Emissão CT-e',format:'date'},
  {key:'cliente',label:'Cliente'},{key:'motoristaNome',label:'Motorista'}, {key:'placa',label:'Placa'},
  {key:'rvReferencia',label:'RV ref.'},{key:'nroMdf',label:'MDF-e ref.'},
  {key:'valor',label:'Valor frete',format:'money'},{key:'valorReceber',label:'Valor a receber',format:'money'},
  {key:'liberadoFaturamento',label:'Liberado faturamento',format:'bool'},
  {key:'numeroFatura',label:'Nº fatura'},{key:'entregaConcluida',label:'Entrega concluída',format:'bool'},
  {key:'comprovanteEntrega',label:'Comprovante',format:'bool'},{key:'ocorrencia',label:'Ocorrência'},
  {key:'valorIcmsIss',label:'ICMS/ISS',format:'money'},{key:'valorAverbacao',label:'Averbação',format:'money'},
  {key:'status',label:'Situação'}];
 return renderGrid('Pedidos de frete',rows,state.permissions.financeiro?cols:cols.filter(x=>!['valor','valorReceber','liberadoFaturamento','numeroFatura','valorIcmsIss','valorAverbacao'].includes(x.key)),state,'ctes','Consulta de campos disponíveis em GET /listarPedidosFrete');
}
function renderMdfes(d){
 const rows=memoView('mdfe-rows',[d,state.search,state.filter],()=>filterLinkedRows(searchRows(d.mdfes),'mdfes',d,state.filter));
 return '<div class="table-tools"><label class="btn btn-sm" for="csvMDFE">Importar CSV de MDF-e</label><input id="csvMDFE" type="file" accept=".csv,text/csv" hidden></div>'+renderGrid('Referências de MDF-e',rows,[{key:'numero',label:'MDF-e',detail:'mdfes'},{key:'data',label:'Emissão',format:'date'},{key:'viagemId',label:'RV vinculada'},{key:'placa',label:'Placa'},{key:'status',label:'Situação declarada'}],state,'mdfes');
}

function renderDrawer(d){
 const [kind,id]=state.selected.split(':');if(!permittedView(state.role,kind)){state.selected=null;return '';}const item=kind==='viagens'?d.viagens.find(x=>x.id===id):kind==='ctes'?[...d.pedidos,...d.ctes].find(x=>x.id===id):d.mdfes.find(x=>x.id===id);
 if(!item){state.selected=null;return '';}
 const secureKeys=new Set(['custo','receita','abastecimento','custoAbastecimentoKm','adiantamento','proventos','liquido','valor','valorReceber','valorAverbacao','valorIcmsIss','freteSemIcms','valorMercadorias','numeroFatura','liberadoFaturamento','statusPagamentoSaldo','dataPagamentoSaldo','contratoVf']);
 const rows=Object.entries(item).filter(([k])=>!['id','isCte'].includes(k)&&(state.permissions.financeiro||!secureKeys.has(k))).map(([k,v])=>'<div class="detail-line"><span>'+esc(({tipoRv:'Tipo de RV',numero:'Número',data:'Data',cliente:'Cliente',abastecimento:'Abastecimento (R$)',nroMdf:'MDF-e informado',rvReferencia:'RV referenciada',pedidoNumero:'Pedido de frete',cteNumero:'Número CT-e',placa:'Placa',origem:'Origem',destino:'Destino',receita:'Receita',custo:'Custo',status:'Situação',viagemId:'Viagem',valor:'Valor',chave:'Chave CT-e'}[k]||k))+'</span><b>'+(['receita','custo','valor'].includes(k)?money(v):k==='data'?dateBR(v):esc(v===null||v===''?'—':v))+'</b></div>').join('');
 let related='';
 if(kind==='viagens'){
  const completeData=filterOptionsData();
  const {cs,ms,orders,incidents}=memoView('drawer-related',[item,completeData],()=>({
   cs:completeData.ctes.filter(c=>c.viagemId===id),ms:completeData.mdfes.filter(m=>m.viagemId===id),orders:completeData.pedidos.filter(p=>p.viagemId===id),
   // Contexto por placa e intervalo não estabelece vínculo documental.
   incidents:(completeData.ocorrencias||[]).filter(o=>(!companyIdentity(o)||companyIdentity(o)===companyIdentity(item))&&item.placa&&o.placa===item.placa&&o.data&&item.data&&o.data>=item.data&&o.data<=(item.dataTermino||item.data)).slice(0,20)
  }));
  const pager=memoView('trip-timeline',[item,completeData],()=>createTripTimeline(item,completeData));
  const timelineResult=pager.getPage({page:state.timelinePage||1});
  const pageCount=timelineResult.pages;state.timelinePage=timelineResult.page;
  const timeline='<h3 class="drawer-section">Linha do tempo da viagem</h3><ol class="trip-timeline">'+timelineResult.rows.map(event=>'<li class="'+(event.context?'timeline-context':'')+'"><small>'+dateBR(event.date||'Data não fornecida')+'</small><strong>'+esc(event.title)+'</strong><p>'+esc(event.detail)+'</p>'+(event.reference?'<button class="btn btn-sm" data-detail="'+attr(event.reference)+'">Abrir documento</button>':'')+'</li>').join('')+'</ol>'+(pageCount>1?'<div class="pagination"><span>Página '+state.timelinePage+' de '+pageCount+'</span><button class="btn btn-sm" data-action="timeline-prev" '+(state.timelinePage===1?'disabled':'')+'>Anterior</button><button class="btn btn-sm" data-action="timeline-next" '+(state.timelinePage===pageCount?'disabled':'')+'>Próxima</button></div>':'');
  related=renderTripChecklist(item,completeData)+timeline+'<h3 class="drawer-section">Visão 360° da viagem</h3>'+
   '<p class="help">Motorista: '+esc(item.motoristaNome||item.motoristaId||'Não informado')+' · Veículo: '+esc(item.placa||'Não informado')+'</p>'+
   '<p class="help">Trajeto: '+esc(item.origem||'—')+' → '+esc(item.destino||'—')+'</p>'+
   '<p class="help">KM previsto: '+esc(item.kmPrevisto??'—')+' · KM rodado: '+esc(item.kmRodados??'—')+'</p>'+
   '<h3 class="drawer-section">Documentos vinculados</h3>'+
   '<p class="help">Pedidos de frete: '+orders.length+' · '+orders.slice(0,15).map(p=>esc(p.numero)).join(', ')+'</p>'+
   '<p class="help">CT-e identificados: '+cs.slice(0,15).map(x=>esc(x.numero)).join(', ')+(cs.length?'':'nenhum')+'</p>'+
   '<p class="help">MDF-e vinculados: '+ms.slice(0,15).map(x=>esc(x.numero)).join(', ')+(ms.length?'':'nenhum')+'</p>'+
   '<h3 class="drawer-section">Ocorrências da mesma placa no intervalo</h3>'+
   '<p class="help">Contexto por placa e data — não confirma relação com esta viagem: '+(incidents.length?incidents.map(o=>esc(o.data)+' · '+esc(o.descricao||o.tipo||o.status||'Ocorrência')).join(' | '):'nenhuma encontrada nos dados carregados')+'</p>';
 }
 return '<div class="overlay" data-action="close-overlay"><aside class="drawer" role="dialog" aria-modal="true" aria-label="Detalhes do registro"><div class="drawer-top"><h2>Detalhes · '+esc(item.numero)+'</h2>'+button('close',icon('close'),'btn-sm')+'</div>'+button('share-record','Copiar link deste registro','btn-sm')+(kind==='viagens'?renderRvStatusStages({[item.status]:1},item.status,{readonly:true})+related+'<details class="rv-fields"><summary>Dados da RV</summary>'+rows+'</details>':rows)+'</aside></div>';
}
function mdfeSituation(m,d){const tripIds=memoView('mdfe-trip-ids',[d.allViagens],()=>new Set(d.allViagens.map(v=>v.id)));if(m.ambiguous)return 'Vínculo ambíguo';if(!m.viagemId)return 'Sem vínculo informado';if(!tripIds.has(m.viagemId))return 'Viagem não encontrada';return 'Vinculado';}

 if(action==='import'){
  if(!Array.isArray(input.rows)||input.rows.length>1000)throw Object.assign(Error('Importe até 1.000 MDF-e por arquivo.'),{status:400});
  const rows=input.rows.map(row=>Object.fromEntries(['id','numero','empresa','data','viagemId','placa','status'].filter(k=>typeof row[k]==='string'&&row[k].length<=200).map(k=>[k,row[k]]))).map(row=>({...row,empresa:row.empresa||company}));
  const imported=scopeCompanyData({mdfes:rows},company).mdfes.filter(row=>row.numero).map(row=>{
   const entity=companyIdentity(row),trip=full.viagens.find(trip=>trip.id===row.viagemId&&companyIdentity(trip)===entity);
   return {...row,id:entity+'~import-'+row.id,viagemId:trip?.id||null};
  });
  snapshot.normalized.set(company,{...full,mdfes:imported,sources:{...full.sources,mdfes:true}});
  return {count:imported.length};
 }
 if(action==='detail'){
  if(!state.selected)return {html:''};
  const html=renderDrawer(period);
  if(!html)throw Object.assign(Error('Registro não encontrado nesta empresa e período.'),{status:404});
  return {html,timelinePage:state.timelinePage};
 }
 if(action==='export'){
  const allowed=reportTypesFor(user.role),types=input.multi===true?allowed:[input.type];
  if(types.some(type=>!allowed.includes(type)))throw Object.assign(Error('Relatório não permitido.'),{status:403});
  if(types.includes('pendencias')&&!state.taskIndexLoaded)throw Object.assign(Error('Carregue os tratamentos antes de exportar pendências.'),{status:503});
  return {models:types.map(type=>buildOperationalReport(type,d,state)),company,from:state.from,to:state.to};
 }
 if(action==='compare'){
  const a=portalSessions.get(input.currentSnapshot,user),b=portalSessions.get(input.previousSnapshot,user);
  state.comparison={company,currentRange:{from:state.compareCurrentFrom,to:state.compareCurrentTo},previousRange:{from:state.comparePreviousFrom,to:state.comparePreviousTo},current:companyData(a,company,user.role),previous:companyData(b,company,user.role)};
  return {html:renderComparison(d,state)};
 }
 const searched=searchOperationalData(d,state.search);
 const workflowWarning=snapshot.payload.workflowUnavailable?'<p class="ins-inline-error" role="status">Os dados DSS foram carregados, mas o acompanhamento das pendências não pôde ser atualizado. Atualize os dados novamente para repetir.</p>':'';
 if(action==='metrics')return {html:workflowWarning+state.listFilters+renderCustomDashboard(searched,state)+renderMyTasksSummary(searched,state)+renderSummary(searched,{...state,financeiro:false,showCards:false}),hero:renderHero(state.view,d,state),search:renderGlobalSearch(state,d),technical:renderDataQuality(state,period)};
 let html='';
 const stages=state.view==='viagens'?'':renderRelatedRvStages(stageBase,state.rvStage||'');
 if(state.view==='viagens')html=renderTripsHeader(d)+renderRvStatusStages(rvStatusCounts(searchRows(stageBase.viagens)),state.status)+renderViagens(d);
 else if(state.view==='ctes')html=stages+renderCtes(d);
 else if(state.view==='mdfes')html=stages+renderMdfes(d);
 else if(state.view==='ocorrencias')html=stages+(d.sources?.ocorrencias===false?'<p class="help" role="status">As ocorrências não estão disponíveis nesta consulta. Uma lista vazia não confirma ausência de ocorrências.</p>':'')+renderGrid('Ocorrências',searchRecords(d.ocorrencias||[],state.search),[{key:'data',label:'Data',format:'date'},{key:'id',label:'ID'},{key:'placa',label:'Placa'},{key:'tipo',label:'Tipo'},{key:'descricao',label:'Descrição'},{key:'relato',label:'Relato'},{key:'status',label:'Situação'},{key:'providencia',label:'Providência'}],state,'ocorrencias');
 else if(state.view==='pendencias')html=workflowWarning+stages+renderAlertsHub(d,state);
 else if(['rotas','motoristas'].includes(state.view))html=stages+renderDriverRouteDetails(d,state,state.view);
 else if(state.view==='programacao')html=stages+renderDayProgramming(d,state);
 else if(state.view==='relatorios')html=stages+renderReportsHeader(d,{financeiro:false,interval:'mensal'})+renderReportHub(d,state);
 else if(state.view==='comparativos')html=renderComparison(d,state);
 else if(state.view==='veiculos'||state.view==='entregas')html=stages+renderAdvanced(state.view,d,state);
 return {html,hero:renderHero(state.view,d,state),search:renderGlobalSearch(state,d),technical:renderDataQuality(state,period),page:state.page,detailPage:state.detailPage,programPage:state.programPage,visibleAlerts:state.visibleAlerts||[],sources:d.sources,reportColumns:state.view==='relatorios'?buildOperationalReport(state.reportSelected,d,state,{preview:true}).columns:[]};
}
