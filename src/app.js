import {COMPANIES,validCompany,scopeCompanyData} from './companies.mjs';
import {renderGlobalSearch,renderCustomDashboard,renderCustomerProfiles,renderDriverRouteDetails,renderAlertsHub,renderComparison} from './intelligence-ui.mjs';
import {normalizedLayout,reorderMetric,comparisonWindows,subsetPeriod} from './intelligence.mjs';
import {renderHero,renderSummary,renderCharts,renderTripsHeader,renderReportsHeader} from './visual-dashboard.mjs';
import {resolvePortalApi} from './site-config.mjs';
import {renderUsersManagement,renderForcePasswordChange} from './admin-users.mjs';
import {permittedView,reportTypesFor,secureReport,safeView,operationalPermissions,operationalDataset} from './access-ui.mjs';
import {buildInsights,extractRows,REPORT_TYPES} from './operational.mjs';
import {downloadXlsx,downloadFile,printReport} from './reporting.mjs';
import {renderAdvanced,operationalFilters,renderInsightsStrip,renderReportHub,renderGrid,ADVANCED_VIEWS} from './advanced-ui.mjs';
import {normalizeOverview,costByClient} from './dss-mapping.mjs';
/* COSTALOG | Viagens e Fretes. Sem credenciais no frontend. */
const root = document.getElementById('app');
const fmtBRL = new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL',maximumFractionDigits:0});
const fmtNum = new Intl.NumberFormat('pt-BR');
const year = new Date().getFullYear();
const localToday=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
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
const emptyDataset=()=>({viagens:[],pedidos:[],ctes:[],mdfes:[],ocorrencias:[],sources:{}});
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
const readPrefs=(key,def)=>{try{return JSON.parse(localStorage.getItem(key))??def;}catch{return def;}};
demo.pedidos=demo.ctes.map(p=>({...p,pedidoNumero:'PF-'+p.numero,cteNumero:p.numero}));
for(const [i,trip] of demo.viagens.entries())trip.empresa=i<8?'AC da Costa':'Ideallog';
for(const order of [...demo.pedidos,...demo.ctes])order.empresa=demo.viagens.find(v=>v.id===order.viagemId)?.empresa||'Ideallog';
for(const doc of demo.mdfes)doc.empresa=demo.viagens.find(v=>v.id===doc.viagemId)?.empresa||'AC da Costa';
Object.assign(demo,operationalDataset(demo));

/* GitHub Pages = APENAS DEMONSTRAÇÃO, SEM AUTENTICAÇÃO REAL.
   Os dados reais DSS nunca devem ser servidos com a autenticação local do navegador. */
const portalSettings=resolvePortalApi(window.location);
const PUBLIC_DEMO=portalSettings.demoOnly;
const DEMO_USERS_KEY='costalog_demo_users_v1';
const TEMP_ADMIN_SALT='0586030c9088763dba9e1cde008cce5a';
const TEMP_ADMIN_HASH='977b36fdad10f371180e01878f3d4331ae80c73e7b422eaeabb058ac48e65bdd';
const PBKDF2_ITERATIONS=120000;
const demoRoles=['operacional','financeiro','administrador'];
const demoRights=role=>({operacional:true,financeiro:false,admin:role==='administrador'});
function demoUsers(){
 try {
  const rows=JSON.parse(localStorage.getItem(DEMO_USERS_KEY)||'null');
  if(Array.isArray(rows)&&rows.length)return rows;
 }catch{}
 return [{username:'admin',name:'Administrador (demonstração)',role:'administrador',salt:TEMP_ADMIN_SALT,hash:TEMP_ADMIN_HASH,disabled:false,mustChangePassword:true}];
}
function demoSave(rows){localStorage.setItem(DEMO_USERS_KEY,JSON.stringify(rows));}
const randomHex=n=>[...crypto.getRandomValues(new Uint8Array(n))].map(x=>x.toString(16).padStart(2,'0')).join('');
async function demoHash(password,salt){
 if(typeof password!=='string'||password.length<12||password.length>256)throw Error('Use uma senha de 12 a 256 caracteres.');
 if(!crypto?.subtle)throw Error('O modo de demonstração exige HTTPS e navegador atualizado.');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 const derived=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new Uint8Array(salt.match(/../g).map(x=>parseInt(x,16))),iterations:PBKDF2_ITERATIONS,hash:'SHA-256'},key,256);
 return [...new Uint8Array(derived)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
const demoPublic=u=>({username:u.username,displayName:u.name||u.username,name:u.name||u.username,role:u.role,disabled:!!u.disabled,mustChangePassword:!!u.mustChangePassword});
async function demoSignin(username,password){
 const u=demoUsers().find(x=>x.username===String(username||'').toLowerCase().trim()&&!x.disabled);
 if(!u||await demoHash(password,u.salt)!==u.hash)throw Error('Usuário ou senha temporária incorretos.');
 return demoPublic(u);
}
async function demoAccountAction(path='',options={}){
 if(state.role!=='administrador'||!state.user||state.user.mustChangePassword)throw Error('Somente o administrador pode modificar contas demonstrativas.');
 const rows=demoUsers(),operation=options.method||'GET',input=options.body?JSON.parse(options.body):{};
 const admins=()=>rows.filter(x=>x.role==='administrador'&&!x.disabled).length;
 if(!path&&operation==='GET')return {users:rows.map(demoPublic)};
 if(!path&&operation==='POST'){
  const username=String(input.username||'').trim().toLowerCase(),name=String(input.name||'').trim();
  if(!/^[a-z0-9._-]{3,60}$/.test(username)||name.length<2||name.length>100)throw Error('Informe nome e login válidos.');
  if(!demoRoles.includes(input.role))throw Error('Permissão inválida.');
  if(rows.some(x=>x.username===username))throw Error('Este login já está cadastrado neste navegador.');
  const salt=randomHex(16),hash=await demoHash(input.password,salt);
  const newUser={username,name,role:input.role,salt,hash,disabled:false,mustChangePassword:true};
  rows.push(newUser);demoSave(rows);return {user:demoPublic(newUser)};
 }
 if(path.startsWith('/')&&operation==='PATCH'){
  const username=decodeURIComponent(path.slice(1)),target=rows.find(x=>x.username===username);
  if(!target)throw Error('Funcionário não encontrado.');
  switch(input.action){
   case 'role':
    if(!demoRoles.includes(input.role))throw Error('Permissão inválida.');
    if(target.username===state.user.username&&input.role!=='administrador')throw Error('Não é possível rebaixar sua própria conta.');
    if(target.role==='administrador'&&input.role!=='administrador'&&admins()<=1)throw Error('Mantenha um administrador.');
    target.role=input.role;break;
   case 'disable':
    if(target.username===state.user.username)throw Error('Não pode bloquear sua própria conta.');
    if(target.role==='administrador'&&admins()<=1)throw Error('Mantenha um administrador.');
    target.disabled=true;break;
   case 'enable':target.disabled=false;break;
   case 'reset-password':
    target.salt=randomHex(16);target.hash=await demoHash(input.password,target.salt);target.mustChangePassword=true;break;
   default:throw Error('Ação inválida.');
  }
  demoSave(rows);return {user:demoPublic(target)};
 }
 throw Error('Operação inválida.');
}
async function demoChangeOwnPassword(currentPassword,newPassword){
 const rows=demoUsers(),u=rows.find(x=>x.username===state.user?.username);
 if(!u||await demoHash(currentPassword,u.salt)!==u.hash)throw Error('Senha provisória incorreta.');
 if(currentPassword===newPassword)throw Error('A nova senha deve ser diferente.');
 const salt=randomHex(16),hash=await demoHash(newPassword,salt);
 Object.assign(u,{salt,hash,mustChangePassword:false});
 demoSave(rows);
}

const requestedCompany=new URLSearchParams(window.location.search||'').get('empresa')||readPrefs('viagens_pf_company','costalog');
const initialCompany=validCompany(requestedCompany)?requestedCompany:'costalog';
const companySnapshots=new Map();
const state = {
 company:initialCompany,
  compareCustom:true,compareCurrentFrom:String(year)+'-10-01',compareCurrentTo:localToday(),comparePreviousFrom:String(year)+'-09-01',comparePreviousTo:String(year)+'-09-30',view:'viagens', chartInterval:'mensal', compareInterval:'mensal',compareAnchor:new Date().toISOString().slice(0,10), from:String(year)+'-01-01',to:localToday(),search:'',filter:'todos',page:1,
 dataset:demo, mode:'demo',error:'',loading:false,selected:null,connect:false,menu:false,
 apiUrl:portalSettings.apiUrl,token:'',importCount:0,
 globalQuery:'',clientSelected:'',routeSelected:'',driverSelected:'',alertKind:'todos',
 metricLayout:null,showMetricOptions:false,comparison:null,comparisonLoading:false,comparisonError:'',
 customer:'',vehicle:'',serviceType:'',sortKey:'',sortDir:'desc',alertPriority:'todos',
 hiddenColumns:readPrefs('costalog_visible_columns',{}),presets:readPrefs('costalog_filter_presets_'+initialCompany,{}),
 demoOnly:PUBLIC_DEMO,reportSelected:'viagens',reportMulti:false,autoRefresh:0,lastSync:null,prevDataset:null,lateDays:2,apiDiagnostics:null,adminUsers:[],adminUsersLoading:false,adminUsersError:'',adminResetUser:'',role:'operacional',user:null,permissions:{operacional:true,financeiro:false,admin:false}
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
 return {id:n||String(i+1),numero:n||'—',empresa:str(pick(v,['empresa','company','nomeEmpresa'])),data:toDay(pick(v,['dataEmissao','dtEmissao','data'])),viagemId:str(pick(v,['idViagem','numeroViagem','nroViagem','nrViagem','viagemId','viagem']))||null,placa:str(pick(v,['placaVeiculo','placa','placaTracao'])),status:str(pick(v,['situacao','status']))||'Não informado'};
}
function normalizePayload(raw){return operationalDataset(normalizeOverview({data:scopeCompanyData(raw?.data||raw,state.company)}));}
function inRange(v){return !v||((!state.from||v>=state.from)&&(!state.to||v<=state.to));}
let scopedCache=null;
function scoped(){
 const source=state.dataset;
 const cacheKey=[state.company,state.from,state.to,state.customer,state.vehicle,state.serviceType].join('|');
 if(scopedCache&&scopedCache.dataset===source&&scopedCache.key===cacheKey)return scopedCache.value;
 const d=scopeCompanyData(source,state.company);
 const matches=r=>(!state.customer||r.cliente===state.customer)&&(!state.vehicle||r.placa===state.vehicle);
 let viagens=d.viagens.filter(v=>inRange(v.data)&&matches(v));
 const pedidos=d.pedidos.filter(p=>inRange(p.data)&&matches(p)&&(!state.serviceType||p.tipoServico===state.serviceType));
 const ctes=d.ctes.filter(c=>inRange(c.data)&&matches(c)&&(!state.serviceType||c.tipoServico===state.serviceType));
 const mdfes=d.mdfes.filter(x=>inRange(x.data)&&(!state.vehicle||x.placa===state.vehicle));
 const ocorrencias=(d.ocorrencias||[]).filter(x=>inRange(x.data)&&(!state.vehicle||x.placa===state.vehicle));
 if(state.serviceType)viagens=viagens.filter(v=>pedidos.some(p=>p.viagemId===v.id));
 const value={viagens,allViagens:d.viagens,ctes,pedidos,mdfes,ocorrencias,sources:d.sources};
 scopedCache={dataset:source,key:cacheKey,value};return value;
}
function totals(data){
 const trips=data.viagens;const ctes=data.ctes;
 const revenueKnown=trips.filter(v=>Number.isFinite(v.receita));
 const costsKnown=trips.filter(v=>Number.isFinite(state.mode==='live'?v.abastecimento:v.custo));
 const revenue=revenueKnown.reduce((s,x)=>s+x.receita,0), cost=costsKnown.reduce((s,x)=>s+(state.mode==='live'?x.abastecimento:x.custo),0);
 const completeMoney=state.mode!=='live'&&trips.length>0&&revenueKnown.length===trips.length&&costsKnown.length===trips.length;
 const orphan=data.sources.ctes?ctes.filter(c=>!c.viagemId||!data.allViagens.some(t=>t.id===c.viagemId)):null;
 const linked=data.mdfes.filter(m=>m.viagemId&&data.allViagens.some(t=>t.id===m.viagemId));
 const mismatched=data.sources.mdfes?data.mdfes.filter(m=>m.viagemId&&!data.allViagens.some(t=>t.id===m.viagemId)):null;
 return {revenue:revenueKnown.length?revenue:null,cost:costsKnown.length?cost:null,profit:completeMoney?revenue-cost:null,margin:completeMoney&&revenue?pct((revenue-cost)/revenue*100):'—',orphan,mismatched,linked,completeMoney,revenueCount:revenueKnown.length,costCount:costsKnown.length};
}
const navItems=[['viagens','truck','Viagens / RV'],['ctes','doc','Pedidos de frete'],['entregas','doc','Entregas'],['pendencias','shield','Pendências'],['rotas','chart','Rotas'],['veiculos','truck','Frota'],['motoristas','home','Motoristas'],['mdfes','shield','MDF-e'],['ocorrencias','shield','Ocorrências']];
function button(action,label,extra){return '<button type="button" class="btn '+(extra||'')+'" data-action="'+action+'">'+label+'</button>';}
function render(){
 const brand=COMPANIES[state.company],other=state.company==='costalog'?'ideallog':'costalog';
 if(document.title!==undefined)document.title=brand.name+' · Viagens e pedidos de frete';
 state.view=safeView(state.role,state.view);
 const d=scoped(),stats=state.view==='painel'?totals(d):null;
 const allowed=navItems.filter(x=>x[0]!=='integracoes'&&permittedView(state.role,x[0]));
 const PRIMARY=['viagens','ctes'];
 const secondary=allowed.filter(x=>!PRIMARY.includes(x[0]));
 const tab=(x,cl)=>'<button type="button" class="'+cl+' '+(state.view===x[0]?'active':'')+'" data-nav="'+x[0]+'" aria-current="'+(state.view===x[0]?'page':'false')+'">'+icon(x[1])+'<span>'+esc(x[2])+'</span></button>';
 const primary=allowed.filter(x=>PRIMARY.includes(x[0])).map(x=>tab(x,'v-nav-item')).join('');
 const sub=secondary.map(x=>tab(x,'v-sub-item')).join('');
 const message=state.mode==='live'?'<div class="info-strip '+(state.error?'error':'live')+'"><strong>DSS:</strong> '+(state.error?'Última atualização falhou. Mostrando dados reais anteriores, que podem estar desatualizados. '+esc(state.error):'Dados consultados no servidor. Campos ausentes são exibidos como “—”.')+'</div>':
 '<div class="info-strip v-demo-notice"><strong>AMBIENTE DE DEMONSTRAÇÃO</strong> · Registros fictícios. A integração DSS utilizará estas mesmas telas quando o backend privado estiver configurado.</div>';
 const detailedFilters=state.view!=='administracao'?'<details class="v-extra-filters"><summary>⚙ Filtros avançados <span>Cliente, placa, serviço e períodos rápidos</span></summary>'+operationalFilters(d,state)+'</details>':'';
 const tools=['viagens','ctes','mdfes'].includes(state.view)?
  '<div class="v-heading-tools">'+button('csv',icon('download')+' CSV','btn-sm')+button('print','PDF / Imprimir','btn-sm btn-red')+'</div>':'';
 const dateFilters=state.view==='administracao'?'':renderFilters();
 const globalSearch=state.view==='administracao'?'':renderGlobalSearch(state,d);
 root.innerHTML='<div class="layout v-app"><main class="main v-main">'+
 '<header class="topbar v-topbar"><div class="v-topbrand"><img class="v-brand-logo '+(state.company==='ideallog'?'v-ideal-logo':'')+'" src="./'+brand.logo+'" alt="Logotipo '+brand.name+'"><div><b>'+brand.name+'</b><small>'+brand.description+'</small></div><i></i><strong>GESTÃO DE VIAGENS & FRETES</strong></div>'+
 '<div class="topbar-right v-accountbar">'+button('switch-company','Trocar para '+COMPANIES[other].label,'btn-sm btn-company-switch')+'<span class="v-environment '+(state.mode==='live'?'connected':'')+'">'+(state.mode==='live'?'● DSS':'● DEMO')+'</span>'+
 (state.user?'<span class="v-username">'+esc(state.user.displayName||state.user.username)+' · '+esc(state.role)+'</span>'+button('logout','Sair','btn-sm btn-ghost'):button('connect','Entrar','btn-sm btn-ghost'))+'</div></header>'+
 '<div class="v-menu-row"><nav class="v-main-nav" aria-label="Seções principais">'+primary+'</nav><div class="v-right-hint">'+(state.mode==='live'?'DADOS DO DSS':'DADOS DE TESTE')+'</div></div>'+
 (sub?'<nav class="v-sub-nav" aria-label="Outras áreas">'+sub+'</nav>':'')+
 '<div class="content v-content">'+renderHero(state.view,d,{from:state.from,to:state.to,mode:state.mode,financeiro:state.permissions.financeiro,company:state.company})+
 '<div class="v-tools-row">'+dateFilters+tools+'</div>'+globalSearch+detailedFilters+message+
 (state.loading?'<div class="info-strip">Consultando registros DSS...</div>':'')+
 renderView(d,stats)+
 '<footer class="v-footer">'+brand.name+' • Portal de inteligência operacional • '+(PUBLIC_DEMO?'Contas de demonstração somente neste navegador.':'Acesso baseado em permissões, dados DSS protegidos no servidor.')+'</footer></div></main></div>'+
 (state.selected?renderDrawer(d):'')+(state.connect?renderConnect():'')+
 (state.user?.mustChangePassword?renderForcePasswordChange():'')+
 (state.adminResetUser&&state.permissions.admin?renderAdminPasswordReset(state.adminResetUser):'');
}
function renderFilters(){
 if(state.view==='integracoes')return '';
 return '<div class="filters"><div class="filter"><label for="from">De</label><input class="control" id="from" type="date" max="'+localToday()+'" value="'+attr(state.from)+'"></div><div class="filter"><label for="to">Até</label><input class="control" id="to" type="date" max="'+localToday()+'" value="'+attr(state.to)+'"></div>'+
 (['viagens','ctes','clientes','mdfes','ocorrencias',...ADVANCED_VIEWS].includes(state.view)?'<div class="filter grow"><label for="searchInput">Buscar registros</label><input id="searchInput" class="control full" type="search" placeholder="Número, placa, cliente ou situação..." value="'+attr(state.search)+'"></div>':'')+
 (['viagens','ctes','mdfes'].includes(state.view)?'<div class="filter"><label for="statusFilter">Situação</label><select id="statusFilter" class="control"><option value="todos">Todas</option><option value="vinculado" '+(state.filter==='vinculado'?'selected':'')+'>Vinculados</option><option value="pendente" '+(state.filter==='pendente'?'selected':'')+'>Sem vínculo</option></select></div>':'')+
 (state.mode==='live'&&!PUBLIC_DEMO?'<div class="filter"><label>Consulta DSS</label><button type="button" class="btn btn-red" data-action="refresh" '+(state.loading?'disabled':'')+'>'+(state.loading?(state.loadingProgress||'Consultando DSS...'):'Atualizar dados da DSS')+'</button></div>':'')+
 '</div>';
}
function kpi(label,value,sub,cl){return '<article class="kpi"><div class="kpi-label">'+label+'</div><div class="kpi-value '+(cl||'')+'">'+value+'</div><div class="kpi-sub">'+sub+'</div></article>';}
function renderOcorrencias(d){
 const all=d.ocorrencias||[],q=String(state.search||'').toLocaleLowerCase('pt-BR');
 const rows=all.filter(o=>!q||[o.id,o.data,o.placa,o.descricao,o.tipo,o.relato,o.status,o.envolvido].some(x=>String(x||'').toLocaleLowerCase('pt-BR').includes(q))).slice(0,300);
 return '<section class="ins-module"><h2>OCORRÊNCIAS INTERNAS DSS</h2><p>Registros de motoristas e veículos no período consultado. Até 300 resultados por página de visualização.</p>'+
 (rows.length?'<div class="ins-responsive-table"><table><thead><tr><th>Data</th><th>ID</th><th>Placa</th><th>Tipo</th><th>Descrição / relato</th><th>Status</th><th>Providência</th></tr></thead><tbody>'+
 rows.map(o=>'<tr><td>'+esc(o.data)+'</td><td>'+esc(o.id)+'</td><td>'+esc(o.placa)+'</td><td>'+esc(o.tipo)+'</td><td>'+esc(o.descricao||o.relato)+'</td><td>'+esc(o.status)+'</td><td>'+esc(o.providencia)+'</td></tr>').join('')+'</tbody></table></div>':
 '<p class="help">Nenhuma ocorrência identificada para esta empresa. Registros sem empresa ou vínculo seguro com RV/PF não são exibidos. A consulta complementar pode estar indisponível na DSS.</p>')+'</section>';
}
function renderView(d,s){
 if(state.view==='painel')return renderCustomDashboard(d,state)+renderSummary(d,{financeiro:state.permissions.financeiro,mode:state.mode,from:state.from,to:state.to,showCards:false});
 if(state.view==='comparativos')return renderComparison(d,state);
 if(state.view==='graficos')return renderCharts(d,{financeiro:state.permissions.financeiro,interval:state.chartInterval});
 if(state.view==='viagens')return renderTripsHeader(d)+renderViagens(d,s);
 if(state.view==='ctes')return renderCtes(d);
 if(state.view==='clientes')return renderCustomerProfiles(d,state);
 if(state.view==='mdfes')return renderMdfes(d,s);
 if(state.view==='pendencias')return renderAlertsHub(d,state);
 if(state.view==='ocorrencias')return renderOcorrencias(d);
 if(state.view==='rotas'||state.view==='motoristas')return renderDriverRouteDetails(d,state,state.view);
 if(state.view==='relatorios')return renderReportsHeader(d,{financeiro:state.permissions.financeiro,interval:state.chartInterval})+renderReportHub(d,state);
 if(state.view==='administracao'&&state.permissions.admin)return renderUsersManagement(state.adminUsers,state.adminUsersLoading,state.adminUsersError)+(PUBLIC_DEMO?'<p class="help">Demonstração: contas e senhas ficam somente neste navegador. Sem dados reais.</p>':'<p class="help">Use Atualizar dados da DSS nas telas de viagens e pedidos para consultar os dados.</p>');
 if(ADVANCED_VIEWS.includes(state.view))return renderAdvanced(state.view,d,state);
 return renderIntegracoes();
}
function renderOperationalPanel(d){
 const values=buildInsights(d);
 const active=values.totals.ongoing,complete=values.totals.completed;
 return '<div class="section-title"><h2>Operação de viagens e entregas</h2><span>Somente dados operacionais</span></div>'+
 '<div class="kpis">'+kpi('VIAGENS NO PERÍODO',number(d.viagens.length),'Registros RV')+
 kpi('EM ANDAMENTO',number(active),'Conforme situação DSS')+
 kpi('CONCLUÍDAS',number(complete),'Conforme situação DSS')+
 kpi('PEDIDOS DE FRETE',number(d.pedidos.length),'Sem valores financeiros')+
 kpi('CT-e IDENTIFICADOS',number(d.ctes.length),'Apenas números de documento')+
 kpi('ENTREGAS SEM COMPROVANTE',number(values.totals.missingDelivery),'Requer conferência')+'</div>'+
 '<div class="charts"><div class="card"><div class="card-head"><h3>Visão operacional por mês</h3></div>'+
 '<div class="table-wrap"><table><thead><tr><th>Mês</th><th>Viagens</th><th>Pedidos</th><th>CT-e</th><th>KM registrados</th></tr></thead><tbody>'+
 values.months.filter(x=>x.trips||x.orders).map(x=>'<tr><td>'+esc(x.month)+'</td><td>'+number(x.trips)+'</td><td>'+number(x.orders)+'</td><td>'+number(x.ctes)+'</td><td>'+number(x.km)+'</td></tr>').join('')+
 '</tbody></table></div></div><div class="card"><div class="card-head"><h3>Acesso permitido</h3></div><p class="help">Consultas de viagens, veículos, motoristas, entregas, containers e referências de documentos. Os campos de custos, fretes, faturamento e tributos não são enviados pelo servidor para este perfil.</p>'+
 '<div class="overview-shortcuts"><button class="btn" data-nav="viagens">Ver viagens</button><button class="btn" data-nav="entregas">Ver entregas</button></div></div></div>';
}
function renderPainel(d,s){
 const cteCount=d.sources.ctes?number(d.ctes.length):'—';
 const orphanCount=s.orphan?number(s.orphan.length):'—';
 const mdfeCount=s.mismatched?number(s.mismatched.length):'—';
 return '<div class="section-title"><h2>Resultados do período</h2><span>'+dateBR(state.from)+' a '+dateBR(state.to)+'</span></div>'+
 '<div class="kpis">'+
 kpi('VIAGENS REGISTRADAS',number(d.viagens.length),'Viagens no período')+
 kpi(state.mode==='live'?'FRETES VINCULADOS':'RECEITA DE VIAGENS',money(s.revenue),state.mode==='live'?'Soma de total_frete nos pedidos':'Com valor informado','money')+
 kpi(state.mode==='live'?'ABASTECIMENTO':'CUSTO DAS VIAGENS',money(s.cost),state.mode==='live'?'Valor parcial informado nas RVs':'Com valor informado','money')+
 kpi('RESULTADO OPERACIONAL',money(s.profit),state.mode==='live'?'Custo total não fornecido pelo DSS':'Margem: '+s.margin,'money '+(s.profit>=0&&s.profit!==null?'positive':''))+
 kpi('CT-e SEM VÍNCULO',orphanCount,'CT-e identificados: '+cteCount,'alert')+
 kpi('MDF-e COM VÍNCULO INVÁLIDO',mdfeCount,'Com viagem inválida','alert')+
 '</div>'+
 '<div class="charts"><div class="card"><div class="card-head"><h3>'+(state.mode==='live'?'Fretes x abastecimento por mês':'Receita x custo por mês')+'</h3><span>Ano '+esc(String(year))+'</span></div>'+chartSvg(d.viagens)+'<div class="chart-legend"><span><i class="legend-bullet" style="background:#e22231"></i>Receita</span><span><i class="legend-bullet" style="background:#777782"></i>Custo</span></div></div>'+
 '<div class="card"><div class="card-head"><h3>'+(state.mode==='live'?'Fretes por cliente':'Receita por cliente')+'</h3><span>Ranking do período</span></div>'+barRanking(d)+'</div></div>'+
 '<div class="bottom-panels"><div class="card"><div class="card-head"><h3>Viagens recentes</h3>'+button('go-viagens','Ver todas','btn-sm btn-ghost')+'</div>'+tableHtml(['Viagem','Data','Cliente','Placa','Situação'],d.viagens.slice().sort((a,b)=>b.data.localeCompare(a.data)).slice(0,5).map(v=>'<tr><td><button class="row-link" data-detail="viagens:'+attr(v.id)+'">'+esc(v.numero)+'</button></td><td>'+dateBR(v.data)+'</td><td>'+esc(v.cliente)+'</td><td>'+esc(v.placa||'—')+'</td><td>'+statusPill(v.status)+'</td></tr>'))+'</div>'+
 '<div class="card"><div class="card-head"><h3>Conciliação de documentos</h3><span>Alertas</span></div><div class="warn-list">'+
 '<div class="warn-row"><div><strong>CT-e sem viagem vinculada</strong><small>Requer identificação real do CT-e na API</small></div><b>'+orphanCount+'</b></div>'+
 '<div class="warn-row"><div><strong>MDF-e com viagem inexistente</strong><small>Vínculo explícito não localizado</small></div><b>'+mdfeCount+'</b></div>'+
 '<div class="warn-row"><div><strong>'+(state.mode==='live'?'Viagens sem valor de abastecimento':'Viagens sem custo informado')+'</strong><small>Sem custo operacional total não é possível calcular lucro</small></div><b>'+number(d.viagens.filter(x=>state.mode==='live'?x.abastecimento===null:x.custo===null).length)+'</b></div>'+
 '</div></div></div>';
}
function chartSvg(trips){
 const months=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
 const aggregate=months.map((_,i)=>{const m=(state.from||String(year)).slice(0,4)+'-'+String(i+1).padStart(2,'0');const t=trips.filter(x=>x.data.startsWith(m));return [t.reduce((s,x)=>s+(x.receita||0),0),t.reduce((s,x)=>s+((state.mode==='live'?x.abastecimento:x.custo)||0),0)];});
 const hasRevenue=trips.some(x=>Number.isFinite(x.receita)),hasCost=trips.some(x=>Number.isFinite(state.mode==='live'?x.abastecimento:x.custo));
 if(!hasRevenue&&!hasCost)return '<div class="empty"><b>Sem dados para o gráfico</b>A API ainda não forneceu valores financeiros utilizáveis.</div>';
 const max=Math.max(1,...aggregate.flat())*1.1;const W=760,H=250,left=48,top=20,h=180,w=680;
 const xy=(i,val)=>(left+(i*w/11)).toFixed(1)+','+(top+h-(val/max*h)).toFixed(1);
 const grid=[0,1,2,3,4].map(i=>{let y=top+i*h/4;return '<line x1="'+left+'" y1="'+y+'" x2="'+(left+w)+'" y2="'+y+'" stroke="#303034" stroke-dasharray="3 5"/><text x="0" y="'+(y+4)+'" fill="#98989f" font-size="11">'+esc(fmtNum.format(Math.round(max*(1-i/4))))+'</text>';}).join('');
 const labels=months.map((m,i)=>'<text x="'+(left+i*w/11)+'" y="229" text-anchor="middle" fill="#afafb4" font-size="11">'+m+'</text>').join('');
 const line=(idx,color)=>'<polyline points="'+aggregate.map((v,i)=>xy(i,v[idx])).join(' ')+'" fill="none" stroke="'+color+'" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>'+aggregate.map((v,i)=>v[idx]>0?'<circle cx="'+(left+i*w/11)+'" cy="'+(top+h-v[idx]/max*h)+'" r="4" fill="'+color+'"/>':'').join('');
 return '<div class="chart"><svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Comparação mensal de receita e custo">'+grid+labels+(hasRevenue?line(0,'#e22231'):'')+(hasCost?line(1,'#777782'):'')+'</svg></div>';
}
function aggregateClients(trips,orders){
 if(state.mode==='live')return costByClient(trips,orders||[]);
 const acc=new Map();
 for(const v of trips){const k=v.cliente||'Não informado';const a=acc.get(k)||{cliente:k,viagens:0,receita:0,custo:0,receitaN:0,custoN:0};a.viagens++;if(Number.isFinite(v.receita)){a.receita+=v.receita;a.receitaN++;}if(Number.isFinite(v.custo)){a.custo+=v.custo;a.custoN++;}acc.set(k,a);}
 return [...acc.values()].sort((a,b)=>b.receita-a.receita);
}
function barRanking(d){
 const data=aggregateClients(d.viagens,d.pedidos).slice(0,6);
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
 let rows=searchRows(d.viagens);
 if(state.filter==='vinculado'||state.filter==='pendente'){
  const connectedIds=new Set([...d.ctes,...d.mdfes].map(x=>x.viagemId).filter(Boolean));
  rows=rows.filter(v=>state.filter==='vinculado'?connectedIds.has(v.id):!connectedIds.has(v.id));
 }
 const cols=[
  {key:'numero',label:'Nº RV',detail:'viagens'},{key:'data',label:'Início',format:'date'},{key:'dataTermino',label:'Término',format:'date'},
  {key:'cliente',label:'Cliente'},{key:'placa',label:'Placa'},{key:'motoristaId',label:'Motorista ID'},
  {key:'container',label:'Container'},{key:'nroMdf',label:'Referência MDF-e'},
  {key:'origem',label:'Origem'},{key:'destino',label:'Destino'},
  {key:'kmPrevisto',label:'KM previsto',format:'number'},{key:'kmRodados',label:'KM rodado',format:'number'},{key:'desvioKm',label:'Desvio KM',format:'number'},{key:'custoAbastecimentoKm',label:'Abastecimento/km',format:'money'},
  {key:'receita',label:state.mode==='live'?'Fretes vinculados':'Receita',format:'money'},
  {key:state.mode==='live'?'abastecimento':'custo',label:state.mode==='live'?'Abastecimento (parcial)':'Custo',format:'money'},
  {key:'status',label:'Situação'}];
 return renderGrid('Viagens cadastradas',rows,state.permissions.financeiro?cols:cols.filter(x=>!['receita','abastecimento','custo','custoAbastecimentoKm'].includes(x.key)),state,'viagens','Clique no número da RV para consultar a ficha completa e os pedidos relacionados.');
}
function renderCtes(d){
 const combined=d.pedidos.map(x=>({...x,numero:x.pedidoNumero||x.numero,category:'Pedido de frete'}));
 let rows=searchRows(combined);
 if(state.filter==='vinculado')rows=rows.filter(x=>x.viagemId);
 if(state.filter==='pendente')rows=rows.filter(x=>!x.viagemId);
 const cols=[
  {key:'numero',label:'Pedido PF',detail:'ctes'},
  {key:'cteNumero',label:'CT-e'},{key:'data',label:'Emissão',format:'date'},{key:'dataCte',label:'Emissão CT-e',format:'date'},
  {key:'cliente',label:'Cliente'},{key:'motoristaNome',label:'Motorista'}, {key:'placa',label:'Placa'},
  {key:'rvReferencia',label:'RV ref.'},{key:'nroMdf',label:'MDF-e ref.'},
  {key:'valor',label:'Valor frete',format:'money'},{key:'valorReceber',label:'Valor a receber',format:'money'},
  {key:'liberadoFaturamento',label:'Liberado faturamento',format:'bool'},
  {key:'numeroFatura',label:'Nº fatura'},{key:'entregaConcluida',label:'Entrega concluída',format:'bool'},
  {key:'comprovanteEntrega',label:'Comprovante',format:'bool'},{key:'ocorrencia',label:'Ocorrência'},
  {key:'valorIcmsIss',label:'ICMS/ISS',format:'money'},{key:'valorAverbacao',label:'Averbação',format:'money'},
  {key:'status',label:'Situação'}];
 return '<div class="info-strip">CT-e é identificado quando nro_cte possui número válido. “Sem RV” significa vínculo não localizado na consulta, não prova que a RV inexista. Situações fiscais completas exigem outras fontes.</div>'+
 renderGrid('Pedidos de frete',rows,state.permissions.financeiro?cols:cols.filter(x=>!['valor','valorReceber','liberadoFaturamento','numeroFatura','valorIcmsIss','valorAverbacao'].includes(x.key)),state,'ctes','Consulta de campos disponíveis em GET /listarPedidosFrete');
}
function renderClientes(d,s){
 const rows=searchRows(aggregateClients(d.viagens,d.pedidos)).map(v=>{
  const known=v.receitaN>0&&v.receitaN===v.viagens&&v.custoN===v.viagens&&state.mode!=='live';
  return {...v,ticket:v.receitaN?v.receita/v.receitaN:null,lucro:known?v.receita-v.custo:null,
   margem:known&&v.receita?(v.receita-v.custo)/v.receita*100:null};
 });
 const cols=[{key:'cliente',label:'Cliente'},{key:'viagens',label:'Viagens'},{key:'pedidos',label:'Pedidos'},
  {key:'receita',label:state.mode==='live'?'Fretes informados':'Receita',format:'money'},
  {key:'ticket',label:'Ticket médio',format:'money'},
  {key:'custo',label:state.mode==='live'?'Custo indisponível':'Custo',format:'money'},
  {key:'lucro',label:'Lucro válido',format:'money'}];
 if(state.mode==='live')rows.forEach(x=>x.custo=null);
 return '<div class="info-strip">Total de fretes por cliente não comprova valor recebido. Custos completos, lucro e margem não são deduzidos do abastecimento; exigem outras fontes.</div>'+
 renderGrid('Resumo operacional por cliente',rows,cols,state,'clientes','Ticket médio calculado sobre pedidos com valor informado.');
}
function mdfeSituation(m,d){if(m.ambiguous)return 'Vínculo ambíguo';if(!m.viagemId)return 'Sem vínculo informado';if(!d.allViagens.some(v=>v.id===m.viagemId))return 'Viagem não encontrada';return 'Vinculado';}
function renderMdfes(d,s){
 let rows=searchRows(d.mdfes);if(state.filter==='vinculado')rows=rows.filter(m=>mdfeSituation(m,d)==='Vinculado');if(state.filter==='pendente')rows=rows.filter(m=>mdfeSituation(m,d)!=='Vinculado');rows.sort((a,b)=>b.data.localeCompare(a.data));const p=paginate(rows);
 return '<div class="table-tools"><h2>Conciliação de MDF-e</h2><div class="right-tools"><label class="btn btn-sm" for="csvMDFE">'+icon('download')+' Importar CSV de MDF-e</label><input id="csvMDFE" type="file" accept=".csv,text/csv" hidden>'+button('csv',icon('download')+' Exportar','btn-sm')+'</div></div>'+
 '<div class="info-strip">'+(d.sources.mdfeReferences?'nro_mdf traz referências nos registros do DSS, não o status fiscal do MDF-e. Para validar, conecte API de MDF-e ou importe CSV.':'Conciliação por ID de viagem. Placa e data não comprovam vínculo.')+' CSV: numero,data,viagemId,placa,status.</div>'+
 tableHtml(['Nº MDF-e','Emissão','Viagem','Placa','Situação fiscal','Conciliação'],p.slice.map(v=>'<tr><td><button class="row-link" data-detail="mdfes:'+attr(v.id)+'">'+esc(v.numero)+'</button></td><td>'+dateBR(v.data)+'</td><td>'+esc(v.viagemId||'—')+'</td><td>'+esc(v.placa||'—')+'</td><td>'+statusPill(v.status)+'</td><td>'+statusPill(mdfeSituation(v,d))+'</td></tr>'))+paging(p);
}
function renderRelatorios(d,s){
 const items=[['Viagens por período','Datas, frota, cliente e resultado','viagens'],['Pedidos de frete e CT-e','Documentos, valores e vínculos','ctes'],['Resultado por cliente','Receita, custo, lucro e margem','clientes'],['Conciliação de MDF-e','Vínculos, divergências e pendências','mdfes']];
 return '<div class="section-title"><h2>Central de relatórios</h2><span>Exportação compatível com Excel (CSV UTF-8)</span></div><div class="split">'+items.map(x=>'<div class="card"><div class="card-head"><h3>'+x[0]+'</h3></div><p class="help">'+x[1]+'</p><button class="btn btn-red" data-export="'+x[2]+'">'+icon('download')+' Baixar CSV</button></div>').join('')+'</div>'+
 '<div class="integration-box" style="margin-top:14px"><strong>Impressão</strong><p>Para imprimir a página ou salvar em PDF, utilize o botão “Imprimir relatório” no cabeçalho.</p>'+button('print','Imprimir agora','btn-ghost')+'</div>';
}
function renderIntegracoes(){
 return '<div class="section-title"><h2>Integração com o DSS</h2><span>Configuração técnica</span></div>'+
 '<div class="integration-box"><strong>1. Fontes mapeadas</strong><p><code>GET /listarViagens</code> e <code>GET /listarPedidosFrete</code>: <code>data_inicio</code> e <code>data_fim</code> em dd/mm/aaaa. Ambos usam array <code>registros</code>. Ainda é necessário confirmar endereço base e autenticação do DSS.</p><a href="https://costalog.dssinformatica.com.br/wsdss/docs?urls.primaryName=APIs+Gerais" rel="noopener noreferrer" target="_blank">Abrir documentação fornecida do DSS ↗</a></div>'+
 '<div class="integration-box"><strong>2. Backend seguro</strong><p>As consultas saem do backend <code>api/server.mjs</code>. Configure o endereço, as rotas e credenciais exclusivamente nas variáveis do servidor; nunca no JavaScript público ou no GitHub. O endpoint interno esperado pelo portal é <code>GET /api/overview</code>.</p></div>'+
 '<div class="integration-box"><strong>3. CT-e e MDF-e</strong><p><code>nro_cte</code> identifica CT-e; <code>rv_viagem</code> vincula às viagens; <code>nro_mdf</code> fornece referências de MDF-e. <code>total_frete</code> é valor de pedido e <code>valor_total_abastecido</code> representa somente despesa parcial.</p></div>'+
 '<div class="integration-box"><strong>4. Publicação no site da empresa</strong><p>A interface é estática e pode ser incorporada por iframe ou rota interna. O backend deve ficar protegido por autenticação e HTTPS, preferencialmente no mesmo domínio da empresa ou atrás do proxy corporativo. GitHub Pages, isoladamente, não executa o backend do DSS.</p></div>';
}
function renderDrawer(d){
 const [kind,id]=state.selected.split(':');if(!permittedView(state.role,kind)){state.selected=null;return '';}const item=kind==='viagens'?d.viagens.find(x=>x.id===id):kind==='ctes'?[...d.pedidos,...d.ctes].find(x=>x.id===id):d.mdfes.find(x=>x.id===id);
 if(!item){state.selected=null;return '';}
 const secureKeys=new Set(['custo','receita','abastecimento','custoAbastecimentoKm','adiantamento','proventos','liquido','valor','valorReceber','valorAverbacao','valorIcmsIss','freteSemIcms','valorMercadorias','numeroFatura','liberadoFaturamento','statusPagamentoSaldo','dataPagamentoSaldo','contratoVf']);
 const rows=Object.entries(item).filter(([k])=>!['id','isCte'].includes(k)&&(state.permissions.financeiro||!secureKeys.has(k))).map(([k,v])=>'<div class="detail-line"><span>'+esc(({numero:'Número',data:'Data',cliente:'Cliente',abastecimento:'Abastecimento (R$)',nroMdf:'MDF-e informado',rvReferencia:'RV referenciada',pedidoNumero:'Pedido de frete',cteNumero:'Número CT-e',placa:'Placa',origem:'Origem',destino:'Destino',receita:'Receita',custo:'Custo',status:'Situação',viagemId:'Viagem',valor:'Valor',chave:'Chave CT-e'}[k]||k))+'</span><b>'+(['receita','custo','valor'].includes(k)?money(v):k==='data'?dateBR(v):esc(v===null||v===''?'—':v))+'</b></div>').join('');
 let related='';
 if(kind==='viagens'){
  const cs=d.ctes.filter(c=>c.viagemId===id),ms=d.mdfes.filter(m=>m.viagemId===id),orders=d.pedidos.filter(p=>p.viagemId===id);
  // Ocorrências não possuem RV no schema DSS: placa + intervalo é somente contexto, nunca vínculo confirmado.
  const incidents=(d.ocorrencias||[]).filter(o=>item.placa&&o.placa===item.placa&&o.data&&item.data&&o.data>=item.data&&o.data<=(item.dataTermino||item.data)).slice(0,20);
  related='<h3 class="drawer-section">Visão 360° da viagem</h3>'+
   '<p class="help">Motorista: '+esc(item.motoristaNome||item.motoristaId||'Não informado')+' · Veículo: '+esc(item.placa||'Não informado')+'</p>'+
   '<p class="help">Trajeto: '+esc(item.origem||'—')+' → '+esc(item.destino||'—')+'</p>'+
   '<p class="help">KM previsto: '+esc(item.kmPrevisto??'—')+' · KM rodado: '+esc(item.kmRodados??'—')+'</p>'+
   '<h3 class="drawer-section">Documentos vinculados</h3>'+
   '<p class="help">Pedidos de frete: '+orders.length+' · '+orders.slice(0,15).map(p=>esc(p.numero)).join(', ')+'</p>'+
   '<p class="help">CT-e identificados: '+cs.map(x=>esc(x.numero)).join(', ')+(cs.length?'':'nenhum')+'</p>'+
   '<p class="help">MDF-e vinculados: '+ms.map(x=>esc(x.numero)).join(', ')+(ms.length?'':'nenhum')+'</p>'+
   '<h3 class="drawer-section">Ocorrências da mesma placa no intervalo</h3>'+
   '<p class="help">Contexto por placa e data — não confirma relação com esta viagem: '+(incidents.length?incidents.map(o=>esc(o.data)+' · '+esc(o.descricao||o.tipo||o.status||'Ocorrência')).join(' | '):'nenhuma encontrada nos dados carregados')+'</p>';
 }
 return '<div class="overlay" data-action="close-overlay"><aside class="drawer" role="dialog" aria-modal="true" aria-label="Detalhes do registro"><div class="drawer-top"><h2>Detalhes · '+esc(item.numero)+'</h2>'+button('close',icon('close'),'btn-sm')+'</div>'+rows+related+'</aside></div>';
}
function renderConnect(){
 return '<div class="overlay" data-action="close-overlay"><aside class="drawer" role="dialog" aria-modal="true" aria-label="Acessar portal COSTALOG">'+
 '<div class="drawer-top"><h2>Entrar no portal COSTALOG</h2>'+button('close',icon('close'),'btn-sm')+'</div>'+
 '<p class="help">'+(PUBLIC_DEMO?'Acesso de demonstração com dados fictícios. Conta e alterações ficam somente neste navegador; não protegem informações reais.':'Cada funcionário utiliza sua própria conta e vê apenas os módulos autorizados. O servidor protege os dados reais.')+'</p>'+
 '<form id="loginForm">'+
 '<div class="filter" style="margin-top:17px"><label for="loginUser">Usuário do portal</label><input id="loginUser" class="control full" autocomplete="username" required placeholder="usuario.funcionario"></div>'+
 '<div class="filter" style="margin-top:17px"><label for="loginPassword">Senha do portal</label><input id="loginPassword" class="control full" type="password" autocomplete="current-password" required placeholder="Sua senha individual"></div>'+
 '<div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap"><button class="btn btn-red" type="submit">'+(PUBLIC_DEMO?'Entrar (demonstração)':'Entrar com segurança')+'</button>'+button('demo','Fechar / demonstração operacional','btn-ghost')+'</div></form>'+
 '<p class="help">'+(PUBLIC_DEMO?'Login inicial: admin. Utilize a senha temporária disponibilizada para testar e troque-a no primeiro acesso.':'O backend corporativo será configurado fora desta tela.')+'</p></aside></div>';
}
async function portalLogin(){
 const url=state.apiUrl?.replace(/\/$/,'')||window.location.origin;
 const username=document.getElementById('loginUser')?.value.trim()||'';
 const password=document.getElementById('loginPassword')?.value||'';
 if(PUBLIC_DEMO){
  try{
   const user=await demoSignin(username,password);
   clearSession();state.user=user;state.role=user.role;state.permissions=demoRights(user.role);
   state.view='viagens';state.connect=false;state.error='';state.mode='demo';state.dataset=demo;loadMetricPreferences();render();

  }catch(err){alert('Demonstração: '+err.message);}
  return;
 }
 if(!/^https:\/\//i.test(url)&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url)){alert('Use HTTPS ou localhost para desenvolvimento.');return;}
 try{
  const res=await fetch(url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',body:JSON.stringify({username,password})});
  const data=await res.json();
  if(!res.ok)throw Error(data.error||'Não foi possível autenticar.');
  if(!data.token||!['operacional','financeiro','administrador'].includes(data.user?.role))throw Error('Resposta inválida do servidor de autenticação.');
  clearSession();
  state.apiUrl=url;
  state.token=data.token;state.user=data.user;state.role=data.user.role;state.permissions=operationalPermissions(data.permissions);
  state.view='viagens';state.connect=false;state.error='';state.dataset={viagens:[],pedidos:[],ctes:[],mdfes:[],sources:{}};
  state.mode='live';loadMetricPreferences();render();
  if(state.user.mustChangePassword)return;
  // Dados DSS são carregados apenas ao clicar em Atualizar.

 }catch(err){const offline=err instanceof TypeError||/failed to fetch|networkerror|load failed/i.test(err.message||'');alert(offline?'Não foi possível conectar à API. Se está no mesmo computador, inicie o backend no PowerShell com node api/server.mjs e abra http://localhost:3001/ (não o endereço GitHub Pages). Verifique http://localhost:3001/api/health.': 'Login não autorizado: '+err.message);}
}
function adminEndpoint(path=''){
 return state.apiUrl.replace(/\/$/,'')+'/api/users'+path;
}
async function adminFetch(path='',options={}){
 if(PUBLIC_DEMO)return demoAccountAction(path,options);
 if(!state.permissions.admin||!state.token)throw Error('Somente administradores podem gerenciar contas.');
 const headers={Authorization:'Bearer '+state.token,...(options.body?{'Content-Type':'application/json'}:{})};
 const response=await fetch(adminEndpoint(path),{...options,headers,credentials:'omit'});
 let result;try{result=await response.json();}catch{result={};}
 if(response.status===401){clearSession();state.connect=true;render();throw Error('Sessão expirada. Faça login novamente.');}
 if(!response.ok)throw Error(result.error||'Erro HTTP '+response.status);
 return result;
}
async function loadAdminUsers(){
 if(!state.permissions.admin||(PUBLIC_DEMO?false:!state.token))return;
 const stamp=identityEpoch;
 state.adminUsersLoading=true;state.adminUsersError='';render();
 try{
  const result=await adminFetch();
  if(stamp!==identityEpoch)return;
  state.adminUsers=result.users||[];
 }catch(err){if(stamp===identityEpoch)state.adminUsersError=err.message;}
 finally{if(stamp===identityEpoch){state.adminUsersLoading=false;render();}}
}
async function createPortalUser(){
 if(!state.permissions.admin)return;
 const name=document.getElementById('adminNewName')?.value.trim();
 const username=document.getElementById('adminNewUsername')?.value.trim().toLowerCase();
 const role=document.getElementById('adminNewRole')?.value;
 const password=document.getElementById('adminNewPassword')?.value||'';
 if(password.length<12||password.length>256){alert('A senha provisória precisa ter de 12 a 256 caracteres.');return;}
 if(role==='administrador'&&!confirm('Este funcionário terá acesso total e poderá gerenciar outros usuários. Confirmar?'))return;
 try{
  await adminFetch('',{method:'POST',body:JSON.stringify({name,username,role,password})});
  await loadAdminUsers();
  alert('Conta de '+username+' criada. Entregue a senha provisória de forma segura. A troca será exigida no primeiro acesso.');
 }catch(err){alert('Não foi possível criar funcionário: '+err.message);}
}
async function updatePortalUser(username,action,extra={}){
 if(!state.permissions.admin)return;
 try{
  await adminFetch('/'+encodeURIComponent(username),{method:'PATCH',body:JSON.stringify({action,...extra})});
  state.adminResetUser='';
  await loadAdminUsers();
 }catch(err){alert('Não foi possível atualizar o usuário: '+err.message);}
}
function renderAdminPasswordReset(username){
 return '<div class="overlay"><aside class="drawer" role="dialog" aria-modal="true"><div class="drawer-top"><h2>Redefinir senha de '+esc(username)+'</h2><button class="btn" type="button" data-action="close-admin-reset">Fechar</button></div>'+
 '<p class="help">Defina uma senha provisória de pelo menos 12 caracteres. O funcionário será obrigado a trocá-la no próximo acesso.</p>'+
 '<form id="resetPortalUserPassword"><label for="adminResetPassword">Senha provisória</label><input id="adminResetPassword" class="control full" type="password" minlength="12" maxlength="256" autocomplete="new-password" required>'+
 '<button class="btn btn-red" type="submit">Confirmar redefinição</button></form></aside></div>';
}
async function changePortalPassword(){
 const currentPassword=document.getElementById('currentPortalPassword')?.value||'';
 const newPassword=document.getElementById('newPortalPassword')?.value||'';
 const confirmPassword=document.getElementById('confirmPortalPassword')?.value||'';
 if(newPassword!==confirmPassword){alert('As novas senhas são diferentes.');return;}
 if(newPassword.length<12||newPassword.length>256){alert('A senha deve ter 12 a 256 caracteres.');return;}
 try{
  if(PUBLIC_DEMO){
   await demoChangeOwnPassword(currentPassword,newPassword);
   clearSession();state.connect=true;render();
   alert('Senha de demonstração alterada neste navegador. Entre novamente com a nova senha.');
   return;
  }
  const r=await fetch(state.apiUrl.replace(/\/$/,'')+'/api/change-password',{method:'POST',headers:{Authorization:'Bearer '+state.token,'Content-Type':'application/json'},credentials:'omit',body:JSON.stringify({currentPassword,newPassword})});
  const data=await r.json();if(!r.ok)throw Error(data.error||'Não foi possível trocar senha.');
  clearSession();state.connect=true;render();
  alert('Senha atualizada. Entre novamente com sua senha pessoal.');
 }catch(err){alert('Falha ao alterar senha: '+err.message);}
}

function metricPrefsKey(){
 const user=state.user?.username||'visitante',mode=PUBLIC_DEMO?'demo':'corporativo';
 return 'costalog_dashboard_v1:'+mode+':'+encodeURIComponent(user)+':'+state.role;
}
function loadMetricPreferences(){
 let saved=null;
 try{const v=JSON.parse(localStorage.getItem(metricPrefsKey())||'null');if(Array.isArray(v))saved=v;}catch{}
 state.metricLayout=normalizedLayout(saved,{financial:!!state.permissions.financeiro});
}
function saveMetricPreferences(){
 localStorage.setItem(metricPrefsKey(),JSON.stringify(normalizedLayout(state.metricLayout,{financial:!!state.permissions.financeiro})));
}
let comparisonSeq=0;
async function fetchPeriodComparison(){
 if(state.mode!=='live'||!state.apiUrl||!state.token)return;
 const interval=state.compareInterval,anchor=state.compareAnchor;
 const windows={current:{from:state.compareCurrentFrom,to:state.compareCurrentTo},previous:{from:state.comparePreviousFrom,to:state.comparePreviousTo}};
 if(windows.current.from>windows.current.to||windows.previous.from>windows.previous.to){state.comparisonError='Corrija os períodos: a data inicial não pode superar a final.';render();return;}
 const seq=++comparisonSeq,identity=identityEpoch;
 state.comparisonLoading=true;state.comparisonError='';state.comparison=null;render();
 try{
  const get=async range=>{
   const url=state.apiUrl.replace(/\/$/,'')+'/api/overview?from='+range.from+'&to='+range.to;
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),180000);
   try{
    const res=await fetch(url,{headers:{Authorization:'Bearer '+state.token},credentials:'omit',signal:controller.signal});
    if(!res.ok){let reason='HTTP '+res.status;try{reason=(await res.json()).error||reason;}catch{}if(res.status===401)throw Error('O servidor recusou a sessão (HTTP 401). Entre novamente no portal e tente outra vez. Se persistir, verifique os logs de autenticação do backend.');throw Error(reason);}
    return normalizePayload(await res.json());
   }finally{clearTimeout(timer);}
  };
  // Reutilizar somente dados reais cujo intervalo completo foi carregado com sucesso.
  // Nunca tratar dados de uma consulta parcial ou antiga como cobertura completa.
  const covered=range=>state.loadedRange&&state.loadedRange.from<=range.from&&state.loadedRange.to>=range.to&&state.mode==='live';
  const getOrReuse=range=>covered(range)?Promise.resolve(subsetPeriod(state.dataset,range)):get(range);
  const [current,previous]=await Promise.all([getOrReuse(windows.current),getOrReuse(windows.previous)]);
  if(seq!==comparisonSeq||identity!==identityEpoch)return;
  const matches=r=>(!state.customer||r.cliente===state.customer)&&(!state.vehicle||r.placa===state.vehicle);
  const filter=d=>{
   const pedidos=d.pedidos.filter(p=>matches(p)&&(!state.serviceType||p.tipoServico===state.serviceType));
   const allowedTripIds=state.serviceType?new Set(pedidos.map(p=>p.viagemId).filter(Boolean)):null;
   const viagens=d.viagens.filter(v=>matches(v)&&(!allowedTripIds||allowedTripIds.has(v.id)));
   return {...d,viagens,pedidos,ctes:pedidos.filter(p=>p.isCte)};
  };
  state.comparison={anchor,interval,custom:!!state.compareCustom,currentRange:windows.current,previousRange:windows.previous,current:filter(current),previous:filter(previous),source:'DSS'};
 }catch(err){
  if(seq===comparisonSeq&&identity===identityEpoch)state.comparisonError='Não foi possível consultar ambos os períodos no DSS: '+err.message;
 }finally{
  if(seq===comparisonSeq&&identity===identityEpoch){state.comparisonLoading=false;render();}
 }
}
function switchCompany(){
 if(state.user?.mustChangePassword)return;
 if(state.mode==='live'&&state.loadedRange&&!state.loading)companySnapshots.set(state.company,{dataset:state.dataset,range:state.loadedRange,lastSync:state.lastSync});
 const company=state.company==='costalog'?'ideallog':'costalog';
 identityEpoch++;comparisonSeq++;
 state.company=company;
 localStorage.setItem('viagens_pf_company',JSON.stringify(company));
 if(window.history?.replaceState){const url=new URL(window.location.href);url.searchParams.set('empresa',company);window.history.replaceState(null,'',url);}
 const saved=companySnapshots.get(company);
 const reusable=saved&&saved.range.from===state.from&&saved.range.to===state.to;
 state.dataset=state.mode==='demo'?demo:reusable?saved.dataset:emptyDataset();
 Object.assign(state,{selected:null,page:1,customer:'',vehicle:'',serviceType:'',search:'',globalQuery:'',filter:'todos',sortKey:'',clientSelected:'',routeSelected:'',driverSelected:'',alertPriority:'todos',alertKind:'todos',comparison:null,prevDataset:null,error:'',loading:false,loadingProgress:'',loadedRange:reusable?saved.range:null,lastSync:reusable?saved.lastSync:null,presets:readPrefs('costalog_filter_presets_'+company,{})});
 loadMetricPreferences();render();
 if(state.mode==='live'&&state.token&&!reusable)loadData();
}
function clearSession(){
 identityEpoch++;comparisonSeq++;companySnapshots.clear();
 const token=state.token,url=state.apiUrl;
 if(token&&url)fetch(url.replace(/\/$/,'')+'/api/logout',{method:'POST',headers:{Authorization:'Bearer '+token},credentials:'omit'}).catch(()=>{});
 state.token='';state.user=null;state.role='operacional';state.permissions={operacional:true,financeiro:false,admin:false};
 state.mode='demo';state.dataset=demo;state.loadedRange=null;state.view='viagens';state.comparison=null;state.comparisonError='';state.metricLayout=null;state.clientSelected='';state.globalQuery='';state.adminUsers=[];state.adminUsersError='';state.adminResetUser='';state.adminUsersLoading=false;state.prevDataset=null;state.loading=false;state.selected=null;state.lastSync=null;state.apiDiagnostics=null;
}
function csvCell(s){const v=str(s);return '"'+v.replace(/"/g,'""')+'"';}
function exportCsv(which){
 const d=scoped();let rows=[],name='relatorio';
 if(which==='viagens'){name='viagens';rows=[['RV','Data','Cliente','Placa','MDF-e','Origem','Destino','Fretes','Abastecimento ou custo','Situacao'],...d.viagens.map(v=>[v.numero,v.data,v.cliente,v.placa,v.nroMdf,v.origem,v.destino,v.receita,state.mode==='live'?v.abastecimento:v.custo,v.status])];}
 else if(which==='ctes'){name='pedidos_cte';rows=[['Documento','Pedido PF','Tipo','Data','Cliente','RV','MDF-e','Valor','Situacao'],...[...d.ctes.map(x=>({...x,tipo:'CT-e'})),...d.pedidos.filter(x=>!x.isCte).map(x=>({...x,tipo:'Pedido de frete'}))].map(v=>[v.numero,v.pedidoNumero,v.tipo,v.data,v.cliente,v.viagemId,v.nroMdf,v.valor,v.status])];}
 else if(which==='clientes'){name='clientes';rows=[['Cliente','Viagens','Receita','Custo'],...aggregateClients(d.viagens,d.pedidos).map(v=>[v.cliente,v.viagens,v.receitaN===v.viagens?v.receita:'',v.custoN===v.viagens?v.custo:''])];}
 else if(which==='mdfes'){name='mdfe';rows=[['MDF-e','Data','Viagem','Placa','Situacao','Conciliacao'],...d.mdfes.map(v=>[v.numero,v.data,v.viagemId,v.placa,v.status,mdfeSituation(v,d)])];}
 else{return exportCsv('viagens');}
 const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8;'});
 const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download='costalog_'+name+'_'+state.from+'_'+state.to+(state.mode==='demo'?'_DEMO':'')+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);
}
function parseCsv(content){const text=content.replace(/^\uFEFF/,'').replace(/\r/g,'');const rows=text.split('\n').filter(x=>x.trim());if(rows.length<2)return [];const sep=rows[0].includes(';')?';':',';function parseLine(l){const out=[];let token='',quoted=false;for(let i=0;i<l.length;i++){const c=l[i];if(c==='"'&&l[i+1]==='"'&&quoted){token+='"';i++;}else if(c==='"'){quoted=!quoted;}else if(c===sep&&!quoted){out.push(token);token='';}else token+=c;}out.push(token);return out;}const headers=parseLine(rows.shift()).map(normalKey);return rows.map((l,i)=>{const fields=parseLine(l);const v={};headers.forEach((h,j)=>v[h]=fields[j]||'');return normalizeMdfe(v,i);}).filter(x=>x.numero!=='—');}
// Carrega mês a mês: evita respostas de 80 mil registros em uma única conexão HTTP.
function splitMonths(from,to){
 const result=[];let y=Number(from.slice(0,4)),m=Number(from.slice(5,7));
 while(y<Number(to.slice(0,4))||(y===Number(to.slice(0,4))&&m<=Number(to.slice(5,7)))){
  const first=[y,String(m).padStart(2,'0'),'01'].join('-');
  const last=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
  result.push({from:result.length?first:from,to:last<to?last:to});
  if(result.length>12)throw Error('Selecione no máximo 12 meses.');
  if(++m===13){m=1;y++;}
 }
 return result;
}
async function fetchDssWindow(range,token,syncTo,company=state.company){
 // O botão Atualizar deve ir à DSS mesmo que o MariaDB tenha uma cópia válida.
 const url=(state.apiUrl||window.location.origin).replace(/\/$/,'')+'/api/overview?from='+encodeURIComponent(range.from)+'&to='+encodeURIComponent(range.to)+'&refresh=recent&sync_to='+encodeURIComponent(syncTo)+'&company='+encodeURIComponent(company);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
 try{
  const response=await fetch(url,{headers:{Authorization:'Bearer '+token},credentials:'omit',signal:controller.signal});
  if(!response.ok){
   let message=response.status===502?'HTTP 502 no período '+range.from+' a '+range.to:'HTTP '+response.status;
   try{const b=await response.json();message=b.error||message;}catch{}
   if(response.status===401)throw Error('Sessão expirada. Entre novamente no portal.');
   throw Error(message);
  }
  const body=await response.json();
  if(!body?.data||!Array.isArray(body.data.viagens)||!Array.isArray(body.data.pedidos))throw Error('Resposta DSS incompleta em '+range.from+' a '+range.to);
  return body;
 }finally{clearTimeout(timer);}
}
async function loadData(){
 const epoch=identityEpoch;
 if(!state.token){state.connect=true;state.loading=false;state.error='Faça login para consultar a DSS.';render();return;}
 const requestFrom=state.from,requestTo=state.to,token=state.token,requestCompany=state.company;
 state.loading=true;state.loadingProgress='Preparando consulta...';state.connect=false;state.error='';render();
 try{
  const windows=splitMonths(requestFrom,requestTo),results=new Array(windows.length);
  // Máximo duas requisições simultâneas, evitando sobrecarregar o DSS/Render Free.
  let next=0;
  const worker=async()=>{
   while(next<windows.length&&epoch===identityEpoch){
    const index=next++;
    results[index]=await fetchDssWindow(windows[index],token,requestTo,requestCompany);
    if(epoch===identityEpoch){
     const loaded=results.filter(Boolean).length;
     state.loadingProgress='Consultando DSS: '+loaded+' de '+windows.length+' meses';
     const button=document.querySelector('[data-action="refresh"]');
     if(button)button.textContent=state.loadingProgress;
    }
   }
  };
  await Promise.all(Array.from({length:Math.min(2,windows.length)},worker));
  if(epoch!==identityEpoch||state.from!==requestFrom||state.to!==requestTo||state.company!==requestCompany)return;
  // Só substitui os dados depois que TODOS os meses forem recebidos com sucesso.
  const data={mode:'live',updatedAt:new Date().toISOString(),data:{
   viagens:results.flatMap(x=>x.data.viagens||[]),pedidos:results.flatMap(x=>x.data.pedidos||[]),
   ctes:results.flatMap(x=>x.data.ctes||[]),mdfes:results.flatMap(x=>x.data.mdfes||[]),
   rotas:results.flatMap(x=>x.data.rotas||[]),programacoes:results.flatMap(x=>x.data.programacoes||[]),
   ocorrencias:results.flatMap(x=>x.data.ocorrencias||[]),
   sources:results.reduce((acc,x)=>({...acc,...x.data.sources}),{})
  }};
  state.dataset=normalizePayload(data);state.loadedRange={from:requestFrom,to:requestTo};state.mode='live';state.error='';
  state.page=1;state.comparison=null;state.lastSync=data.updatedAt;state.prevDataset=null;
  companySnapshots.set(state.company,{dataset:state.dataset,range:state.loadedRange,lastSync:state.lastSync});
 }catch(err){
  if(epoch!==identityEpoch)return;
  const alreadyLive=state.mode==='live';
  if(!alreadyLive){state.mode='demo';state.dataset=demo;state.loadedRange=null;}
  state.error='API indisponível: '+(err.name==='AbortError'?'tempo limite na consulta mensal':err.message)+(alreadyLive?'. Dados anteriores mantidos.':'. Exibindo somente dados fictícios.');
 }finally{if(epoch===identityEpoch){state.loading=false;state.loadingProgress='';render();}}
}

function exportAdvanced(type,format){
 const raw=scoped(),full=state.reportMulti&&format==='xlsx';
 const d={...raw,
  viagens:searchRecords(raw.viagens,state.search),
  pedidos:searchRecords(raw.pedidos,state.search),
  ctes:searchRecords(raw.ctes,state.search),
  mdfes:searchRecords(raw.mdfes,state.search)};
 const allowed=reportTypesFor(state.role);if(!allowed.includes(type))throw Error('Acesso negado ao relatório.');
 const models=(full?allowed:[type]).map(t=>secureReport(extractRows(t,d),t,state.role));
 const suffix=(state.mode==='live'?'DSS':'DEMO')+'_'+state.from+'_'+state.to;
 if(format==='xlsx')downloadXlsx(models,{mode:state.mode,from:state.from,to:state.to,company:state.company},state.company.toUpperCase()+'_'+(full?'COMPLETO':type)+'_'+suffix+'.xlsx');
 if(format==='pdf')printReport(models,{mode:state.mode,from:state.from,to:state.to,company:state.company});
 if(format==='csv'){
  const r=models[0],lines=[r.columns.map(x=>x[1]),...r.rows.map(row=>r.columns.map(c=>row[c[0]]??''))];
  const quote=x=>{let t=String(x??'');if(/^[=+@-]/.test(t)&&!/^-(\d+)(\.\d+)?$/.test(t))t="'"+t;return '"'+t.replace(/"/g,'""')+'"';};
  const csv='\uFEFF'+lines.map(x=>x.map(quote).join(';')).join('\r\n');
  downloadFile(new TextEncoder().encode(csv),state.company.toUpperCase()+'_'+type+'_'+suffix+'.csv','text/csv;charset=utf-8');
 }
}
let refreshTimer=null;
let identityEpoch=0;
function activateRefresh(){if(refreshTimer){clearInterval(refreshTimer);refreshTimer=null;}state.autoRefresh=0;}

async function comparePeriods(){
 if(state.mode!=='live'||!state.apiUrl||!state.token){alert('Conecte a API DSS para comparar períodos reais.');return;}
 const start=Date.parse(state.from+'T12:00:00Z'),end=Date.parse(state.to+'T12:00:00Z');
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<start){alert('Escolha um intervalo de datas válido.');return;}
 const days=Math.round((end-start)/86400000)+1;
 const iso=x=>new Date(x).toISOString().slice(0,10),from=iso(start-days*86400000),to=iso(start-86400000);
 try{
  const response=await fetch(state.apiUrl.replace(/\/$/,'')+'/api/overview?from='+from+'&to='+to,{headers:{Authorization:'Bearer '+state.token}});
  if(!response.ok)throw Error('HTTP '+response.status);
  const previous=normalizePayload(await response.json());
 const matches=r=>(!state.customer||r.cliente===state.customer)&&(!state.vehicle||r.placa===state.vehicle);
 const pedidos=previous.pedidos.filter(p=>matches(p)&&(!state.serviceType||p.tipoServico===state.serviceType));
 const viagens=previous.viagens.filter(v=>matches(v)&&(!state.serviceType||pedidos.some(p=>p.viagemId===v.id)));
 state.prevDataset={...previous,allViagens:previous.viagens,viagens,pedidos,ctes:previous.ctes.filter(matches),mdfes:previous.mdfes};render();
 }catch(err){alert('Não foi possível obter o período anterior: '+err.message);}
}
function activateChartPoint(hit){
 if(!hit || typeof hit.getAttribute!=='function')return;
 const wasActive=hit.getAttribute('data-active')==='true';
 // Não altera os dados nem re-renderiza todo o portal ao tocar num ponto.
 if(typeof root.querySelectorAll==='function'){
  root.querySelectorAll('[data-chart-point][data-active="true"]').forEach(node=>node.removeAttribute('data-active'));
 }
 if(!wasActive){
  hit.setAttribute('data-active','true');
  if(hit.dataset?.chartPoint==='legend'){
   const layout=hit.closest('.v-donut-layout');
   const index=hit.dataset.chartIndex;
   if(layout&&index!==undefined){
    const slices=layout.querySelectorAll('[data-chart-point="donut"]');
    for(const slice of slices)if(slice.dataset.chartIndex===index)slice.setAttribute('data-active','true');
   }
  }
 }
}
root.addEventListener('click',e=>{
 const point=e.target.closest('[data-chart-point]');
 if(point){activateChartPoint(point);return;}
 const searchHit=e.target.closest('[data-search-result]');
 if(searchHit){
  const raw=searchHit.dataset.searchResult||'',pos=raw.indexOf(':');
  if(pos<0)return;
  const group=raw.slice(0,pos),id=raw.slice(pos+1);
  state.globalQuery='';
  if(group==='clientes'&&state.permissions.financeiro){state.view='clientes';state.clientSelected=id;render();return;}
  const view=group==='viagens'?'viagens':group==='pedidos'?'ctes':'mdfes';
  if(!permittedView(state.role,view))return;
  state.view=view;state.selected=view+':'+id;render();return;
 }
 const openClient=e.target.closest('[data-client-open]');
 if(openClient&&state.permissions.financeiro){state.clientSelected=openClient.dataset.clientOpen;render();return;}
 const profileDetail=e.target.closest('[data-profile-detail]');
 if(profileDetail){state.selected=profileDetail.dataset.profileDetail;render();return;}
 const openRoute=e.target.closest('[data-route-open]');
 if(openRoute){state.routeSelected=openRoute.dataset.routeOpen;render();return;}
 const openDriver=e.target.closest('[data-driver-open]');
 if(openDriver){state.driverSelected=openDriver.dataset.driverOpen;render();return;}
 const alertDetail=e.target.closest('[data-alert-detail]');
 if(alertDetail){const ref=alertDetail.dataset.alertDetail,kind=ref.split(':')[0];
  if(!permittedView(state.role,kind))return;
  state.view=kind;state.selected=ref;render();return;
 }
 const compareInterval=e.target.closest('[data-compare-interval]');
 if(compareInterval){state.compareInterval=compareInterval.dataset.compareInterval;state.comparison=null;state.comparisonError='';comparisonSeq++;render();return;}
 const metricMove=e.target.closest('[data-metric-move]');
 if(metricMove){const [id,direction]=metricMove.dataset.metricMove.split(':');state.metricLayout=reorderMetric(state.metricLayout,id,Number(direction),{financial:!!state.permissions.financeiro});saveMetricPreferences();render();return;}
 const insAction=e.target.closest('[data-ins-action]');
 if(insAction){
  const action=insAction.dataset.insAction;
  if(action==='clear-search')state.globalQuery='';
  if(action==='close-client')state.clientSelected='';
  if(action==='clear-route')state.routeSelected='';
  if(action==='clear-driver')state.driverSelected='';
  if(action==='customize')state.showMetricOptions=!state.showMetricOptions;
  if(action==='reset-metrics'){state.metricLayout=null;try{localStorage.removeItem(metricPrefsKey());}catch{}}
  if(action==='load-comparison'){fetchPeriodComparison();return;}
  render();return;
 }
 const nav=e.target.closest('[data-nav]');if(nav){if(state.user?.mustChangePassword)return;if(!permittedView(state.role,nav.dataset.nav))return;state.view=nav.dataset.nav;state.clientSelected='';state.routeSelected='';state.driverSelected='';state.globalQuery='';state.search='';state.filter='todos';state.sortKey='';state.page=1;state.menu=false;state.selected=null;render();if(state.view==='administracao'&&state.permissions.admin)loadAdminUsers();return;}
 const sorter=e.target.closest('[data-sort-metric]');
 if(sorter){
  const [kind,key]=(sorter.dataset.sortMetric||'').split(':');
  const allowed={rotas:['name','count','km','kmPerTrip','vehicles','drivers'],motoristas:['name','trips','orders','ctes','km','kmPerTrip','routes'],clientes:['name','tripCount','orderCount','cteCount','fretesValor','lastDate']};
  if(allowed[kind]?.includes(key)){
   state.tableSort||={};
   const prev=state.tableSort[kind];
   state.tableSort[kind]={key,direction:prev?.key===key&&prev.direction==='desc'?'asc':'desc'};
   render();
  }return;
 }
 const graphInterval=e.target.closest('[data-chart-interval]');if(graphInterval){state.chartInterval=graphInterval.dataset.chartInterval;render();return;}
 const detail=e.target.closest('[data-detail]');if(detail){state.selected=detail.dataset.detail;render();return;}
 const sort=e.target.closest('[data-sort]');if(sort){const k=sort.dataset.sort;state.sortDir=state.sortKey===k&&state.sortDir==='asc'?'desc':'asc';state.sortKey=k;state.page=1;render();return;}
 const report=e.target.closest('[data-report-select]');if(report){state.reportSelected=report.dataset.reportSelect;state.reportMulti=false;render();return;}
 const priority=e.target.closest('[data-alert-priority]');if(priority){state.alertPriority=priority.dataset.alertPriority;state.page=1;render();return;}
 const exp=e.target.closest('[data-export]');if(exp){try{exportAdvanced(exp.dataset.export,'csv');}catch(err){alert(err.message);}return;}
 const targetRole=e.target.closest('[data-admin-reset]');if(targetRole&&state.permissions.admin){state.adminResetUser=targetRole.dataset.adminReset;render();return;}
 const targetToggle=e.target.closest('[data-admin-toggle]');if(targetToggle&&state.permissions.admin){
  const username=targetToggle.dataset.adminToggle,disabled=targetToggle.dataset.disabled==='1';
  if(confirm((disabled?'Reativar':'Bloquear')+' o funcionário '+username+'?'))updatePortalUser(username,disabled?'enable':'disable');
  return;
 }
 const act=e.target.closest('[data-action]');if(!act)return;
 const action=act.dataset.action;
 if(action==='close-overlay'&&e.target!==act)return;
 if(action==='switch-company'){switchCompany();return;}
 if(action==='close'||action==='close-overlay'){state.selected=null;state.connect=false;render();}
 if(action==='menu'){state.menu=!state.menu;render();}
 if(action==='refresh'&&!PUBLIC_DEMO)loadData();
 if(action==='reload-users')loadAdminUsers();
 if(action==='close-admin-reset'){state.adminResetUser='';render();}
 if(action==='compare-periods'&&!PUBLIC_DEMO)comparePeriods();
 if(action==='api-diagnostics'&&!PUBLIC_DEMO){
  if(!state.permissions.admin){alert('Acesso restrito a administradores.');return;}
  if(!state.apiUrl||!state.token){alert('Conecte o backend e informe o token do portal antes de consultar os diagnósticos.');return;}
  fetch(state.apiUrl.replace(/\/$/,'')+'/api/status',{headers:{Authorization:'Bearer '+state.token}})
   .then(async res=>{if(!res.ok)throw Error('HTTP '+res.status);return res.json();})
   .then(value=>{state.apiDiagnostics=value;render();})
   .catch(err=>alert('Não foi possível consultar os diagnósticos: '+err.message));
 }
 if(['xlsx-export','csv-advanced','pdf-report'].includes(action)){try{exportAdvanced(state.reportSelected||'viagens',action==='xlsx-export'?'xlsx':action==='csv-advanced'?'csv':'pdf');}catch(err){alert('Erro ao gerar relatório: '+err.message);}}
 if(action==='clear-filters'){state.customer='';state.vehicle='';state.serviceType='';state.search='';state.sortKey='';state.page=1;render();}
 if(action==='save-filter'){const name=prompt('Nome para este conjunto de filtros:');if(name&&name.trim()){state.presets[name.trim().slice(0,45)]={from:state.from,to:state.to,customer:state.customer,vehicle:state.vehicle,serviceType:state.serviceType,search:state.search};localStorage.setItem('costalog_filter_presets_'+state.company,JSON.stringify(state.presets));render();}}
 if(action==='delete-filter'){const sel=document.getElementById('savedPreset'),name=sel?.value;if(!name){alert('Selecione primeiro um filtro salvo.');return;}if(confirm('Excluir o filtro salvo '+name+'?')){delete state.presets[name];localStorage.setItem('costalog_filter_presets_'+state.company,JSON.stringify(state.presets));render();}}
 if(action==='clear-settings'){if(confirm('Limpar filtros salvos e preferências de colunas?')){localStorage.removeItem('costalog_filter_presets_'+state.company);localStorage.removeItem('costalog_visible_columns');state.presets={};state.hiddenColumns={};state.autoRefresh=0;activateRefresh();render();}}
 if(action==='connect'){state.connect=true;state.selected=null;render();}
 if(action==='go-viagens'){state.view='viagens';state.page=1;render();}
 if(action==='csv'){try{exportAdvanced(state.view==='ctes'?'pedidos':state.view==='mdfes'?'mdfes':state.permissions.financeiro&&state.view==='clientes'?'clientes':'viagens','csv');}catch(err){alert(err.message);}}
 if(action==='print'){try{const type=state.view==='ctes'?'pedidos':state.view==='mdfes'?'mdfes':'viagens';exportAdvanced(type,'pdf');}catch(err){alert(err.message);}}
 if(action==='prev'){state.page--;render();}
 if(action==='next'){state.page++;render();}
 if(action==='demo'){clearSession();state.connect=false;render();}
 if(action==='logout'){clearSession();render();}
 if(action==='test-connect'){portalLogin();}
});
root.addEventListener('submit',e=>{
 if(e.target?.id==='loginForm'){e.preventDefault();portalLogin();}
 if(e.target?.id==='createPortalUser'){e.preventDefault();createPortalUser();}
 if(e.target?.id==='forcePasswordChange'){e.preventDefault();changePortalPassword();}
 if(e.target?.id==='resetPortalUserPassword'){
  e.preventDefault();const password=document.getElementById('adminResetPassword')?.value||'';
  if(state.adminResetUser&&password.length>=12)updatePortalUser(state.adminResetUser,'reset-password',{password});
 }
});
root.addEventListener('change',e=>{
 if(e.target.dataset?.adminRole && state.permissions.admin){
  const username=e.target.dataset.adminRole,role=e.target.value;
  const previous=state.adminUsers.find(u=>u.username===username)?.role;
  if(role!==previous&&confirm('Alterar a permissão de '+username+' para '+role+'?'))updatePortalUser(username,'role',{role});
  else render();
  return;
 }
 if(e.target.id==='from'){state.from=e.target.value>localToday()?localToday():e.target.value;if(state.from>state.to)state.to=state.from;state.page=1;render();}
 if(e.target.id==='to'){state.to=e.target.value>localToday()?localToday():e.target.value;if(state.to<state.from)state.from=state.to;state.page=1;render();}
 if(e.target.id==='compareCustom'){state.compareCustom=e.target.checked;state.comparison=null;state.comparisonError='';comparisonSeq++;render();return;}
 if(['compareCurrentFrom','compareCurrentTo','comparePreviousFrom','comparePreviousTo'].includes(e.target.id)){state[e.target.id]=e.target.value;state.compareCustom=true;state.comparison=null;state.comparisonError='';comparisonSeq++;render();return;}
 if(e.target.id==='compareAnchorInput'){
  state.compareAnchor=e.target.value;state.comparison=null;state.comparisonError='';comparisonSeq++;render();return;
 }
 if(e.target.id==='alertPriorityFilter'){state.alertPriority=e.target.value;state.page=1;render();return;}
 if(e.target.id==='alertKindFilter'){state.alertKind=e.target.value;state.page=1;render();return;}
 if(e.target.dataset?.metricToggle){
  const id=e.target.dataset.metricToggle;
  const current=normalizedLayout(state.metricLayout,{financial:!!state.permissions.financeiro});
  state.metricLayout=e.target.checked?[...new Set([...current,id])]:current.filter(x=>x!==id);
  saveMetricPreferences();render();return;
 }
 if(e.target.id==='statusFilter'){state.filter=e.target.value;state.page=1;render();}
 if(e.target.id==='filterClient'){state.customer=e.target.value;state.page=1;render();}
 if(e.target.id==='filterPlate'){state.vehicle=e.target.value;state.page=1;render();}
 if(e.target.id==='filterType'){state.serviceType=e.target.value;state.page=1;render();}
 if(e.target.id==='sortDir'){state.sortDir=e.target.value;state.page=1;render();}
 if(e.target.id==='autoRefresh'){state.autoRefresh=0;activateRefresh();render();}
 if(e.target.id==='reportSelected'){state.reportSelected=e.target.value;render();}
 if(e.target.id==='reportMulti'){state.reportMulti=e.target.value==='all';render();}
 if(e.target.id==='savedPreset'&&e.target.value){const preset=state.presets[e.target.value];if(!preset)return;Object.assign(state,preset,{page:1,prevDataset:null});render();}
 if(e.target.id==='quickPeriod'&&e.target.value){
  const now=new Date(),today=new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()));
  const iso=x=>x.toISOString().slice(0,10);let from,to;
  if(e.target.value==='this-month'){from=new Date(Date.UTC(now.getFullYear(),now.getMonth(),1));to=today;}
  if(e.target.value==='last-month'){from=new Date(Date.UTC(now.getFullYear(),now.getMonth()-1,1));to=new Date(Date.UTC(now.getFullYear(),now.getMonth(),0));}
  if(e.target.value==='this-year'){from=new Date(Date.UTC(now.getFullYear(),0,1));to=today;}
  if(e.target.value==='last-90'){from=new Date(today.getTime()-89*86400000);to=today;}
  state.from=iso(from);state.to=iso(to);state.page=1;state.prevDataset=null;
  render();
 }
 if(e.target.dataset.columnToggle){
  const [view,key]=e.target.dataset.columnToggle.split(':'),old=state.hiddenColumns[view]||[];
  state.hiddenColumns[view]=e.target.checked?old.filter(x=>x!==key):[...new Set([...old,key])];
  localStorage.setItem('costalog_visible_columns',JSON.stringify(state.hiddenColumns));render();
 }
 if(e.target.id==='csvMDFE'){
  const file=e.target.files&&e.target.files[0];if(!file)return;
  file.text().then(text=>{const records=parseCsv(text);if(!records.length){alert('Nenhum registro válido no CSV. Confira o cabeçalho.');return;}const imported=scopeCompanyData({mdfes:records.map(row=>({...row,empresa:row.empresa||state.company}))},state.company).mdfes;state.dataset={...state.dataset,mdfes:imported,sources:{...state.dataset.sources,mdfes:true}};state.importCount=imported.length;render();alert(imported.length+' MDF-e carregados para '+COMPANIES[state.company].label+'.');}).catch(()=>alert('Não foi possível ler o arquivo.'));
 }
});
root.addEventListener('input',e=>{
 if(e.target.id==='globalSearchInput'){
  const cursor=e.target.selectionStart;
  state.globalQuery=e.target.value;render();
  const input=document.getElementById('globalSearchInput');
  if(input){input.focus();if(typeof input.setSelectionRange==='function'&&typeof cursor==='number')input.setSelectionRange(cursor,cursor);}
  return;
 }
 if(e.target.id==='searchInput'){
  const start=e.target.selectionStart;state.search=e.target.value;state.page=1;render();
  const input=document.getElementById('searchInput');if(input){input.focus();input.setSelectionRange(start,start);}
 }
});
root.addEventListener('keydown',e=>{
 const point=e.target?.closest?.('[data-chart-point]');
 if(point&&(e.key==='Enter'||e.key===' ')){e.preventDefault();activateChartPoint(point);}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&(state.selected||state.connect)){state.selected=null;state.connect=false;render();}});
loadMetricPreferences();
render();
// Nenhuma consulta automática ao abrir o portal.
