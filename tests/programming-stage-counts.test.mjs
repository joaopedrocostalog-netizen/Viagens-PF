import test from 'node:test';
import assert from 'node:assert/strict';
import {portalResponse} from '../api/portal-render.mjs';
import {permissionsFor} from '../api/access.mjs';
const user={username:'operador',displayName:'Operador',role:'operacional',permissions:permissionsFor('operacional')};
const range={from:'2026-10-01',to:'2026-10-26'};
// 40 RVs no período; apenas 3 começam em 26/10 (2 Escalado, 1 Viajando).
const trip=(i,date,status)=>({empresa:'CRC',rv_id:i,nro_rv:'RV-'+i,status_rv:status,tipo_rv:'RODO',cliente_nome:'C'+i,placa_veiculo:'P'+i,data_inicio:date,data_termino:date,cidade_inicial:'Santos',cidade_final:'SP',motorista_id:i,motorista_nome:'M'+i});
const viagens=[...Array.from({length:37},(_,i)=>trip(i+1,'05/10/2026',i%2?'Escalado':'Encerrado')),trip(101,'26/10/2026','Escalado'),trip(102,'26/10/2026','Escalado'),trip(103,'26/10/2026','Viajando')];
const snapshot={...range,payload:{updatedAt:'2026-10-26T10:00:00Z',data:{viagens,pedidos:[],sources:{viagens:true,pedidos:true,ctes:false,mdfes:false,ocorrencias:false,programacoes:false}}}};
const view=state=>portalResponse({action:'view',input:{state:{...range,view:'programacao',page:1,filter:'todos',dayDate:'2026-10-26',...state}},snapshot,user,company:'costalog',workflowStore:{get:async()=>({})}});
const count=(html,label)=>Number(html.match(new RegExp('data-related-rv-stage="'+label+'"[^>]*>[^<]*<span>(\\d+)</span>'))?.[1]);

test('Programação do dia: a barra de etapas conta só as RVs da data, igual à tabela',async()=>{
 const {html}=await view({});
 assert.equal(count(html,''),3,'Todas = viagens do dia, não do período inteiro');
 assert.equal(count(html,'Escalado'),2);assert.equal(count(html,'Viajando'),1);assert.equal(count(html,'Encerrado'),0);
 assert.match(html,/3 registros/);
});

test('Programação do dia: data fora do período carregado zera a barra',async()=>{
 const {html}=await view({dayDate:'2026-11-05'});
 assert.equal(count(html,''),0);
});
