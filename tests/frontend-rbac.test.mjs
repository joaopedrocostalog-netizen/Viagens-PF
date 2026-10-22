import test from 'node:test';
import assert from 'node:assert/strict';
test('Todos os perfis veem somente viagens/PF; detalhes e respostas antigas não expõem finanças',async()=>{
 const storage=new Map(),events={};
 const root={innerHTML:'',addEventListener(type,fn){events[type]=fn;}};
 const fields={
 apiUrl:{value:'https://api.exemplo.local'},
 loginUser:{value:'funcionario'},
 loginPassword:{value:'senha-de-exemplo'}
 };
 globalThis.localStorage={getItem:x=>storage.get(x)||null,setItem:(x,v)=>storage.set(x,v),removeItem:x=>storage.delete(x)};
 globalThis.document={getElementById:id=>id==='app'?root:fields[id]||null,addEventListener(){},querySelector(){return null;},visibilityState:'visible'};
 globalThis.window={location:{protocol:'file:',origin:'https://api.exemplo.local'}};
 globalThis.alert=()=>{};globalThis.confirm=()=>true;
 let activeRole='operacional';
 const user=()=>({username:activeRole,displayName:'Usuário Teste',role:activeRole});
 const permissions=()=>({operacional:true,financeiro:activeRole!=='operacional',admin:activeRole==='administrador'});
 globalThis.fetch=async url=>{
  const route=String(url);
  return {ok:true,status:200,async json(){
   if(route.includes('/api/login'))return {token:'teste-'+activeRole,user:user(),permissions:permissions()};
   if(route.includes('/api/overview'))return {mode:'live',updatedAt:new Date().toISOString(),role:activeRole,permissions:permissions(),
    data:{viagens:[{rv_id:10,nro_rv:123,data_inicio:'01/10/2026',cliente_nome:'CLIENTE OPERACIONAL',valor_total_abastecido:98765}],pedidos:[1,2].map(id=>({pf_id:id,nro_pf:'PF-TESTE-'+id,nro_cte:44,data_emissao:'01/10/2026',rv_viagem:123,cliente_nome:'CLIENTE OPERACIONAL',total_frete:87654,nro_fatura:'FAT-PRIVADA',liberado_para_faturamento:true})),ctes:[],mdfes:[],sources:{viagens:true,pedidos:true,ctes:true,mdfes:false}}};
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
 assert(!root.innerHTML.includes('data-nav="entregas"'));
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
 assert(!root.innerHTML.includes('data-nav="faturamento"'));
 assert(!root.innerHTML.includes('data-nav="clientes"'));
 assert(!root.innerHTML.includes('data-nav="administracao"'));
 click('[data-action]',{action:'logout'});
 activeRole='administrador';
 click('[data-action]',{action:'connect'});
 events.submit({target:{id:'loginForm'},preventDefault(){}});
 await wait();
 assert(root.innerHTML.includes('data-nav="administracao"'));
 assert(!root.innerHTML.includes('data-nav="integracoes"'),'A aba de integração deve estar oculta enquanto a API estiver desativada.');
 click('[data-nav]',{nav:'ctes'});
 events.change({target:{id:'from',value:'2026-10-01',dataset:{}}});
 events.change({target:{id:'to',value:'2026-10-22',dataset:{}}});
 click('[data-action]',{action:'refresh'});
 await wait();
 for(const pf of ['PF-TESTE-1','PF-TESTE-2'])assert(root.innerHTML.includes(pf),'Não pode perder PFs que compartilham CT-e');
 for(const field of ['Valor frete','Valor a receber','Liberado faturamento','Nº fatura','FAT-PRIVADA','87654'])assert(!root.innerHTML.includes(field),field);
 click('[data-detail]',{detail:'ctes:1'});
 assert(root.innerHTML.includes('Detalhes ·'));
 assert(root.innerHTML.includes('PF-TESTE-1'));
 for(const field of ['numeroFatura','liberadoFaturamento','valorReceber','FAT-PRIVADA','87654'])assert(!root.innerHTML.includes(field),field);
 click('[data-action]',{action:'close'});
 click('[data-nav]',{nav:'viagens'});
 click('[data-detail]',{detail:'viagens:10'});
 assert(root.innerHTML.includes('Detalhes · 123'));
 for(const field of ['Abastecimento (R$)','receita','98765'])assert(!root.innerHTML.includes(field),field);

});
