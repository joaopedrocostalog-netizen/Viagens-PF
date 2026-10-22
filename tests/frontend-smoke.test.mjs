import test from 'node:test';
import assert from 'node:assert/strict';
test('Portal abre no painel e mantém relatórios e abas operacionais',async()=>{
 const listeners={};
 const root={innerHTML:'',addEventListener(name,fn){listeners[name]=fn;}};
 const storage=new Map();
 globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 globalThis.document={getElementById:id=>id==='app'?root:null,addEventListener(){}};
 globalThis.window={location:{protocol:'file:'}};
 await import('../src/app.js?smoke=1');
 assert(root.innerHTML.includes('COSTALOG'));
 assert(root.innerHTML.includes('STATUS &amp; CATEGORIA'));
 assert(root.innerHTML.includes('data-nav="relatorios"'));
 assert(root.innerHTML.includes('data-nav="ctes"'));
 assert(root.innerHTML.includes('v-matrix'));
 assert(!root.innerHTML.includes('data-nav="graficos"'));
 for(const view of ['graficos','pendencias','rotas','veiculos','motoristas','containers','faturamento','analises','administracao','relatorios','viagens','ctes','clientes','mdfes','integracoes']){
  listeners.click({target:{closest(selector){return selector==='[data-nav]'?{dataset:{nav:view}}:null;}}});
  assert(root.innerHTML.includes('GESTÃO DE VIAGENS & FRETES'),'sem cabeçalho na página '+view);
  assert(!root.innerHTML.includes('undefinedundefined'),'concatenação suspeita em '+view);
 }
});
