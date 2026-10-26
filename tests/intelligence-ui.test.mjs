import test from 'node:test';
import assert from 'node:assert/strict';
import {renderGlobalSearch,renderCustomDashboard,renderCustomerProfiles,renderDriverRouteDetails,renderAlertsHub,renderComparison,sortedMetricRows} from '../src/intelligence-ui.mjs';
const d={viagens:[
{id:'rv7',numero:'720',cliente:'Cliente Alfa',origem:'Santos',destino:'Campinas',placa:'ABC-1234',data:'2026-10-14',status:'Concluída',motoristaId:'11',kmRodados:100,kmPrevisto:95},
{id:'rv8',numero:'721',cliente:'Cliente Alfa',origem:'Santos',destino:'Campinas',placa:'DEF-1234',data:'2026-10-15',status:'Em andamento',motoristaId:'11',kmRodados:null}],
pedidos:[{id:'p1',numero:'PF10',pedidoNumero:'PF10',cteNumero:'1000',isCte:true,cliente:'Cliente Alfa',placa:'ABC-1234',data:'2026-10-14',motoristaId:'11',motoristaNome:'Motorista Teste',valor:1400,viagemId:'rv7',entregaConcluida:true,comprovanteEntrega:false}],
mdfes:[],sources:{viagens:true,pedidos:true,ctes:true,mdfes:false}};
const state=(financial=false)=>({permissions:{financeiro:financial},role:financial?'financeiro':'operacional',user:{username:'teste'},metricLayout:null,showMetricOptions:false,search:'Alfa',clientSelected:'',routeSelected:'',driverSelected:'',alertPriority:'todos',alertKind:'todos',compareInterval:'mensal',compareAnchor:'2026-10-16',compareCurrentFrom:'2026-10-01',compareCurrentTo:'2026-10-16',comparePreviousFrom:'2026-09-01',comparePreviousTo:'2026-09-30',to:'2026-10-31',mode:'demo',dataset:d,lateDays:2});
test('Busca global gera resultados clicáveis, sem perfis de cliente para operacional',()=>{
 const op=renderGlobalSearch(state(false),d),fin=renderGlobalSearch(state(true),d);
 assert(op.includes('data-search-result="viagens:rv7"'));
 assert(!op.includes('data-search-result="clientes:Cliente Alfa"'));
 assert(!fin.includes('data-search-result="clientes:Cliente Alfa"'));
 assert(!fin.includes('data-search-result="mdfes:'));
});
test('Painel personalizado respeita ordem, botão de mover e campos financeiros',()=>{
 const st=state(false);st.metricLayout=['pedidos','viagens','fretes'];st.showMetricOptions=true;
 const html=renderCustomDashboard(d,st);
 const grid=html.split('class="ins-metric-grid"')[1]||'';
 assert(grid.indexOf('Pedidos de frete')<grid.indexOf('Viagens'));
 assert(html.includes('data-metric-toggle="viagens"'));
 assert(!html.includes('data-metric-toggle="fretes"'));
 const manager=renderCustomDashboard(d,{...st,permissions:{financeiro:true},metricLayout:['fretes','viagens']});
 assert(manager.includes('data-metric-toggle="fretes"'));
 assert(manager.includes('R$'));
});
test('Perfil de clientes expõe fretes somente a usuário autorizado e mostra históricos',()=>{
 assert(!renderCustomerProfiles(d,state(false)).includes('1400'));
 const html=renderCustomerProfiles(d,state(true));
 assert(html.includes('data-client-open="Cliente Alfa"'));
 const profile=renderCustomerProfiles(d,{...state(true),clientSelected:'Cliente Alfa'});
 assert(profile.includes('data-profile-detail="viagens:rv7"'));
 assert(profile.includes('data-profile-detail="ctes:p1"'));
 assert(profile.includes('1.400,00'));
});
test('Rotas e motoristas contam volumes conhecidos e retornam estados vazios sem dados',()=>{
 const route=renderDriverRouteDetails(d,state(false),'rotas');
 const driver=renderDriverRouteDetails(d,state(false),'motoristas');
 assert(route.includes('data-route-open="Santos → Campinas"'));
 assert(driver.includes('data-driver-open="11"'));
 assert(!driver.includes('1.400,00'));
 assert(renderDriverRouteDetails({viagens:[],pedidos:[]},state(false),'motoristas').includes('Sem registros'));
});
test('Central de alertas possui tipos/filtros e ação para abrir registro',()=>{
 const html=renderAlertsHub(d,state(false));
 assert(html.includes('data-alert-detail="ctes:p1"'));
 assert(html.includes('alertKindFilter'));
 assert(html.includes('comprovante'));
});
test('Comparativo preserva dados fictícios separados e não exibe fretes operacionais',()=>{
 const html=renderComparison(d,state(false));
 assert(html.includes('COMPARATIVO DE PERÍODOS'));
 assert(html.includes('compareCurrentFrom'));
 assert(html.includes('compareCurrentTo'));
 assert(html.includes('comparePreviousFrom'));
 assert(html.includes('comparePreviousTo'));
 assert(!html.includes('data-compare-interval'));
 assert(html.includes('Viagens'));
 assert(!html.includes('Fretes informados'));
 const financial=renderComparison(d,state(true));
 assert(!financial.includes('Fretes informados'));
});

test('Ordenação de motoristas e rotas funciona por maior número de CT-e e KM, sem colocar ausentes em primeiro',()=>{
 const rows=[{name:'A',ctes:2,km:50},{name:'B',ctes:8,km:null},{name:'C',ctes:4,km:100}];
 assert.deepEqual(sortedMetricRows(rows,'ctes','desc').map(x=>x.name),['B','C','A']);
 assert.deepEqual(sortedMetricRows(rows,'ctes','asc').map(x=>x.name),['A','C','B']);
 assert.deepEqual(sortedMetricRows(rows,'km','desc').map(x=>x.name),['C','A','B']);
 const markup=renderDriverRouteDetails(d,{...state(false),tableSort:{motoristas:{key:'ctes',direction:'desc'}}},'motoristas');
 assert(markup.includes('data-sort-metric="motoristas:ctes"'));
 assert(!markup.includes('data-sort-metric="motoristas:km"'),'coluna de KM oculta enquanto a DSS não informa');
 assert(!markup.includes('KM médio'));
 assert(markup.includes('data-sort-metric="motoristas:orders"'));
});
