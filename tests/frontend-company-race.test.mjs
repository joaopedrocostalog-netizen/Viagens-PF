import test from 'node:test';
import assert from 'node:assert/strict';

test('Resposta antiga de Costalog não substitui a Ideallog depois da troca',async(t)=>{
 const events={},storage=new Map(),fields={loginUser:{value:'operador'},loginPassword:{value:'senha-teste'}};
 const root={innerHTML:'',addEventListener:(type,callback)=>events[type]=callback};
 globalThis.document={getElementById:id=>id==='app'?root:fields[id]||null,querySelector(){return null;},addEventListener(){}};
 globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
 globalThis.window={location:{protocol:'file:',origin:'https://teste.local'}};
 const reply=data=>({ok:true,status:200,json:async()=>data});
 let finishCostalog;
 t.after(()=>finishCostalog?.());
 globalThis.fetch=async input=>{
  const url=new URL(input);
  if(url.pathname==='/api/login')return reply({token:'token-teste',user:{username:'operador',role:'operacional'},permissions:{operacional:true,financeiro:false,admin:false}});
  const data={viagens:[{empresa:url.searchParams.get('company'),rv_id:1,nro_rv:1,data_inicio:'01/10/2026',cliente_nome:url.searchParams.get('company')==='ideallog'?'CLIENTE IDEAL ATIVO':'CLIENTE COSTA ANTIGO'}],pedidos:[]};
  if(url.searchParams.get('company')==='costalog')return new Promise(resolve=>finishCostalog=()=>resolve(reply({data})));
  return reply({data});
 };
 const click=(selector,dataset)=>events.click({target:{closest:name=>name===selector?{dataset}:null}});
 const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
 await import('../src/app.js?company-race=1');
 click('[data-action]',{action:'connect'});
 events.submit({target:{id:'loginForm'},preventDefault(){}});await tick();
 events.change({target:{id:'from',value:'2026-10-01',dataset:{}}});
 events.change({target:{id:'to',value:'2026-10-22',dataset:{}}});
 click('[data-action]',{action:'refresh'});await tick();
 assert.equal(typeof finishCostalog,'function');
 click('[data-action]',{action:'switch-company'});await tick();
 // Conferir a lista visível; filtros fechados não pré-carregam opções de clientes.
 click('[data-nav]',{nav:'viagens'});
 assert(root.innerHTML.includes('CLIENTE IDEAL ATIVO'));
 finishCostalog();await tick();
 assert(root.innerHTML.includes('CLIENTE IDEAL ATIVO'));
 assert(!root.innerHTML.includes('CLIENTE COSTA ANTIGO'));
 assert(root.innerHTML.includes('Trocar para Costalog'));
});
