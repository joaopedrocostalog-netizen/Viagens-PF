/** Administração de funcionários no próprio servidor (NÃO há cadastro público). */
import { existsSync } from 'node:fs';
import { readUsers, writeUsers, passwordHash } from './auth.mjs';
import { permissionsFor } from './access.mjs';
const filepath = process.env.PORTAL_USERS_FILE;
const [action, usernameRaw, roleRaw] = process.argv.slice(2);
if (!filepath) {
  console.error('Defina PORTAL_USERS_FILE=/caminho/privado/portal-users.json');
  process.exit(1);
}
if (!['add', 'bootstrap', 'disable', 'enable', 'list', 'password', 'role'].includes(action)) {
  console.error(
    'Uso: node api/users.mjs bootstrap admin; add usuario operacional|financeiro|administrador; ou list,disable,enable,password,role'
  );
  process.exit(1);
}
const users = existsSync(filepath) ? readUsers(filepath) : [];
const username = String(usernameRaw || '')
  .toLowerCase()
  .trim();
if (action === 'list') {
  for (const u of users)
    console.log(u.username, '|', u.name || '', '|', u.role, '|', u.disabled ? 'BLOQUEADO' : 'ATIVO');
  process.exit(0);
}
if (!/^[a-z0-9._-]{3,60}$/.test(username)) {
  console.error('Nome de usuário inválido (3-60 caracteres, letras/números/._-).');
  process.exit(1);
}
let account = users.find(u => u.username === username);
if ((action === 'add' || action === 'bootstrap') && account) {
  console.error('Usuário já existe. Use password ou role.');
  process.exit(1);
}
if (!['add', 'bootstrap'].includes(action) && !account) {
  console.error('Usuário não encontrado.');
  process.exit(1);
}
async function promptPassword() {
  if (process.env.PORTAL_NEW_PASSWORD) return process.env.PORTAL_NEW_PASSWORD;
  if (!process.stdin.isTTY) throw Error('Use terminal interativo ou defina PORTAL_NEW_PASSWORD temporariamente.');
  process.stdout.write('Nova senha (não será exibida): ');
  return new Promise(resolve => {
    const chars = [];
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    function handler(char) {
      if (char === '\r' || char === '\n') {
        stdin.off('data', handler);
        stdin.setRawMode(false);
        stdin.pause();
        process.stdout.write('\n');
        resolve(chars.join(''));
        return;
      }
      if (char === '\u0003') {
        stdin.setRawMode(false);
        process.exit(130);
      }
      if (char === '\u007f') {
        chars.pop();
        return;
      }
      chars.push(char);
    }
    stdin.on('data', handler);
  });
}
if (action === 'add' || action === 'bootstrap' || action === 'password') {
  const password = await promptPassword();
  const details = passwordHash(password);
  if (action === 'bootstrap' && users.some(x => x.role === 'administrador'))
    throw Error('Já existe administrador. Use add ou login de administrador.');
  if (action === 'bootstrap' && users.length > 0)
    throw Error('Bootstrap permitido somente quando não há nenhuma conta.');
  if (action === 'add' || action === 'bootstrap') {
    const role = action === 'bootstrap' ? 'administrador' : roleRaw;
    if (!permissionsFor(role)) throw Error('Papel inválido. Use operacional, financeiro ou administrador.');
    account = {
      username,
      role,
      name: action === 'bootstrap' ? 'Administrador COSTALOG' : username,
      ...details,
      disabled: false,
      mustChangePassword: false
    };
    users.push(account);
  } else Object.assign(account, details);
} else if (action === 'role') {
  if (!permissionsFor(roleRaw)) throw Error('Papel inválido. Use operacional, financeiro ou administrador.');
  if (
    account.role === 'administrador' &&
    roleRaw !== 'administrador' &&
    users.filter(u => u.role === 'administrador' && !u.disabled).length === 1
  )
    throw Error('Não pode remover o último administrador ativo.');
  account.role = roleRaw;
} else {
  if (
    action === 'disable' &&
    account.role === 'administrador' &&
    users.filter(u => u.role === 'administrador' && !u.disabled).length === 1
  )
    throw Error('Não pode bloquear o último administrador ativo.');
  account.disabled = action === 'disable';
}
writeUsers(filepath, users);
console.log('Conta', username, 'atualizada. As sessões existentes desta conta serão invalidadas quando aplicável.');
