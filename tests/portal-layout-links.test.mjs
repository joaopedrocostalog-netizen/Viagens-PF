import test from 'node:test';
import assert from 'node:assert/strict';
import {renderDataQuality} from '../src/data-quality.mjs';
import {projectOverview} from '../api/access.mjs';
import {portalLink,parsePortalLink} from '../src/portal-links.mjs';
import {normalizeOverview} from '../src/dss-mapping.mjs';
import {dayTrips,dailyStatus} from '../src/programming-data.mjs';
import {renderDayProgramming} from '../src/programming.mjs';
import {createAlertPager} from '../src/operational.mjs';
import {mobileTables} from '../src/mobile-tables.mjs';
import {renderGrid} from '../src/advanced-ui.mjs';
import {renderComparison} from '../src/intelligence-ui.mjs';
const range={from:'2026-10-01',to:'2026-10-23'};

test('Diagnósticos exigem permissão no servidor e no rodapé; fechado não calcula nem insere conteúdo',()=>{
 const raw={quality:{sources:[{name:'ocorrencias',status:'unavailable'}]},data:{viagens:[],pedidos:[]}};
 for(const role of ['operacional','financeiro'])assert(!Object.hasOwn(projectOverview(raw,role),'quality'));
 assert.deepEqual(projectOverview(raw,'administrador').quality,raw.quality);
 const data={get viagens(){throw Error('Não calcular rodapé fechado');}};
 const state={...range,company:'costalog',role:'administrador',user:{username:'admin'},permissions:{admin:true}};
 const closed=renderDataQuality(state,data);assert(closed.includes('id="technicalInfo"'));assert(!closed.includes('quality-sources'));assert(!closed.includes('data-quality-summary'));
 assert.equal(renderDataQuality({...state,role:'operacional'},data),'');
 assert.equal(renderDataQuality({...state,permissions:{admin:false}},data),'');
 const opened=renderDataQuality({...state,technicalOpen:true,syncMetadata:[raw.quality]},raw.data);assert(opened.includes('Indisponível'));assert(opened.includes('data-quality-summary'));
});

test('Links usam somente filtros autorizados, validam datas e namespace e nunca incluem sessão ou dados',()=>{
 const state={...range,company:'costalog',legalEntity:'crc',view:'viagens',search:'João ABC1D23',tripFocus:'crc~7',token:'SEGREDO',apiUrl:'https://privado',tasks:{segredo:1},dataset:{cpf:'PESSOAL'}};
 const url=portalLink('https://exemplo/portal/?token=SEGREDO#privado',state,{record:'viagens:crc~7'});
 assert(!/SEGREDO|PESSOAL|privado|tasks|dataset|token/.test(url));
 const result=parsePortalLink(url);assert(result.hasLink);assert.equal(result.state.pendingRecord,'viagens:crc~7');assert.equal(result.state.legalEntity,'crc');assert.equal(result.state.search,state.search);
 const bad=parsePortalLink('https://exemplo/?empresa=ideallog&entidade=crc&aba=administracao&registro=viagens:crc~7&foco=crc~7&de=2026-02-31&ate=2026-10-23&permissao=admin');
 assert.equal(bad.state.view,'painel');assert(!bad.state.pendingRecord);assert(!bad.state.tripFocus);assert(!bad.state.from);assert.equal(bad.state.legalEntity,'');
 assert(!portalLink('https://exemplo/',state,{record:'viagens:comex~7'}).includes('registro='));
});

test('Programação preserva empresa, não presume saída a partir da emissão e não une RVs homônimas',()=>{
 const data=normalizeOverview({data:{viagens:[{empresa:'CRC',rv_id:7,nro_rv:100,programacao_id:9,data_inicio:'22/10/2026',status_rv:'Em andamento'},{empresa:'Comex',rv_id:7,nro_rv:100,programacao_id:9,data_inicio:'22/10/2026'}],pedidos:[],programacoes:[{empresa:'CRC',programacao_id:9,nro_programacao:300,rv_id:7,data_emissao:'23/10/2026',total_frete_pedido_frete:987654},{empresa:'Comex',programacao_id:9,rv_id:7,data_emissao:'23/10/2026'},{programacao_id:10,rv_id:7,data_emissao:'23/10/2026'}],sources:{programacoes:true}}});
 assert.equal(data.programacoes.length,3);assert.equal(data.programacoes[0].viagemId,'crc~7');assert.equal(data.programacoes[1].viagemId,'comex~7');assert.equal(data.programacoes[2].viagemId,null);assert(!JSON.stringify(data.programacoes).includes('987654'));
 const rows=[{id:'a',data:'2026-10-22',status:'Em andamento'},{id:'b',data:'2026-10-22',dataTermino:'2026-10-22',status:'Concluída'},{id:'c',data:'2026-10-20',dataTermino:'2026-10-23',status:'Concluída'},{id:'d',data:'2026-10-23',status:'Planejada'}];
 assert.deepEqual(dayTrips({viagens:rows},'2026-10-23').map(row=>row.id),['a','c','d']);assert.equal(dailyStatus(rows[3]),'Planejadas');
 const state={...range,dayDate:'2026-10-23',mode:'live',loadedRange:range,page:1};
 const closed=renderDayProgramming(data,state);assert(!closed.includes('programa-9'));assert(closed.includes('Programações emitidas na data'));
 const opened=renderDayProgramming(data,{...state,dayProgramsOpen:true});assert(opened.includes('A saída prevista não foi informada'));
 assert(renderDayProgramming({...data,sources:{programacoes:false}},{...state,dayProgramsOpen:true}).includes('não estão disponíveis'));
});

test('Grupos de pendências paginam referências e só montam nomes dos 25 grupos abertos',()=>{
 let reads=0;const trips=Array.from({length:61},(_,i)=>({id:'crc~'+i,get numero(){reads++;return 'RV-'+i;},data:'2026-10-23',status:'Concluída',dataTermino:'2026-10-23'}));
 const pager=createAlertPager({viagens:trips,pedidos:[],sources:{pedidos:true}},{asOf:'2026-10-23'});assert.equal(reads,0);
 const page=pager.getPage({grouped:true,page:2});assert.equal(page.groups.length,25);assert.equal(page.groupTotal,61);assert.equal(page.pages,3);assert.equal(reads,25);assert.equal(page.rows.length,0);
 reads=0;const alerts=pager.getPage({group:page.groups[0].id});assert.equal(alerts.total,1);assert.equal(alerts.rows.length,1);assert.equal(reads,1);
 const separate=createAlertPager({viagens:[{id:'crc~1',numero:'1',data:'2026-10-23'},{id:'comex~1',numero:'1',data:'2026-10-23'}],pedidos:[{id:'crc~p',pedidoNumero:'P1',viagemId:'crc~1',data:'2026-10-23',isCte:false},{id:'comex~p',pedidoNumero:'P2',viagemId:'comex~1',data:'2026-10-23',isCte:false}]},{asOf:'2026-10-23'}).getPage({grouped:true});
 assert.deepEqual(new Set(separate.groups.map(g=>g.id)),new Set(['rv:crc~1','rv:comex~1']));
});

test('Celular mantém ações e detalhes somente das linhas da página atual',()=>{
 let reads=0;const rows=Array.from({length:61},(_,i)=>({id:'r'+i,numero:'RV-'+i,placa:'ABC-1234',status:'Concluída',get cliente(){reads++;return 'Cliente '+i;},data:'2026-10-23'}));
 const html=mobileTables(renderGrid('RVs',rows,[{key:'numero',label:'RV',detail:'viagens'},{key:'placa',label:'Placa'},{key:'status',label:'Situação'},{key:'cliente',label:'Cliente'},{key:'data',label:'Início'}],{page:2,sortKey:'numero',sortDir:'asc'},'viagens'));
 assert.equal(reads,25);assert.equal((html.match(/data-mobile-row /g)||[]).length,25);assert(html.includes('data-mobile-primary="false"'));assert.equal((html.match(/data-detail=/g)||[]).length,25);assert(!html.includes('data-detail="viagens:r0"'));
});

test('Comparativos reaplicam empresa interna e pesquisa nos dois períodos',()=>{
 const trip=(id,empresa,cliente)=>({id,empresa,data:'2026-10-01',cliente,kmRodados:5});
 // 37 RVs CRC/Alfa entram; 962 de Comex/Outra (999 no total) nunca podem aparecer.
 const current={viagens:[...Array.from({length:37},(_,i)=>trip('crc~a'+i,'CRC','Alfa')),...Array.from({length:962},(_,i)=>trip('comex~'+i,'Comex','Outra'))],pedidos:[]};
 const previous={viagens:[{id:'crc~2',empresa:'CRC',data:'2026-09-01',cliente:'Alfa',kmRodados:20}],pedidos:[]};
 const state={company:'costalog',legalEntity:'crc',mode:'live',permissions:{financeiro:false},search:'Alfa',compareCurrentFrom:'2026-10-01',compareCurrentTo:'2026-10-23',comparePreviousFrom:'2026-09-01',comparePreviousTo:'2026-09-30',comparison:{company:'costalog',current,previous,currentRange:range,previousRange:{from:'2026-09-01',to:'2026-09-30'}}};
 const html=renderComparison({},state);assert(html.includes('37'));assert(!html.includes('999'));assert(!html.includes('RVs com KM'));
 assert(!renderComparison({},{...state,company:'ideallog'}).includes('1 RVs com KM no A'));
});
