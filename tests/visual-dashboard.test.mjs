import test from 'node:test';
import assert from 'node:assert/strict';
import {renderSummary,renderCharts,renderHero,renderTripsHeader,renderReportsHeader,timelineGroups,lineGraph} from '../src/visual-dashboard.mjs';
const data={
 viagens:[
  {id:'1',numero:'101',tipoRv:'RODO',data:'2026-10-14',status:'Em viagem',cliente:'Cliente A',placa:'ABC1234',origem:'Santos',destino:'Campinas',kmRodados:200,abastecimento:350},
  {id:'2',numero:'102',tipoRv:'LS',data:'2026-10-14',status:'Concluída',cliente:'Cliente B',placa:'XYZ9876',origem:'Santos',destino:'São Paulo',kmRodados:100,abastecimento:150},
  {id:'3',numero:'103',tipoRv:'RODO',data:'2026-10-15',status:'Aguardando início',cliente:'Cliente A',placa:'ABC1234',origem:'Santos',destino:'Campinas',kmRodados:null,abastecimento:null}],
 pedidos:[
  {id:'a',numero:'PF9',pedidoNumero:'PF9',isCte:true,data:'2026-10-14',cliente:'Cliente A',valor:3500,viagemId:'1',entregaConcluida:true,comprovanteEntrega:true},
  {id:'b',numero:'PF10',pedidoNumero:'PF10',isCte:false,data:'2026-10-15',cliente:'Cliente B',valor:1600,viagemId:null,entregaConcluida:false,comprovanteEntrega:false}
 ],
 mdfes:[{numero:'777',data:'2026-10-14',status:'Referência no DSS (não validado)'}],
 sources:{viagens:true,pedidos:true,ctes:true,mdfes:false}
};
const cfg={from:'2026-10-01',to:'2026-10-31',interval:'diario',mode:'live'};
test('Status e categoria gera matriz RODO/LS a partir de registros DSS sem inventar tipo',()=>{
 const html=renderSummary(data,{...cfg,financeiro:false});
 assert(html.includes('STATUS &amp; CATEGORIA'));
 assert(html.includes('RODO'));
 assert(html.includes('LS'));
 assert(html.includes('EM VIAGEM'));
 assert(html.includes('CONCLUÍDAS'));
 assert(html.includes('ALERTAS &amp; PENDÊNCIAS'));
 assert(!html.includes('R$ 5.100,00'),'Operação não exibe soma financeira');
});
test('Financeiro pode ver total de fretes, mas não rotula como recebimento',()=>{
 const html=renderSummary(data,{...cfg,financeiro:true});
 assert(html.includes('VALOR DOS FRETES'));
 assert(html.includes('5.100,00'));
 assert(html.includes('não recebido'));
});
test('Gráficos usam período diário/semanal/mensal e dados reais de viagens/pedidos',()=>{
 const day=timelineGroups(data,'diario'),week=timelineGroups(data,'semanal'),month=timelineGroups(data,'mensal');
 assert.equal(day.length,2);
 assert.equal(day[0].viagens,2);
 assert.equal(day[0].pedidos,1);
 assert.equal(week.reduce((n,r)=>n+r.viagens,0),3);
 assert.equal(month.length,1);
 assert.equal(month[0].fretes,5100);
 const html=renderCharts(data,{...cfg,financeiro:false});
 assert(html.includes('EVOLUÇÃO OPERACIONAL'));
 assert(html.includes('DISTRIBUIÇÃO POR STATUS'));
 assert(html.includes('ROTAS MAIS FREQUENTES'));
 assert(html.includes('VIAGENS POR CLIENTE'));
 assert(html.includes('data-chart-interval="diario"'));
 assert(html.includes('<svg'));
 assert(!html.includes('FRETES POR CLIENTE'));
});
test('Relatórios e telas vazias continuam utilizáveis sem dados',()=>{
 const none={viagens:[],pedidos:[],ctes:[],mdfes:[],sources:{}};
 assert(renderHero('painel',none,cfg).includes('DEMONSTRAÇÃO')===false);
 assert(renderTripsHeader(none).includes('TOTAL DE VIAGENS'));
 assert(renderReportsHeader(none,{...cfg,financeiro:false}).includes('HISTÓRICO DE VIAGENS'));
 assert(lineGraph([]).includes('Selecione um período'));
});


test('Gráficos de linha possuem áreas interativas com datas, valores e foco pelo teclado',()=>{
 const html=lineGraph([{label:'2026-10-14',viagens:7},{label:'2026-10-15',viagens:12}]);
 assert(html.includes('data-chart-point="line"'));
 assert(html.includes('data-chart-index="0"'));
 assert(html.includes('data-chart-index="1"'));
 assert(html.includes('aria-label="14/10/2026 · Viagens: 7"'));
 assert(html.includes('aria-label="15/10/2026 · Viagens: 12"'));
 assert(html.includes('class="v-line-crosshair"'));
 assert(html.includes('class="v-line-popup"'));
 assert(html.includes('tabindex="0"'));
 assert(html.includes('pointer-events="none"'));
});
test('Gráficos de rosca e barras mostram tooltip em hover, foco e toque',()=>{
 const html=renderCharts(data,{...cfg,financeiro:false});
 assert(html.includes('data-chart-point="donut"'),'Fatias acessíveis');
 assert(html.includes('data-chart-point="legend"'),'Legenda com detalhes');
 assert(html.includes('class="v-donut-tooltip"'),'Tooltip das fatias');
 assert(html.includes('data-chart-point="bar"'),'Barras acessíveis');
 assert(html.includes('class="v-bar-tooltip"'),'Tooltip das barras');
 assert(html.includes('role="button"'),'Operáveis por toque e teclado');
 assert(!html.includes('FRETES POR CLIENTE'));
 assert(!html.includes('R$ 3.500,00'),'Tooltip operacional não contém frete');
 const financial=renderCharts(data,{...cfg,financeiro:true});
 assert(financial.includes('FRETES POR CLIENTE'));
 assert(financial.includes('R$'));
});
test('Tooltip escapa categorias externas para prevenir injeção HTML',()=>{
 const malicious={...data,viagens:[{...data.viagens[0],status:'<script>alert(1)</script>',cliente:'<img src=x onerror=alert(1)>',origem:'<b>Origem</b>'}]};
 const html=renderCharts(malicious,{...cfg,financeiro:false});
 assert(!html.includes('<script>'));
 assert(!html.includes('<img src=x'));
 assert(!html.includes('<b>Origem</b>'));
 assert(html.includes('&lt;img')||html.includes('&lt;b&gt;'));
});
test('Gráficos com dados vazios ou somente uma categoria não exibem NaN e mantêm interatividade',()=>{
 const emptyData={viagens:[],pedidos:[],mdfes:[],ctes:[]};
 const html=renderCharts(emptyData,{...cfg,financeiro:false});
 assert(html.includes('Sem registros'));
 const justOne={...data,viagens:[data.viagens[0]],pedidos:[]};
 const one=renderCharts(justOne,{...cfg,financeiro:false});
 assert(one.includes('data-chart-point="donut"'));
 assert(!one.includes('NaN'));
 assert(!one.includes('undefined'));
});
