import {rvStatus} from './rv-status.mjs';
import {normalizePrograms} from './programming-data.mjs';
import {companyIdentity} from './companies.mjs';
import {serviceTypeLabel} from './filtering.mjs';
/**
 * Mapeamento real DSS para as telas COSTALOG.
 * Formatos baseados nos esquemas enviados para listarViagens e listarPedidosFrete.
 * Não representa custos operacionais completos ou documentos MDF-e validados.
 */
const s=v=>v===null||v===undefined?'':String(v).trim();
const scopedId=(row,value)=>companyIdentity(row)?companyIdentity(row)+'~'+value:value;
const id=v=>v===0||v==='0'?'':s(v);
export function moneyNumber(v){
 if(v===undefined||v===null||v==='')return null;
 if(typeof v==='number')return Number.isFinite(v)?v:null;
 let str=s(v).replace(/[R$\s]/g,'');
 if(str.includes(',')&&str.includes('.'))str=str.replace(/\./g,'').replace(',','.');
 else if(str.includes(','))str=str.replace(',','.');
 const n=Number(str);return Number.isFinite(n)?n:null;
}
export function isoDate(v){
 const str=s(v);if(!str)return '';
 const pt=str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
 if(pt)return pt[3]+'-'+pt[2]+'-'+pt[1];
 if(/^\d{4}-\d{2}-\d{2}/.test(str))return str.slice(0,10);
 return '';
}
const meaningfulDocNum=v=>{const n=s(v);return n && !/^0+$/.test(n)&&n.toLowerCase()!=='null'?n:'';};
const docKey=v=>s(v).replace(/^0+(?=\d)/,'');
const validArray=v=>Array.isArray(v)?v:[];
const uniqueBy=(rows,keyFn)=>{
 const seen=new Set();return rows.filter(x=>{const k=keyFn(x);if(seen.has(k))return false;seen.add(k);return true;});
};
function mapViagem(v,i){
 const rvId=id(v.rv_id),numero=id(v.nro_rv);
 const abastecimento=moneyNumber(v.valor_total_abastecido);
 return {
  id:scopedId(v,rvId||('rv-index-'+i)),rvId,numero:numero||rvId||'—',
  data:isoDate(v.data_inicio),dataTermino:isoDate(v.data_termino),
  cliente:s(v.cliente_nome)||'Não informado',clienteDocumento:s(v.cliente_cnpjcpf),
  placa:s(v.placa_veiculo),origem:s(v.cidade_inicial),destino:s(v.cidade_final),
  status:rvStatus(v.status_rv),nroMdf:meaningfulDocNum(v.nro_mdf),
  kmPrevisto:moneyNumber(v.km_previsto),kmRodados:moneyNumber(v.total_km_rodados),
  abastecimento,custoAbastecimentoKm:Number.isFinite(abastecimento)&&moneyNumber(v.total_km_rodados)>0?abastecimento/moneyNumber(v.total_km_rodados):null,
  desvioKm:Number.isFinite(moneyNumber(v.total_km_rodados))&&Number.isFinite(moneyNumber(v.km_previsto))?moneyNumber(v.total_km_rodados)-moneyNumber(v.km_previsto):null,
  adiantamento:moneyNumber(v.valor_adiantamento_vf),
  proventos:moneyNumber(v.valor_proventos_vf),liquido:moneyNumber(v.valor_liquido_vf),
  custo:null,receita:null,pedidosVinculados:0,vinculoFinancas:'sem dados',tipoRv:s(v.tipo_rv),
  veiculoId:id(v.veiculo_id),motoristaId:id(v.motorista_id),motoristaNome:s(v.motorista_nome??v.nome_motorista??v.motorista?.nome),
  carreta1Id:id(v.carreta1_id),carreta2Id:id(v.carreta2_id),carreta3Id:id(v.carreta3_id),
  contratoVf:s(v.nro_contrato_vf),rotaMdf:s(v.rota_mdf),perfilCiot:s(v.perfil_ciot),
  solicitacaoMonitoramento:s(v.nro_solic_monitoramento),programacaoId:id(v.programacao_id),
  nroProgramacao:id(v.nro_programacao),rotaId:id(v.rota_id),empresa:typeof v.empresa==='object'?companyIdentity(v):s(v.empresa),
  clientePredominante:s(v.cliente_predominante),container:s(v.nro_container),
  proprietario:s(v.proprietario),statusPagamentoSaldo:s(v.status_pgto_saldo),
  dataPagamentoSaldo:isoDate(v.data_pgto_saldo),createdBy:s(v.created_by),createdOn:isoDate(v.created_on)
 };
}
function mapPedido(v,i){
 const pfId=id(v.pf_id),pedidoNum=id(v.nro_pf),cteNum=meaningfulDocNum(v.nro_cte);
 const mdfeNum=meaningfulDocNum(v.nro_mdf);
 return {
  id:scopedId(v,pfId||('pf-index-'+i)),pedidoNumero:pedidoNum,cteNumero:cteNum,
  numero:cteNum||pedidoNum||pfId||'—',data:isoDate(v.data_emissao),
  dataCte:isoDate(v.data_emissao_cte),cliente:s(v.cliente_nome)||'Não informado',
  placa:s(v.placa_veiculo),origem:s(v.cidade_origem),destino:s(v.cidade_destino),
  status:s(v.status_pedido)||'Não informado',
  rvReferencia:id(v.rv_viagem),viagemId:null,matchMethod:'',ambiguous:false,
  nroMdf:mdfeNum,valor:moneyNumber(v.total_frete),valorReceber:moneyNumber(v.valor_receber),
  tipoCte:s(v.tipo_cte),tipoDocumento:s(v.tipo_documento),isCte:!!cteNum,numeroPf:pedidoNum,
  veiculoId:id(v.veiculo_id),motoristaId:id(v.motorista_id),motoristaNome:s(v.motorista_nome??v.nome_motorista??v.motorista?.nome),
  motoristaCpf:s(v.motorista_cpf),operacaoTransporte:s(v.operacao_transporte),
  numeroFatura:s(v.nro_fatura),liberadoFaturamento:v.liberado_para_faturamento??null,
  entregaConcluida:v.entrega_concluida??null,comprovanteEntrega:v.comprovante_entrega??null,
  ocorrencia:s(v.ocorrencia),tipoServico:serviceTypeLabel(v.tipo_servico),freteMunicipal:v.frete_municipal??null,
  numeroAverbacao:s(v.nro_averbacao),valorAverbacao:moneyNumber(v.valor_averbacao),
  valorIcmsIss:moneyNumber(v.valor_icms_iss),freteSemIcms:moneyNumber(v.total_frete_sem_icms),
  numeroNfse:s(v.numero_nfse),processoId:id(v.processo_id),numeroProcesso:s(v.numero_processo),
  nroProgramacao:id(v.nro_programacao),programacaoId:id(v.programacao_id),
  empresa:typeof v.empresa==='object'?companyIdentity(v):s(v.empresa),remetente:s(v.remetente),destinatario:s(v.destinatario),
  container:s(v.nro_container),localColeta:s(v.local_coleta),
  produtoPredominante:s(v.produto_predominante),refCliente:s(v.nro_ref_cliente),
  valorMercadorias:moneyNumber(v.valor_mercadorias),numeroDocumento:s(v.nro_documento),
  statusFiscal:null
 };
}
function mapMdfe(v,i){
 const num=meaningfulDocNum(v.nro_mdf??v.numeroMDFe??v.numero??v.nroMDFe??v.nrMDFe);
 const rv=id(v.rv_id??v.viagemId??v.idViagem??v.rv_viagem);
 return {id:scopedId(v,num||('mdfe-index-'+i)),numero:num||'—',data:isoDate(v.data_emissao??v.data),
  viagemId:rv||null,placa:s(v.placa_veiculo??v.placa),status:s(v.status??v.situacao)||'Não informado',
  empresa:typeof v.empresa==='object'?companyIdentity(v):s(v.empresa),origem:'API de MDF-e',nroMdf:num};
}
function indexBy(rows,key){
 const map=new Map();
 for(const row of rows){const value=key(row);if(!value)continue;const k=docKey(value);if(!map.has(k))map.set(k,[]);map.get(k).push(row);}
 return map;
}
function unique(items){return [...new Set(items)];}
function reconcile(viagens,pedidos){
 const byId=indexBy(viagens,v=>v.rvId),byNum=indexBy(viagens,v=>v.numero),byMdfe=indexBy(viagens,v=>v.nroMdf);
 for(const p of pedidos){
  let found=[];
  if(p.rvReferencia)found=unique([...(byId.get(docKey(p.rvReferencia))||[]),...(byNum.get(docKey(p.rvReferencia))||[])]);
  // Referência RV presente porém não encontrada: NÃO presumir vínculo por placa ou MDF.
  else if(p.nroMdf)found=unique(byMdfe.get(docKey(p.nroMdf))||[]);
  const entity=companyIdentity(p);
  if(entity)found=found.filter(v=>!companyIdentity(v)||companyIdentity(v)===entity);
  if(found.length===1){p.viagemId=found[0].id;p.matchMethod=p.rvReferencia?'rv_viagem':'nro_mdf';}
  else if(found.length>1){p.ambiguous=true;p.matchMethod='ambíguo';}
 }
 const byTrip=indexBy(pedidos.filter(p=>p.viagemId),p=>p.viagemId);
 for(const v of viagens){
  const connected=byTrip.get(docKey(v.id))||[];
  const withValue=connected.filter(p=>p.valor!==null);
  // Receita exibida = soma de fretes de pedidos vinculados, NÃO faturamento confirmado.
  v.receita=withValue.length?withValue.reduce((acc,p)=>acc+p.valor,0):null;
  v.pedidosVinculados=connected.length;
  v.vinculoFinancas=withValue.length===connected.length&&connected.length?'completo':'parcial';
 }
}
function referencesMdfe(viagens,pedidos){
 const map=new Map();
 const add=(numero,viagemId,placa,data,empresa)=>{
  if(!numero)return;
  const key=companyIdentity({empresa})+'~'+docKey(numero);const found=map.get(key)||{id:'ref-'+key,empresa,numero,viagemId:null,placa:placa||'',data:data||'',status:'Referência no DSS (não validado)',origem:'Referência DSS',nroMdf:numero,ids:new Set()};
  if(viagemId)found.ids.add(viagemId);map.set(key,found);
 };
 for(const v of viagens)add(v.nroMdf,v.id,v.placa,v.data,v.empresa);
 for(const p of pedidos)add(p.nroMdf,p.viagemId,p.placa,p.data,p.empresa);
 return [...map.values()].map(r=>({...r,viagemId:r.ids.size===1?[...r.ids][0]:null,ambiguous:r.ids.size>1,ids:undefined}));
}
export function normalizeOverview(raw){
 const payload=raw?.data||raw||{};
 const viagens=uniqueBy(validArray(payload.viagens).map(mapViagem),v=>v.id);
 // Rotas DSS contêm distância PREVISTA. Nunca confundir com odômetro ou KM rodado.
 const routeById=new Map(validArray(payload.rotas).filter(r=>r.rota_id!=null&&String(r.rota_id)!=='0').map(r=>[String(r.rota_id),r]));
 for(const trip of viagens){
  if(trip.kmPrevisto!==null||!trip.rotaId)continue;
  const raw=routeById.get(trip.rotaId);
  const planned=moneyNumber(raw?.km_previsto_rota);
  if(planned!==null){trip.kmPrevisto=planned;trip.kmPrevistoFonte='Cadastro de rotas DSS';}
 }

 const pedidos=uniqueBy(validArray(payload.pedidos).map(mapPedido),p=>p.id);
 const ctesSeparate=validArray(payload.ctes).map((v,i)=>({...mapPedido(v,i),isCte:true}));
 const orderCteNumbers=new Set(pedidos.filter(p=>p.cteNumero).map(p=>companyIdentity(p)+'~'+docKey(p.cteNumero)));
 const uniqueCtes=ctesSeparate.filter(c=>!c.cteNumero||!orderCteNumbers.has(companyIdentity(c)+'~'+docKey(c.cteNumero)));
 reconcile(viagens,[...pedidos,...uniqueCtes]);
 // Evitar duplicidade se o CT-e também constar em listarPedidosFrete.
 const seenCte=new Set();
 const ctes=[...pedidos.filter(p=>p.isCte),...ctesSeparate].filter(p=>{
  const key=p.cteNumero?companyIdentity(p)+'~'+docKey(p.cteNumero):p.id;
  if(seenCte.has(key))return false;seenCte.add(key);return true;
 });
 const hasMdfeApi=!!payload.sources?.mdfes;
 const mdfes=hasMdfeApi?validArray(payload.mdfes).map(mapMdfe):referencesMdfe(viagens,pedidos);
 const tripIds=new Set(viagens.map(v=>v.id)),tripsById=indexBy(viagens,v=>v.rvId),tripsByNumber=indexBy(viagens,v=>v.numero);
 for(const doc of mdfes){
  if(!doc.viagemId||tripIds.has(doc.viagemId))continue;
  const matches=unique([...(tripsById.get(docKey(doc.viagemId))||[]),...(tripsByNumber.get(docKey(doc.viagemId))||[])]).filter(v=>!companyIdentity(doc)||companyIdentity(v)===companyIdentity(doc));
  doc.viagemId=matches.length===1?matches[0].id:null;
 }
 const ocorrencias=validArray(payload.ocorrencias).map(o=>({id:s(o.ocorrencia_id),empresa:o.empresa,rv_id:o.rv_id,nro_rv:o.nro_rv,pf_id:o.pf_id,nro_mdf:o.nro_mdf,data:isoDate(o.data_ocorrencia)||isoDate(o.data),descricao:s(o.descricao),placa:s(o.placa_veiculo),veiculoId:id(o.veiculo_id),tipo:s(o.ocorrencia_de),relato:s(o.relato),causa:s(o.causa_raiz),providencia:s(o.providencia_tomada),responsavel:s(o.responsavel_atendimento),envolvido:s(o.envolvido),status:s(o.status)}));
 const programacoes=normalizePrograms(validArray(payload.programacoes),viagens,pedidos);
 return {viagens,pedidos,ctes,mdfes,ocorrencias,programacoes,sources:{
  ...payload.sources,
  viagens:true,pedidos:true,ctes:true,mdfes:hasMdfeApi,mdfeReferences:!hasMdfeApi
 }};
}
export function costByClient(viagens,pedidos){
 const byClient=new Map();
 for(const p of pedidos){
  const k=p.cliente||'Não informado';
  const o=byClient.get(k)||{cliente:k,viagens:0,receita:0,custo:0,receitaN:0,custoN:0,pedidos:0,linked:new Set()};
  o.pedidos++;
  if(p.valor!==null){o.receita+=p.valor;o.receitaN++;}
  if(p.viagemId)o.linked.add(p.viagemId);
  byClient.set(k,o);
 }
 return [...byClient.values()].map(o=>({...o,viagens:o.linked.size})).sort((a,b)=>b.receita-a.receita);
}
