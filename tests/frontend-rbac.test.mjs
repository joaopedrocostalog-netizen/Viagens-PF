import test from 'node:test';
import assert from 'node:assert/strict';
test('Cada funcionário vê somente abas permitidas após login; logout esconde faturamento',async()=>{
 const storage=new Map(),events={};
 const root={innerHTML:'',addEventListener(type,fn){events[type]=fn;}};
 const fields={
 apiUrl:{value:'https://api.exemplo.local'},
 loginUser:{value:'funcionario'},
 loginPassword:{value:'senha-de-exemplo'}
 };
 globalThis.localStorage={getItem:x=>storage.get(x)||null,setItem:(x,v)=>storage.set(x,v),removeItem:x=>storage.delete(x)};
 globalThis.document={getElementById:id=>id==='app'?root:fields[id]||null,addEventListener(){},visibilityState:'visible'};
 globalThis.window={location:{protocol:'file:'}};
 let activeRole='operacional';
 const user=()=>({username:activeRole,displayName:'Usuário Teste',role:activeRole});
 const permissions=()=>({operacional:true,financeiro:activeRole!=='operacional',admin:activeRole==='administrador'});
 globalThis.fetch=async url=>{
  const route=String(url);
  return {ok:true,status:200,async json(){
   if(route.includes('/api/login'))return {token:'teste-'+activeRole,user:user(),permissions:permissions()};
   if(route.includes('/api/overview'))return {mode:'live',updatedAt:new Date().toISOString(),role:activeRole,permissions:permissions(),
    data:{viagens:[],pedidos:[],ctes:[],mdfes:[],sources:{viagens:true,pedidos:true,ctes:true,mdfes:false}}};
   return {ok:true};
  }};
 };
 await import('../src/app.js?role-smoke=1');
 const click=(selector,value)=>events.click({target:{closest:key=>key===selector?{dataset:value}:null}});
 const wait=()=>new Promise(resolve=>setTimeout(resolve,30));
 click('[data-action]',{action:'connect'});
 events.submit({target:{id:'loginForm'},preventDefault(){}});
 await wait();
 assert(root.innerHTML.includes('operacional'),'Deve identificar o perfil operacional');
 assert(root.innerHTML.includes('data-nav="viagens"'));
 assert(root.innerHTML.includes('data-nav="entregas"'));
 assert(!root.innerHTML.includes('data-nav="faturamento"'));
 assert(!root.innerHTML.includes('data-nav="clientes"'));
 assert(!root.innerHTML.includes('data-nav="administracao"'));
 click('[data-nav]',{nav:'faturamento'});
 assert(!root.innerHTML.includes('Controle de entrega e faturamento'));
 click('[data-nav]',{nav:'relatorios'});
 assert(!root.innerHTML.includes('option value="clientes"'));
 click('[data-action]',{action:'logout'});
 await wait();
 assert(!root.innerHTML.includes('data-nav="faturamento"'));
 activeRole='financeiro';
 click('[data-action]',{action:'connect'});
 events.submit({target:{id:'loginForm'},preventDefault(){}});
 await wait();
 assert(root.innerHTML.includes('data-nav="faturamento"'));
 assert(root.innerHTML.includes('data-nav="clientes"'));
 assert(!root.innerHTML.includes('data-nav="administracao"'));
 click('[data-action]',{action:'logout'});
 activeRole='administrador';
 click('[data-action]',{action:'connect'});
 events.submit({target:{id:'loginForm'},preventDefault(){}});
 await wait();
 assert(root.innerHTML.includes('data-nav="administracao"'));
 assert(root.innerHTML.includes('data-nav="integracoes"'));
});
