import {memoView} from './view-cache.mjs';
import {TASK_STATUSES,TASK_PRIORITIES,alertKey,operationalToday,taskDueBucket} from './workflow.mjs';
import {unifiedSearch,customerProfiles,routeStats,driverStats,comparisonWindows,subsetPeriod,comparePeriodMetrics, dashboardMetrics,DASH_METRICS,normalizedLayout} from './intelligence.mjs';
import {cachedAlertPager,searchRecords} from './operational.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[x]));
const fmt=new Intl.NumberFormat('pt-BR');
const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const n=v=>v===null||v===undefined?'—':fmt.format(v);
const curr=v=>v===null||v===undefined?'—':money.format(v);
const date=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')?s.slice(8)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'—';
export function sortedMetricRows(rows,key='trips',direction='desc'){
 const numeric=new Set(['trips','orders','ctes','km','kmPerTrip','routes','count','vehicles','drivers','tripCount','orderCount','cteCount','fretesValor']);
 const dir=direction==='asc'?1:-1;
 return [...rows].sort((a,b)=>{
  const x=a[key],y=b[key];
  if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;
  return numeric.has(key)?dir*(x-y):dir*String(x).localeCompare(String(y),'pt-BR',{numeric:true});
 });
}
const sortTableHeader=(label,key,state,kind)=>{
 const current=state.tableSort?.[kind]||{key:kind==='rotas'?'count':kind==='clientes'?'tripCount':'trips',direction:state.sortDir||'desc'};
 return '<th><button type="button" class="ins-sort-head" data-sort-metric="'+esc(kind+':'+key)+'" aria-label="Ordenar por '+esc(label)+'" aria-sort="'+(current.key===key?(current.direction==='asc'?'ascending':'descending'):'none')+'">'+esc(label)+' <span>'+ (current.key===key?(current.direction==='asc'?'▲':'▼'):'↕')+'</span></button></th>';
};

const badge=(value,cl='red')=>'<span class="ins-badge '+cl+'">'+esc(value)+'</span>';
const empty=message=>'<div class="ins-empty"><span>◇</span><p>'+esc(message)+'</p></div>';
function metricPage(rows,state,pageKey='page'){
 const pages=Math.max(1,Math.ceil(rows.length/25));const current=Math.min(pages,Math.max(1,state[pageKey]||1));state[pageKey]=current;const prefix=pageKey==='page'?'':'detail-';
 return {rows:rows.slice((current-1)*25,current*25),html:'<div class="pagination"><span>'+n(rows.length)+' registros • Página '+current+' de '+pages+'</span><div class="pagination-actions"><button class="btn btn-sm" data-action="'+prefix+'prev" '+(current===1?'disabled':'')+'>Anterior</button><button class="btn btn-sm" data-action="'+prefix+'next" '+(current===pages?'disabled':'')+'>Próxima</button></div></div>'};
}
const cards=items=>'<div class="ins-kpi-row">'+items.map(x=>'<div class="ins-kpi"><div>'+esc(x.label)+'</div><strong>'+esc(x.value)+'</strong><small>'+esc(x.note||'')+'</small></div>').join('')+'</div>';
export const SEARCH_MIN_LENGTH=2;
export function renderGlobalSearch(state,data){
 const q=String(state.globalQuery||''),result=unifiedSearch(data,q,{financial:false,limit:35});
 const tags={viagens:'RV',pedidos:'PF',mdfes:'MDF-e',clientes:'Cliente'};
 return '<section class="ins-search"><div class="ins-search-control"><span class="ins-search-symbol">⌕</span>'+
 '<label for="globalSearchInput" class="sr-only">Pesquisa global por RV, CT-e, PF, placa ou cliente</label>'+
 '<input id="globalSearchInput" class="control" type="search" autocomplete="off" placeholder="Pesquisa global — placa, cliente, pedido PF, RV, CT-e, container..." value="'+esc(q)+'">'+
 (q?'<button class="ins-clear" type="button" data-ins-action="clear-search">Limpar</button>':'')+'</div>'+
 (q.trim().length>=SEARCH_MIN_LENGTH?'<div class="ins-search-results"><div class="ins-toolbar"><strong>'+n(result.length)+' resultado(s) na consulta carregada</strong><small>Selecione para abrir o registro</small></div>'+
 (result.length?result.map(r=>'<button type="button" class="ins-search-result" data-search-result="'+esc(r.group+':'+r.id)+'"><span>'+badge(tags[r.group]||r.group,r.group==='clientes'?'violet':'red')+'</span><span><strong>'+esc(r.title)+'</strong><small>'+esc(r.subtitle)+'</small></span><span class="ins-chevron">↗</span></button>').join(''):empty('Não há registros correspondentes nos dados disponíveis.'))+
 '</div>':q?'<p class="ins-hint">Digite pelo menos dois caracteres.</p>':'')+'</section>';
}
const metricDescription={km:'Somente quilômetros informados pelo DSS',fretes:'Soma de fretes dos pedidos, não valor recebido',abastecimento:'Custo parcial de abastecimento, não lucro',sem_rv:'RV não localizada entre as viagens consultadas',fatura:'Não implica inadimplência'};
let cachedDashboardMetrics=null;
export function renderCustomDashboard(data,state){
 const financial=!!state.permissions.financeiro;
 if(!cachedDashboardMetrics||cachedDashboardMetrics.data!==data||cachedDashboardMetrics.financial!==financial){
  cachedDashboardMetrics={data,financial,metrics:dashboardMetrics(data,{financial})};
 }
 const metrics=cachedDashboardMetrics.metrics;
 const visible=normalizedLayout(state.metricLayout,{financial:!!state.permissions.financeiro});
 const byId=new Map(metrics.map(m=>[m.id,m]));
 const options=metrics.map(m=>'<label class="ins-metric-option"><input type="checkbox" data-metric-toggle="'+m.id+'" '+(visible.includes(m.id)?'checked':'')+'> '+esc(m.label)+'</label>').join('');
 const grid=visible.map((id,i)=>{
  const m=byId.get(id);if(!m)return '';
  const val=m.value===null?'—':m.id==='fretes'||m.id==='abastecimento'?curr(m.value):n(m.value)+(m.id==='km'?' km':'');
  const extra=m.coverage!==null?'Dados conhecidos: '+m.coverage+'/'+data.viagens.length+' RVs':metricDescription[id]||'Indicador calculado com os registros disponíveis';
  return '<article class="ins-metric-card"><div class="ins-metric-top"><small>'+esc(m.label)+'</small><div class="ins-reorder">'+
  '<button data-metric-move="'+id+':-1" aria-label="Mover '+esc(m.label)+' para a esquerda" '+(i===0?'disabled':'')+'>←</button>'+
  '<button data-metric-move="'+id+':1" aria-label="Mover '+esc(m.label)+' para a direita" '+(i===visible.length-1?'disabled':'')+'>→</button></div></div>'+
  '<strong>'+esc(val)+'</strong><span>'+esc(extra)+'</span>'+(!m.financial?'<button class="btn btn-sm ins-metric-open" data-metric-open="'+id+'">Ver registros ↗</button>':'')+'</article>';
 }).join('');
 return '<section class="ins-module ins-custom-dashboard"><div class="ins-toolbar"><div><h2>MEU PAINEL</h2><p>Indicadores personalizados para '+esc(state.user?.displayName||state.user?.username||'visitante demonstrativo')+'</p></div>'+
 '<button class="btn btn-sm" data-ins-action="customize">'+(state.showMetricOptions?'Fechar configurações':'Personalizar cartões')+'</button></div>'+
 (state.showMetricOptions?'<div class="ins-metric-settings">'+options+'<button class="btn btn-sm" data-ins-action="reset-metrics">Restaurar padrão</button></div>':'')+
 '<div class="ins-metric-grid">'+grid+'</div>'+(visible.length?'':empty('Selecione pelo menos um indicador para montar seu painel.'))+
 '<p class="ins-hint">A ordem e a seleção dos cartões são salvas neste navegador, separadas por usuário e perfil. Dados operacionais não são armazenados nas preferências.</p></section>';
}
export function renderCustomerProfiles(data,state){
 if(!state.permissions.financeiro)return empty('Acesso à área financeira restrito.');
 const profiles=customerProfiles(data,{financial:true}),selected=state.clientSelected;
 const client=selected?profiles.find(x=>x.name===selected):null;
 if(client){
  const cs=cards([{label:'RVs',value:n(client.tripCount)},
   {label:'Pedidos PF',value:n(client.orderCount)},{label:'CT-e numerados',value:n(client.cteCount)},
   {label:'Fretes informados',value:curr(client.fretesValor),note:'Não é pagamento confirmado'}]);
  const trips=client.viagens.slice().sort((a,b)=>(b.data||'').localeCompare(a.data||''));
  const orders=client.pedidos.slice().sort((a,b)=>(b.data||'').localeCompare(a.data||''));
  return '<section class="ins-module"><div class="ins-toolbar"><div><h2>PERFIL DO CLIENTE</h2><p>'+esc(client.name)+'</p></div><button class="btn" data-ins-action="close-client">← Todos os clientes</button></div>'+
   cs+'<div class="ins-profile-columns"><div><h3>Rotas mais utilizadas</h3>'+
   (client.routes.length?client.routes.slice(0,8).map(x=>'<div class="ins-info-row"><span>'+esc(x.name)+'</span><strong>'+n(x.count)+' RVs</strong></div>').join(''):empty('Sem rotas disponíveis'))+'</div>'+
   '<div><h3>Histórico mensal</h3>'+
   (client.monthly.length?'<div class="ins-responsive-table"><table><thead><tr><th>Mês</th><th>RVs</th><th>Pedidos</th><th>Fretes informados</th></tr></thead><tbody>'+client.monthly.map(x=>'<tr><td>'+esc(x.month)+'</td><td>'+n(x.viagens)+'</td><td>'+n(x.pedidos)+'</td><td>'+curr(x.fretesKnown?x.fretes:null)+'</td></tr>').join('')+'</tbody></table></div>':empty('Nenhum histórico mensal com data'))+'</div></div>'+
   '<div class="ins-profile-columns"><div><h3>Viagens / RV</h3>'+
   (trips.length?'<div class="ins-responsive-table"><table><thead><tr><th>RV</th><th>Início</th><th>Placa</th><th>Rota</th></tr></thead><tbody>'+trips.map(v=>'<tr><td><button class="ins-link" data-profile-detail="viagens:'+esc(v.id)+'">'+esc(v.numero)+'</button></td><td>'+date(v.data)+'</td><td>'+esc(v.placa||'—')+'</td><td>'+esc((v.origem||'—')+' → '+(v.destino||'—'))+'</td></tr>').join('')+'</tbody></table></div>':empty('Nenhuma RV encontrada para este cliente'))+'</div>'+
   '<div><h3>Pedidos / CT-e</h3>'+
   (orders.length?'<div class="ins-responsive-table"><table><thead><tr><th>Pedido</th><th>CT-e</th><th>Data</th><th>Frete</th></tr></thead><tbody>'+orders.map(p=>'<tr><td><button class="ins-link" data-profile-detail="ctes:'+esc(p.id)+'">'+esc(p.pedidoNumero||p.id)+'</button></td><td>'+esc(p.cteNumero||'—')+'</td><td>'+date(p.data)+'</td><td>'+curr(p.valor)+'</td></tr>').join('')+'</tbody></table></div>':empty('Nenhum pedido encontrado'))+'</div></div>'+
   '<p class="ins-hint">Fretes = valores informados nos pedidos DSS. Não representam faturas pagas nem lucro do cliente. Dados limitados ao período consultado.</p></section>';
 }
 return '<section class="ins-module"><div class="ins-toolbar"><div><h2>CARTEIRA DE CLIENTES</h2><p>Selecione um cliente para ver viagens, pedidos e histórico</p></div>'+badge(n(profiles.length)+' clientes','violet')+'</div>'+
 (profiles.length?'<div class="ins-responsive-table"><table><thead><tr>'+sortTableHeader('Cliente','name',state,'clientes')+''+sortTableHeader('RVs','tripCount',state,'clientes')+''+sortTableHeader('Pedidos','orderCount',state,'clientes')+''+sortTableHeader('CT-e','cteCount',state,'clientes')+''+sortTableHeader('Fretes','fretesValor',state,'clientes')+''+sortTableHeader('Último registro','lastDate',state,'clientes')+'</tr></thead><tbody>'+
 sortedMetricRows(profiles,state.tableSort?.clientes?.key||'tripCount',state.tableSort?.clientes?.direction||state.sortDir||'desc').map(p=>'<tr><td><button class="ins-link" data-client-open="'+esc(p.name)+'">'+esc(p.name)+'</button></td><td>'+n(p.tripCount)+'</td><td>'+n(p.orderCount)+'</td><td>'+n(p.cteCount)+'</td><td>'+curr(p.fretesValor)+'</td><td>'+date(p.lastDate)+'</td></tr>').join('')+'</tbody></table></div>':empty('Nenhum cliente encontrado no período selecionado.'))+
 '<p class="ins-hint">Dados do DSS, agregados pelo nome do cliente. Empresas homônimas podem precisar de identificação adicional quando o cadastro fornecer ID consistente.</p></section>';
}
export function renderDriverRouteDetails(data,state,view){
 const trips=data.viagens||[],orders=data.pedidos||[],q=state.search||'';
 const groups=memoView('metrics-'+view,[data],()=>view==='rotas'?routeStats(trips):driverStats(trips,orders));
 const filtered=memoView('metrics-filter-'+view,[groups,q],()=>{
  if(!q)return groups;
  const matchedTrips=searchRecords(trips,q),matchedOrders=view==='motoristas'?searchRecords(orders,q):[];
  const names=new Set(matchedTrips.map(v=>(v.origem||'Origem não informada')+' → '+(v.destino||'Destino não informado')));
  const ids=new Set([...matchedTrips,...matchedOrders].map(row=>String(row.motoristaId||('nome:'+String(row.motoristaNome||'Não informado').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()))));
  return groups.filter(row=>(view==='rotas'?names.has(row.name):ids.has(row.id))||searchRecords([row],q).length);
 });
 const sort=state.tableSort?.[view],key=sort?.key||(view==='rotas'?'count':'trips'),direction=sort?.direction||state.sortDir||'desc';
 const sorted=memoView('metrics-sort-'+view,[filtered,key,direction],()=>sortedMetricRows(filtered,key,direction));
 const selected=view==='rotas'?filtered.find(r=>r.name===state.routeSelected):filtered.find(r=>r.id===state.driverSelected);
 if(selected){
  const references=memoView('metric-detail-'+view,[data,selected],()=>{
   if(view==='rotas')return trips.filter(v=>(v.origem||'Origem não informada')+' → '+(v.destino||'Destino não informado')===selected.name).map(record=>({record,kind:'viagens'}));
   const matches=row=>String(row.motoristaId||('nome:'+String(row.motoristaNome||'Não informado').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()))===selected.id;
   return [...trips.filter(matches).map(record=>({record,kind:'viagens'})),...orders.filter(matches).map(record=>({record,kind:'ctes'}))].sort((a,b)=>String(b.record.data||'').localeCompare(String(a.record.data||'')));
  });
  const paged=metricPage(references,state,'detailPage');
  const items=view==='rotas'?[{label:'RVs',value:n(selected.count)},{label:'KM identificados',value:n(selected.km),note:selected.kmKnown+'/'+selected.count+' RVs com KM'},{label:'Placas distintas',value:n(selected.vehicles)},{label:'Motoristas',value:n(selected.drivers)}]:[{label:'RVs',value:n(selected.trips)},{label:'Pedidos PF',value:n(selected.orders)},{label:'CT-e numerados',value:n(selected.ctes)},{label:'KM conhecidos',value:n(selected.km)}];
  return '<section class="ins-module"><div class="ins-toolbar"><h2>'+esc(selected.name)+'</h2><button class="btn" data-ins-action="'+(view==='rotas'?'clear-route':'clear-driver')+'">← Voltar</button></div>'+cards(items)+
   '<div class="ins-responsive-table"><table><thead><tr><th>Registro</th><th>Data</th><th>Cliente</th><th>Placa</th></tr></thead><tbody>'+paged.rows.map(({record:r,kind})=>'<tr><td><button class="ins-link" data-profile-detail="'+kind+':'+esc(r.id)+'">'+(kind==='viagens'?'RV ':'PF ')+esc(kind==='viagens'?r.numero:r.pedidoNumero||r.numero)+'</button></td><td>'+date(r.data)+'</td><td>'+esc(r.cliente)+'</td><td>'+esc(r.placa||'—')+'</td></tr>').join('')+'</tbody></table></div>'+paged.html+'</section>';
 }
 const paged=metricPage(sorted,state);
 const columns=view==='rotas'?[['name','Origem → Destino'],['count','RVs'],['km','KM informados'],['kmPerTrip','KM médio*'],['vehicles','Veículos'],['drivers','Motoristas']]:[['name','Motorista'],['trips','RVs'],['orders','Pedidos'],['ctes','CT-e'],['km','KM conhecidos'],['kmPerTrip','KM médio*'],['routes','Rotas distintas']];
 return '<section class="ins-module"><div class="ins-toolbar"><div><h2>'+(view==='rotas'?'ROTAS & VOLUME OPERACIONAL':'MOTORISTAS & ATIVIDADE')+'</h2><p>Volume observado nas RVs e pedidos PF do DSS</p></div>'+badge(n(filtered.length)+(view==='rotas'?' rotas':' motoristas'))+'</div>'+
 (filtered.length?'<div class="ins-responsive-table"><table><thead><tr>'+columns.map(([key,label])=>sortTableHeader(label,key,state,view)).join('')+'</tr></thead><tbody>'+paged.rows.map(row=>'<tr>'+columns.map(([key])=>'<td>'+(key==='name'?'<button class="ins-link" '+(view==='rotas'?'data-route-open="'+esc(row.name):'data-driver-open="'+esc(row.id))+'">'+esc(row.name)+'</button>':n(row[key]))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>':empty('Sem registros disponíveis para os filtros selecionados.'))+paged.html+
 '<p class="ins-hint">Clique nos cabeçalhos para ordenar. * KM médio usa apenas RVs com informação de KM. Registros sem vínculo não são inferidos. Sem localização GPS ou produtividade laboral presumida.</p></section>';
}
const dueLabels={todos:'Todos os prazos',vencidas:'Vencidas',hoje:'Para hoje',proximas:'Próximas',sem_prazo:'Sem prazo'};
function alertPager(data,state){
 const asOf=operationalToday(),lateDays=state.lateDays??2;
 return cachedAlertPager(data,{asOf,lateDays});
}
export function renderMyTasksSummary(data,state){
 if(!state.user?.username||state.user.mustChangePassword)return '';
 if(state.mode==='live'&&!state.loadedRange)return '<section class="ins-module my-tasks-summary"><h2>MINHAS PENDÊNCIAS</h2><p class="help">Atualize os dados da DSS para conferir as pendências do período.</p></section>';
 const ready=!!state.taskIndexLoaded,failed=!!state.taskIndexError;
 const result=ready?alertPager(data,state).getPage({scope:'mine',user:state.user,tasks:state.tasks||{},status:'ativas',includeRows:false}):null;
 return '<section class="ins-module my-tasks-summary"><div class="ins-toolbar"><div><h2>MINHAS PENDÊNCIAS</h2><p>Responsável: '+esc(state.user.displayName||state.user.username)+' · alertas presentes no período consultado</p></div><button class="btn" data-mine-due="todos">Ver minhas pendências ↗</button></div>'+
 (!ready?'<p class="help" role="status">'+esc(failed?state.taskIndexError:'Carregando os tratamentos do portal…')+'</p>'+(failed?'<button class="btn btn-sm" data-action="reload-workflow">Tentar novamente</button>':''):
 '<div class="my-task-buckets">'+Object.entries(dueLabels).filter(([key])=>key!=='todos').map(([key,label])=>'<button class="my-task-bucket '+key+'" data-mine-due="'+key+'"><span>'+label+'</span><strong>'+n(result.dueCounts[key])+'</strong></button>').join('')+'</div><p class="help">Somente abertas e em tratamento. Prazos seguem o horário de São Paulo.</p>')+'</section>';
}
export function renderAlertsHub(data,state){
 const financial=!!state.permissions.financeiro;
 const pager=alertPager(data,state),mine=state.alertScope==='mine';
 const scopeTabs='<div class="alert-scope-tabs" role="group" aria-label="Responsabilidade pelas pendências"><button class="btn '+(!mine?'btn-red':'')+'" data-alert-scope="todos" aria-pressed="'+!mine+'">Todas as pendências</button><button class="btn '+(mine?'btn-red':'')+'" data-alert-scope="mine" aria-pressed="'+mine+'" '+(!state.user?.username?'disabled':'')+'>Minhas pendências</button></div>';
 if(mine&&!state.user?.username)return '<section class="ins-module"><h2>MINHAS PENDÊNCIAS</h2>'+scopeTabs+'<p class="help">Entre no portal para ver as pendências atribuídas à sua conta.</p><button class="btn btn-sm" data-action="connect">Entrar</button></section>';
 if(mine&&state.mode==='live'&&!state.loadedRange)return '<section class="ins-module"><h2>MINHAS PENDÊNCIAS</h2>'+scopeTabs+'<p class="help">Atualize os dados da DSS para conferir as pendências do período.</p></section>';
 if(mine&&!state.taskIndexLoaded)return '<section class="ins-module"><h2>MINHAS PENDÊNCIAS</h2>'+scopeTabs+'<p class="help" role="status">'+esc(state.taskIndexError||'Carregando os tratamentos do portal…')+'</p><button class="btn btn-sm" data-action="reload-workflow">Atualizar tratamentos</button></section>';
 const priority=state.alertPriority||'todos';let kind=state.alertKind||'todos';
 let result=pager.getPage({page:state.page,priority,kind,financial,query:state.search||'',tasks:state.tasks||{},status:state.alertStatus||'todos',owner:state.alertOwner||'',scope:state.alertScope||'todos',user:state.user,due:state.alertDue||'todos'});
 if(kind!=='todos'&&!result.types.includes(kind)){kind='todos';state.alertKind='todos';result=pager.getPage({page:1,priority,kind,financial,query:state.search||'',tasks:state.tasks||{},status:state.alertStatus||'todos',owner:state.alertOwner||'',scope:state.alertScope||'todos',user:state.user,due:state.alertDue||'todos'});}
 state.page=result.page;
 const allowed=result.rows,types=result.types;state.visibleAlerts=allowed;
 const pagination='<div class="pagination"><span>'+n(result.total)+' registros • Página '+result.page+' de '+result.pages+'</span><div class="pagination-actions"><button type="button" class="btn btn-sm" data-action="prev" '+(result.page<=1?'disabled':'')+'>Anterior</button><button type="button" class="btn btn-sm" data-action="next" '+(result.page>=result.pages?'disabled':'')+'>Próxima</button></div></div>';
 const typeLabels={cte_pendente:'Pedido sem CT-e',rv_nao_localizada:'RV não localizada',rv_ambigua:'Vínculo ambíguo',sem_fatura:'Fatura pendente',comprovante_pendente:'Comprovante ausente',ocorrencia:'Ocorrência',rv_sem_termino:'RV sem término',km_acima:'Excesso de KM',cte_sem_rv:'CT-e sem RV',rv_sem_pedido:'RV sem pedido PF'};
 return '<section class="ins-module"><div class="ins-toolbar"><div><h2>'+(mine?'MINHAS PENDÊNCIAS':'CENTRAL INTELIGENTE DE PENDÊNCIAS')+'</h2><p>Alertas da DSS · acompanhamento e providências no portal</p></div>'+'<div class="filter-row">'+badge(n(result.totalAlerts)+' alertas','red')+'<button class="btn btn-sm" data-action="reload-workflow" '+(state.taskIndexLoading?'disabled':'')+'>'+(state.taskIndexLoading?'Carregando…':'Atualizar tratamentos')+'</button></div></div>'+
 (state.taskIndexError?'<p class="ins-inline-error">'+esc(state.taskIndexError)+' <button class="btn btn-sm" data-action="reload-workflow">Tentar novamente</button></p>':'')+
 scopeTabs+
 (mine?'<div class="my-task-buckets">'+Object.entries(dueLabels).filter(([key])=>key!=='todos').map(([key,label])=>'<button class="my-task-bucket '+key+' '+(state.alertDue===key?'active':'')+'" data-alert-due="'+key+'"><span>'+label+'</span><strong>'+n(result.dueCounts[key])+'</strong></button>').join('')+'</div>':'')+
 cards([{label:'Prioridade alta',value:n(result.counts.high)},{label:'Verificação',value:n(result.counts.warning)},
 {label:'Informativos',value:n(result.counts.info)},{label:'Registros encontrados',value:n(result.total)}])+
 '<div class="ins-alert-filters"><label>Prioridade<select id="alertPriorityFilter" class="control"><option value="todos">Todas</option>'+[['high','Alta'],['warning','Verificação'],['info','Informativa']].map(([k,v])=>'<option value="'+k+'" '+(priority===k?'selected':'')+'>'+v+'</option>').join('')+'</select></label>'+
 '<label>Tipo<select id="alertKindFilter" class="control"><option value="todos">Todos</option>'+types.map(t=>'<option value="'+esc(t)+'" '+(kind===t?'selected':'')+'>'+esc(typeLabels[t]||t)+'</option>').join('')+'</select></label>'+
 '<label>Prazo<select id="alertDueFilter" class="control">'+Object.entries(dueLabels).map(([key,label])=>'<option value="'+key+'" '+((state.alertDue||'todos')===key?'selected':'')+'>'+label+'</option>').join('')+'</select></label><label>Situação<select id="alertStatusFilter" class="control"><option value="todos">Todas</option><option value="ativas" '+(state.alertStatus==='ativas'?'selected':'')+'>Abertas e em tratamento</option>'+Object.entries(TASK_STATUSES).map(([key,label])=>'<option value="'+key+'" '+(state.alertStatus===key?'selected':'')+'>'+esc(label)+'</option>').join('')+'</select></label><label>Responsável<input id="alertOwnerFilter" class="control" value="'+esc(state.alertOwner||'')+'" placeholder="Nome do responsável"></label></div>'+
 (allowed.length?'<div class="ins-alert-list">'+allowed.map(a=>'<article class="ins-alert-item"><span class="ins-alert-signal '+(a.level==='high'?'danger':a.level==='info'?'info':'warning')+'">!</span>'+
 '<div><strong>'+esc(a.title)+'</strong><p>'+esc(a.detail)+'</p><small>'+date(a.refDate)+' · '+esc(typeLabels[a.type]||a.type)+'</small></div>'+
 '<div class="task-card-actions"><small>'+esc(TASK_STATUSES[a.status]||'Aberta')+' · '+esc(a.owner||'Sem responsável')+(a.due?' · Prazo: '+date(a.due):'')+(taskDueBucket(a)==='vencidas'?' · Vencida':'')+'</small><button type="button" class="btn btn-sm" data-alert-manage="'+esc(alertKey(a))+'">Tratar pendência</button><button type="button" class="btn btn-sm" data-alert-detail="'+esc(a.view+':'+a.recordId)+'">Abrir registro ↗</button></div></article>').join('')+'</div>':empty('Nenhuma pendência correspondente aos filtros.'))+pagination+
 '<p class="ins-hint">Uma RV ou CT-e não localizada pode estar fora do período consultado. Uma referência ausente não comprova irregularidade fiscal ou falta de emissão.</p></section>';
}
export function renderComparison(data,state){
 const selected='personalizado';
 const anchor=state.compareAnchor||state.to;
 const windows={current:{from:state.compareCurrentFrom,to:state.compareCurrentTo},previous:{from:state.comparePreviousFrom,to:state.comparePreviousTo}};
 let comparison=state.comparison;
 if(state.mode==='demo')comparison={interval:selected,anchor,custom:true,currentRange:windows.current,previousRange:windows.previous,current:subsetPeriod(state.dataset,windows.current),previous:subsetPeriod(state.dataset,windows.previous),source:'demo'};
 const ready=comparison&&comparison.currentRange?.from===windows.current.from&&comparison.currentRange?.to===windows.current.to&&comparison.previousRange?.from===windows.previous.from&&comparison.previousRange?.to===windows.previous.to;
 const financial=!!state.permissions.financeiro;
 const lines=ready?comparePeriodMetrics(comparison.current,comparison.previous,{financial}):[];
 const moneyFmt=metric=>metric.unit==='money';
 const val=(x,isMoney)=>x===null?'—':isMoney?curr(x):n(x);
 return '<section class="ins-module"><div class="ins-toolbar"><div><h2>COMPARATIVO DE PERÍODOS</h2><p>Escolha livremente os períodos A e B para comparar</p></div></div>'+
 '<div class="ins-compare-anchor"><label>Período A: de <input type="date" id="compareCurrentFrom" value="'+esc(windows.current.from)+'"></label><label>Até <input type="date" id="compareCurrentTo" value="'+esc(windows.current.to)+'"></label><label>Período B: de <input type="date" id="comparePreviousFrom" value="'+esc(windows.previous.from)+'"></label><label>Até <input type="date" id="comparePreviousTo" value="'+esc(windows.previous.to)+'"></label></div>'+
 '<div class="ins-period-label"><div><small>PERÍODO A</small><strong>'+date(windows.current.from)+' a '+date(windows.current.to)+'</strong></div><div><small>PERÍODO B</small><strong>'+date(windows.previous.from)+' a '+date(windows.previous.to)+'</strong></div></div>'+
 (state.mode==='live'&&!ready?'<div class="ins-compare-init"><p>Consulte os dois períodos no DSS para comparar registros reais. Essa consulta é protegida pelo perfil de acesso.</p><button class="btn btn-red" data-ins-action="load-comparison">Consultar os dois períodos</button></div>':'')+
 (state.comparisonLoading?'<p class="ins-hint">Consultando DSS...</p>':'')+
 (state.comparisonError?'<p class="ins-inline-error">'+esc(state.comparisonError)+'</p>':'')+
 (ready?'<div class="ins-responsive-table"><table><thead><tr><th>Indicador</th><th>Atual</th><th>Anterior</th><th>Diferença</th><th>Variação (%)</th></tr></thead><tbody>'+
 lines.map(m=>'<tr><td>'+esc(m.label)+'</td><td>'+val(m.value,moneyFmt(m))+'</td><td>'+val(m.previous,moneyFmt(m))+'</td>'+
 '<td class="'+(m.delta===null?'':m.delta>0?'ins-positive':m.delta<0?'ins-negative':'')+'">'+(m.delta===null?'—':(m.delta>0?'+':'')+val(m.delta,moneyFmt(m)))+'</td>'+
 '<td>'+ (m.pct===null?'—':(m.pct>0?'+':'')+m.pct.toFixed(1).replace('.',',')+'%')+'</td></tr>').join('')+'</tbody></table></div>':
 state.mode==='demo'?empty('Sem dados para comparar no período selecionado'):'' )+
 '<p class="ins-hint">Quando o período anterior é zero, a variação percentual não é calculada. Dados financeiros e de KM ausentes ficam como “—”. Uma elevação de custos ou de alertas não indica necessariamente melhor desempenho.</p></section>';
}
