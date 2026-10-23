import test from 'node:test';
import assert from 'node:assert/strict';
import {OP_VIEWS} from '../src/access-ui.mjs';

test('Link passa pelo login e consulta manual; todas as abas têm uma busca e rodapé privado; comparativos consultam a empresa correta',async t=>{
 const events={},pageEvents={},storage=new Map(),calls=[],copied=[];
 const fields={loginUser:{value:'admin'},loginPassword:{value:'senha-teste'},searchInput:{focus(){},setSelectionRange(){}}};
 const root={innerHTML:'',addEventListener:(type,fn)=>events[type]=fn};
 globalThis.document={getElementById:id=>id==='app'?root:fields[id]||null,querySelector(){return null;},addEventListener(){}};
 const url=new URL('https://portal.exemplo/?empresa=ideallog&aba=viagens&registro=viagens:ideallog~7&de=2026-10-01&ate=2026-10-23');
 globalThis.window={location:{href:url.href,origin:url.origin,pathname:url.pathname,search:url.search,protocol:'https:',hostname:'portal.exemplo'},addEventListener:(type,fn)=>pageEvents[type]=fn};
 globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
 globalThis.alert=message=>{throw Error('Alerta inesperado: '+message);};globalThis.prompt=()=>null;
 const previousNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async text=>copied.push(text)}}});
 t.after(()=>{if(previousNavigator)Object.defineProperty(globalThis,'navigator',previousNavigator);else delete globalThis.navigator;});
 const reply=body=>({ok:true,status:200,json:async()=>body});
 globalThis.fetch=async input=>{
  const uri=new URL(input);calls.push(uri);
  if(uri.pathname==='/api/login')return reply({token:'SEGREDO-DA-SESSAO',user:{username:'admin',role:'administrador'},permissions:{operacional:true,financeiro:false,admin:true}});
  if(uri.pathname==='/api/workflow')return reply({tasks:{}});
  if(uri.pathname==='/api/logout')return reply({});
  return reply({data:{viagens:[{empresa:'Ideallog',rv_id:7,nro_rv:77,data_inicio:'01/10/2026',status_rv:'Em andamento',cliente_nome:'IDEAL AUTORIZADO',placa_veiculo:'ABC-1234'},{empresa:'CRC',rv_id:7,nro_rv:77,data_inicio:'01/10/2026',cliente_nome:'NÃO EXIBIR COSTALOG'}],pedidos:[{empresa:'Ideallog',pf_id:1,nro_pf:'PF-IDEAL',data_emissao:'01/10/2026',rv_viagem:77}],sources:{pedidos:true,programacoes:false}},quality:{sources:[{name:'programacoes',status:'unavailable'}],periods:[{...Object.fromEntries(uri.searchParams),syncedAt:'2026-10-22T12:00:00Z'}]}});
 };
 const click=(selector,dataset)=>events.click({target:{closest:key=>key===selector?{dataset}:null}});
 const change=(id,value)=>events.change({target:{id,value,dataset:{}}});
 const tick=()=>new Promise(resolve=>setTimeout(resolve,30));
 await import('../src/app.js?layout-links=1');
 assert.equal(calls.length,0);assert(root.innerHTML.includes('Entre no portal'));assert(!root.innerHTML.includes('IDEAL AUTORIZADO'));assert(!root.innerHTML.includes('data-quality-summary'));
 click('[data-action]',{action:'connect'});events.submit({target:{id:'loginForm'},preventDefault(){}});await tick();
 assert.equal(calls.filter(url=>url.pathname==='/api/overview').length,0,'Login não deve iniciar uma consulta DSS');assert(root.innerHTML.includes('id="from" type="date" max='));
 click('[data-action]',{action:'refresh'});await tick();
 assert(root.innerHTML.includes('Detalhes · 77'));assert(root.innerHTML.includes('IDEAL AUTORIZADO'));assert(!root.innerHTML.includes('NÃO EXIBIR COSTALOG'));
 click('[data-action]',{action:'share-record'});await tick();assert(copied[0].includes('registro=viagens%3Aideallog%7E7'));assert(!copied[0].includes('SEGREDO'));assert(copied[0].includes('empresa=ideallog'));
 click('[data-action]',{action:'close'});
 for(const view of OP_VIEWS){
  click('[data-nav]',{nav:view});
  assert.equal((root.innerHTML.match(/type="search"/g)||[]).length,1,view);
  assert.equal((root.innerHTML.match(/id="advancedFilters"/g)||[]).length,1,view);
  assert.equal((root.innerHTML.match(/id="technicalInfo"/g)||[]).length,1,view);
  assert(!root.innerHTML.includes('data-quality-summary'),view+' deve iniciar com os diagnósticos fechados');
  const table=root.innerHTML.indexOf('<table');if(table>=0)assert(root.innerHTML.indexOf('id="advancedFilters"')<table,view);
  assert(root.innerHTML.indexOf('id="technicalInfo"')<root.innerHTML.indexOf('<footer'));
 }
 click('[data-nav]',{nav:'viagens'});events.toggle({target:{id:'technicalInfo',open:true}});
 assert(root.innerHTML.includes('data-quality-summary'));assert(root.innerHTML.indexOf('id="technicalInfo"')>root.innerHTML.lastIndexOf('</table>'));
 events.toggle({target:{id:'technicalInfo',open:false}});assert(!root.innerHTML.includes('data-quality-summary'));
 events.toggle({target:{id:'advancedFilters',open:true}});assert(root.innerHTML.includes('recordStatusFilter'));
 change('filterClient','IDEAL AUTORIZADO');assert(root.innerHTML.includes('id="advancedFilters" class="v-extra-filters" open'));
 click('[data-nav]',{nav:'comparativos'});change('compareCurrentFrom','2026-10-01');change('compareCurrentTo','2026-10-23');change('comparePreviousFrom','2026-10-01');change('comparePreviousTo','2026-10-23');
 const before=calls.filter(url=>url.pathname==='/api/overview').length;
 click('[data-ins-action]',{insAction:'load-comparison'});await tick();assert.equal(calls.filter(url=>url.pathname==='/api/overview').length,before,'Período já carregado deve ser reutilizado');
 change('comparePreviousFrom','2026-08-01');change('comparePreviousTo','2026-09-30');click('[data-ins-action]',{insAction:'load-comparison'});await tick();
 const comparisonCalls=calls.filter(url=>url.pathname==='/api/overview').slice(before);assert.equal(comparisonCalls.length,2);assert(comparisonCalls.every(url=>url.searchParams.get('company')==='ideallog'&&!url.searchParams.has('refresh')));
 assert(root.innerHTML.includes('KM informados'));assert(!root.innerHTML.includes('Fretes informados'));
 click('[data-action]',{action:'logout'});assert(!root.innerHTML.includes('id="technicalInfo"'));assert(!root.innerHTML.includes('IDEAL AUTORIZADO'));
 assert.equal(typeof pageEvents.popstate,'function');
});
