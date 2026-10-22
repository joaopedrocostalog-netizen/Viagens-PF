import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOverview} from '../src/dss-mapping.mjs';
import {buildInsights,makeAlerts,monthsOverview,extractRows,sortRecords,REPORT_TYPES} from '../src/operational.mjs';
const rv=(id,n,patch={})=>({rv_id:id,nro_rv:n,cliente_nome:'Cliente Exemplo',cidade_inicial:'Santos',cidade_final:'Campinas',status_rv:'Encerrada',data_inicio:'02/10/2026',data_termino:'03/10/2026',placa_veiculo:'ABC-1234',nro_mdf:'6500',km_previsto:300,total_km_rodados:320,valor_total_abastecido:490,motorista_id:500,veiculo_id:901,nro_container:'CONT123',...patch});
const pf=(id,patch={})=>({pf_id:id,nro_pf:'PF'+id,nro_cte:0,rv_viagem:700,cliente_nome:'Cliente Exemplo',data_emissao:'02/10/2026',total_frete:2000,valor_receber:1900,liberado_para_faturamento:true,nro_fatura:'',entrega_concluida:true,comprovante_entrega:false,placa_veiculo:'ABC-1234',motorista_id:500,motorista_nome:'Motorista Exemplo',nro_container:'CONT123',nro_mdf:'6500',tipo_servico:'Rodoviário',nro_averbacao:'AVER22',valor_averbacao:15.2,...patch});
const data=()=>normalizeOverview({data:{viagens:[rv(700,900)],pedidos:[pf(70),pf(71,{nro_cte:1234,comprovante_entrega:true,nro_fatura:'FAT-14'})],ctes:[],mdfes:[],sources:{viagens:true,pedidos:true,ctes:false,mdfes:false}}});
test('Mapeamento financeiro, entrega e documentos preserva campos reais do DSS',()=>{
 const d=data();
 assert.equal(d.viagens[0].motoristaId,'500');
 assert.equal(d.viagens[0].container,'CONT123');
 assert.equal(d.pedidos[0].entregaConcluida,true);
 assert.equal(d.pedidos[0].comprovanteEntrega,false);
 assert.equal(d.pedidos[0].liberadoFaturamento,true);
 assert.equal(d.pedidos[0].valorAverbacao,15.2);
 assert.equal(d.pedidos[1].cteNumero,'1234');
});
test('Painel usa valor total_frete sem presumir lucro',()=>{
 const d=data(),i=buildInsights({...d,allViagens:d.viagens},{year:2026});
 assert.equal(i.totals.trips,1);
 assert.equal(i.totals.orders,2);
 assert.equal(i.totals.ctes,1);
 assert.equal(i.totals.withoutCT,1);
 assert.equal(i.totals.freight.sum,4000);
 assert.equal(i.totals.fuel.sum,490);
 assert.equal(i.totals.kmDifference,20);
 assert.equal(i.totals.withoutInvoice,1);
 assert.equal(i.totals.missingDelivery,1);
 assert.equal(i.totals.insured,2);
 assert.equal(i.totals.averbacao.sum,30.4);
 assert.equal(i.containers.length,1);
 assert.equal(i.customers.length,1);
 assert.equal(i.customers[0].ticket,2000);
 assert.equal(i.routes[0].name,'Santos → Campinas');
 assert.equal(i.vehicles[0].name,'ABC-1234');
 assert.equal(i.drivers[0].orders,2);
});
test('Alertas por ausência de CT-e e comprovante dependem de dados explícitos',()=>{
 const d=data(),alerts=makeAlerts({...d,allViagens:d.viagens});
 assert(alerts.some(a=>a.type==='cte_pendente'&&a.recordId==='70'));
 assert(alerts.some(a=>a.type==='comprovante_pendente'&&a.recordId==='70'));
 assert(alerts.some(a=>a.type==='sem_fatura'&&a.recordId==='70'));
 assert(!alerts.some(a=>a.type==='comprovante_pendente'&&a.recordId==='71'));
});
test('Sem comprovante DESCONHECIDO (null) não é igual a sem comprovante (false)',()=>{
 const d=normalizeOverview({data:{viagens:[rv(700,900)],pedidos:[pf(70,{comprovante_entrega:null})]}});
 const a=makeAlerts({...d,allViagens:d.viagens});
 assert(!a.some(x=>x.type==='comprovante_pendente'));
});
test('Agregação mensal separa datas de RV e PF',()=>{
 const d=data(),m=monthsOverview(d.viagens,d.pedidos,2026);
 assert.equal(m.length,12);
 assert.equal(m[9].trips,1);
 assert.equal(m[9].orders,2);
 assert.equal(m[9].freight,4000);
 assert.equal(m[9].fuel,490);
});
test('Relatórios compatíveis usam campos públicos existentes e preservam ausência',()=>{
 const d=data();
 assert.equal(REPORT_TYPES.length,13);
 for(const type of REPORT_TYPES){
  const r=extractRows(type,{...d,allViagens:d.viagens});
  assert(r.columns.length>=3,'sem colunas: '+type);
  assert(Array.isArray(r.rows),'sem linhas: '+type);
 }
 const order=extractRows('pedidos',d);
 assert(order.columns.some(c=>c[0]==='entregaConcluida'));
 assert(order.columns.some(c=>c[0]==='numeroFatura'));
 assert.equal(sortRecords([{data:'2026-10-01'},{data:'2026-10-10'}],'data','desc')[0].data,'2026-10-10');
});
