/** Autenticação individual do portal (não confundir com Basic Auth DSS). Node.js >=20. */
import {readFileSync,existsSync,writeFileSync,chmodSync} from 'node:fs';
import {scryptSync,randomBytes,timingSafeEqual} from 'node:crypto';
import {permissionsFor} from './access.mjs';
export const USERS_PATH=process.env.PORTAL_USERS_FILE||'';
export function configuredUsers(){
 if(!USERS_PATH)return false;
 if(!existsSync(USERS_PATH))throw Error('PORTAL_USERS_FILE configurado mas arquivo inexistente. Acesso bloqueado.');
 return true;
}
export function readUsers(filepath=USERS_PATH){
 if(!filepath)throw Error('PORTAL_USERS_FILE ausente');
 const value=JSON.parse(readFileSync(filepath,'utf8'));
 if(!Array.isArray(value.users))throw Error('Formato do arquivo de usuários inválido');
 return value.users;
}
export function passwordHash(password,salt=randomBytes(16).toString('hex')){
 if(typeof password!=='string'||password.length<12)throw Error('A senha deve conter pelo menos 12 caracteres.');
 return {salt,hash:scryptSync(password,salt,64).toString('hex')};
}
export function passwordValid(password,user){
 if(!user||!user.salt||!user.hash||typeof password!=='string')return false;
 try{const a=Buffer.from(user.hash,'hex'),b=scryptSync(password,user.salt,a.length);
  return a.length===b.length&&timingSafeEqual(a,b);
 }catch{return false;}
}
export function writeUsers(filepath,users){
 writeFileSync(filepath,JSON.stringify({users},null,2)+'\n',{mode:0o600});
 try{chmodSync(filepath,0o600);}catch{}
}
const SESSIONS=new Map(),SESSION_LIFETIME=8*3600*1000;
export function login(username,password){
 const users=readUsers();
 const user=users.find(u=>u.username===String(username||'').trim().toLowerCase());
 if(!user||user.disabled||!permissionsFor(user.role)||!passwordValid(password,user))return null;
 const token=randomBytes(48).toString('base64url');
 SESSIONS.set(token,{username:user.username,expires:Date.now()+SESSION_LIFETIME,revision:user.hash});
 if(SESSIONS.size>2500){
  for(const [key,v] of SESSIONS){if(v.expires<Date.now())SESSIONS.delete(key);}
  if(SESSIONS.size>2500)SESSIONS.delete(SESSIONS.keys().next().value);
 }
 return {token,user:{username:user.username,displayName:user.name||user.username,role:user.role},expiresIn:SESSION_LIFETIME/1000,permissions:permissionsFor(user.role)};
}
export function authenticate(token){
 const session=SESSIONS.get(token||'');
 if(!session)return null;
 if(Date.now()>=session.expires){SESSIONS.delete(token);return null;}
 const user=readUsers().find(x=>x.username===session.username);
 if(!user||user.disabled||user.hash!==session.revision||!permissionsFor(user.role)){SESSIONS.delete(token);return null;}
 return {username:user.username,displayName:user.name||user.username,role:user.role,permissions:permissionsFor(user.role)};
}
export function logout(token){return SESSIONS.delete(token||'');}
