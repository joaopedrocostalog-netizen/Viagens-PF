import test from 'node:test';
import assert from 'node:assert/strict';
import {serviceTypeLabel,filterOperationalData} from '../src/filtering.mjs';
import {operationalFilters} from '../src/advanced-ui.mjs';

test('Tipo de serviço da DSS aparece com grafia correta, sem mudar o significado',()=>{
 assert.equal(serviceTypeLabel('normal'),'Normal');
 assert.equal(serviceTypeLabel('subcontratacao'),'Subcontratação');
 assert.equal(serviceTypeLabel('vinculado a multimodal'),'Vinculado a multimodal');
 assert.equal(serviceTypeLabel('Rodoviário'),'Rodoviário');
 assert.equal(serviceTypeLabel(''),'');
});

test('Filtro salvo com o valor antigo da DSS continua encontrando os pedidos',()=>{
 const data={viagens:[],pedidos:[{id:'a',data:'2026-10-05',tipoServico:'Subcontratação'}],ctes:[],mdfes:[],ocorrencias:[]};
 assert.equal(filterOperationalData(data,{serviceType:'subcontratacao'}).pedidos.length,1);
 assert.equal(filterOperationalData(data,{serviceType:'Subcontratação'}).pedidos.length,1);
});

test('Vínculo usa o mesmo formato de rótulo dos outros filtros avançados',()=>{
 const html=operationalFilters({viagens:[],pedidos:[{tipoServico:'Normal'}]},{view:'viagens',filter:'todos'});
 assert.match(html,/<label class="filter grow filter-compact"><span>Vínculo<\/span><select id="statusFilter" class="control full">/);
 assert.match(html,/<span>Tipo de serviço<\/span>/);
});
