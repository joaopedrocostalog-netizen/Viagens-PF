/* COSTALOG | Viagens e Fretes. Sem credenciais no frontend. */
const root = document.getElementById('app');
const fmtBRL = new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL',maximumFractionDigits:0});
const fmtNum = new Intl.NumberFormat('pt-BR');
const year = new Date().getFullYear();
const DEMO_VIAGENS = [
 ['V-260081','2026-01-18','MAERSK LOGISTICS','CUF-7H59','Santos/SP','São Paulo/SP',21850,15430,'Concluída'],
 ['V-260102','2026-02-08','MSC BRASIL','CCU-5118','Santos/SP','Campinas/SP',18420,12270,'Concluída'],
 ['V-260148','2026-03-12','CMA CGM','CUL-4A55','Guarujá/SP','Jundiaí/SP',27450,18900,'Concluída'],
 ['V-260181','2026-04-15','MAERSK LOGISTICS','CUC-2B46','Santos/SP','São Paulo/SP',23880,17700,'Concluída'],
 ['V-260228','2026-05-21','HAPAG-LLOYD','CDR-7G70','Santos/SP','Sorocaba/SP',16540,11120,'Concluída'],
 ['V-260260','2026-06-09','MSC BRASIL','CUL-3H74','Santos/SP','Ribeirão Preto/SP',33500,23640,'Concluída'],
 ['V-260304','2026-07-18','CMA CGM','CCU-8C25','Santos/SP','Campinas/SP',19600,14420,'Concluída'],
 ['V-260341','2026-08-14','HAPAG-LLOYD','CUI-6101','Guarujá/SP','São José dos Campos/SP',22450,15920,'Concluída'],
 ['V-260375','2026-09-20','MAERSK LOGISTICS','CUG-5E51','Santos/SP','São Paulo/SP',24700,16350,'Concluída'],
 ['V-260401','2026-10-02','MSC BRASIL','CUF-7H59','Santos/SP','Campinas/SP',18960,13100,'Concluída'],
 ['V-260402','2026-10-09','CMA CGM','CCU-5118','Santos/SP','Sorocaba/SP',26500,18800,'Em andamento'],
 ['V-260403','2026-10-13','HAPAG-LLOYD','CDR-7G70','Santos/SP','Jundiaí/SP',21400,14250,'Planejada']
];
const demo = {
 viagens:DEMO_VIAGENS.map(x=>({id:x[0],numero:x[0],data:x[1],cliente:x[2],placa:x[3],origem:x[4],destino:x[5],receita:x[6],custo:x[7],status:x[8]})),
 ctes:[
  ...DEMO_VIAGENS.slice(0,10).map((x,i)=>({id:'CT-'+(31001+i),numero:String(31001+i),data:x[1],cliente:x[2],viagemId:x[0],valor:x[6],chave:'',status:'Autorizado',isCte:true})),
  {id:'CT-31011',numero:'31011',data:'2026-10-11',cliente:'MSC BRASIL',viagemId:null,valor:5250,chave:'',status:'Autorizado',isCte:true},
  {id:'CT-31012',numero:'31012',data:'2026-10-13',cliente:'CMA CGM',viagemId:null,valor:6400,chave:'',status:'Autorizado',isCte:true}
 ],
 pedidos:[],
 mdfes:[
  {id:'M-65021',numero:'65021',data:'2026-10-02',viagemId:'V-260401',placa:'CUF-7H59',status:'Encerrado'},
  {id:'M-65022',numero:'65022',data:'2026-10-09',viagemId:'V-260402',placa:'CCU-5118',status:'Autorizado'},
  {id:'M-65023',numero:'65023',data:'2026-10-12',viagemId:'V-260999',placa:'CDR-7G70',status:'Autorizado'},
  {id:'M-65024',numero:'65024',data:'2026-09-20',viagemId:'V-260375',placa:'CUG-5E51',status:'Encerrado'}
 ],
 sources:{viagens:true,pedidos:true,ctes:true,mdfes:true}
};
const state = {
 view:'painel', from:String(year)+'-01-01',to:String(year)+'-12-31',search:'',filter:'todos',page:1,
 dataset:demo, mode:'demo',error:'',loading:false,selected:null,connect:false,menu:false,
 apiUrl:localStorage.getItem('costalog_api_url')||'',token:'',importCount:0
};
const icons={
 home:'<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
 truck:'<path d="M3 6h12v11H3zM15 10h4l3 4v3h-7"/><circle cx="7.5" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
 doc:'<path d="M5 3h9l5 5v13H5zM14 3v5h5M8 13h8M8 17h8"/>',
 chart:'<path d="M4 20V4M4 20h17M8 15l4-5 4 2 5-7"/>',
 shield:'<path d="m12 2 9 4v6c0 5-4 8-9 10-5-2-9-5-9-10V6z"/><path d="m8 12 3 3 5-6"/>',
 cog:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"/>',
 reload:'<path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7"/>',
 download:'<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',
 search:'<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
 close:'<path d="M5 5l14 14M19 5 5 19"/>'
};
function icon(name){return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(icons[name]||icons.doc)+'</svg>';}
function esc(value){return String(value===null||value===undefined?'':value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function money(n){return Number.isFinite(n)?fmtBRL.format(n):'—';}
function number(n){return Number.isFinite(n)?fmtNum.format(n):'—';}
function dateBR(v){if(!v)return '—';const s=String(v).slice(0,10);if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4);return esc(s);}
function pct(n){return Number.isFinite(n)?new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(n)+'%':'—';}
function attr(v){return esc(v);}
function normalKey(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase();}
function pick(o,aliases){if(!o||typeof o!=='object')return undefined;const keys=Object.keys(o);for(const a of aliases){const k=keys.find(x=>normalKey(x)===normalKey(a));if(k&&o[k]!==null&&o[k]!=='')return o[k];}return undefined;}
function toMoney(v){if(typeof v==='number')return Number.isFinite(v)?v:null;if(v===null||v===undefined||v==='')return null;let s=String(v).replace(/[R$\s]/g,'');if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');else if(s.includes(','))s=s.replace(',','.');const n=Number(s);return Number.isFinite(n)?n:null;}
function toDay(v){if(!v)return '';const s=String(v);const match=s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);if(match)return match[3]+'-'+match[2]+'-'+match[1];return s.slice(0,10);}
function str(v){return v===undefined||v===null?'':String(v);}
function extractList(v){if(Array.isArray(v))return v;if(!v||typeof v!=='object')return [];for(const key of ['data','dados','results','result','items','lista','registros','retorno','content']){const match=Object.keys(v).find(k=>normalKey(k)===key);if(match){const r=extractList(v[match]);if(r.length||Array.isArray(v[match]))return r;}}return [];}
function normalizeViagem(v,i){
 const id=str(pick(v,['idViagem','codViagem','numeroViagem','nrViagem','nroViagem','sequenciaViagem','nseqviagem','id','codigo']));
 return {id:id||'V-'+(i+1),numero:id||'—',data:toDay(pick(v,['dataViagem','dtViagem','dataSaida','dtSaida','dataEmissao','data'])),cliente:str(pick(v,['nomeCliente','razaoSocialCliente','cliente','tomador','razaoSocial','nomeTomador']))||'Não informado',placa:str(pick(v,['placaVeiculo','placaCavalo','placa','veiculo'])),origem:str(pick(v,['cidadeOrigem','origem','localOrigem'])),destino:str(pick(v,['cidadeDestino','destino','localDestino'])),receita:toMoney(pick(v,['valorReceita','receita','vlReceita','valorFrete','vlrFrete','totalReceita'])),custo:toMoney(pick(v,['custoTotal','valorCusto','custo','totalCusto','vlCusto'])),status:str(pick(v,['situacao','status','statusViagem']))||'Não informado'};
}
function normalizeDoc(v,i){
 const cteNumber=pick(v,['numeroCTe','nroCTe','nrCTe','numCTe','cteNumero','chaveCTe','chaveAcessoCTe']);
 const order=str(pick(v,['numeroPedidoFrete','nroPedidoFrete','numPedido','idPedidoFrete','pedido','numero','id']));
 const id=str(cteNumber||order||i+1);
 return {id:id,numero:str(cteNumber||order||'—'),data:toDay(pick(v,['dataEmissao','dtEmissao','dataCTe','data'])),cliente:str(pick(v,['nomeCliente','razaoSocial','cliente','tomador','nomeTomador']))||'Não informado',viagemId:str(pick(v,['idViagem','numeroViagem','nroViagem','nrViagem','codViagem','viagemId','viagem']))||null,valor:toMoney(pick(v,['valorFrete','valorCTe','valorTotal','valor','vlrFrete','receita'])),chave:str(pick(v,['chaveCTe','chaveAcessoCTe','chaveAcesso'])),status:str(pick(v,['situacao','status']))||'Não informado',isCte:cteNumber!==undefined};
}
function normalizeMdfe(v,i){
 const n=str(pick(v,['numeroMDFe','nroMDFe','nrMDFe','numero','id']));
 return {id:n||String(i+1),numero:n||'—',data:toDay(pick(v,['dataEmissao','dtEmissao','data'])),viagemId:str(pick(v,['idViagem','numeroViagem','nroViagem','nrViagem','viagemId','viagem']))||null,placa:str(pick(v,['placaVeiculo','placa','placaTracao'])),status:str(pick(v,['situacao','status']))||'Não informado'};
}
function normalizePayload(raw){
 const payload=raw.data||raw;const viagens=extractList(payload.viagens).map(normalizeViagem);
 const pedidos=extractList(payload.pedidos).map(normalizeDoc);
 const ctesApi=extractList(payload.ctes).map((v,i)=>({...normalizeDoc(v,i),isCte:true}));
 const inferred=pedidos.filter(x=>x.isCte);
 const ctes=ctesApi.length?ctesApi:inferred;
 const mdfes=extractList(payload.mdfes).map(normalizeMdfe);
 return {viagens,pedidos,ctes,mdfes,sources:{...(payload.sources||{viagens:true,pedidos:true,mdfes:Array.isArray(payload.mdfes)}),ctes:!!(ctesApi.length||inferred.length||payload.sources?.ctes)}};
}
function inRange(v){return !v||((!state.from||v>=state.from)&&(!state.to||v<=state.to));}
function scoped(){const d=state.dataset;return {viagens:d.viagens.filter(x=>inRange(x.data)),allViagens:d.viagens,ctes:d.ctes.filter(x=>inRange(x.data)),pedidos:d.pedidos.filter(x=>inRange(x.data)),mdfes:d.mdfes.filter(x=>inRange(x.data)),sources:d.sources};}
function totals(data){
 const trips=data.viagens;const ctes=data.ctes;
 const revenueKnown=trips.filter(v=>Number.isFinite(v.receita));
 const costsKnown=trips.filter(v=>Number.isFinite(v.custo));
 const revenue=revenueKnown.reduce((s,x)=>s+x.receita,0), cost=costsKnown.reduce((s,x)=>s+x.custo,0);
 const completeMoney=trips.length>0&&revenueKnown.length===trips.length&&costsKnown.length===trips.length;
 const orphan=data.sources.ctes?ctes.filter(c=>!c.viagemId||!data.allViagens.some(t=>t.id===c.viagemId)):null;
 const linked=data.mdfes.filter(m=>m.viagemId&&data.allViagens.some(t=>t.id===m.viagemId));
 const mismatched=data.sources.mdfes?data.mdfes.filter(m=>m.viagemId&&!data.allViagens.some(t=>t.id===m.viagemId)):null;
 return {revenue:revenueKnown.length?revenue:null,cost:costsKnown.length?cost:null,profit:completeMoney?revenue-cost:null,margin:completeMoney&&revenue?pct((revenue-cost)/revenue*100):'—',orphan,mismatched,linked,completeMoney,revenueCount:revenueKnown.length,costCount:costsKnown.length};
}
const navItems=[['painel','home','Visão geral'],['viagens','truck','Viagens'],['ctes','doc','Pedidos / CT-e'],['clientes','chart','Custos e Receitas'],['mdfes','shield','MDF-e'],['relatorios','doc','Relatórios'],['integracoes','cog','Integração DSS']];
const tabs=[['painel','Painel'],['viagens','Viagens'],['ctes','Pedidos / CT-e'],['clientes','Clientes'],['mdfes','MDF-e'],['relatorios','Relatórios'],['integracoes','Integração']];
function button(action,label,extra){return '<button class="btn '+(extra||'')+'" data-action="'+action+'">'+label+'</button>';}
function render(){
 const d=scoped(),stats=totals(d);
 const nav=navItems.map(x=>'<button class="side-link '+(state.view===x[0]?'active':'')+'" data-nav="'+x[0]+'">'+icon(x[1])+esc(x[2])+'</button>').join('');
 const buttons=tabs.map(x=>'<button class="tab '+(state.view===x[0]?'active':'')+'" role="tab" aria-selected="'+(state.view===x[0])+'" data-nav="'+x[0]+'">'+esc(x[1])+'</button>').join('');
 const message=state.mode==='live'?'<div class="info-strip live"><strong>Dados do DSS:</strong> consulta concluída. Os campos não disponibilizados pela API são exibidos como “—”.</div>':'<div class="info-strip'+(state.error?' error':'')+'"><strong>DADOS DEMONSTRATIVOS:</strong> números fictícios usados apenas para visualizar o portal. Nenhuma informação real da COSTALOG está sendo exibida.'+(state.error?'<div>'+esc(state.error)+'</div>':'')+'</div>';
 root.innerHTML='<div class="layout">'+
  (state.menu?'<button class="floating-close" data-action="menu" aria-label="Fechar menu"></button>':'')+
  '<aside class="sidebar '+(state.menu?'open':'')+'"><div class="brand"><div class="brand-emblem">C</div><div><div class="brand-name">COSTALOG</div><div class="brand-sub">A LOGÍSTICA IDEAL</div></div></div><div class="side-title">GESTÃO DE FROTA</div><nav class="side-nav">'+nav+'</nav><div class="side-bottom"><strong>VIAGENS & FRETES</strong>Inteligência operacional e financeira<br>Portal interno COSTALOG</div></aside>'+
  '<main class="main"><header class="topbar"><div class="filter-row"><button class="btn btn-ghost btn-sm mobile-menu" data-action="menu" aria-label="Abrir menu">'+icon('menu')+'</button><strong>Viagens & Fretes</strong></div><div class="topbar-right"><span class="status '+(state.mode==='live'?'online':'')+'">'+(state.mode==='live'?'DSS conectado':'Modo demonstração')+'</span>'+button('connect','Conectar API','btn-ghost btn-sm')+button('refresh',icon('reload')+' Atualizar','btn-sm')+'</div></header>'+
  '<div class="content"><div class="heading"><div><h1>Controle de Viagens e Fretes</h1><p>Viagens, pedidos de frete, CT-e, MDF-e e análise de rentabilidade.</p></div><div class="heading-actions">'+button('csv',icon('download')+' Exportar CSV','btn-ghost')+button('print','Imprimir relatório','btn-ghost')+'</div></div><div class="tabbar" role="tablist">'+buttons+'</div>'+
  message+renderFilters()+(state.loading?'<div class="info-strip">Consultando a API do DSS...</div>':'')+renderView(d,stats)+
  '<p class="footer-note">COSTALOG · Painel de viagens e fretes. Valores financeiros dependem do mapeamento correto dos campos de origem.</p></div></main></div>'+
  (state.selected?renderDrawer(d):'')+(state.connect?renderConnect():'');
}
function renderFilters(){
 if(state.view==='integracoes')return '';
 return '<div class="filters"><div class="filter"><label for="from">De</label><input class="control" id="from" type="date" value="'+attr(state.from)+'"></div><div class="filter"><label for="to">Até</label><input class="control" id="to" type="date" value="'+attr(state.to)+'"></div>'+
 (['viagens','ctes','clientes','mdfes'].includes(state.view)?'<div class="filter grow"><label for="searchInput">Buscar registros</label><input id="searchInput" class="control full" type="search" placeholder="Número, placa, cliente ou situação..." value="'+attr(state.search)+'"></div>':'')+
 (['viagens','ctes','mdfes'].includes(state.view)?'<div class="filter"><label for="statusFilter">Situação</label><select id="statusFilter" class="control"><option value="todos">Todas</option><option value="vinculado" '+(state.filter==='vinculado'?'selected':'')+'>Vinculados</option><option value="pendente" '+(state.filter==='pendente'?'selected':'')+'>Sem vínculo</option></select></div>':'')+
 '</div>';
}
function kpi(label,value,sub,cl){return '<article class="kpi"><div class="kpi-label">'+label+'</div><div class="kpi-value '+(cl||'')+'">'+value+'</div><div class="kpi-sub">'+sub+'</div></article>';}
function renderView(d,s){
 if(state.view==='painel')return renderPainel(d,s);
 if(state.view==='viagens')return renderViagens(d,s);
 if(state.view==='ctes')return renderCtes(d);
 if(state.view==='clientes')return renderClientes(d,s);
 if(state.view==='mdfes')return renderMdfes(d,s);
 if(state.view==='relatorios')return renderRelatorios(d,s);
 return renderIntegracoes();
}
function renderPainel(d,s){
 const cteCount=d.sources.ctes?number(d.ctes.length):'—';
 const orphanCount=s.orphan?number(s.orphan.length):'—';
 const mdfeCount=s.mismatched?number(s.mismatched.length):'—';
 return '<div class="section-title"><h2>Resultados do período</h2><span>'+dateBR(state.from)+' a '+dateBR(state.to)+'</span></div>'+
 '<div class="kpis">'+
 kpi('VIAGENS REGISTRADAS',number(d.viagens.length),'Viagens no período')+
 kpi('RECEITA DE VIAGENS',money(s.revenue),'Com valor informado','money')+
 kpi('CUSTO DAS VIAGENS',money(s.cost),'Com valor informado','money')+
 kpi('RESULTADO OPERACIONAL',money(s.profit),'Margem: '+s.margin,'money '+(s.profit>=0&&s.profit!==null?'positive':''))+
 kpi('CT-e SEM VIAGEM',orphanCount,'CT-e identificados: '+cteCount,'alert')+
 kpi('MDF-e COM VÍNCULO INVÁLIDO',mdfeCount,'Com viagem inválida','alert')+
 '</div>'+
 '<div class="charts"><div class="card"><div class="card-head"><h3>Receita x custo por mês</h3><span>Ano '+esc(String(year))+'</span></div>'+chartSvg(d.viagens)+'<div class="chart-legend"><span><i class="legend-bullet" style="background:#e22231"></i>Receita</span><span><i class="legend-bullet" style="background:#777782"></i>Custo</span></div></div>'+
 '<div class="card"><div class="card-head"><h3>Receita por cliente</h3><span>Ranking do período</span></div>'+barRanking(d.viagens)+'</div></div>'+
 '<div class="bottom-panels"><div class="card"><div class="card-head"><h3>Viagens recentes</h3>'+button('go-viagens','Ver todas','btn-sm btn-ghost')+'</div>'+tableHtml(['Viagem','Data','Cliente','Placa','Situação'],d.viagens.slice().sort((a,b)=>b.data.localeCompare(a.data)).slice(0,5).map(v=>'<tr><td><button class="row-link" data-detail="viagens:'+attr(v.id)+'">'+esc(v.numero)+'</button></td><td>'+dateBR(v.data)+'</td><td>'+esc(v.cliente)+'</td><td>'+esc(v.placa||'—')+'</td><td>'+statusPill(v.status)+'</td></tr>'))+'</div>'+
 '<div class="card"><div class="card-head"><h3>Conciliação de documentos</h3><span>Alertas</span></div><div class="warn-list">'+
 '<div class="warn-row"><div><strong>CT-e sem viagem vinculada</strong><small>Requer identificação real do CT-e na API</small></div><b>'+orphanCount+'</b></div>'+
 '<div class="warn-row"><div><strong>MDF-e com viagem inexistente</strong><small>Vínculo explícito não localizado</small></div><b>'+mdfeCount+'</b></div>'+
 '<div class="warn-row"><div><strong>Viagens sem custo informado</strong><small>Não são consideradas no lucro consolidado</small></div><b>'+number(d.viagens.filter(x=>x.custo===null).length)+'</b></div>'+
 '</div></div></div>';
}
function chartSvg(trips){
 const months=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
 const aggregate=months.map((_,i)=>{const m=String(year)+'-'+String(i+1).padStart(2,'0');const t=trips.filter(x=>x.data.startsWith(m));return [t.reduce((s,x)=>s+(x.receita||0),0),t.reduce((s,x)=>s+(x.custo||0),0)];});
 const hasRevenue=trips.some(x=>Number.isFinite(x.receita)),hasCost=trips.some(x=>Number.isFinite(x.custo));
 if(!hasRevenue&&!hasCost)return '<div class="empty"><b>Sem dados para o gráfico</b>A API ainda não forneceu receita e custo.</div>';
 const max=Math.max(1,...aggregate.flat())*1.1;const W=760,H=250,left=48,top=20,h=180,w=680;
 const xy=(i,val)=>(left+(i*w/11)).toFixed(1)+','+(top+h-(val/max*h)).toFixed(1);
 const grid=[0,1,2,3,4].map(i=>{let y=top+i*h/4;return '<line x1="'+left+'" y1="'+y+'" x2="'+(left+w)+'" y2="'+y+'" stroke="#303034" stroke-dasharray="3 5"/><text x="0" y="'+(y+4)+'" fill="#98989f" font-size="11">'+esc(fmtNum.format(Math.round(max*(1-i/4))))+'</text>';}).join('');
 const labels=months.map((m,i)=>'<text x="'+(left+i*w/11)+'" y="229" text-anchor="middle" fill="#afafb4" font-size="11">'+m+'</text>').join('');
 const line=(idx,color)=>'<polyline points="'+aggregate.map((v,i)=>xy(i,v[idx])).join(' ')+'" fill="none" stroke="'+color+'" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>'+aggregate.map((v,i)=>v[idx]>0?'<circle cx="'+(left+i*w/11)+'" cy="'+(top+h-v[idx]/max*h)+'" r="4" fill="'+color+'"/>':'').join('');
 return '<div class="chart"><svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Comparação mensal de receita e custo">'+grid+labels+(hasRevenue?line(0,'#e22231'):'')+(hasCost?line(1,'#777782'):'')+'</svg></div>';
}
function aggregateClients(trips){
 const acc=new Map();
 for(const v of trips){const k=v.cliente||'Não informado';const a=acc.get(k)||{cliente:k,viagens:0,receita:0,custo:0,receitaN:0,custoN:0};a.viagens++;if(Number.isFinite(v.receita)){a.receita+=v.receita;a.receitaN++;}if(Number.isFinite(v.custo)){a.custo+=v.custo;a.custoN++;}acc.set(k,a);}
 return [...acc.values()].sort((a,b)=>b.receita-a.receita);
}
function barRanking(trips){
 const data=aggregateClients(trips).slice(0,6);
 if(!data.length)return '<div class="empty">Nenhum cliente no período.</div>';
 const top=Math.max(1,...data.map(x=>x.receita));
 return '<div class="bar-list">'+data.map(x=>'<div class="bar-item"><span class="bar-name" title="'+attr(x.cliente)+'">'+esc(x.cliente)+'</span><div class="bar-track"><div class="bar-fill" style="width:'+((x.receita/top)*100).toFixed(1)+'%"></div></div><span class="bar-num">'+(x.receitaN?money(x.receita):'—')+'</span></div>').join('')+'</div>';
}
function statusPill(s){const x=str(s).toLowerCase();let cl=x.includes('conclu')||x.includes('autoriza')||x.includes('encerra')?'green':x.includes('pend')||x.includes('andamento')||x.includes('planeja')?'yellow':x.includes('cancel')||x.includes('sem ')||x.includes('erro')?'red':'gray';return '<span class="pill '+cl+'">'+esc(s||'Não informado')+'</span>';}
function tableHtml(headers,rows){return '<div class="table-wrap"><table><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+(rows.length?rows.join(''):'<tr><td colspan="'+headers.length+'"><div class="empty"><b>Nenhum registro encontrado</b>Ajuste os filtros ou atualize os dados.</div></td></tr>')+'</tbody></table></div>';}
function searchRows(list){const term=normalKey(state.search);return list.filter(x=>!term||Object.values(x).some(v=>normalKey(str(v)).includes(term)));}
function paginate(list){const pageCount=Math.max(1,Math.ceil(list.length/15));state.page=Math.min(state.page,pageCount);const start=(state.page-1)*15;return {slice:list.slice(start,start+15),total:list.length,pages:pageCount};}
function paging(p){return '<div class="pagination"><span>'+number(p.total)+' registros · Página '+state.page+' de '+p.pages+'</span><div class="pagination-actions"><button class="btn btn-sm" data-action="prev" '+(state.page<=1?'disabled':'')+'>Anterior</button><button class="btn btn-sm" data-action="next" '+(state.page>=p.pages?'disabled':'')+'>Próxima</button></div></div>';}
function renderViagens(d,s){
 let rows=searchRows(d.viagens);if(state.filter==='vinculado')rows=rows.filter(v=>d.ctes.some(c=>c.viagemId===v.id)||d.mdfes.some(m=>m.viagemId===v.id));if(state.filter==='pendente')rows=rows.filter(v=>!d.ctes.some(c=>c.viagemId===v.id)&&!d.mdfes.some(m=>m.viagemId===v.id));rows.sort((a,b)=>b.data.localeCompare(a.data));const p=paginate(rows);
 return '<div class="table-tools"><h2>Viagens cadastradas</h2><div class="right-tools"><span class="status">'+number(rows.length)+' viagens</span>'+button('csv',icon('download')+' Exportar','btn-sm')+'</div></div>'+
 tableHtml(['Nº Viagem','Data','Cliente','Placa','Origem / Destino','Receita','Custo','Resultado','Situação'],p.slice.map(v=>'<tr><td><button class="row-link" data-detail="viagens:'+attr(v.id)+'">'+esc(v.numero)+'</button></td><td>'+dateBR(v.data)+'</td><td>'+esc(v.cliente)+'</td><td>'+esc(v.placa||'—')+'</td><td>'+esc((v.origem||'—')+' → '+(v.destino||'—'))+'</td><td>'+money(v.receita)+'</td><td>'+money(v.custo)+'</td><td>'+money(Number.isFinite(v.receita)&&Number.isFinite(v.custo)?v.receita-v.custo:null)+'</td><td>'+statusPill(v.status)+'</td></tr>'))+paging(p);
}
function renderCtes(d){
 const combined=[...d.ctes.map(x=>({...x,category:'CT-e'})),...d.pedidos.filter(p=>!p.isCte).map(x=>({...x,category:'Pedido de frete'}))];
 let rows=searchRows(combined);if(state.filter==='vinculado')rows=rows.filter(x=>x.viagemId);if(state.filter==='pendente')rows=rows.filter(x=>!x.viagemId);rows.sort((a,b)=>b.data.localeCompare(a.data));const p=paginate(rows);
 return '<div class="table-tools"><h2>Pedidos de frete e CT-e</h2><div class="right-tools"><span class="status">'+number(rows.length)+' registros</span>'+button('csv',icon('download')+' Exportar','btn-sm')+'</div></div>'+
 '<div class="info-strip">Pedidos de frete só são identificados como CT-e quando a fonte disponibiliza um número ou chave de CT-e. A ausência desse campo não significa que o CT-e não exista.</div>'+
 tableHtml(['Documento','Tipo','Emissão','Cliente','Viagem vinculada','Valor','Situação'],p.slice.map(v=>'<tr><td><button class="row-link" data-detail="ctes:'+attr(v.id)+'">'+esc(v.numero)+'</button></td><td>'+esc(v.category)+'</td><td>'+dateBR(v.data)+'</td><td>'+esc(v.cliente)+'</td><td>'+(v.viagemId?esc(v.viagemId):'<span class="pill red">Não vinculada</span>')+'</td><td>'+money(v.valor)+'</td><td>'+statusPill(v.status)+'</td></tr>'))+paging(p);
}
function renderClientes(d,s){
 let rows=searchRows(aggregateClients(d.viagens));const p=paginate(rows);
 return '<div class="kpis">'+kpi('CLIENTES COM VIAGENS',number(rows.length),'No período selecionado')+kpi('RECEITA IDENTIFICADA',money(s.revenue),'Com campo de receita','money')+kpi('CUSTO IDENTIFICADO',money(s.cost),'Com campo de custo','money')+kpi('RESULTADO VALIDÁVEL',money(s.profit),'Apenas se todos os valores existirem','money')+'</div>'+
 '<div class="table-tools"><h2>Rentabilidade por cliente</h2><div class="right-tools">'+button('csv',icon('download')+' Exportar','btn-sm')+'</div></div>'+
 tableHtml(['Cliente','Viagens','Receita','Custo','Resultado','Margem'],p.slice.map(v=>{const valid=v.receitaN===v.viagens&&v.custoN===v.viagens;const luc=valid?v.receita-v.custo:null;return '<tr><td><strong>'+esc(v.cliente)+'</strong></td><td>'+number(v.viagens)+'</td><td>'+(v.receitaN?money(v.receita):'—')+'</td><td>'+(v.custoN?money(v.custo):'—')+'</td><td>'+money(luc)+'</td><td>'+pct(valid&&v.receita?luc/v.receita*100:null)+'</td></tr>';}))+paging(p)+
 '<p class="help">O resultado financeiro de um cliente fica indisponível quando uma ou mais viagens não possuem receita ou custo. Nenhum valor ausente é tratado como zero.</p>';
}
function mdfeSituation(m,d){if(!m.viagemId)return 'Sem vínculo informado';if(!d.allViagens.some(v=>v.id===m.viagemId))return 'Viagem não encontrada';return 'Vinculado';}
function renderMdfes(d,s){
 let rows=searchRows(d.mdfes);if(state.filter==='vinculado')rows=rows.filter(m=>mdfeSituation(m,d)==='Vinculado');if(state.filter==='pendente')rows=rows.filter(m=>mdfeSituation(m,d)!=='Vinculado');rows.sort((a,b)=>b.data.localeCompare(a.data));const p=paginate(rows);
 return '<div class="table-tools"><h2>Conciliação de MDF-e</h2><div class="right-tools"><label class="btn btn-sm" for="csvMDFE">'+icon('download')+' Importar CSV de MDF-e</label><input id="csvMDFE" type="file" accept=".csv,text/csv" hidden>'+button('csv',icon('download')+' Exportar','btn-sm')+'</div></div>'+
 '<div class="info-strip">O cruzamento é feito por identificador explícito de viagem. Correspondência apenas por placa ou data não é confirmação suficiente. Caso a API de MDF-e ainda não exista, importe um CSV com as colunas: numero,data,viagemId,placa,status.</div>'+
 tableHtml(['Nº MDF-e','Emissão','Viagem','Placa','Situação fiscal','Conciliação'],p.slice.map(v=>'<tr><td><button class="row-link" data-detail="mdfes:'+attr(v.id)+'">'+esc(v.numero)+'</button></td><td>'+dateBR(v.data)+'</td><td>'+esc(v.viagemId||'—')+'</td><td>'+esc(v.placa||'—')+'</td><td>'+statusPill(v.status)+'</td><td>'+statusPill(mdfeSituation(v,d))+'</td></tr>'))+paging(p);
}
function renderRelatorios(d,s){
 const items=[['Viagens por período','Datas, frota, cliente e resultado','viagens'],['Pedidos de frete e CT-e','Documentos, valores e vínculos','ctes'],['Resultado por cliente','Receita, custo, lucro e margem','clientes'],['Conciliação de MDF-e','Vínculos, divergências e pendências','mdfes']];
 return '<div class="section-title"><h2>Central de relatórios</h2><span>Exportação compatível com Excel (CSV UTF-8)</span></div><div class="split">'+items.map(x=>'<div class="card"><div class="card-head"><h3>'+x[0]+'</h3></div><p class="help">'+x[1]+'</p><button class="btn btn-red" data-export="'+x[2]+'">'+icon('download')+' Baixar CSV</button></div>').join('')+'</div>'+
 '<div class="integration-box" style="margin-top:14px"><strong>Impressão</strong><p>Para imprimir a página ou salvar em PDF, utilize o botão “Imprimir relatório” no cabeçalho.</p>'+button('print','Imprimir agora','btn-ghost')+'</div>';
}
function renderIntegracoes(){
 return '<div class="section-title"><h2>Integração com o DSS</h2><span>Configuração técnica</span></div>'+
 '<div class="integration-box"><strong>1. Fontes planejadas</strong><p><code>listarViagens</code> e <code>listarPedidosFrete</code> são as operações informadas para a integração. O caminho HTTP, método, parâmetros, autenticação e campos de resposta precisam ser conferidos no Swagger da instalação.</p><a href="https://costalog.dssinformatica.com.br/wsdss/docs?urls.primaryName=APIs+Gerais" rel="noopener noreferrer" target="_blank">Abrir documentação fornecida do DSS ↗</a></div>'+
 '<div class="integration-box"><strong>2. Backend seguro</strong><p>As consultas saem do backend <code>api/server.mjs</code>. Configure o endereço, as rotas e credenciais exclusivamente nas variáveis do servidor; nunca no JavaScript público ou no GitHub. O endpoint interno esperado pelo portal é <code>GET /api/overview</code>.</p></div>'+
 '<div class="integration-box"><strong>3. CT-e e MDF-e</strong><p>Os pedidos de frete não são automaticamente CT-e. Para encontrar CT-e sem viagem, a API precisa retornar número/chave de CT-e e o identificador de viagem. O cruzamento com MDF-e exige uma fonte específica do portal ou a importação de CSV.</p></div>'+
 '<div class="integration-box"><strong>4. Publicação no site da empresa</strong><p>A interface é estática e pode ser incorporada por iframe ou rota interna. O backend deve ficar protegido por autenticação e HTTPS, preferencialmente no mesmo domínio da empresa ou atrás do proxy corporativo. GitHub Pages, isoladamente, não executa o backend do DSS.</p></div>';
}
function renderDrawer(d){
 const [kind,id]=state.selected.split(':');const item=kind==='viagens'?d.viagens.find(x=>x.id===id):kind==='ctes'?[...d.ctes,...d.pedidos].find(x=>x.id===id):d.mdfes.find(x=>x.id===id);
 if(!item){state.selected=null;return '';}
 const rows=Object.entries(item).filter(([k])=>!['id','isCte'].includes(k)).map(([k,v])=>'<div class="detail-line"><span>'+esc(({numero:'Número',data:'Data',cliente:'Cliente',placa:'Placa',origem:'Origem',destino:'Destino',receita:'Receita',custo:'Custo',status:'Situação',viagemId:'Viagem',valor:'Valor',chave:'Chave CT-e'}[k]||k))+'</span><b>'+(['receita','custo','valor'].includes(k)?money(v):k==='data'?dateBR(v):esc(v===null||v===''?'—':v))+'</b></div>').join('');
 let related='';
 if(kind==='viagens'){const cs=d.ctes.filter(c=>c.viagemId===id),ms=d.mdfes.filter(m=>m.viagemId===id);related='<h3 class="drawer-section">Documentos relacionados</h3><p class="help">CT-e identificados: '+cs.map(x=>esc(x.numero)).join(', ')+(cs.length?'':'nenhum')+'</p><p class="help">MDF-e vinculados: '+ms.map(x=>esc(x.numero)).join(', ')+(ms.length?'':'nenhum')+'</p>';}
 return '<div class="overlay" data-action="close-overlay"><aside class="drawer" role="dialog" aria-modal="true" aria-label="Detalhes do registro"><div class="drawer-top"><h2>Detalhes · '+esc(item.numero)+'</h2>'+button('close',icon('close'),'btn-sm')+'</div>'+rows+related+'</aside></div>';
}
function renderConnect(){
 return '<div class="overlay" data-action="close-overlay"><aside class="drawer" role="dialog" aria-modal="true" aria-label="Conectar API DSS"><div class="drawer-top"><h2>Conectar ao backend</h2>'+button('close',icon('close'),'btn-sm')+'</div><p class="help">Informe a URL do backend privado da COSTALOG e o token de acesso ao portal. Este token permanece apenas na memória desta aba e não é salvo no navegador nem no GitHub.</p>'+
 '<div class="filter"><label for="apiUrl">Endereço da API do portal</label><input id="apiUrl" class="control full" type="url" placeholder="https://portal.suaempresa.com.br" value="'+attr(state.apiUrl)+'"></div>'+
 '<div class="filter" style="margin-top:17px"><label for="apiToken">Token de acesso ao portal</label><input id="apiToken" class="control full" type="password" autocomplete="off" placeholder="Token definido no backend" value=""></div>'+
 '<div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap">'+button('test-connect','Conectar e consultar','btn-red')+button('demo','Voltar à demonstração','btn-ghost')+'</div><p class="help">A chave de autenticação do DSS é diferente da senha de acesso ao portal e deve existir apenas no servidor.</p></aside></div>';
}
function csvCell(s){const v=str(s);return '"'+v.replace(/"/g,'""')+'"';}
function exportCsv(which){
 const d=scoped();let rows=[],name='relatorio';
 if(which==='viagens'){name='viagens';rows=[['Viagem','Data','Cliente','Placa','Origem','Destino','Receita','Custo','Situacao'],...d.viagens.map(v=>[v.numero,v.data,v.cliente,v.placa,v.origem,v.destino,v.receita,v.custo,v.status])];}
 else if(which==='ctes'){name='pedidos_cte';rows=[['Documento','Tipo','Data','Cliente','Viagem','Valor','Situacao'],...[...d.ctes.map(x=>({...x,tipo:'CT-e'})),...d.pedidos.filter(x=>!x.isCte).map(x=>({...x,tipo:'Pedido de frete'}))].map(v=>[v.numero,v.tipo,v.data,v.cliente,v.viagemId,v.valor,v.status])];}
 else if(which==='clientes'){name='clientes';rows=[['Cliente','Viagens','Receita','Custo'],...aggregateClients(d.viagens).map(v=>[v.cliente,v.viagens,v.receitaN===v.viagens?v.receita:'',v.custoN===v.viagens?v.custo:''])];}
 else if(which==='mdfes'){name='mdfe';rows=[['MDF-e','Data','Viagem','Placa','Situacao','Conciliacao'],...d.mdfes.map(v=>[v.numero,v.data,v.viagemId,v.placa,v.status,mdfeSituation(v,d)])];}
 else{return exportCsv(state.view==='painel'?'viagens':state.view);}
 const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8;'});
 const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download='costalog_'+name+'_'+state.from+'_'+state.to+(state.mode==='demo'?'_DEMO':'')+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);
}
function parseCsv(content){const text=content.replace(/^\uFEFF/,'').replace(/\r/g,'');const rows=text.split('\n').filter(x=>x.trim());if(rows.length<2)return [];const sep=rows[0].includes(';')?';':',';function parseLine(l){const out=[];let token='',quoted=false;for(let i=0;i<l.length;i++){const c=l[i];if(c==='"'&&l[i+1]==='"'&&quoted){token+='"';i++;}else if(c==='"'){quoted=!quoted;}else if(c===sep&&!quoted){out.push(token);token='';}else token+=c;}out.push(token);return out;}const headers=parseLine(rows.shift()).map(normalKey);return rows.map((l,i)=>{const fields=parseLine(l);const v={};headers.forEach((h,j)=>v[h]=fields[j]||'');return normalizeMdfe(v,i);}).filter(x=>x.numero!=='—');}
async function loadData(){
 state.loading=true;state.connect=false;state.error='';render();
 try{
  const url=(state.apiUrl||window.location.origin).replace(/\/$/,'')+'/api/overview?from='+encodeURIComponent(state.from)+'&to='+encodeURIComponent(state.to);
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
  let response;try{response=await fetch(url,{headers:state.token?{'Authorization':'Bearer '+state.token}:{},credentials:'omit',signal:controller.signal});}finally{clearTimeout(timer);}
  if(!response.ok){let message='HTTP '+response.status;try{const b=await response.json();message=b.error||message;}catch{}throw new Error(message);}
  const data=await response.json();
  if(!data||!data.data)throw new Error('Formato de resposta desconhecido');
  state.dataset=normalizePayload(data);state.mode='live';state.error='';state.page=1;
 }catch(err){
  state.mode='demo';state.dataset=demo;state.error='API indisponível: '+(err.name==='AbortError'?'tempo limite de 15 segundos':err.message)+'. Exibindo somente dados fictícios.';
 }finally{state.loading=false;render();}
}
root.addEventListener('click',e=>{
 const nav=e.target.closest('[data-nav]');if(nav){state.view=nav.dataset.nav;state.search='';state.filter='todos';state.page=1;state.menu=false;state.selected=null;render();return;}
 const detail=e.target.closest('[data-detail]');if(detail){state.selected=detail.dataset.detail;render();return;}
 const exp=e.target.closest('[data-export]');if(exp){exportCsv(exp.dataset.export);return;}
 const act=e.target.closest('[data-action]');if(!act)return;
 const action=act.dataset.action;
 if(action==='close-overlay'&&e.target!==act)return;
 if(action==='close'||action==='close-overlay'){state.selected=null;state.connect=false;render();}
 if(action==='menu'){state.menu=!state.menu;render();}
 if(action==='refresh')loadData();
 if(action==='connect'){state.connect=true;state.selected=null;render();}
 if(action==='go-viagens'){state.view='viagens';state.page=1;render();}
 if(action==='csv')exportCsv(state.view==='painel'?'viagens':state.view);
 if(action==='print')window.print();
 if(action==='prev'){state.page--;render();}
 if(action==='next'){state.page++;render();}
 if(action==='demo'){state.mode='demo';state.dataset=demo;state.connect=false;state.error='';render();}
 if(action==='test-connect'){
   const u=document.getElementById('apiUrl').value.trim();
   if(u&&!/^https:\/\//i.test(u)&&!/^http:\/\/localhost(?::\d+)?$/i.test(u)){alert('Informe uma URL HTTPS, ou localhost para testes.');return;}
   state.apiUrl=u;state.token=document.getElementById('apiToken').value.trim();localStorage.setItem('costalog_api_url',u);loadData();
 }
});
root.addEventListener('change',e=>{
 if(e.target.id==='from'){state.from=e.target.value;state.page=1;render();}
 if(e.target.id==='to'){state.to=e.target.value;state.page=1;render();}
 if(e.target.id==='statusFilter'){state.filter=e.target.value;state.page=1;render();}
 if(e.target.id==='csvMDFE'){
  const file=e.target.files&&e.target.files[0];if(!file)return;
  file.text().then(text=>{const records=parseCsv(text);if(!records.length){alert('Nenhum registro válido no CSV. Confira o cabeçalho.');return;}state.dataset={...state.dataset,mdfes:records,sources:{...state.dataset.sources,mdfes:true}};state.importCount=records.length;render();alert(records.length+' MDF-e carregados nesta aba.');}).catch(()=>alert('Não foi possível ler o arquivo.'));
 }
});
root.addEventListener('input',e=>{
 if(e.target.id==='searchInput'){
  const start=e.target.selectionStart;state.search=e.target.value;state.page=1;render();
  const input=document.getElementById('searchInput');if(input){input.focus();input.setSelectionRange(start,start);}
 }
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&(state.selected||state.connect)){state.selected=null;state.connect=false;render();}});
render();
if(window.location.protocol!=='file:'&&state.apiUrl)loadData();
