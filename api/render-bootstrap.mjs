/** Inicialização exclusiva para testes no Render Free (sem disco persistente).
 * A senha fica em variável de ambiente privada; nunca imprimir, salvar no Git ou criar endpoint público.
 * Nunca reescrever contas existentes, inclusive se a senha do ambiente for alterada.
 */
import {existsSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {passwordHash,writeUsers} from './auth.mjs';

export function bootstrapTemporaryAdmin(env=process.env){
 if(env.RENDER_FREE_BOOTSTRAP!=='true')return {created:false,reason:'disabled'};
 const filepath=env.PORTAL_USERS_FILE;
 if(!filepath||!resolve(filepath).startsWith('/'))throw Error('PORTAL_USERS_FILE deve ser um caminho absoluto privado no Render.');
 // Os exemplos usam /tmp, mas não aceitamos repositórios nem arquivos estáticos.
 const path=resolve(filepath);
 if(!path.startsWith('/tmp/')&&!path.startsWith('/var/tmp/'))throw Error('No modo Render Free, PORTAL_USERS_FILE deve apontar para /tmp/ ou /var/tmp/.');
 if(existsSync(path))return {created:false,reason:'exists'};
 const username=String(env.RENDER_FREE_ADMIN_USERNAME||'admin').toLowerCase().trim();
 if(!/^[a-z0-9._-]{3,60}$/.test(username))throw Error('RENDER_FREE_ADMIN_USERNAME inválido.');
 const secret=env.RENDER_FREE_ADMIN_PASSWORD;
 if(typeof secret!=='string'||secret.length<16||secret.length>256)throw Error('RENDER_FREE_ADMIN_PASSWORD deve ter entre 16 e 256 caracteres.');
 if(!/[a-z]/i.test(secret)||!/[0-9]/.test(secret))throw Error('Senha temporária deve conter letras e números.');
 mkdirSync(dirname(path),{recursive:true,mode:0o700});
 const hashed=passwordHash(secret);
 writeUsers(path,[{username,name:'Administrador temporário (Render Free)',role:'administrador',...hashed,disabled:false,mustChangePassword:true}]);
 return {created:true,reason:'created'};
}

if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 try{
  const result=bootstrapTemporaryAdmin();
  console.log('[bootstrap] Conta de teste:',result.created?'criada':'não criada ('+result.reason+')');
 }catch(err){
  console.error('[bootstrap] Falha na preparação do administrador temporário:',err.message);
  process.exitCode=1;
 }
}
