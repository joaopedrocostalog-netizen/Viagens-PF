import {createPendingClient} from './pending-client.mjs';
import {createPortalClient} from './portal-client.mjs';
import {filterRvStage,renderRelatedRvStages} from './rv-stage-filter.mjs';
import {renderDateControl,editDateControl,resetDateControls,hasDateErrors,openDateCalendar,parseEditableDate} from './date-controls.mjs';
import {rvStatusCounts,renderRvStatusStages} from './rv-status.mjs';
import {mobileTables} from './mobile-tables.mjs';
import {parsePortalLink,portalLink} from './portal-links.mjs';
import {renderDayProgramming} from './programming.mjs';
import {renderTripChecklist} from './rv-checklist.mjs';
import {memoView,clearViewCache} from './view-cache.mjs';
import {alertKey,taskFor,updateTask,taskSummary,TASK_STATUSES,assignmentForOwner} from './workflow.mjs';
import {renderTaskDrawer} from './workflow-ui.mjs';
import {createTripTimeline} from './trip-timeline.mjs';
import {renderDataQuality} from './data-quality.mjs';
import {reportTemplate,applyReportTemplate} from './report-templates.mjs';
import {filterOperationalData,searchOperationalData,filterLinkedRows} from './filtering.mjs';
import {COMPANIES,COSTALOG_ENTITIES,companyIdentity,validCompany,scopeCompanyData} from './companies.mjs';
import {renderGlobalSearch,renderCustomDashboard,renderCustomerProfiles,renderDriverRouteDetails,renderAlertsHub,renderComparison,renderMyTasksSummary} from './intelligence-ui.mjs';
import {normalizedLayout,reorderMetric,comparisonWindows,subsetPeriod} from './intelligence.mjs';
import {renderHero,renderSummary,renderCharts,renderTripsHeader,renderReportsHeader} from './visual-dashboard.mjs';
import {resolvePortalApi} from './site-config.mjs';
import {renderUsersManagement,renderForcePasswordChange} from './admin-users.mjs';
import {permittedView,reportTypesFor,secureReport,safeView,operationalPermissions,operationalDataset,buildOperationalReport} from './access-ui.mjs';
import {buildInsights,extractRows,REPORT_TYPES,searchRecords} from './operational.mjs';
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
let sharedIntent=parsePortalLink(window.location);
let sharedLoginPending=sharedIntent.hasLink;
const state = {
 preferenceStorage:'',workflowStorage:null,serverMode:false,remoteSnapshot:'',remoteError:'',queryNotice:'',preferencesError:'',rvStage:'',
 company:initialCompany,technicalOpen:false,alertGrouping:'lista',alertGroup:'',dayDate:localToday(),tripFocus:'',alertScope:'todos',alertDue:'todos',legalEntity:'',drilldown:'',detailPage:1,timelinePage:1,
 visibleAlerts:[],tasks:{},taskIndexLoaded:false,taskIndexLoading:false,taskIndexError:'',taskSelected:null,taskDetail:null,taskLoading:false,taskSaving:false,taskError:'',taskUnavailable:false,alertStatus:'todos',alertOwner:'',syncMetadata:[],
 reportTemplates:{},templateSelected:'',reportFormat:'xlsx',reportColumnOrder:{},
  compareCustom:true,compareCurrentFrom:String(year)+'-10-01',compareCurrentTo:localToday(),comparePreviousFrom:String(year)+'-09-01',comparePreviousTo:String(year)+'-09-30',view:'painel', chartInterval:'mensal', compareInterval:'mensal',compareAnchor:new Date().toISOString().slice(0,10), from:String(year)+'-01-01',to:localToday(),search:'',filter:'todos',page:1,
 dataset:demo, mode:'demo',error:'',loading:false,selected:null,connect:false,menu:false,
 apiUrl:portalSettings.apiUrl,token:'',importCount:0,
 globalQuery:'',clientSelected:'',routeSelected:'',driverSelected:'',alertKind:'todos',
 metricLayout:null,showMetricOptions:false,comparison:null,comparisonLoading:false,comparisonError:'',
 customer:'',vehicle:'',serviceType:'',status:'',filtersOpen:false,sortKey:'',sortDir:'desc',alertPriority:'todos',
 hiddenColumns:readPrefs('costalog_visible_columns',{}),presets:readPrefs('costalog_filter_presets_'+initialCompany,{}),
 demoOnly:PUBLIC_DEMO,reportSelected:'viagens',reportMulti:false,autoRefresh:0,lastSync:null,prevDataset:null,lateDays:2,apiDiagnostics:null,adminUsers:[],adminUsersLoading:false,adminUsersError:'',adminResetUser:'',role:'operacional',user:null,permissions:{operacional:true,financeiro:false,admin:false}
};
const remoteClient=createPortalClient(state,render);
const pendingClient=createPendingClient(state,render,{invalidate:()=>remoteClient.invalidate(),exportModels:deliverExport});
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
function normalizePayload(raw,company=state.company){return operationalDataset(normalizeOverview({data:scopeCompanyData(raw?.data||raw,company)}));}
function inRange(v){return !v||((!state.from||v>=state.from)&&(!state.to||v<=state.to));}
let companyPeriodCache=null,scopedCache=null;
function filterOptionsData(){
 const key=[state.company,state.legalEntity,state.from,state.to].join('|');
 if(companyPeriodCache?.dataset===state.dataset&&companyPeriodCache.key===key)return companyPeriodCache.value;
 const value=filterOperationalData(scopeCompanyData(state.dataset,state.company,state.legalEntity),{from:state.from,to:state.to});
 companyPeriodCache={dataset:state.dataset,key,value};return value;
}
function scoped(){
 const source=filterOptionsData(),key=[state.customer,state.vehicle,state.serviceType,state.status,state.status?state.view:'',state.status?state.reportSelected:'',state.drilldown,state.tripFocus].join('|');
 if(scopedCache?.dataset===source&&scopedCache.key===key)return scopedCache.value;
 const value=filterOperationalData(source,state);
 scopedCache={dataset:source,key,value};return value;
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
const navItems=[['painel','home','Painel'],['viagens','truck','Viagens / RV'],['ctes','doc','Pedidos de frete'],['relatorios','doc','Relatórios'],['programacao','truck','Programação do dia'],['comparativos','chart','Comparativos'],['entregas','doc','Entregas'],['pendencias','shield','Pendências'],['rotas','chart','Rotas'],['veiculos','truck','Frota'],['motoristas','home','Motoristas'],['mdfes','shield','MDF-e'],['ocorrencias','shield','Ocorrências']];
function button(action,label,extra){return '<button type="button" class="btn '+(extra||'')+'" data-action="'+action+'">'+label+'</button>';}
let textRenderTimer=null;
function render(){
 pendingClient.observe();remoteClient.observe();
 const focusedDate=document.activeElement?.dataset?.editDate?{id:document.activeElement.id,cursor:document.activeElement.selectionStart}:null;
 if(textRenderTimer){clearTimeout(textRenderTimer);textRenderTimer=null;}
 if(!remoteClient.active()&&state.pendingRecord&&state.mode==='live'&&state.user&&!state.user.mustChangePassword&&state.loadedRange){const [kind,id]=state.pendingRecord.split(':'),rows=kind==='viagens'?filterOptionsData().viagens:kind==='ctes'?filterOptionsData().pedidos:filterOptionsData().mdfes;if(rows.some(row=>row.id===id)){state.selected=state.pendingRecord;state.pendingRecord='';state.linkMessage='';}else state.linkMessage='O registro do link não foi localizado no período consultado.';}
 const brand=COMPANIES[state.company],other=state.company==='costalog'?'ideallog':'costalog';
 if(document.title!==undefined)document.title=brand.name+' · Viagens e pedidos de frete';
 state.view=safeView(state.role,state.view);
 const remote=remoteClient.active(),remoteResponse=remote?remoteClient.response():null;
 const base=scoped(),d=state.view==='painel'?searchOperationalData(base,state.search):base,stats=null;
 const allowed=navItems.filter(x=>x[0]!=='integracoes'&&permittedView(state.role,x[0]));
 const PRIMARY=['painel','viagens','ctes','relatorios'];
 const secondary=allowed.filter(x=>!PRIMARY.includes(x[0]));
 const tab=(x,cl)=>'<button type="button" class="'+cl+' '+(state.view===x[0]?'active':'')+'" data-nav="'+x[0]+'" aria-current="'+(state.view===x[0]?'page':'false')+'">'+icon(x[1])+'<span>'+esc(x[2])+'</span></button>';
 const primary=allowed.filter(x=>PRIMARY.includes(x[0])).map(x=>tab(x,'v-nav-item')).join('');
 const sub=secondary.map(x=>tab(x,'v-sub-item')).join('');
 const message=state.mode==='demo'?'<div class="demo-label" role="status">Demonstração · registros fictícios</div>':state.error?'<p class="ins-inline-error" role="alert">Não foi possível atualizar. Os dados anteriores foram mantidos. Tente atualizar novamente.</p>':'';
 const needsUpdate=!state.alertArchive&&state.mode==='live'&&!state.loading&&(!state.loadedRange||state.from<state.loadedRange.from||state.to>state.loadedRange.to);
 const updateNotice=needsUpdate?'<div class="info-strip">O período selecionado precisa ser consultado. Clique em <strong>Atualizar dados da DSS</strong> para carregar os registros.</div>':'';
 state.listFilters=state.view!=='administracao'?'<details id="advancedFilters" class="v-extra-filters" '+(state.filtersOpen?'open':'')+'><summary>Filtros avançados <span>'+([state.customer,state.vehicle,state.serviceType,state.status,state.filter!=='todos'?state.filter:''].filter(Boolean).length||'')+'</span></summary>'+(state.filtersOpen?memoView('advanced-filters',[filterOptionsData(),state.customer,state.vehicle,state.serviceType,state.sortDir,state.view,state.reportSelected,state.presets,state.status,state.filter],()=>operationalFilters(filterOptionsData(),state)):'')+'</details>':'';
 const tools=['viagens','ctes','mdfes'].includes(state.view)?
  '<div class="v-heading-tools">'+button('csv',icon('download')+' CSV','btn-sm')+button('print','PDF / Imprimir','btn-sm btn-red')+'</div>':'';
 const dateFilters=state.view==='administracao'?'':renderFilters();
 const globalSearch=state.view==='administracao'?'':remote?(remoteResponse?.search||''):renderGlobalSearch(state,base);
 root.innerHTML='<div class="layout v-app"><main class="main v-main">'+
 '<header class="topbar v-topbar"><div class="v-topbrand"><img class="v-brand-logo '+(state.company==='ideallog'?'v-ideal-logo':'')+'" src="./'+brand.logo+'" alt="Logotipo '+brand.name+'"><div><b>'+brand.name+'</b><small>'+brand.description+'</small></div><i></i><strong>GESTÃO DE VIAGENS & FRETES</strong></div>'+
 '<div class="topbar-right v-accountbar">'+button('switch-company','Trocar para '+COMPANIES[other].label,'btn-sm btn-company-switch')+'<span class="v-environment '+(state.mode==='live'?'connected':'')+'">'+(state.mode==='live'?'● DSS':'● DEMO')+'</span>'+
 pendingClient.bell()+(state.user?'<span class="v-username">'+esc(state.user.displayName||state.user.username)+' · '+esc(state.role)+'</span>'+button('logout','Sair','btn-sm btn-ghost'):button('connect','Entrar','btn-sm btn-ghost'))+'</div></header>'+
 '<div class="v-menu-row"><nav class="v-main-nav" aria-label="Seções principais">'+primary+'</nav><div class="v-right-hint">'+(state.mode==='live'?'DADOS DO DSS':'DADOS DE TESTE')+'</div></div>'+
 (sub?'<nav class="v-sub-nav" aria-label="Outras áreas">'+sub+'</nav>':'')+
 '<div class="content v-content">'+(remote?(remoteResponse?.hero||renderHero(state.view,d,{from:state.from,to:state.to,mode:state.mode,company:state.company}).replace(/<small>[^<]* RVs[^<]*<\/small>/,'<small>Consulta no servidor</small>')):renderHero(state.view,d,{from:state.from,to:state.to,mode:state.mode,financeiro:state.permissions.financeiro,company:state.company}))+
 '<div class="v-tools-row">'+dateFilters+tools+button('share-query','Copiar link','btn-sm')+'</div>'+globalSearch+(state.linkMessage?'<p class="help" role="status">'+esc(state.linkMessage)+'</p>':'')+updateNotice+message+
 (remote?'<div id="syncProgress">'+remoteClient.progress()+'</div>':state.loading?'<div class="info-strip">Consultando registros DSS...</div>':'')+(state.queryNotice?'<p class="help" role="status">'+esc(state.queryNotice)+'</p>':'')+(state.preferencesError?'<p class="ins-inline-error" role="status">'+esc(state.preferencesError)+' <button class="btn btn-sm" data-action="reload-preferences">Recarregar preferências</button></p>':'')+
 renderDrilldownNotice()+mobileTables(remote?(state.alertArchive&&(state.view==='pendencias'||state.view==='relatorios'&&state.reportSelected==='pendencias')?pendingClient.contents():remoteClient.contents()):renderView(d,stats))+(remote?(remoteResponse?.technical||''):renderDataQuality(state,base))+
 '<footer class="v-footer">'+brand.name+' • Portal de inteligência operacional • '+(PUBLIC_DEMO?'Contas de demonstração somente neste navegador.':'Acesso baseado em permissões, dados DSS protegidos no servidor.')+'</footer></div></main></div>'+
 (state.selected?(remote?remoteClient.drawer():renderDrawer(filterOptionsData())):'')+renderTaskDrawer(state)+pendingClient.dialogs()+(state.connect?renderConnect():'')+
 (state.user?.mustChangePassword?renderForcePasswordChange():'')+
 (state.adminResetUser&&state.permissions.admin?renderAdminPasswordReset(state.adminResetUser):'');
 pendingClient.afterRender();
 if(focusedDate){const field=document.getElementById(focusedDate.id);field?.focus?.();if(typeof focusedDate.cursor==='number')field?.setSelectionRange?.(focusedDate.cursor,focusedDate.cursor);}
 if(!remote&&(state.view==='pendencias'||state.view==='painel'&&state.user?.username&&!state.user.mustChangePassword||state.view==='relatorios'&&state.reportSelected==='pendencias')&&!state.user?.mustChangePassword&&!state.taskIndexLoaded&&!state.taskIndexLoading&&!state.taskIndexError)loadTaskIndex();
}
function renderFilters(){
 const validDates=/^\d{4}-\d{2}-\d{2}$/.test(state.from)&&/^\d{4}-\d{2}-\d{2}$/.test(state.to)&&state.from<=state.to&&!hasDateErrors(['from','to']);
 return '<div class="filters">'+(state.company==='costalog'?'<div class="filter"><label for="legalEntityFilter">Empresa Costalog</label><select id="legalEntityFilter" class="control"><option value="">Todas: AC · CRC · Comex</option>'+Object.entries(COSTALOG_ENTITIES).map(([key,label])=>'<option value="'+key+'" '+(state.legalEntity===key?'selected':'')+'>'+label+'</option>').join('')+'</select></div>':'')+'<div class="filter"><label for="from">De</label>'+renderDateControl('from',state.from,{label:'De',max:localToday()})+'</div><div class="filter"><label for="to">Até</label>'+renderDateControl('to',state.to,{label:'Até',max:localToday()})+'</div>'+
 '<div class="filter grow"><label for="searchInput">Pesquisar no portal</label><div class="search-field"><input id="searchInput" class="control full" type="search" autocomplete="off" placeholder="'+attr('RV, pedido, CT-e, MDF-e, placa, cliente ou motorista')+'" value="'+attr(state.search)+'">'+(state.search?button('clear-table-search','Limpar busca','btn-sm'):'')+'</div></div>'+
 (state.mode==='live'&&!PUBLIC_DEMO?'<div class="filter"><label>Consulta DSS</label><button type="button" class="btn btn-red" data-action="refresh" '+(state.loading||!validDates?'disabled':'')+'>'+(state.loading?(state.loadingProgress||'Consultando DSS...'):'Atualizar dados da DSS')+'</button></div>':'')+
 '</div>';
}
function kpi(label,value,sub,cl){return '<article class="kpi"><div class="kpi-label">'+label+'</div><div class="kpi-value '+(cl||'')+'">'+value+'</div><div class="kpi-sub">'+sub+'</div></article>';}
function renderOcorrencias(d){
 const rows=memoView('incident-rows',[d,state.search],()=>searchRecords(d.ocorrencias||[],state.search));
 const cols=[{key:'data',label:'Data',format:'date'},{key:'id',label:'ID'},{key:'placa',label:'Placa'},{key:'tipo',label:'Tipo'},{key:'descricao',label:'Descrição'},{key:'relato',label:'Relato'},{key:'status',label:'Situação'},{key:'providencia',label:'Providência'}];
 return (d.sources?.ocorrencias===false?'<p class="help" role="status">As ocorrências não estão disponíveis nesta consulta. Uma lista vazia não confirma ausência de ocorrências.</p>':'')+renderGrid('Ocorrências internas DSS',rows,cols,state,'ocorrencias','Registros identificados para a empresa selecionada, com 25 itens por página.');
}
function renderView(d,s){
 if(!['viagens','painel','comparativos'].includes(state.view)){const staged=filterRvStage(d,state.rvStage);return renderRelatedRvStages(d,state.rvStage)+renderLocalView(staged,s);}
 return renderLocalView(d,s);
}
function renderLocalView(d,s){
 if(state.view==='painel')return (state.listFilters||'')+renderCustomDashboard(d,state)+renderMyTasksSummary(d,state)+renderSummary(d,{financeiro:state.permissions.financeiro,mode:state.mode,from:state.from,to:state.to,showCards:false});
 if(state.view==='programacao')return renderDayProgramming(d,state);
 if(state.view==='comparativos')return renderComparison(d,state);
 if(state.view==='graficos')return renderCharts(d,{financeiro:state.permissions.financeiro,interval:state.chartInterval});
 if(state.view==='viagens'){const source=memoView('rv-stages-source',[filterOptionsData(),state.customer,state.vehicle,state.serviceType,state.search,state.filter,state.drilldown,state.tripFocus],()=>filterLinkedRows(searchRecords(filterOperationalData(filterOptionsData(),{...state,status:''}).viagens,state.search),'viagens',d,state.filter));return renderTripsHeader(d)+renderRvStatusStages(memoView('rv-stages-counts',[source],()=>rvStatusCounts(source)),state.status)+renderViagens(d,s);}
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
function searchRows(list){return searchRecords(list,state.search);}
function paginate(list){const pageCount=Math.max(1,Math.ceil(list.length/25));state.page=Math.min(state.page,pageCount);const start=(state.page-1)*25;return {slice:list.slice(start,start+25),total:list.length,pages:pageCount};}
function paging(p){return '<div class="pagination"><span>'+number(p.total)+' registros · Página '+state.page+' de '+p.pages+'</span><div class="pagination-actions"><button class="btn btn-sm" data-action="prev" '+(state.page<=1?'disabled':'')+'>Anterior</button><button class="btn btn-sm" data-action="next" '+(state.page>=p.pages?'disabled':'')+'>Próxima</button></div></div>';}
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
function mdfeSituation(m,d){const tripIds=memoView('mdfe-trip-ids',[d.allViagens],()=>new Set(d.allViagens.map(v=>v.id)));if(m.ambiguous)return 'Vínculo ambíguo';if(!m.viagemId)return 'Sem vínculo informado';if(!tripIds.has(m.viagemId))return 'Viagem não encontrada';return 'Vinculado';}
function renderMdfes(d){
 const rows=memoView('mdfe-rows',[d,state.search,state.filter],()=>filterLinkedRows(searchRows(d.mdfes),'mdfes',d,state.filter));
 return '<div class="table-tools"><label class="btn btn-sm" for="csvMDFE">Importar CSV de MDF-e</label><input id="csvMDFE" type="file" accept=".csv,text/csv" hidden></div>'+renderGrid('Referências de MDF-e',rows,[{key:'numero',label:'MDF-e',detail:'mdfes'},{key:'data',label:'Emissão',format:'date'},{key:'viagemId',label:'RV vinculada'},{key:'placa',label:'Placa'},{key:'status',label:'Situação declarada'}],state,'mdfes');
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
   state.view='painel';state.connect=false;state.error='';state.mode='demo';state.dataset=demo;loadMetricPreferences();render();

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
  state.workflowStorage=data.workflowStorage||null;state.serverMode=data.portalVersion===2;state.token=data.token;state.user=data.user;state.role=data.user.role;state.permissions=operationalPermissions(data.permissions);
  state.view='painel';state.connect=false;state.error='';state.dataset={viagens:[],pedidos:[],ctes:[],mdfes:[],sources:{}};
  state.mode='live';if(!remoteClient.active())loadMetricPreferences();if(sharedLoginPending){Object.assign(state,sharedIntent.state);sharedLoginPending=false;state.linkMessage='Consulta compartilhada. Atualize os dados para ver os registros autorizados.';}render();
  if(state.user.mustChangePassword)return;
  if(remoteClient.active())remoteClient.loadPreferences();
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
 return 'costalog_dashboard_v1:'+mode+':'+encodeURIComponent(user)+':'+state.role+':'+state.company;
}
function loadMetricPreferences(){
 state.reportTemplates=readPrefs(reportTemplatesKey(),{});state.templateSelected='';
 let saved=null;
 try{const v=JSON.parse(localStorage.getItem(metricPrefsKey())||(state.company==='costalog'?localStorage.getItem(metricPrefsKey().slice(0,metricPrefsKey().lastIndexOf(':'))):null)||'null');if(Array.isArray(v))saved=v;}catch{}
 state.metricLayout=normalizedLayout(saved,{financial:!!state.permissions.financeiro});
}
function saveMetricPreferences(){
 (!remoteClient.active()&&localStorage.setItem(metricPrefsKey(),JSON.stringify(normalizedLayout(state.metricLayout,{financial:!!state.permissions.financeiro}))));
}
let comparisonSeq=0;
async function fetchPeriodComparison(){
 if(remoteClient.active()){if(hasDateErrors(['compareCurrentFrom','compareCurrentTo','comparePreviousFrom','comparePreviousTo']))return;return remoteClient.compare();}
 if(hasDateErrors(['compareCurrentFrom','compareCurrentTo','comparePreviousFrom','comparePreviousTo']))return;
 if(state.mode!=='live'||!state.apiUrl||!state.token)return;
 const windows={current:{from:state.compareCurrentFrom,to:state.compareCurrentTo},previous:{from:state.comparePreviousFrom,to:state.comparePreviousTo}};
 try{for(const range of Object.values(windows)){if(parseEditableDate(range.from)!==range.from||parseEditableDate(range.to)!==range.to||!range.from||!range.to||range.from>range.to)throw Error('Corrija as datas dos períodos A e B.');splitMonths(range.from,range.to);}}
 catch(error){state.comparisonError=error.message;render();return;}
 const seq=++comparisonSeq,identity=identityEpoch,company=state.company,token=state.token,api=state.apiUrl;
 const dataset=state.dataset,loaded=state.loadedRange;
 state.comparisonLoading=true;state.comparisonError='';state.comparison=null;render();
 try{
  const get=async range=>{
   if(loaded&&loaded.from<=range.from&&loaded.to>=range.to)return subsetPeriod(dataset,range);
   const windows=splitMonths(range.from,range.to),results=new Array(windows.length);let next=0;
   const worker=async()=>{while(next<windows.length&&seq===comparisonSeq&&identity===identityEpoch){
    const i=next++,window=windows[i],query=new URLSearchParams({...window,company});
    const response=await fetch(api.replace(/\/$/,'')+'/api/overview?'+query,{headers:{Authorization:'Bearer '+token},credentials:'omit',signal:AbortSignal.timeout(90000)});
    if(!response.ok)throw Error(response.status===401?'Sessão expirada. Entre novamente.':'Consulta indisponível (HTTP '+response.status+'). Tente novamente.');
    const body=await response.json();if(!Array.isArray(body.data?.viagens)||!Array.isArray(body.data?.pedidos))throw Error('Consulta incompleta. Tente novamente.');results[i]=body.data;
   }};
   await Promise.all(Array.from({length:Math.min(2,windows.length)},worker));
   if(identity!==identityEpoch||seq!==comparisonSeq)return null;
   const data={};for(const key of ['viagens','pedidos','ctes','mdfes','rotas','ocorrencias','programacoes'])data[key]=results.flatMap(result=>result[key]||[]);
   data.sources=results.reduce((acc,result)=>{for(const [key,value] of Object.entries(result.sources||{}))acc[key]=Object.hasOwn(acc,key)?acc[key]&&value:value;return acc;},{});
   return normalizePayload({data},company);
  };
  const current=await get(windows.current);if(seq!==comparisonSeq||identity!==identityEpoch)return;
  const previous=await get(windows.previous);if(seq!==comparisonSeq||identity!==identityEpoch)return;
  state.comparison={company,currentRange:windows.current,previousRange:windows.previous,current,previous,source:'DSS'};
 }catch(error){if(seq===comparisonSeq&&identity===identityEpoch)state.comparisonError=error.message;}
 finally{if(seq===comparisonSeq&&identity===identityEpoch){state.comparisonLoading=false;render();}}
}

async function switchCompany(){
 if(remoteClient.active()&&!await remoteClient.flushPreferences())return;
 const remoteSnapshot=state.remoteSnapshot,remoteRange=state.loadedRange,remoteLastSync=state.lastSync;
 resetDateControls();
 sharedLoginPending=false;state.pendingRecord='';state.linkMessage='';
 if(state.user?.mustChangePassword)return;
 if(state.mode==='live'&&state.loadedRange&&!state.loading)companySnapshots.set(state.company,{dataset:state.dataset,range:state.loadedRange,lastSync:state.lastSync,syncMetadata:state.syncMetadata});
 const company=state.company==='costalog'?'ideallog':'costalog';
 identityEpoch++;comparisonSeq++;
 state.company=company;clearViewCache();
 localStorage.setItem('viagens_pf_company',JSON.stringify(company));
 if(window.history?.replaceState){const url=new URL(window.location.href);url.search='';url.hash='';url.searchParams.set('empresa',company);window.history.replaceState(null,'',url);}
 const saved=companySnapshots.get(company);
 const reusable=saved&&saved.range.from<=state.from&&saved.range.to>=state.to;
 const syncing=state.loading,loadingProgress=state.loadingProgress;
 state.dataset=state.mode==='demo'?demo:reusable?saved.dataset:emptyDataset();
 Object.assign(state,{alertArchive:false,alertAllTracked:false,alertUnassigned:false,alertRecurrent:false,alertRelevant:false,pendingDialog:'',technicalOpen:false,pendingRecord:'',linkMessage:'',alertGroup:'',tripFocus:'',alertScope:'todos',alertDue:'todos',legalEntity:'',drilldown:'',detailPage:1,timelinePage:1,visibleAlerts:[],tasks:{},taskIndexLoaded:false,taskIndexLoading:false,taskIndexError:'',taskSelected:null,taskDetail:null,taskLoading:false,taskSaving:false,taskUnavailable:false,alertStatus:'todos',alertOwner:'',syncMetadata:reusable?saved.syncMetadata||[]:[],selected:null,page:1,customer:'',vehicle:'',serviceType:'',status:'',search:'',globalQuery:'',filter:'todos',sortKey:'',clientSelected:'',routeSelected:'',driverSelected:'',alertPriority:'todos',alertKind:'todos',comparison:null,comparisonLoading:false,comparisonError:'',prevDataset:null,error:'',loading:false,loadingProgress:'',loadedRange:reusable?saved.range:null,lastSync:reusable?saved.lastSync:null,presets:readPrefs('costalog_filter_presets_'+company,{})});
 state.loading=syncing;state.loadingProgress=loadingProgress;
 if(remoteClient.active()){Object.assign(state,{remoteSnapshot,loadedRange:remoteRange,lastSync:remoteLastSync,rvStage:'',dataset:emptyDataset()});remoteClient.invalidate();remoteClient.loadPreferences();}
 else loadMetricPreferences();render();
}
function clearSession(){
 remoteClient.reset();state.preferenceStorage='';state.workflowStorage=null;state.serverMode=false;state.remoteSnapshot='';state.remoteError='';state.queryNotice='';state.preferencesError='';state.rvStage='';
 resetDateControls();identityEpoch++;comparisonSeq++;syncSeq++;companySnapshots.clear();clearViewCache();
 Object.assign(state,{alertArchive:false,alertAllTracked:false,alertUnassigned:false,alertRecurrent:false,alertRelevant:false,pendingDialog:'',technicalOpen:false,pendingRecord:'',linkMessage:'',alertGroup:'',tripFocus:'',alertScope:'todos',alertDue:'todos',legalEntity:'',drilldown:'',detailPage:1,timelinePage:1,visibleAlerts:[],tasks:{},taskIndexLoaded:false,taskIndexLoading:false,taskIndexError:'',taskSelected:null,taskDetail:null,taskLoading:false,taskSaving:false,taskUnavailable:false,alertStatus:'todos',alertOwner:'',syncMetadata:[],reportTemplates:{},templateSelected:'',reportColumnOrder:{},reportFormat:'xlsx'});
 const token=state.token,url=state.apiUrl;
 if(token&&url)fetch(url.replace(/\/$/,'')+'/api/logout',{method:'POST',headers:{Authorization:'Bearer '+token},credentials:'omit'}).catch(()=>{});
 state.token='';state.user=null;state.role='operacional';state.permissions={operacional:true,financeiro:false,admin:false};
 state.mode='demo';state.dataset=demo;state.loadedRange=null;state.view='painel';state.customer='';state.vehicle='';state.serviceType='';state.status='';state.rvStage='';state.search='';state.filter='todos';state.page=1;state.comparison=null;state.comparisonError='';state.metricLayout=null;state.clientSelected='';state.globalQuery='';state.adminUsers=[];state.adminUsersError='';state.adminResetUser='';state.adminUsersLoading=false;state.prevDataset=null;state.loading=false;state.selected=null;state.lastSync=null;state.apiDiagnostics=null;
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
 const url=(state.apiUrl||window.location.origin).replace(/\/$/,'')+'/api/overview?from='+encodeURIComponent(range.from)+'&to='+encodeURIComponent(range.to)+'&refresh=recent&sync_to='+encodeURIComponent(syncTo)+'&company='+encodeURIComponent(company)+'&include_companies=1';
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
function snapshotForCompany(results,company,requestCompany,range,lastSync){
 const parts=results.map(result=>company===requestCompany?result:result.companions?.[company]);
 // Backend antigo não confirma a outra empresa: não inventar uma consulta vazia nem chamar a DSS.
 if(parts.some(part=>!part||company!==requestCompany&&part.company!==company||!Array.isArray(part.data?.viagens)||!Array.isArray(part.data?.pedidos)))return null;
 const data={};for(const key of ['viagens','pedidos','ctes','mdfes','rotas','programacoes','ocorrencias'])data[key]=parts.flatMap(part=>part.data[key]||[]);
 data.sources=parts.reduce((acc,part)=>{for(const [key,value] of Object.entries(part.data.sources||{}))acc[key]=Object.hasOwn(acc,key)?acc[key]&&value:value;return acc;},{});
 return {dataset:normalizePayload({data},company),range,lastSync,syncMetadata:parts.map(part=>part.quality||{})};
}
async function loadData(){
 if(remoteClient.active()){if(hasDateErrors(['from','to'])||!state.from||!state.to||state.from>state.to)return;return remoteClient.synchronize();}
 if(hasDateErrors(['from','to']))return;
 if(parseEditableDate(state.from)!==state.from||parseEditableDate(state.to)!==state.to||!state.from||!state.to||state.from>state.to){state.error='Informe datas válidas para consultar a DSS.';render();return;}
 if(!state.token){state.connect=true;state.loading=false;state.error='Faça login para consultar a DSS.';render();return;}
 const requestFrom=state.from,requestTo=state.to,token=state.token,requestCompany=state.company,seq=++syncSeq;
 const current=()=>seq===syncSeq&&state.token===token;
 state.loading=true;state.loadingProgress='Preparando consulta...';state.connect=false;state.error='';render();
 try{
  const windows=splitMonths(requestFrom,requestTo),results=new Array(windows.length);
  // Duas chamadas no máximo; cada resposta fornece as duas empresas já separadas.
  let next=0,failed=false;
  const worker=async()=>{
   try{while(next<windows.length&&current()&&!failed){
    const index=next++;
    results[index]=await fetchDssWindow(windows[index],token,requestTo,requestCompany);
    if(current()&&!failed){
     state.loadingProgress='Consultando DSS: '+results.filter(Boolean).length+' de '+windows.length+' meses';
     const button=document.querySelector('[data-action="refresh"]');if(button)button.textContent=state.loadingProgress;
    }
   }}catch(error){failed=true;throw error;}
  };
  await Promise.all(Array.from({length:Math.min(2,windows.length)},worker));
  if(!current())return;
  const range={from:requestFrom,to:requestTo},lastSync=new Date().toISOString();
  // Preparar as duas bases antes de substituir qualquer cópia da sessão.
  const snapshots=Object.fromEntries(Object.keys(COMPANIES).map(company=>[company,snapshotForCompany(results,company,requestCompany,range,lastSync)]));
  for(const [company,snapshot] of Object.entries(snapshots))if(snapshot)companySnapshots.set(company,snapshot);
  const active=snapshots[state.company];
  if(active&&state.from>=range.from&&state.to<=range.to){
   clearViewCache();Object.assign(state,{dataset:active.dataset,loadedRange:range,mode:'live',error:'',page:1,comparison:null,lastSync,syncMetadata:active.syncMetadata,prevDataset:null});
  }
 }catch(err){
  if(!current())return;
  const alreadyLive=state.mode==='live';
  if(!alreadyLive){state.mode='demo';state.dataset=demo;state.loadedRange=null;}
  state.error='API indisponível: '+(err.name==='AbortError'?'tempo limite na consulta mensal':err.message)+(alreadyLive?'. Dados anteriores mantidos.':'. Exibindo somente dados fictícios.');
 }finally{if(current()){state.loading=false;state.loadingProgress='';render();}}
}

function exportAdvanced(type,format){
 if(remoteClient.active()&&type==='pendencias'&&state.alertArchive)return pendingClient.exportArchive().then(value=>deliverExport(value.models,type,format,false)).catch(error=>alert(error.message));
 if(remoteClient.active()){const full=state.view==='relatorios'&&state.reportMulti&&format==='xlsx';return remoteClient.export(type,full).then(models=>deliverExport(models,type,format,full)).catch(error=>alert('Erro ao gerar relatório: '+error.message));}
 const d=scoped(),full=state.view==='relatorios'&&state.reportMulti&&format==='xlsx';
 if((type==='pendencias'||full)&&state.mode==='live'&&!state.taskIndexLoaded){const epoch=identityEpoch,query=state.search;loadTaskIndex(true).then(()=>{if(epoch!==identityEpoch||scoped()!==d||state.search!==query)return;if(!state.taskIndexLoaded)throw Error(state.taskIndexError||'Tratamentos ainda não carregados.');exportAdvanced(type,format);}).catch(error=>alert('Erro ao gerar relatório: '+error.message));return;}
 const allowed=reportTypesFor(state.role);if(!allowed.includes(type))throw Error('Acesso negado ao relatório.');
 const models=(full?allowed:[type]).map(t=>buildOperationalReport(t,d,state));
 deliverExport(models,type,format,full);
}
function deliverExport(models,type,format,full){
 const suffix=(state.mode==='live'?'DSS':'DEMO')+'_'+state.from+'_'+state.to+(state.legalEntity?'_'+state.legalEntity:'');
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
let syncSeq=0;
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
function openMyTasks(due='todos'){
 if(!state.user?.username||state.user.mustChangePassword){state.connect=!state.user?.username;render();return;}
 Object.assign(state,{view:'pendencias',selected:null,tripFocus:'',drilldown:'',alertScope:'mine',alertDue:due,alertStatus:'ativas',alertKind:'todos',alertPriority:'todos',alertOwner:'',search:'',globalQuery:'',page:1});render();
}
function openChecklistRecords(reference){
 const [view,id]=String(reference||'').split(':');
 if(!['ctes','entregas'].includes(view)||(!remoteClient.active()&&!filterOptionsData().viagens.some(row=>row.id===id)))return;
 Object.assign(state,{view,alertGroup:'',tripFocus:id,drilldown:'',selected:null,page:1,search:'',globalQuery:'',customer:'',vehicle:'',serviceType:'',status:'',filter:'todos',sortKey:''});render();
}
const drilldownLabels={viagens:'Todas as viagens',andamento:'Viagens em andamento',concluidas:'Viagens concluídas',pedidos:'Todos os pedidos',ctes:'Pedidos com CT-e',sem_cte:'Pedidos sem CT-e',sem_rv:'CT-e sem RV localizada',entregas:'Entregas concluídas sem comprovante',km:'RVs com KM informado'};
function renderDrilldownNotice(){
 const focused=state.tripFocus?(filterOptionsData().viagens||[]).find(row=>row.id===state.tripFocus):null;
 if(state.tripFocus)return '<div class="info-strip drilldown-notice"><strong>RV '+esc(focused?.numero||(remoteClient.active()?state.tripFocus.split('~').at(-1):'não localizada no período'))+'</strong> · Apenas documentos vinculados nesta consulta. '+button('clear-trip-focus','Remover filtro da RV','btn-sm')+(focused?'<button class="btn btn-sm" data-detail="viagens:'+attr(focused.id)+'">Voltar à RV</button>':'')+'</div>';
 return state.drilldown?'<div class="info-strip drilldown-notice"><strong>Filtro do painel:</strong> '+esc(drilldownLabels[state.drilldown]||state.drilldown)+' '+button('clear-drilldown','Remover filtro','btn-sm')+'</div>':'';
}
function openMetric(id){
 const view=['viagens','andamento','concluidas','km'].includes(id)?'viagens':id==='entregas'?'entregas':'ctes';
 if(!drilldownLabels[id]||!permittedView(state.role,view))return;
 Object.assign(state,{view,alertGroup:'',tripFocus:'',drilldown:id,page:1,search:'',status:'',filter:'todos',sortKey:'',selected:null,routeSelected:'',driverSelected:'',globalQuery:''});render();
}
function reportTemplatesKey(){return 'viagens_pf_report_templates_v1:'+state.company+':'+(PUBLIC_DEMO?'demo':'portal')+':'+encodeURIComponent(state.user?.username||'visitante');}
function saveReportTemplate(){
 try{
  const model=reportTemplate(state),name=prompt('Nome do modelo de relatório:',state.templateSelected||'');
  if(!name?.trim())return;
  const label=name.trim().slice(0,60);
  if(Object.hasOwn(state.reportTemplates,label)&&!confirm('Substituir o modelo “'+label+'”?'))return;
  state.reportTemplates={...state.reportTemplates,[label]:model};(!remoteClient.active()&&localStorage.setItem(reportTemplatesKey(),JSON.stringify(state.reportTemplates)));state.templateSelected=label;render();
 }catch(error){alert('Não foi possível salvar o modelo: '+error.message);}
}
function applySelectedReportTemplate(){
 const name=state.templateSelected;if(!name)return;
 try{const restored=applyReportTemplate(state.reportTemplates[name],state);resetDateControls();Object.assign(state,restored,{selected:null,routeSelected:'',driverSelected:'',detailPage:1});render();}catch(error){alert(error.message);}
}
function deleteReportTemplate(){
 const name=state.templateSelected;if(!name)return;
 if(!confirm('Excluir o modelo “'+name+'”?'))return;
 state.reportTemplates={...state.reportTemplates};delete state.reportTemplates[name];(!remoteClient.active()&&localStorage.setItem(reportTemplatesKey(),JSON.stringify(state.reportTemplates)));state.templateSelected='';render();
}
async function workflowFetch(company,options={},key=''){
 const query=new URLSearchParams({company});if(key)query.set('key',key);
 const response=await fetch(state.apiUrl.replace(/\/$/,'')+'/api/workflow?'+query,{...options,credentials:'omit',headers:{Authorization:'Bearer '+state.token,...(options.body?{'Content-Type':'application/json'}:{})},signal:AbortSignal.timeout(20000)});
 const body=await response.json();
 if(!response.ok){const error=Error(response.status===401?'Sessão expirada. Entre novamente no portal.':body.error||'Falha ao consultar tratamentos.');error.status=response.status;throw error;}
 return body;
}
function demoWorkflowKey(company){return 'viagens_pf_demo_workflow_v1:'+company;}
let taskIndexRequest=null;
function loadTaskIndex(force=false){
 if(remoteClient.active()){remoteClient.invalidate();render();return Promise.resolve();}
 if(state.taskIndexLoading)return taskIndexRequest||Promise.resolve();
 if(state.taskIndexLoaded&&!force)return Promise.resolve();
 const epoch=identityEpoch,company=state.company;state.taskIndexLoading=true;
 taskIndexRequest=(async()=>{
  try{
   const tasks=state.mode==='demo'?Object.fromEntries(Object.entries(readPrefs(demoWorkflowKey(company),{})).map(([key,value])=>[key,taskSummary(value)])):(await workflowFetch(company)).tasks;
   if(epoch!==identityEpoch)return;
   state.tasks=tasks||{};state.taskIndexLoaded=true;state.taskIndexError='';
  }catch(error){if(epoch===identityEpoch)state.taskIndexError='Tratamentos não carregados: '+error.message;}
  finally{if(epoch===identityEpoch){state.taskIndexLoading=false;render();}}
 })();
 return taskIndexRequest;
}
async function openTask(item){
 resetDateControls(['taskDue']);
 const epoch=identityEpoch,key=alertKey(item),company=state.company;
 Object.assign(state,{taskOwnerSelf:false,taskSelected:{...item,key},taskDetail:taskFor(item,state.tasks),taskLoading:true,taskSaving:false,taskError:'',taskUnavailable:false});render();
 try{
  const task=state.mode==='demo'?readPrefs(demoWorkflowKey(company),{})[key]:(await workflowFetch(company,{},key)).task;
  if(epoch!==identityEpoch||state.taskSelected?.key!==key)return;
  state.taskDetail=task||{...taskFor(item,{}),comments:[],history:[]};
  state.tasks={...state.tasks,[key]:taskSummary(state.taskDetail)};
 }catch(error){if(epoch===identityEpoch&&state.taskSelected?.key===key){state.taskError=error.message;state.taskUnavailable=true;}}
 finally{if(epoch===identityEpoch&&state.taskSelected?.key===key){state.taskLoading=false;render();}}
}
async function saveTask(){
 const dueInput=document.getElementById('taskDue'),due=parseEditableDate(dueInput?.value||'');if(due===null){editDateControl(dueInput,{optional:true});dueInput.reportValidity?.();return;}
 if(!state.taskSelected||state.taskSaving||state.taskLoading||state.taskUnavailable)return;
 const epoch=identityEpoch,company=state.company,key=state.taskSelected.key;
 const owner=document.getElementById('taskOwner')?.value||'';
 const input={key,...(remoteClient.active()&&state.remoteSnapshot?{snapshot:state.remoteSnapshot}:{}),...(document.getElementById('taskResolutionReason')?{resolutionReason:document.getElementById('taskResolutionReason').value}:{}),owner,ownerUsername:assignmentForOwner(owner,state.user,state.taskDetail,state.taskOwnerSelf),due,priority:document.getElementById('taskPriority')?.value,status:document.getElementById('taskStatus')?.value,comment:document.getElementById('taskComment')?.value||'',revision:state.taskDetail?.revision||0};
 state.taskSaving=true;state.taskError='';
 const submit=document.querySelector('#taskForm button[type="submit"]');if(submit){submit.disabled=true;submit.textContent='Salvando…';}
 try{
  let task;
  if(state.mode==='demo'){
   const tasks=readPrefs(demoWorkflowKey(company),{});task=updateTask(tasks[key],input,state.user?.username||'demonstração');tasks[key]=task;localStorage.setItem(demoWorkflowKey(company),JSON.stringify(tasks));
  }else task=(await workflowFetch(company,{method:'PATCH',body:JSON.stringify(input)})).task;
  if(epoch!==identityEpoch)return;
  state.tasks={...state.tasks,[key]:taskSummary(task)};
  if(remoteClient.active())pendingClient.refresh();
  if(state.taskSelected?.key===key){state.taskDetail=task;state.taskSelected=null;state.taskDetail=null;}
 }catch(error){
  if(epoch===identityEpoch){state.taskError=error.message;if(error.status===409||error.status===401)state.taskUnavailable=true;}
 }finally{
  if(epoch===identityEpoch){state.taskSaving=false;
   // Preserva os campos digitados em caso de falha, inclusive o comentário.
   if(state.taskError&&state.taskSelected?.key===key){
    state.taskDetail={...state.taskDetail,owner:input.owner,ownerUsername:input.ownerUsername,due:input.due,priority:input.priority,status:input.status,resolutionReason:input.resolutionReason||''};
    render();const comment=document.getElementById('taskComment');if(comment)comment.value=input.comment;
   }else render();
  }
 }
}
root.addEventListener('click',e=>{
 if(pendingClient.handleClick(e.target))return;
 const stage=e.target.closest('[data-related-rv-stage]');if(stage){state.rvStage=stage.dataset.relatedRvStage;state.page=1;state.selected=null;render();return;}
 const calendar=e.target.closest('[data-open-calendar]');if(calendar){openDateCalendar(calendar.dataset.openCalendar);return;}
 const rvStage=e.target.closest('[data-rv-status]');if(rvStage){state.status=rvStage.dataset.rvStatus;state.page=1;render();return;}

 const mobile=e.target.closest('[data-mobile-row]');if(mobile){const row=mobile.closest('tr'),expanded=mobile.getAttribute('aria-expanded')!=='true';row.classList.toggle('mobile-expanded',expanded);mobile.setAttribute('aria-expanded',String(expanded));mobile.innerHTML=(expanded?'Menos detalhes':'Mais detalhes')+' <span aria-hidden="true">⌄</span>';return;}
 const alertGroup=e.target.closest('[data-alert-group]');if(alertGroup){state.alertGroup=alertGroup.dataset.alertGroup;state.page=1;render();return;}
 const mineDue=e.target.closest('[data-mine-due]');if(mineDue){openMyTasks(mineDue.dataset.mineDue);return;}
 const scope=e.target.closest('[data-alert-scope]');if(scope){if(scope.dataset.alertScope==='mine')openMyTasks('todos');else{Object.assign(state,{alertScope:'todos',alertDue:'todos',alertStatus:'todos',alertOwner:'',page:1});render();}return;}
 const due=e.target.closest('[data-alert-due]');if(due){state.alertDue=due.dataset.alertDue;state.page=1;render();return;}
 const checklist=e.target.closest('[data-checklist-open]');if(checklist){openChecklistRecords(checklist.dataset.checklistOpen);return;}
 const metric=e.target.closest('[data-metric-open]');if(metric){openMetric(metric.dataset.metricOpen);return;}
 const manage=e.target.closest('[data-alert-manage]');if(manage){const item=state.visibleAlerts?.find(item=>alertKey(item)===manage.dataset.alertManage);if(item)openTask(item);return;}
 const columnMove=e.target.closest('[data-report-column-move]');if(columnMove){const [key,direction]=columnMove.dataset.reportColumnMove.split(':'),model=remoteClient.active()?{columns:state.remoteColumns||[]}:buildOperationalReport(state.reportSelected,scoped(),state,{preview:true}),keys=model.columns.map(([key])=>key),i=keys.indexOf(key),j=i+Number(direction);if(i>=0&&j>=0&&j<keys.length){[keys[i],keys[j]]=[keys[j],keys[i]];state.reportColumnOrder={...state.reportColumnOrder,[state.reportSelected]:keys};render();}return;}
 const point=e.target.closest('[data-chart-point]');
 if(point){activateChartPoint(point);return;}
 const searchHit=e.target.closest('[data-search-result]');
 if(searchHit){
  const raw=searchHit.dataset.searchResult||'',pos=raw.indexOf(':');
  if(pos<0)return;
  const group=raw.slice(0,pos),id=raw.slice(pos+1);
  state.globalQuery='';state.search='';state.page=1;
  if(group==='clientes'&&state.permissions.financeiro){state.view='clientes';state.clientSelected=id;render();return;}
  const view=group==='viagens'?'viagens':group==='pedidos'?'ctes':'mdfes';
  if(!permittedView(state.role,view))return;
  state.view=view;state.selected=view+':'+id;state.timelinePage=1;render();return;
 }
 const openClient=e.target.closest('[data-client-open]');
 if(openClient&&state.permissions.financeiro){state.clientSelected=openClient.dataset.clientOpen;render();return;}
 const profileDetail=e.target.closest('[data-profile-detail]');
 if(profileDetail){state.selected=profileDetail.dataset.profileDetail;state.timelinePage=1;render();return;}
 const openRoute=e.target.closest('[data-route-open]');
 if(openRoute){state.routeSelected=openRoute.dataset.routeOpen;state.detailPage=1;render();return;}
 const openDriver=e.target.closest('[data-driver-open]');
 if(openDriver){state.driverSelected=openDriver.dataset.driverOpen;state.detailPage=1;render();return;}
 const alertDetail=e.target.closest('[data-alert-detail]');
 if(alertDetail){const ref=alertDetail.dataset.alertDetail,kind=ref.split(':')[0];
  if(!permittedView(state.role,kind))return;
  state.view=kind;state.alertArchive=false;state.alertAllTracked=false;state.selected=ref;state.timelinePage=1;
  if(remoteClient.active()&&!state.remoteSnapshot){const item=state.visibleAlerts?.find(row=>row.recordId===ref.split(':')[1]);state.pendingRecord=ref;state.selected=null;state.linkMessage='Ajuste o período'+(item?.refDate?' para incluir '+dateBR(item.refDate):' do registro')+' e atualize os dados da DSS para abrir o documento.';}render();return;
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
 const nav=e.target.closest('[data-nav]');if(nav){if(state.user?.mustChangePassword)return;if(!permittedView(state.role,nav.dataset.nav))return;state.view=nav.dataset.nav;state.alertArchive=false;state.alertAllTracked=false;state.alertUnassigned=false;state.alertRecurrent=false;state.alertRelevant=false;state.pendingDialog='';state.rvStage='';state.technicalOpen=false;state.alertGroup='';state.tripFocus='';state.alertScope='todos';state.alertDue='todos';state.drilldown='';state.alertPriority='todos';state.alertKind='todos';state.alertStatus='todos';state.alertOwner='';state.clientSelected='';state.routeSelected='';state.driverSelected='';state.globalQuery='';state.search='';state.filter='todos';state.status='';state.sortKey='';state.page=1;state.menu=false;state.selected=null;render();if(state.view==='administracao'&&state.permissions.admin)loadAdminUsers();return;}
 const sorter=e.target.closest('[data-sort-metric]');
 if(sorter){
  const [kind,key]=(sorter.dataset.sortMetric||'').split(':');
  const allowed={rotas:['name','count','km','kmPerTrip','vehicles','drivers'],motoristas:['name','trips','orders','ctes','km','kmPerTrip','routes'],clientes:['name','tripCount','orderCount','cteCount','fretesValor','lastDate']};
  if(allowed[kind]?.includes(key)){
   state.tableSort||={};
   const prev=state.tableSort[kind];
   state.tableSort[kind]={key,direction:prev?.key===key&&prev.direction==='desc'?'asc':'desc'};state.sortDir=state.tableSort[kind].direction;state.page=1;
   render();
  }return;
 }
 const graphInterval=e.target.closest('[data-chart-interval]');if(graphInterval){state.chartInterval=graphInterval.dataset.chartInterval;render();return;}
 const detail=e.target.closest('[data-detail]');if(detail){state.selected=detail.dataset.detail;state.timelinePage=1;render();return;}
 const sort=e.target.closest('[data-sort]');if(sort){const k=sort.dataset.sort;state.sortDir=state.sortKey===k&&state.sortDir==='asc'?'desc':'asc';state.sortKey=k;state.page=1;render();return;}
 const report=e.target.closest('[data-report-select]');if(report){state.reportSelected=report.dataset.reportSelect;state.reportMulti=false;state.page=1;state.sortKey='';render();return;}
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
 if(action==='cancel-query'){remoteClient.cancel();return;}
 if(action==='cancel-page'){remoteClient.cancelPage();return;}
 if(action==='retry-page'){remoteClient.invalidate();render();return;}
 if(action==='reload-preferences'){remoteClient.loadPreferences();return;}
 if(action==='assign-task-to-me'){const owner=document.getElementById('taskOwner');if(owner&&state.user?.username){owner.value=state.user.displayName||state.user.username;state.taskOwnerSelf=true;const account=document.getElementById('taskOwnerAccount');if(account)account.textContent='Conta: '+state.user.username+' · confirme em Salvar tratamento';}return;}
 if(action==='share-query'||action==='share-record'){copyPortalLink(action==='share-record'?state.selected:'');return;}
 if(action==='program-prev'||action==='program-next'){state.programPage=(state.programPage||1)+(action==='program-prev'?-1:1);render();return;}
 if(action==='day-today'){resetDateControls(['dayDate']);state.dayDate=localToday();state.page=1;render();return;}
 if(action==='clear-alert-group'){state.alertGroup='';state.page=1;render();return;}
 if(action==='clear-trip-focus'){state.tripFocus='';state.page=1;render();return;}
 if(action==='close-task'){state.taskSelected=null;state.taskDetail=null;render();return;}
 if(action==='reload-workflow'){pendingClient.refresh();state.taskIndexLoaded=false;state.taskIndexError='';loadTaskIndex(true);return;}
 if(action==='detail-prev'||action==='detail-next'){state.detailPage+=action==='detail-prev'?-1:1;render();return;}
 if(action==='timeline-prev'||action==='timeline-next'){state.timelinePage+=action==='timeline-prev'?-1:1;render();return;}
 if(action==='clear-drilldown'){state.drilldown='';state.page=1;render();return;}
 if(action==='apply-report-template'){applySelectedReportTemplate();return;}
 if(action==='save-report-template'){saveReportTemplate();return;}
 if(action==='delete-report-template'){deleteReportTemplate();return;}
 if(action==='export-report-template'){try{exportAdvanced(state.reportSelected,state.reportFormat||'xlsx');}catch(err){alert(err.message);}return;}
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
 if(action==='clear-table-search'){state.search='';state.page=1;render();}
 if(action==='clear-filters'){Object.assign(state,{rvStage:'',alertArchive:false,alertAllTracked:false,alertUnassigned:false,alertRecurrent:false,alertRelevant:false,pendingDialog:'',technicalOpen:false,pendingRecord:'',linkMessage:'',alertGroup:'',tripFocus:'',alertScope:'todos',alertDue:'todos',alertStatus:'todos',alertOwner:'',alertKind:'todos',alertPriority:'todos',legalEntity:'',drilldown:'',customer:'',vehicle:'',serviceType:'',status:'',filter:'todos',search:'',globalQuery:'',sortKey:'',sortDir:'desc',page:1,routeSelected:'',driverSelected:''});render();}
 if(action==='save-filter'){const name=prompt('Nome para este conjunto de filtros:');if(name&&name.trim()){state.presets={...state.presets};state.presets[name.trim().slice(0,45)]={alertArchive:!!state.alertArchive,alertAllTracked:!!state.alertAllTracked,alertRelevant:!!state.alertRelevant,alertUnassigned:!!state.alertUnassigned,alertRecurrent:!!state.alertRecurrent,rvStage:state.rvStage,alertGroup:state.alertGroup,alertGrouping:state.alertGrouping,tripFocus:state.tripFocus,alertScope:state.alertScope,alertDue:state.alertDue,alertStatus:state.alertStatus,alertOwner:state.alertOwner,alertKind:state.alertKind,alertPriority:state.alertPriority,legalEntity:state.legalEntity,drilldown:state.drilldown,from:state.from,to:state.to,customer:state.customer,vehicle:state.vehicle,serviceType:state.serviceType,status:state.status,filter:state.filter,search:state.search,sortKey:state.sortKey,sortDir:state.sortDir};(!remoteClient.active()&&localStorage.setItem('costalog_filter_presets_'+state.company,JSON.stringify(state.presets)));render();}}
 if(action==='delete-filter'){const sel=document.getElementById('savedPreset'),name=sel?.value;if(!name){alert('Selecione primeiro um filtro salvo.');return;}if(confirm('Excluir o filtro salvo '+name+'?')){state.presets={...state.presets};delete state.presets[name];(!remoteClient.active()&&localStorage.setItem('costalog_filter_presets_'+state.company,JSON.stringify(state.presets)));render();}}
 if(action==='clear-settings'){if(confirm('Limpar filtros salvos e preferências de colunas?')){localStorage.removeItem('costalog_filter_presets_'+state.company);localStorage.removeItem('costalog_visible_columns');state.presets={};state.hiddenColumns={};state.autoRefresh=0;activateRefresh();render();}}
 if(action==='connect'){state.connect=true;state.selected=null;render();}
 if(action==='go-viagens'){state.view='viagens';state.page=1;render();}
 if(action==='csv'){try{exportAdvanced(state.view==='ctes'?'pedidos':state.view==='mdfes'?'mdfes':state.permissions.financeiro&&state.view==='clientes'?'clientes':'viagens','csv');}catch(err){alert(err.message);}}
 if(action==='print'){try{const type=state.view==='ctes'?'pedidos':state.view==='mdfes'?'mdfes':'viagens';exportAdvanced(type,'pdf');}catch(err){alert(err.message);}}
 if(action==='prev'){state.page--;render();}
 if(action==='next'){state.page++;render();}
 if(action==='demo'){clearSession();state.connect=false;render();}
 if(action==='logout'){if(remoteClient.active()){remoteClient.flushPreferences().finally(()=>{clearSession();render();});return;}clearSession();render();}
 if(action==='test-connect'){portalLogin();}
});
root.addEventListener('submit',e=>{
 if(['pendingRulesForm','pendingBatchForm'].includes(e.target?.id)){e.preventDefault();pendingClient.submit(e.target);return;}
 if(e.target?.id==='taskForm'){e.preventDefault();saveTask();return;}
 if(e.target?.id==='loginForm'){e.preventDefault();portalLogin();}
 if(e.target?.id==='createPortalUser'){e.preventDefault();createPortalUser();}
 if(e.target?.id==='forcePasswordChange'){e.preventDefault();changePortalPassword();}
 if(e.target?.id==='resetPortalUserPassword'){
  e.preventDefault();const password=document.getElementById('adminResetPassword')?.value||'';
  if(state.adminResetUser&&password.length>=12)updatePortalUser(state.adminResetUser,'reset-password',{password});
 }
});
root.addEventListener('change',e=>{
 if(pendingClient.handleChange(e.target))return;
 if(e.target.id==='taskStatus'){const reason=document.getElementById('taskResolutionReason');if(reason)reason.required=e.target.value==='resolvida';return;}
 if(e.target.dataset?.datePicker){const id=e.target.dataset.datePicker,input=document.getElementById(id)||{id};input.value=e.target.value;applyDateEdit(input,{calendar:true});return;}
 if(DATE_FIELDS.has(e.target.id)){applyDateEdit(e.target);return;}

 if(e.target.id==='alertGrouping'){state.alertGrouping=e.target.value==='rv'?'rv':'lista';state.alertGroup='';state.page=1;render();return;}
 if(e.target.id==='legalEntityFilter'){state.legalEntity=e.target.value;state.tripFocus='';Object.assign(state,{page:1,detailPage:1,selected:null,customer:'',vehicle:'',serviceType:'',status:'',search:'',globalQuery:'',routeSelected:'',driverSelected:''});render();return;}
 if(e.target.id==='alertDueFilter'){state.alertDue=e.target.value;state.page=1;render();return;}
 if(e.target.id==='alertStatusFilter'){state.alertStatus=e.target.value;state.page=1;render();return;}
 if(e.target.id==='reportFormat'){state.reportFormat=e.target.value;render();return;}
 if(e.target.id==='reportTemplateSelect'){state.templateSelected=e.target.value;if(e.target.value)applySelectedReportTemplate();else render();return;}
 if(e.target.dataset?.adminRole && state.permissions.admin){
  const username=e.target.dataset.adminRole,role=e.target.value;
  const previous=state.adminUsers.find(u=>u.username===username)?.role;
  if(role!==previous&&confirm('Alterar a permissão de '+username+' para '+role+'?'))updatePortalUser(username,'role',{role});
  else render();
  return;
 }
 if(e.target.id==='compareCustom'){state.compareCustom=e.target.checked;state.comparison=null;state.comparisonError='';comparisonSeq++;render();return;}
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
 if(e.target.id==='recordStatusFilter'){state.status=e.target.value;state.page=1;render();return;}
 if(e.target.id==='statusFilter'){state.filter=e.target.value;state.page=1;render();}
 if(e.target.id==='filterClient'){state.routeSelected='';state.driverSelected='';state.customer=e.target.value;state.page=1;render();}
 if(e.target.id==='filterPlate'){state.routeSelected='';state.driverSelected='';state.vehicle=e.target.value;state.page=1;render();}
 if(e.target.id==='filterType'){state.serviceType=e.target.value;state.page=1;render();}
 if(e.target.id==='sortDir'){state.sortDir=e.target.value;if(state.tableSort?.[state.view])state.tableSort[state.view].direction=state.sortDir;state.page=1;render();}
 if(e.target.id==='autoRefresh'){state.autoRefresh=0;activateRefresh();render();}
 if(e.target.id==='reportSelected'){state.reportSelected=e.target.value;state.page=1;state.sortKey='';render();}
 if(e.target.id==='reportMulti'){state.reportMulti=e.target.value==='all';render();}
 if(e.target.id==='savedPreset'&&e.target.value){resetDateControls();const preset=state.presets[e.target.value];if(!preset)return;const allowed=['alertArchive','alertAllTracked','alertRelevant','alertUnassigned','alertRecurrent','rvStage','alertGroup','alertGrouping','tripFocus','alertScope','alertDue','alertStatus','alertOwner','alertKind','alertPriority','legalEntity','drilldown','from','to','customer','vehicle','serviceType','status','filter','search','sortKey','sortDir'];Object.assign(state,{alertArchive:false,alertAllTracked:false,alertUnassigned:false,alertRecurrent:false,alertRelevant:false,pendingDialog:'',technicalOpen:false,pendingRecord:'',linkMessage:'',alertGroup:'',tripFocus:'',alertScope:'todos',alertDue:'todos',alertStatus:'todos',alertOwner:'',alertKind:'todos',alertPriority:'todos',legalEntity:'',drilldown:'',customer:'',vehicle:'',serviceType:'',status:'',filter:'todos',search:'',sortKey:'',sortDir:'desc'},Object.fromEntries(allowed.filter(key=>Object.hasOwn(preset,key)).map(key=>[key,preset[key]])),{page:1,prevDataset:null,routeSelected:'',driverSelected:''});render();}
 if(e.target.id==='quickPeriod'&&e.target.value){
  resetDateControls(['from','to']);
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
  (!remoteClient.active()&&localStorage.setItem('costalog_visible_columns',JSON.stringify(state.hiddenColumns)));render();
 }
 if(e.target.id==='csvMDFE'){
  const file=e.target.files&&e.target.files[0];if(!file)return;
  if(remoteClient.active()){file.text().then(text=>remoteClient.importMdfes(parseCsv(text))).then(count=>alert(count+' MDF-e importados para a consulta atual.')).catch(error=>alert(error.message));return;}
  file.text().then(text=>{const records=parseCsv(text);if(!records.length){alert('Nenhum registro válido no CSV. Confira o cabeçalho.');return;}const imported=scopeCompanyData({mdfes:records.map(row=>({...row,empresa:row.empresa||state.company}))},state.company).mdfes;state.dataset={...state.dataset,mdfes:imported,sources:{...state.dataset.sources,mdfes:true}};state.importCount=imported.length;render();alert(imported.length+' MDF-e carregados para '+COMPANIES[state.company].label+'.');}).catch(()=>alert('Não foi possível ler o arquivo.'));
 }
});
const DATE_FIELDS=new Set(['from','to','compareCurrentFrom','compareCurrentTo','comparePreviousFrom','comparePreviousTo','dayDate','taskDue']);
function applyDateEdit(input,{typing=false,calendar=false,enter=false}={}){
 const id=input.id,max=['from','to'].includes(id)?localToday():'',optional=id==='taskDue';
 const result=editDateControl(input,{max,optional,showError:!typing||String(input.value||'').replace(/\D/g,'').length>=8});
 const refresh=document.querySelector('[data-action="refresh"]');if(refresh)refresh.disabled=state.loading||hasDateErrors(['from','to']);
 if(!result.valid){if(enter)input.reportValidity?.();return;}
 if(optional)return;
 state[id]=result.iso;state.page=1;
 if(id==='from'&&state.from>state.to){state.to=state.from;resetDateControls(['to']);}
 if(id==='to'&&state.to<state.from){state.from=state.to;resetDateControls(['from']);}
 if(id.startsWith('compare')){state.compareCustom=true;state.comparison=null;state.comparisonError='';state.comparisonLoading=false;comparisonSeq++;}
 if(id==='dayDate')state.programPage=1;
 if(calendar||enter){render();return;}
 const cursor=input.selectionStart;
 if(textRenderTimer)clearTimeout(textRenderTimer);
 textRenderTimer=setTimeout(()=>{const focused=document.activeElement===input;render();const field=document.getElementById(id);if(focused&&field){field.focus?.();if(typeof cursor==='number')field.setSelectionRange?.(cursor,cursor);}},350);
}
root.addEventListener('toggle',e=>{const key=e.target.id==='dayPrograms'?'dayProgramsOpen':e.target.id==='advancedFilters'?'filtersOpen':e.target.id==='technicalInfo'&&state.permissions.admin?'technicalOpen':'';if(key&&state[key]!==e.target.open){state[key]=e.target.open;render();}},true);
root.addEventListener('input',e=>{
 if(DATE_FIELDS.has(e.target.id)){applyDateEdit(e.target,{typing:true});return;}

 if(e.target.id==='taskOwner'){state.taskOwnerSelf=false;const account=document.getElementById('taskOwnerAccount'),username=assignmentForOwner(e.target.value,state.user,state.taskDetail);if(account)account.textContent=username?'Conta: '+username:'Responsável informado por nome; nenhuma conta vinculada.';return;}
 if(!['searchInput','alertOwnerFilter'].includes(e.target.id))return;
 const id=e.target.id,cursor=e.target.selectionStart;
 if(id==='alertOwnerFilter'){state.alertOwner=e.target.value;state.page=1;}
 else{state.search=e.target.value;state.page=1;state.routeSelected='';state.driverSelected='';}
 if(textRenderTimer)clearTimeout(textRenderTimer);
 textRenderTimer=setTimeout(()=>{render();const input=document.getElementById(id);if(input){input.focus?.();if(typeof cursor==='number')input.setSelectionRange?.(cursor,cursor);}},160);
});
root.addEventListener('keydown',e=>{
 if(e.key==='Enter'&&DATE_FIELDS.has(e.target.id)){e.preventDefault();applyDateEdit(e.target,{enter:true});return;}

 const point=e.target?.closest?.('[data-chart-point]');
 if(point&&(e.key==='Enter'||e.key===' ')){e.preventDefault();activateChartPoint(point);}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&(state.selected||state.connect||state.taskSelected)){state.selected=null;state.connect=false;state.taskSelected=null;render();}});
function applyIncomingLink(link){
 remoteClient.reset();state.remoteSnapshot='';state.rvStage='';
 resetDateControls();
 identityEpoch++;comparisonSeq++;syncSeq++;clearViewCache();
 Object.assign(state,{dataset:state.token?emptyDataset():demo,selected:null,pendingRecord:'',tripFocus:'',drilldown:'',customer:'',vehicle:'',serviceType:'',search:'',status:'',filter:'todos',alertGroup:'',alertScope:'todos',alertDue:'todos',alertStatus:'todos',alertKind:'todos',alertPriority:'todos',alertOwner:'',comparison:null,comparisonLoading:false,comparisonError:'',loading:false,loadedRange:null,lastSync:null,syncMetadata:[],tasks:{},taskIndexLoaded:false,taskIndexLoading:false,taskIndexError:'',technicalOpen:false,page:1},link.state);
 if(!PUBLIC_DEMO){state.mode='live';state.dataset=emptyDataset();state.linkMessage=state.token?'Consulta compartilhada. Atualize os dados para ver os registros autorizados.':'Link compartilhado. Entre no portal e atualize os dados para consultar.';}
 sharedIntent=link;sharedLoginPending=!state.token&&link.hasLink;
 loadMetricPreferences();render();
}
async function copyPortalLink(record=''){
 const url=portalLink(window.location,state,{record});
 try{if(!globalThis.navigator?.clipboard?.writeText)throw Error('clipboard');await navigator.clipboard.writeText(url);state.linkMessage='Link copiado.';render();}
 catch{prompt('Copie o link da consulta (o destinatário precisará entrar no portal):',url);}
}
window.addEventListener?.('popstate',()=>applyIncomingLink(parsePortalLink(window.location)));
loadMetricPreferences();
if(sharedIntent.hasLink)applyIncomingLink(sharedIntent);else render();
// Nenhuma consulta automática ao abrir o portal.
