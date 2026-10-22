import {unifiedSearch,customerProfiles,routeStats,driverStats,comparisonWindows,subsetPeriod,comparePeriodMetrics, dashboardMetrics,DASH_METRICS,normalizedLayout,alertsForRole} from './intelligence.mjs';
import {makeAlerts} from './operational.mjs';
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
 const current=state.tableSort?.[kind]||{key:kind==='rotas'?'count':kind==='clientes'?'tripCount':'trips',direction:'desc'};
 return '<th><button type="button" class="ins-sort-head" data-sort-metric="'+esc(kind+':'+key)+'" aria-label="Ordenar por '+esc(label)+'" aria-sort="'+(current.key===key?(current.direction==='asc'?'ascending':'descending'):'none')+'">'+esc(label)+' <span>'+ (current.key===key?(current.direction==='asc'?'▲':'▼'):'↕')+'</span></button></th>';
};

const badge=(value,cl='red')=>'<span class="ins-badge '+cl+'">'+esc(value)+'</span>';
const empty=message=>'<div class="ins-empty"><span>◇</span><p>'+esc(message)+'</p></div>';
const cards=items=>'<div class="ins-kpi-row">'+items.map(x=>'<div class="ins-kpi"><div>'+esc(x.label)+'</div><strong>'+esc(x.value)+'</strong><small>'+esc(x.note||'')+'</small></div>').join('')+'</div>';
export const SEARCH_MIN_LENGTH=2;
export function renderGlobalSearch(state,data){
 const q=String(state.globalQuery||''),result=unifiedSearch(data,q,{financial:false,limit:35});
 const tags={viagens:'RV',pedidos:'PF',mdfes:'MDF-e',clientes:'Cliente'};
 return '<section class="ins-search"><div class="ins-search-control"><span class="ins-search-symbol">⌕</span>'+
 '<label for="globalSearchInput" class="sr-only">Busca global por RV, CT-e, PF, placa ou cliente</label>'+
 '<input id="globalSearchInput" class="control" type="search" autocomplete="off" placeholder="Pesquisa global — placa, cliente, pedido PF, RV, CT-e, container..." value="'+esc(q)+'">'+
 (q?'<button class="ins-clear" type="button" data-ins-action="clear-search">Limpar</button>':'')+'</div>'+
 (q.length>=SEARCH_MIN_LENGTH?'<div class="ins-search-results"><div class="ins-toolbar"><strong>'+n(result.length)+' resultado(s) na consulta carregada</strong><small>Selecione para abrir o registro</small></div>'+
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
  '<strong>'+esc(val)+'</strong><span>'+esc(extra)+'</span></article>';
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
 sortedMetricRows(profiles,state.tableSort?.clientes?.key||'tripCount',state.tableSort?.clientes?.direction||'desc').map(p=>'<tr><td><button class="ins-link" data-client-open="'+esc(p.name)+'">'+esc(p.name)+'</button></td><td>'+n(p.tripCount)+'</td><td>'+n(p.orderCount)+'</td><td>'+n(p.cteCount)+'</td><td>'+curr(p.fretesValor)+'</td><td>'+date(p.lastDate)+'</td></tr>').join('')+'</tbody></table></div>':empty('Nenhum cliente encontrado no período selecionado.'))+
 '<p class="ins-hint">Dados do DSS, agregados pelo nome do cliente. Empresas homônimas podem precisar de identificação adicional quando o cadastro fornecer ID consistente.</p></section>';
}
export function renderDriverRouteDetails(data,state,view){
 const trips=data.viagens||[],orders=data.pedidos||[],routes=routeStats(trips),drivers=driverStats(trips,orders);
 const route=state.routeSelected?routes.find(r=>r.name===state.routeSelected):null;
 const driver=state.driverSelected?drivers.find(r=>r.id===state.driverSelected):null;
 if(view==='rotas'){
  const relevant=route?trips.filter(v=>(v.origem||'Origem não informada')+' → '+(v.destino||'Destino não informado')===route.name):[];
  return '<section class="ins-module"><div class="ins-toolbar"><div><h2>ROTAS & VOLUME OPERACIONAL</h2><p>Viagens, KM conhecidos, veículos e motoristas distintos</p></div>'+badge(n(routes.length)+' rotas')+'</div>'+
  (route?'<div class="ins-selected"><button class="btn" data-ins-action="clear-route">← Voltar para todas</button><h3>'+esc(route.name)+'</h3>'+
   cards([{label:'RVs',value:n(route.count)},{label:'KM identificados',value:route.km===null?'—':n(route.km)+' km',note:route.kmKnown+'/'+route.count+' RVs com KM'},
   {label:'Placas distintas',value:n(route.vehicles)},{label:'Motoristas ID',value:n(route.drivers)}])+
   (relevant.length?'<div class="ins-responsive-table"><table><thead><tr><th>RV</th><th>Início</th><th>Cliente</th><th>Placa</th><th>KM rodados</th></tr></thead><tbody>'+
    relevant.map(v=>'<tr><td><button class="ins-link" data-profile-detail="viagens:'+esc(v.id)+'">'+esc(v.numero)+'</button></td><td>'+date(v.data)+'</td><td>'+esc(v.cliente)+'</td><td>'+esc(v.placa||'—')+'</td><td>'+n(v.kmRodados)+'</td></tr>').join('')+'</tbody></table></div>':'')+'</div>':'')+
  (routes.length?'<div class="ins-responsive-table"><table><thead><tr>'+sortTableHeader('Origem → Destino','name',state,'rotas')+''+sortTableHeader('RVs','count',state,'rotas')+''+sortTableHeader('KM informados','km',state,'rotas')+''+sortTableHeader('KM médio*','kmPerTrip',state,'rotas')+''+sortTableHeader('Veículos','vehicles',state,'rotas')+''+sortTableHeader('Motoristas','drivers',state,'rotas')+'</tr></thead><tbody>'+
  sortedMetricRows(routes,state.tableSort?.rotas?.key||'count',state.tableSort?.rotas?.direction||'desc').map(r=>'<tr><td><button class="ins-link" data-route-open="'+esc(r.name)+'">'+esc(r.name)+'</button></td><td>'+n(r.count)+'</td><td>'+n(r.km)+'</td><td>'+n(r.kmPerTrip)+'</td><td>'+n(r.vehicles)+'</td><td>'+n(r.drivers)+'</td></tr>').join('')+'</tbody></table></div>':empty('Sem viagens com dados de rota'))+
  '<p class="ins-hint">* KM médio apenas entre RVs com KM registrado. Não são estimativas de percurso por GPS. Sem dados de tempo de condução ou produtividade laboral.</p></section>';
 }
 const related=driver?{trips:trips.filter(v=>v.motoristaId&&String(v.motoristaId)===driver.id),orders:orders.filter(p=>p.motoristaId&&String(p.motoristaId)===driver.id)}:null;
 return '<section class="ins-module"><div class="ins-toolbar"><div><h2>MOTORISTAS & ATIVIDADE</h2><p>Volume observado nas RVs e pedidos PF do DSS</p></div>'+badge(n(drivers.length)+' motoristas','blue')+'</div>'+
 (driver?'<div class="ins-selected"><button class="btn" data-ins-action="clear-driver">← Voltar</button><h3>'+esc(driver.name)+'</h3>'+
 cards([{label:'RVs com ID',value:n(driver.trips)},{label:'Pedidos PF',value:n(driver.orders)},{label:'CT-e numerados',value:n(driver.ctes)},{label:'KM conhecidos',value:driver.km===null?'—':n(driver.km)+' km'}])+
 '<div class="ins-profile-columns"><div><h3>RVs identificadas</h3>'+(related.trips.length?related.trips.map(v=>'<div class="ins-info-row"><button class="ins-link" data-profile-detail="viagens:'+esc(v.id)+'">RV '+esc(v.numero)+'</button><span>'+date(v.data)+'</span></div>').join(''):empty('Nenhuma RV identificada para este ID'))+'</div>'+
 '<div><h3>Pedidos identificados</h3>'+(related.orders.length?related.orders.map(p=>'<div class="ins-info-row"><button class="ins-link" data-profile-detail="ctes:'+esc(p.id)+'">'+esc(p.pedidoNumero||p.numero)+'</button><span>'+date(p.data)+'</span></div>').join(''):empty('Nenhum pedido identificado'))+'</div></div></div>':'')+
 (drivers.length?'<div class="ins-responsive-table"><table><thead><tr>'+sortTableHeader('Motorista','name',state,'motoristas')+''+sortTableHeader('RVs','trips',state,'motoristas')+''+sortTableHeader('Pedidos','orders',state,'motoristas')+''+sortTableHeader('CT-e','ctes',state,'motoristas')+''+sortTableHeader('KM conhecidos','km',state,'motoristas')+''+sortTableHeader('KM médio*','kmPerTrip',state,'motoristas')+''+sortTableHeader('Rotas distintas','routes',state,'motoristas')+'</tr></thead><tbody>'+
 sortedMetricRows(drivers,state.tableSort?.motoristas?.key||'trips',state.tableSort?.motoristas?.direction||'desc').map(d=>'<tr><td><button class="ins-link" data-driver-open="'+esc(d.id)+'">'+esc(d.name)+'</button></td><td>'+n(d.trips)+'</td><td>'+n(d.orders)+'</td><td>'+n(d.ctes)+'</td><td>'+n(d.km)+'</td><td>'+n(d.kmPerTrip)+'</td><td>'+n(d.routes)+'</td></tr>').join('')+'</tbody></table></div>':empty('Sem registros de motorista disponíveis'))+
 '<p class="ins-hint">Clique nos cabeçalhos para ordenar por mais CT-e, pedidos, viagens, KM ou motorista. “Nome não informado” significa que nenhum nome confiável foi retornado no período. A contagem depende do ID do motorista nas RVs e PFs; registros sem vínculo não são inferidos. * KM médio usa apenas viagens com informação de KM.</p></section>';
}
let cachedAlerts=null;
export function renderAlertsHub(data,state){
 const financial=!!state.permissions.financeiro;
 const lateDays=state.lateDays??2;
 if(!cachedAlerts||cachedAlerts.data!==data||cachedAlerts.lateDays!==lateDays){cachedAlerts={data,lateDays,alerts:makeAlerts(data,{lateDays})};}
 const alerts=alertsForRole(cachedAlerts.alerts,financial);
 const priority=state.alertPriority||'todos',kind=state.alertKind||'todos';
 const allowed=alerts.filter(a=>(priority==='todos'||a.level===priority)&&(kind==='todos'||a.type===kind));
 const types=[...new Set(alerts.map(x=>x.type))].sort();
 const typeLabels={cte_pendente:'Pedido sem CT-e',rv_nao_localizada:'RV não localizada',rv_ambigua:'Vínculo ambíguo',sem_fatura:'Fatura pendente',comprovante_pendente:'Comprovante ausente',ocorrencia:'Ocorrência',rv_sem_termino:'RV sem término',km_acima:'Excesso de KM',cte_sem_rv:'CT-e sem RV',rv_sem_pedido:'RV sem pedido PF'};
 return '<section class="ins-module"><div class="ins-toolbar"><div><h2>CENTRAL INTELIGENTE DE PENDÊNCIAS</h2><p>Alertas derivados dos campos do DSS — somente leitura</p></div>'+badge(n(alerts.length)+' alertas','red')+'</div>'+
 cards([{label:'Prioridade alta',value:n(alerts.filter(x=>x.level==='high').length)},{label:'Verificação',value:n(alerts.filter(x=>x.level==='warning').length)},
 {label:'Informativos',value:n(alerts.filter(x=>x.level==='info').length)},{label:'Registros encontrados',value:n(allowed.length)}])+
 '<div class="ins-alert-filters"><label>Prioridade<select id="alertPriorityFilter" class="control"><option value="todos">Todas</option>'+[['high','Alta'],['warning','Verificação'],['info','Informativa']].map(([k,v])=>'<option value="'+k+'" '+(priority===k?'selected':'')+'>'+v+'</option>').join('')+'</select></label>'+
 '<label>Tipo<select id="alertKindFilter" class="control"><option value="todos">Todos</option>'+types.map(t=>'<option value="'+esc(t)+'" '+(kind===t?'selected':'')+'>'+esc(typeLabels[t]||t)+'</option>').join('')+'</select></label></div>'+
 (allowed.length?'<div class="ins-alert-list">'+allowed.map(a=>'<article class="ins-alert-item"><span class="ins-alert-signal '+(a.level==='high'?'danger':a.level==='info'?'info':'warning')+'">!</span>'+
 '<div><strong>'+esc(a.title)+'</strong><p>'+esc(a.detail)+'</p><small>'+date(a.refDate)+' · '+esc(typeLabels[a.type]||a.type)+'</small></div>'+
 '<button type="button" class="btn btn-sm" data-alert-detail="'+esc(a.view+':'+a.recordId)+'">Abrir registro ↗</button></article>').join('')+'</div>':empty('Nenhuma pendência correspondente aos filtros.'))+(allowed.length>100?'<p class="ins-hint">Exibindo as primeiras 100 pendências dos '+n(allowed.length)+' registros. Refine os filtros para localizar outros resultados.</p>':'')+
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
