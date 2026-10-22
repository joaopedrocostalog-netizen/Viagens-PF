import test from 'node:test';
import assert from 'node:assert/strict';
import {projectOverview,permissionsFor,canView} from '../api/access.mjs';
const raw={mode:'live',data:{viagens:[{
 rv_id:7,nro_rv:77,placa_veiculo:'ABC1D23',cliente_nome:'Empresa Teste',valor_total_abastecido:1200,valor_adiantamento_vf:300,
 valor_liquido_vf:400,motorista_id:6,cliente_cnpjcpf:'11111111111',extra_secreta:'sigilo'}],
 pedidos:[{pf_id:1,nro_cte:90,nro_pf:'PF1',total_frete:9999,valor_receber:7000,valor_icms_iss:100,
 nr_fatura:'FAT-7',nro_fatura:'FAT-7',liberado_para_faturamento:true,entrega_concluida:true,
 comprovante_entrega:false,motorista_cpf:'22222222222',cliente_nome:'Empresa Teste',rv_viagem:7}],
 ctes:[],mdfes:[],sources:{viagens:true,pedidos:true,ctes:true,mdfes:false}}};
test('RBAC operacional não entrega custo, receita, faturamento ou CPF nem campo arbitrário',()=>{
 const response=projectOverview(raw,'operacional');
 assert.equal(response.permissions.financeiro,false);
 assert.equal(response.data.viagens[0].nro_rv,77);
 assert.equal(response.data.viagens[0].valor_total_abastecido,undefined);
 assert.equal(response.data.pedidos[0].entrega_concluida,true);
 for(const secret of ['1200','300','400','9999','7000','FAT-7','11111111111','22222222222','sigilo']){
  assert(!JSON.stringify(response).includes(secret),'dado sensível retornou ao Operacional: '+secret);
 }
});
test('Perfis financeiro e administrador também recebem somente dados operacionais',()=>{
 for(const role of ['financeiro','administrador']){
 const response=projectOverview(raw,role);
 assert.equal(response.data.viagens[0].valor_total_abastecido,undefined);
 assert.equal(response.data.pedidos[0].total_frete,undefined);
 assert.equal(response.data.pedidos[0].motorista_cpf,undefined);
 assert.equal(canView('financeiro','administracao'),false);
 assert.equal(canView(role,'faturamento'),false);
 assert.equal(response.permissions.financeiro,false);
 }
});
test('Sem role válida não existe projeção',()=>{
 assert.equal(permissionsFor(''),null);
 assert.throws(()=>projectOverview(raw,'invalido'));
 assert.equal(canView('operacional','faturamento'),false);
 assert.equal(canView('operacional','entregas'),true);
});

test('Programações não vazam total de frete e navegação mantém operações sem administração',()=>{
 for(const role of ['operacional','financeiro','administrador']){
  const response=projectOverview({data:{programacoes:[{pf_id:8,nro_rv:77,total_frete_pedido_frete:9999}]}},role);
  assert.deepEqual(response.data.programacoes,[{nro_rv:77,pf_id:8}]);
  for(const view of ['painel','clientes','faturamento','analises','relatorios','administracao'])assert.equal(canView(role,view),false);
  for(const view of ['viagens','ctes','entregas','pendencias','rotas','veiculos','motoristas','mdfes','ocorrencias'])assert.equal(canView(role,view),true);
 }
});
