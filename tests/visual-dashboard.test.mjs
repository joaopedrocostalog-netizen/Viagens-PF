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
 assert(html.includes('STATUS & CATEGORIA'));
 assert(html.includes('RODO'));
 assert(html.includes('LS'));
 assert(html.includes('Em viagem'));
 assert(html.includes('Concluídas'));
 assert(html.includes('ALERTAS & PENDÊNCIAS'));
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
 assert(lineGraph([]).includes('Sem registros'));
});
