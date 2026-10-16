import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

test('logo PNG do repositório está publicada e substitui o C antigo',()=>{
 const app=readFileSync('src/app.js','utf8');
 const workflow=readFileSync('.github/workflows/pages.yml','utf8');
 const image='logo-costalog-sem-fundo-1024x876.png';
 assert(existsSync(image),'Arquivo de logo original precisa existir na raiz');
 assert(app.includes('src="./'+image+'"'),'Cabeçalho principal deve usar o PNG original');
 assert(!app.includes('<div class="brand-emblem">C</div>'),'Não pode manter o C antigo');
 assert(workflow.includes('cp index.html styles.css '+image+' public_site/'),'GitHub Pages deve copiar o PNG');
});

test('backend não usa credenciais Basic Auth no frontend e usa servidor protegido',()=>{
 const api=readFileSync('api/server.mjs','utf8');
 const app=readFileSync('src/app.js','utf8');
 assert(api.includes("Buffer.from(env.DSS_USERNAME+':'+env.DSS_PASSWORD"));
 assert(api.includes('dssCredentialsReady()'));
 assert(app.includes('Authorization'));
 assert(!app.includes('DSS_PASSWORD'));
 assert(!app.includes('DSS_USERNAME'));
});
