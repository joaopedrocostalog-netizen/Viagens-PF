/**
 * COSTALOG • Painel visual corporativo (dados normalizados pelo adaptador DSS).
 * Não inventa posição GPS, manutenção, frota disponível, lucro ou status fiscal.
 * Mantém perfis financeiro/operacional: preços só quando a permissão é verdadeira.
 */
import {buildInsights,makeAlerts,groupRows} from './operational.mjs';
const H=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const N=v=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0}).format(v);
const B=v=>Number.isFinite(v)?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:2}).format(v):'—';
const PT=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v.slice(8)+'/'+v.slice(5,7)+'/'+v.slice(0,4):'—';
const COLORS=['#ff3548','#3ed68c','#64a9ff','#bb81ff','#ffad5b','#ffb6ae','#8f98a8'];
const safeStatus=s=>String(s||'Não informado').trim()||'Não informado';
const lower=s=>safeStatus(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const ended=s=>/conclu|encerr|finaliz|entreg/.test(lower(s));
const active=s=>/inici|transit|andamento|em viagem|rodando|em rota/.test(lower(s))&&!ended(s);
function classify(v){
 const s=lower(v.status);
 if(ended(s))return 'Concluídas';
 if(active(s))return 'Em viagem';
 if(/cancel/.test(s))return 'Canceladas';
 if(/aguard|penden|programad|previst|abert/.test(s))return 'Programadas / pendentes';
 return 'Outras situações';
}
const DOT={ 'Em viagem':'green','Concluídas':'blue','Programadas / pendentes':'amber','Canceladas':'red','Outras situações':'violet'};
const CATS=['Em viagem','Concluídas','Programadas / pendentes','Canceladas','Outras situações'];
function createCard(title,value,sub,tone='red',symbol='↗',progress=null){
 const bar=progress===null?'':'<div class="v-meter"><span class="v-meter-fill '+tone+'" style="width:'+Math.max(0,Math.min(100,progress)).toFixed(1)+'%"></span></div>';
 return '<article class="v-stat"><div class="v-stat-caption"><span>'+H(title)+'</span><b class="v-stat-icon '+tone+'">'+H(symbol)+'</b></div><div class="v-stat-value '+tone+'">'+H(value)+'</div><div class="v-stat-sub">'+H(sub||'')+'</div>'+bar+'</article>';
}
function panel(title,kicker,content,extra=''){
 return '<section class="v-panel '+extra+'"><div class="v-panel-head"><div><h3>'+H(title)+'</h3>'+(kicker?'<small>'+H(kicker)+'</small>':'')+'</div></div>'+content+'</section>';
}
function empty(text){return '<div class="v-chart-empty"><span>◇</span>'+H(text)+'</div>';}
export function renderHero(view,d,{from,to,mode,financeiro}){
 const titles={
  painel:['STATUS & CATEGORIA','Visão operacional unificada de viagens e pedidos de frete'],
  graficos:['VISÃO GRÁFICA','Indicadores, tendências e distribuição dos registros DSS'],
  viagens:['VIAGENS / RV','Relatórios de viagem, placas, clientes e situações'],
  ctes:['PEDIDOS DE FRETE / CT-e','Acompanhamento de documentos vinculados às viagens'],
  relatorios:['RELATÓRIOS DE PERFORMANCE','Business Intelligence & Operational Metrics'],
  faturamento:['FATURAMENTO','Análise financeira dos pedidos de frete'],
  clientes:['CLIENTES & FRETES','Valores e distribuição por cliente'],
  analises:['ANÁLISES FINANCEIRAS','Tendências mensais e valores de pedidos']
 };
 const t=titles[view]||[String(view||'painel').toUpperCase(),'Acompanhamento operacional COSTALOG'];
 return '<section class="v-hero"><div class="v-hero-mark">▦</div><div class="v-hero-copy"><div class="v-eyebrow">COSTALOG <span> / INTELIGÊNCIA OPERACIONAL</span></div><h1>'+H(t[0])+' <span class="v-hero-badge">'+(mode==='live'?'DSS':'DEMONSTRAÇÃO')+'</span></h1><p>'+H(t[1])+'</p></div><div class="v-hero-side"><span>PERÍODO SELECIONADO</span><strong>'+H(PT(from))+' — '+H(PT(to))+'</strong><small>'+N(d.viagens.length)+' RVs • '+N(d.pedidos.length)+' pedidos</small></div></section>';
}
export function renderSummary(d,settings){
 const viagens=d.viagens||[],pedidos=d.pedidos||[];
 const fin=!!settings.financeiro;
 const insights=buildInsights(d,{year:Number(settings.from?.slice(0,4)||new Date().getFullYear())});
 const statuses=groupRows(viagens,classify),counts=Object.fromEntries(statuses.map(x=>[x.name,x.count]));
 const underway=counts['Em viagem']||0,completed=counts['Concluídas']||0;
 const docs=pedidos.filter(p=>p.isCte),unlinked=docs.filter(p=>!p.viagemId);
 const evidence=pedidos.filter(p=>p.entregaConcluida===true&&p.comprovanteEntrega===false);
 const cards=[
  createCard('VIAGENS NO PERÍODO',N(viagens.length),'Relatórios de viagem identificados','red','▤',100),
  createCard('EM VIAGEM',N(underway),viagens.length?(100*underway/viagens.length).toFixed(1)+'% das viagens':'Sem viagens no período','green','↗',viagens.length?100*underway/viagens.length:0),
  createCard('VIAGENS CONCLUÍDAS',N(completed),'Status registrado no DSS','blue','✓',viagens.length?100*completed/viagens.length:0),
  createCard('PEDIDOS DE FRETE',N(pedidos.length),'Pedidos PF retornados','violet','▣',100)
 ];
 const extras=[
  createCard('CT-e IDENTIFICADOS',N(docs.length),'Número de CT-e registrado','blue','▤'),
  createCard('CT-e SEM RV VINCULADA',N(unlinked.length),'Não localizados na consulta','amber','!'),
  createCard('ENTREGAS SEM COMPROVANTE',N(evidence.length),'Entrega concluída; comprovante = não','red','!'),
  fin?createCard('VALOR DOS FRETES',insights.totals.freight.known?B(insights.totals.freight.sum):'—','Soma de total_frete informado; não recebido','green','R$'):
  createCard('REFERÊNCIAS MDF-e',N((d.mdfes||[]).length),'Sem validação de situação fiscal','violet','▤')
 ];
 const buckets=[...new Set(viagens.map(v=>v.tipoRv||'Não informado'))].sort((a,b)=>a.localeCompare(b,'pt-BR')).slice(0,5);
 const types=buckets.length?buckets:['Não informado'];
 const matrix='<div class="v-matrix-scroll"><table class="v-matrix"><thead><tr><th>SITUAÇÃO / TIPO DE RV</th>'+types.map(t=>'<th>'+H(t)+'</th>').join('')+'<th>TOTAL</th></tr></thead><tbody>'+
 CATS.map(cat=>{
 const row=types.map(type=>viagens.filter(v=>(v.tipoRv||'Não informado')===type&&classify(v)===cat).length);
 return '<tr><td><i class="v-dot '+DOT[cat]+'"></i>'+H(cat.toUpperCase())+'</td>'+
 row.map(n=>'<td><span class="v-matrix-cell'+(n?' filled':'')+'">'+N(n)+'</span></td>').join('')+
 '<td class="v-matrix-total">'+N(counts[cat]||0)+'</td></tr>';
 }).join('')+'</tbody></table></div>';
 const warnings=makeAlerts(d).filter(a=>fin||a.type!=='sem_fatura').slice(0,6);
 const alertHtml=warnings.length?warnings.map(a=>'<div class="v-alert '+(a.level==='high'?'critical':'')+'"><div class="v-alert-title">'+H(a.title)+'</div><p>'+H(a.detail)+'</p><span>'+H(a.refDate||'')+'</span></div>').join(''):empty('Nenhuma pendência identificada nos registros selecionados');
 return '<div class="v-stats-grid">'+cards.join('')+'</div>'+
 '<div class="v-stats-grid v-secondary-stats">'+extras.join('')+'</div>'+
 '<div class="v-section-grid">'+panel('STATUS & CATEGORIA','Distribuição por tipo e situação informada na RV',matrix,'v-span-7')+
 panel('ALERTAS & PENDÊNCIAS','Conferência dos registros disponíveis', '<div class="v-alert-list">'+alertHtml+'</div>','v-span-5')+'</div>'+
 '<div class="v-bottom-actions"><button class="btn btn-red" data-nav="viagens">VER TODAS AS VIAGENS →</button><button class="btn" data-nav="graficos">ABRIR VISÃO GRÁFICA ↗</button><button class="btn" data-nav="ctes">CONSULTAR CT-e</button></div>';
}
function pct(n,total){return total?100*n/total:0;}
function donut(entries,label){
 const list=entries.filter(x=>x.value>0);
 if(!list.length)return empty('Sem registros para distribuir');
 const total=list.reduce((sum,x)=>sum+x.value,0);
 let at=0;const gradients=list.map((x,i)=>{const start=pct(at,total);at+=x.value;return COLORS[i%COLORS.length]+' '+start+'% '+pct(at,total)+'%';});
 return '<div class="v-donut-layout"><div class="v-donut" style="background:conic-gradient('+gradients.join(',')+')"><div class="v-donut-hole"><strong>'+N(total)+'</strong><small>'+H(label)+'</small></div></div>'+
 '<div class="v-donut-legend">'+list.map((x,i)=>'<div><i style="background:'+COLORS[i%COLORS.length]+'"></i><span>'+H(x.name)+'</span><b>'+N(x.value)+' · '+pct(x.value,total).toFixed(0)+'%</b></div>').join('')+'</div></div>';
}
function bars(rows,{money=false}={}){
 const values=rows.filter(r=>Number.isFinite(r.value)).slice(0,8);
 if(!values.length)return empty('Sem dados suficientes para este gráfico');
 const max=Math.max(1,...values.map(r=>r.value));
 return '<div class="v-h-bars">'+values.map((r,i)=>'<div class="v-h-row"><div class="v-h-label" title="'+H(r.name)+'">'+H(r.name)+'</div><div class="v-h-track"><span style="width:'+Math.max(0,100*r.value/max).toFixed(1)+'%;background:'+COLORS[i%COLORS.length]+'"></span></div><strong>'+H(money?B(r.value):N(r.value))+'</strong></div>').join('')+'</div>';
}
function monthKey(date){return String(date||'').slice(0,7);}
export function timelineGroups(d,interval='mensal'){
 const dateFns={
  diario:s=>String(s||'').slice(0,10),
  semanal:s=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))return '';const a=new Date(s+'T12:00:00Z');a.setUTCDate(a.getUTCDate()-(a.getUTCDay()+6)%7);return a.toISOString().slice(0,10);},
  mensal:monthKey
 };
 const bucket=dateFns[interval]||monthKey,map=new Map();
 function register(item,type){
  const key=bucket(item.data);if(!key)return;
  const row=map.get(key)||{label:key,viagens:0,pedidos:0,ctes:0,fretes:0,fretesInformados:0,abastecimento:0,abastecimentoInformado:0};
  if(type==='viagens'){row.viagens++;if(Number.isFinite(item.abastecimento)){row.abastecimento+=item.abastecimento;row.abastecimentoInformado++;}}
  else{row.pedidos++;if(item.isCte)row.ctes++;if(Number.isFinite(item.valor)){row.fretes+=item.valor;row.fretesInformados++;}}
  map.set(key,row);
 }
 (d.viagens||[]).forEach(x=>register(x,'viagens'));
 (d.pedidos||[]).forEach(x=>register(x,'pedidos'));
 return [...map.values()].sort((a,b)=>a.label.localeCompare(b.label)).slice(-14);
}
export function lineGraph(series,metric='viagens',color='#ff3548'){
 if(!series.length)return empty('Selecione um período com registros para gerar a evolução');
 const W=780,H=286,L=45,R=18,T=22,BOT=42,innerW=W-L-R,innerH=H-T-BOT;
 const vals=series.map(v=>Number(v[metric])||0),max=Math.max(1,...vals),step=vals.length>1?innerW/(vals.length-1):0;
 const pt=(i,v)=>[L+(vals.length===1?innerW/2:i*step),T+innerH-innerH*v/max];
 const points=vals.map((v,i)=>pt(i,v).map(n=>n.toFixed(1)).join(',')).join(' ');
 const area=vals.map((v,i)=>pt(i,v).map(n=>n.toFixed(1)).join('L')).join(' '); // informational only, polygon uses closed coordinates below
 const polygon=[L+','+(T+innerH),points,(L+innerW)+','+(T+innerH)].join(' ');
 const grids=Array.from({length:5},(_,i)=>{const y=T+innerH*i/4;return '<line x1="'+L+'" y1="'+y+'" x2="'+(L+innerW)+'" y2="'+y+'" stroke="#292a2e" stroke-dasharray="4 5"/><text x="2" y="'+(y+3)+'" fill="#a3a4ad" font-size="11">'+H(N(Math.round(max*(1-i/4))))+'</text>';}).join('');
 const labels=series.map((d,i)=>'<text x="'+pt(i,0)[0]+'" y="'+(H-12)+'" text-anchor="middle" fill="#9c9da7" font-size="10">'+H(d.label.slice(5).replace('-','/'))+'</text>').join('');
 const markers=vals.map((v,i)=>'<circle cx="'+pt(i,v)[0]+'" cy="'+pt(i,v)[1]+'" r="3.7" fill="'+color+'" stroke="#141416" stroke-width="2"><title>'+H(series[i].label+' · '+N(v))+'</title></circle>').join('');
 return '<div class="v-svg-holder"><svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Evolução de '+H(metric)+' por período"><defs><linearGradient id="vLineFade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="'+color+'" stop-opacity=".36"/><stop offset="1" stop-color="'+color+'" stop-opacity=".01"/></linearGradient></defs>'+grids+
 '<polygon fill="url(#vLineFade)" points="'+polygon+'"/><polyline points="'+points+'" fill="none" stroke="'+color+'" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>'+markers+labels+'</svg></div>';
}
export function renderCharts(d,settings){
 const trips=d.viagens||[],orders=d.pedidos||[],fin=!!settings.financeiro,groups=timelineGroups(d,settings.interval||'mensal');
 const counted=groupRows(trips,classify),statuses=counted.map(x=>({name:x.name,value:x.count}));
 const customer=groupRows(fin?orders:trips,x=>x.cliente).map(x=>({name:x.name,value:fin?x.items.reduce((sum,p)=>sum+(Number.isFinite(p.valor)?p.valor:0),0):x.count,known:fin?x.items.some(p=>Number.isFinite(p.valor)):true})).filter(x=>x.known).sort((a,b)=>b.value-a.value);
 const rk=groupRows(trips,x=>[x.origem||'Origem não informada',x.destino||'Destino não informado'].join(' → ')).map(x=>({name:x.name,value:x.count})).sort((a,b)=>b.value-a.value);
 const modes=[['diario','DIÁRIO'],['semanal','SEMANAL'],['mensal','MENSAL']].map(([id,label])=>'<button class="v-segment '+(settings.interval===id?'selected':'')+'" data-chart-interval="'+id+'">'+label+'</button>').join('');
 const km=trips.filter(v=>Number.isFinite(v.kmRodados)).reduce((sum,v)=>sum+v.kmRodados,0);
 const summary='<div class="v-stats-grid">'+
 createCard('TOTAL DE VIAGENS',N(trips.length),'RV no período','red','▤')+
 createCard('PEDIDOS REGISTRADOS',N(orders.length),'Documentos PF','green','✓')+
 createCard('QUILOMETRAGEM',trips.some(v=>Number.isFinite(v.kmRodados))?N(km)+' km':'—','KM realizado informado','blue','↗')+
 (fin?createCard('FRETES INFORMADOS',orders.some(o=>Number.isFinite(o.valor))?B(orders.reduce((sum,p)=>sum+(Number.isFinite(p.valor)?p.valor:0),0)):'—','Valor de pedidos, não recebimento','violet','R$'):createCard('CT-e NUMERADOS',N(orders.filter(x=>x.isCte).length),'Não inclui validação fiscal','violet','▣'))+
 '</div>';
 return summary+
 '<div class="v-section-grid v-top-graphs">'+
 '<section class="v-panel v-span-8"><div class="v-panel-head"><div><h3>EVOLUÇÃO OPERACIONAL</h3><small>Contagem de RVs conforme data de início</small></div><div class="v-segments">'+modes+'</div></div>'+lineGraph(groups,'viagens')+'</section>'+
 '<section class="v-panel v-span-4"><div class="v-panel-head"><div><h3>DISTRIBUIÇÃO POR STATUS</h3><small>Classificação dos relatórios de viagem</small></div></div>'+donut(statuses,'VIAGENS')+'</section>'+
 '</div><div class="v-section-grid">'+
 panel('ROTAS MAIS FREQUENTES','Viagens com origem e destino registrados',bars(rk),'v-span-6')+
 panel(fin?'FRETES POR CLIENTE':'VIAGENS POR CLIENTE',fin?'Soma de pedidos com total_frete informado':'Quantidade de RVs por cliente',bars(customer,{money:fin}),'v-span-6')+
 '</div>';
}
export function renderTripsHeader(d){
 const rows=d.viagens||[],categorized=groupRows(rows,classify),counts=Object.fromEntries(categorized.map(c=>[c.name,c.count]));
 return '<div class="v-stats-grid">'+
 createCard('TOTAL DE VIAGENS',N(rows.length),'No período selecionado','red','▤')+
 createCard('EM VIAGEM',N(counts['Em viagem']||0),'Conforme status da RV','green','↗')+
 createCard('CONCLUÍDAS',N(counts['Concluídas']||0),'Conforme status da RV','blue','✓')+
 createCard('OUTRAS SITUAÇÕES',N(rows.length-(counts['Em viagem']||0)-(counts['Concluídas']||0)),'Pendentes, canceladas e demais','amber','!')+
 '</div>';
}
export function renderReportsHeader(d,settings){
 const groups=timelineGroups(d,settings.interval||'mensal'),fin=!!settings.financeiro;
 const counts=[{label:'VIAGENS',value:d.viagens.length,bar:'red'},{label:'PEDIDOS',value:d.pedidos.length,bar:'green'},{label:'CT-e NUMERADOS',value:d.pedidos.filter(p=>p.isCte).length,bar:'blue'}];
 const percentages=counts.map((c,i)=>createCard(c.label,N(c.value),i===0?'Relatórios RV':i===1?'Registros PF':'Pedidos com nro_cte',c.bar,i===0?'▤':'✓'));
 return '<div class="v-stats-grid">'+percentages.join('')+
 (fin?createCard('FRETES INFORMADOS',d.pedidos.some(p=>Number.isFinite(p.valor))?B(d.pedidos.reduce((s,p)=>s+(Number.isFinite(p.valor)?p.valor:0),0)):'—','Não equivale a faturamento recebido','violet','R$'):createCard('REFERÊNCIAS MDF-e',N((d.mdfes||[]).length),'Sem confirmação fiscal','violet','▤'))+'</div>'+
 panel('HISTÓRICO DE VIAGENS','Quantidade de registros por período',lineGraph(groups,'viagens'),'v-report-trend');
}
