import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePortalApi} from '../src/site-config.mjs';
test('GitHub Pages aceita administrador temporário, troca senha e gerencia usuários DEMO sem API',async(t)=>{
 if(!resolvePortalApi({hostname:'joaopedrocostalog-netizen.github.io',origin:'https://joaopedrocostalog-netizen.github.io'}).demoOnly)return t.skip('Modo de demonstração desativado pelo backend configurado.');
 const db=new Map(),events={},fields={
  loginUser:{value:'admin'},loginPassword:{value:'CL-cwfK6_CoN6lKAUZeM5sPnsE'},
  currentPortalPassword:{value:'CL-cwfK6_CoN6lKAUZeM5sPnsE'},
  newPortalPassword:{value:'SenhaPessoal-Que-Vou-Trocar-2026!'},
  confirmPortalPassword:{value:'SenhaPessoal-Que-Vou-Trocar-2026!'},
  adminNewName:{value:'Funcionário Teste'},adminNewUsername:{value:'funcionario.teste'},
  adminNewRole:{value:'financeiro'},adminNewPassword:{value:'provisoria-funcionario-2026'}
 };
 let networkCalls=0;
 globalThis.localStorage={getItem:k=>db.get(k)||null,setItem:(k,v)=>db.set(k,v),removeItem:k=>db.delete(k)};
 globalThis.window={location:{hostname:'joaopedrocostalog-netizen.github.io',protocol:'https:',origin:'https://joaopedrocostalog-netizen.github.io'}};
 const app={innerHTML:'',addEventListener:(type,fn)=>events[type]=fn};
 globalThis.document={getElementById:k=>k==='app'?app:fields[k]||null,addEventListener(){},visibilityState:'visible'};
 globalThis.fetch=()=>{networkCalls++;throw Error('Não deve chamar API no GitHub Pages');};
 globalThis.alert=()=>{};globalThis.confirm=()=>true;
 const tick=()=>new Promise(r=>setTimeout(r,170));
 await import('../src/app.js?github-pages-demo=1');
 assert(!app.innerHTML.includes('data-nav="integracoes"'));
 assert(!app.innerHTML.includes('data-action="refresh"'));
 const click=(key,value)=>events.click({target:{closest:selector=>selector===key?{dataset:value}:null}});
 const submit=id=>events.submit({target:{id},preventDefault(){}});
 click('[data-action]',{action:'connect'});
 assert(!app.innerHTML.includes('id="apiUrl"'));
 submit('loginForm');await tick();
 assert(app.innerHTML.includes('Defina sua senha pessoal'),'Deve forçar troca de senha.');
 assert(!app.innerHTML.includes('data-nav="faturamento"'));
 submit('forcePasswordChange');await tick();
 fields.loginPassword.value='SenhaPessoal-Que-Vou-Trocar-2026!';
 submit('loginForm');await tick();
 click('[data-nav]',{nav:'administracao'});await tick();
 assert(!app.innerHTML.includes('Cadastrar funcionário'));
 assert(!app.innerHTML.includes('data-nav="administracao"'));
 assert.equal(networkCalls,0,'Demonstração nunca acessa API');
});
