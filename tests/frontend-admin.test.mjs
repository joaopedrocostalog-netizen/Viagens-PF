import test from 'node:test';
import assert from 'node:assert/strict';

function fakeBrowser(){
 const store=new Map(),events={},fields={
  apiUrl:{value:'https://api.interno.exemplo'},
  loginUser:{value:'admin'},loginPassword:{value:'senha-local-de-teste-2026'},
  adminNewName:{value:'Funcionário Financeiro'},
  adminNewUsername:{value:'financeiro02'},adminNewRole:{value:'financeiro'},
  adminNewPassword:{value:'provisoria-super-forte-2026'}
 };
 const root={innerHTML:'',addEventListener(name,cb){events[name]=cb;}};
 globalThis.document={getElementById(id){return id==='app'?root:fields[id]||null;},addEventListener(){},visibilityState:'visible'};
 globalThis.localStorage={getItem:key=>store.get(key)||null,setItem:(key,val)=>store.set(key,val),removeItem:key=>store.delete(key)};
 globalThis.window={location:{protocol:'file:'}};
 globalThis.alert=()=>{};globalThis.confirm=()=>true;
 return {events,fields,root};
}
const tick=()=>new Promise(r=>setTimeout(r,40));
test('Admin vê cadastro de funcionários e cria usuário com acesso Financeiro sem precisar alterar o GitHub',async()=>{
 const {events,root}=fakeBrowser();const calls=[];let accounts=[{username:'admin',name:'Admin',role:'administrador',disabled:false}];
 globalThis.fetch=async(url,options={})=>{
  const target=String(url);calls.push({url:target,method:options.method||'GET',body:options.body});
  const ok=(status,data)=>({ok:status<400,status,async json(){return data;}});
  if(target.endsWith('/api/login'))return ok(200,{token:'token-privado',user:{username:'admin',displayName:'Admin',role:'administrador'},permissions:{operacional:true,financeiro:true,admin:true}});
  if(target.includes('/api/overview'))return ok(200,{data:{viagens:[],pedidos:[],ctes:[],mdfes:[],sources:{viagens:true,pedidos:true,ctes:true,mdfes:false}},updatedAt:'2026-10-15T19:00:00Z'});
  if(target.endsWith('/api/users')&&options.method==='POST'){
   const user=JSON.parse(options.body);
   assert.equal(user.role,'financeiro');
   assert.equal(user.username,'financeiro02');
   assert.equal(user.password,'provisoria-super-forte-2026');
   accounts.push({...user,disabled:false,mustChangePassword:true});
   return ok(201,{user});
  }
  if(target.endsWith('/api/users'))return ok(200,{users:accounts.map(({password,...a})=>a)});
  if(target.includes('/api/logout'))return ok(200,{ok:true});
  return ok(404,{error:'não encontrado'});
 };
 await import('../src/app.js?admin-ui-test=1');
 events.click({target:{closest:(name)=>name==='[data-action]'?{dataset:{action:'connect'}}:null}});
 events.submit({target:{id:'loginForm'},preventDefault(){}});
 await tick();await tick();
 events.click({target:{closest:(name)=>name==='[data-nav]'?{dataset:{nav:'administracao'}}:null}});
 await tick();
 assert(root.innerHTML.includes('Cadastrar funcionário'));
 assert(root.innerHTML.includes('Financeiro — acesso ao faturamento'));
 assert(root.innerHTML.includes('adminNewUsername'));
 events.submit({target:{id:'createPortalUser'},preventDefault(){}});
 await tick();await tick();
 assert(calls.some(x=>x.url.endsWith('/api/users')&&x.method==='POST'));
 assert(root.innerHTML.includes('financeiro02'));
 assert(!root.innerHTML.includes('provisoria-super-forte-2026'),'senha não pode ficar no HTML após criação');
});
test('Usuário com senha provisória não consulta dados reais antes de alterá-la',async()=>{
 const {events,fields,root}=fakeBrowser();
 let overviews=0,changed=0;
 fields.loginUser.value='financeiro02';
 fields.currentPortalPassword={value:'temporaria123456'};
 fields.newPortalPassword={value:'nova-senha-pessoal-2026'};
 fields.confirmPortalPassword={value:'nova-senha-pessoal-2026'};
 globalThis.fetch=async(url,options={})=>{
  const path=String(url);
  const reply=data=>({ok:true,status:200,async json(){return data;}});
  if(path.includes('/api/login'))return reply({token:'token-provisorio',user:{username:'financeiro02',role:'financeiro',mustChangePassword:true},permissions:{operacional:true,financeiro:true,admin:false}});
  if(path.includes('/api/overview')){overviews++;return reply({});}
  if(path.includes('/api/change-password')){changed++;assert.equal(options.method,'POST');return reply({ok:true});}
  return reply({ok:true});
 };
 await import('../src/app.js?temporary-ui-test=2');
 events.click({target:{closest:name=>name==='[data-action]'?{dataset:{action:'connect'}}:null}});
 events.submit({target:{id:'loginForm'},preventDefault(){}});
 await tick();
 assert(root.innerHTML.includes('Defina sua senha pessoal'));
 assert.equal(overviews,0);
 events.submit({target:{id:'forcePasswordChange'},preventDefault(){}});
 await tick();
 assert.equal(changed,1);
 assert(root.innerHTML.includes('loginUser'));
 assert.equal(overviews,0);
});
