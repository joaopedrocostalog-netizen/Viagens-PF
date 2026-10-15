import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOverview,isoDate,moneyNumber,costByClient} from '../src/dss-mapping.mjs';

const rv=(patch={})=>({
 rv_id:345,nro_rv:905,tipo_rv:'Viagem',cliente_nome:'Cliente A',cliente_cnpjcpf:'123',
 cidade_inicial:'Santos',cidade_final:'Campinas',status_rv:'Encerrada',
 data_inicio:'10/10/2026',data_termino:'11/10/2026',placa_veiculo:'ABC-1234',
 nro_mdf:'12345',total_km_rodados:300,valor_total_abastecido:123.45,
 valor_adiantamento_vf:100,valor_proventos_vf:200,valor_liquido_vf:100,
 ...patch
});
const pf=(patch={})=>({
 pf_id:712,nro_pf:'PF001',nro_cte:2003,data_emissao:'11/10/2026',
 cliente_nome:'Cliente A',nro_mdf:'12345',rv_viagem:905,
 total_frete:1800.45,valor_receber:1600.44,status_pedido:'Faturado',
 ...patch
});
const payload=(v=[],p=[],other={})=>({data:{viagens:v,pedidos:p,ctes:[],mdfes:[],sources:{viagens:true,pedidos:true,ctes:false,mdfes:false},...other}});

test('datas brasileiras e valores monetários são normalizados sem perder zeros',()=>{
 assert.equal(isoDate('15/10/2026 09:30'),'2026-10-15');
 assert.equal(isoDate('2026-10-15T05:00:00Z'),'2026-10-15');
 assert.equal(moneyNumber('1.456,70'),1456.7);
 assert.equal(moneyNumber(0),0);
 assert.equal(moneyNumber(null),null);
});

test('rv_viagem relaciona nro_rv e preserva nro_cte',()=>{
 const d=normalizeOverview(payload([rv()],[pf()]));
 assert.equal(d.viagens[0].id,'345');
 assert.equal(d.viagens[0].numero,'905');
 assert.equal(d.viagens[0].data,'2026-10-10');
 assert.equal(d.ctes[0].numero,'2003');
 assert.equal(d.ctes[0].viagemId,'345');
 assert.equal(d.ctes[0].matchMethod,'rv_viagem');
 assert.equal(d.viagens[0].receita,1800.45);
 assert.equal(d.viagens[0].abastecimento,123.45);
 assert.equal(d.viagens[0].custo,null);
 assert.equal(d.sources.mdfes,false);
 assert.equal(d.mdfes[0].numero,'12345');
 assert.equal(d.mdfes[0].status,'Referência no DSS (não validado)');
});

test('rv_viagem aceita também o rv_id',()=>{
 const d=normalizeOverview(payload([rv()],[pf({rv_viagem:345})]));
 assert.equal(d.pedidos[0].viagemId,'345');
});

test('nro_cte 0 não é CT-e e nro_pf mantém o pedido',()=>{
 const d=normalizeOverview(payload([rv()],[pf({nro_cte:0,nro_pf:'PF002'})]));
 assert.equal(d.ctes.length,0);
 assert.equal(d.pedidos[0].numero,'PF002');
 assert.equal(d.pedidos[0].isCte,false);
});

test('RV ausente não é conciliada apenas por placa ou por MDF-e se referência RV foi informada',()=>{
 const d=normalizeOverview(payload([rv()],[pf({rv_viagem:100001,placa_veiculo:'ABC-1234'})]));
 assert.equal(d.pedidos[0].viagemId,null);
 assert.equal(d.pedidos[0].rvReferencia,'100001');
 assert.equal(d.viagens[0].receita,null);
});

test('nro_mdf único permite conciliação de referência sem rv_viagem explícita',()=>{
 const d=normalizeOverview(payload([rv()],[pf({rv_viagem:0})]));
 assert.equal(d.pedidos[0].viagemId,'345');
 assert.equal(d.pedidos[0].matchMethod,'nro_mdf');
});

test('nro_mdf duplicado em diferentes viagens é ambíguo',()=>{
 const d=normalizeOverview(payload([rv(),rv({rv_id:346,nro_rv:906})],[pf({rv_viagem:0})]));
 assert.equal(d.pedidos[0].viagemId,null);
 assert.equal(d.pedidos[0].ambiguous,true);
 assert.equal(d.mdfes[0].ambiguous,true);
});

test('valores por cliente são pedidos, sem simular custo completo',()=>{
 const d=normalizeOverview(payload([rv()],[pf(),pf({pf_id:713,nro_cte:2004,total_frete:200})]));
 const c=costByClient(d.viagens,d.pedidos);
 assert.equal(c.length,1);
 assert.equal(c[0].pedidos,2);
 assert.equal(c[0].viagens,1);
 assert.equal(c[0].receita,2000.45);
 assert.equal(c[0].custoN,0);
 assert.equal(d.viagens[0].custo,null);
});

test('sem registros é diferente de falha e permite listas vazias',()=>{
 const d=normalizeOverview(payload([],[]));
 assert.equal(d.viagens.length,0);
 assert.equal(d.ctes.length,0);
 assert.equal(d.mdfes.length,0);
 assert.equal(d.sources.ctes,true);
});

test('pedidos repetidos com mesmo pf_id não duplicam frete',()=>{
 const d=normalizeOverview(payload([rv()],[pf(),pf()]));
 assert.equal(d.pedidos.length,1);
 assert.equal(d.viagens[0].receita,1800.45);
});
