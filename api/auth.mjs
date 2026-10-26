/** Contas locais do portal. Basic Auth do DSS é separado.
 * Arquivo de usuários deve ficar em volume privado gravável no servidor.
 */
import { readFileSync, existsSync, writeFileSync, chmodSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { permissionsFor } from './access.mjs';
export const USERS_PATH = process.env.PORTAL_USERS_FILE || '';
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,60}$/;
export function configuredUsers() {
  if (!USERS_PATH) return false;
  if (!existsSync(USERS_PATH))
    throw Error(
      'PORTAL_USERS_FILE configurado mas arquivo inexistente. Acesso bloqueado; crie primeiro o administrador pela ferramenta api/users.mjs.'
    );
  return true;
}
export function readUsers(filepath = USERS_PATH) {
  if (!filepath) throw Error('PORTAL_USERS_FILE ausente');
  const value = JSON.parse(readFileSync(filepath, 'utf8'));
  if (!Array.isArray(value.users)) throw Error('Arquivo de usuários inválido');
  return value.users;
}
export function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256)
    throw Error('Senha precisa ter entre 12 e 256 caracteres.');
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
}
export function passwordValid(password, user) {
  if (!user || !user.salt || !user.hash || typeof password !== 'string') return false;
  try {
    const a = Buffer.from(user.hash, 'hex'),
      b = scryptSync(password, user.salt, a.length);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
export function writeUsers(filepath, users) {
  // Gravação atômica para não expor arquivo parcialmente escrito.
  const temporary = join(dirname(filepath), '.accounts-' + randomBytes(10).toString('hex') + '.tmp');
  try {
    writeFileSync(temporary, JSON.stringify({ users }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    renameSync(temporary, filepath);
    try {
      chmodSync(filepath, 0o600);
    } catch {}
  } catch (err) {
    try {
      unlinkSync(temporary);
    } catch {}
    throw err;
  }
}
const SESSIONS = new Map(),
  SESSION_LIFETIME = 8 * 3600 * 1000;
const publicUser = user => ({
  username: user.username,
  displayName: user.name || user.username,
  role: user.role,
  mustChangePassword: !!user.mustChangePassword
});
export function login(username, password) {
  const users = readUsers();
  const user = users.find(
    u =>
      u.username ===
      String(username || '')
        .trim()
        .toLowerCase()
  );
  if (!user || user.disabled || !permissionsFor(user.role) || !passwordValid(password, user)) return null;
  const token = randomBytes(48).toString('base64url');
  SESSIONS.set(token, { username: user.username, expires: Date.now() + SESSION_LIFETIME, revision: user.hash });
  if (SESSIONS.size > 2500) {
    for (const [key, v] of SESSIONS) {
      if (v.expires < Date.now()) SESSIONS.delete(key);
    }
    if (SESSIONS.size > 2500) SESSIONS.delete(SESSIONS.keys().next().value);
  }
  return { token, user: publicUser(user), expiresIn: SESSION_LIFETIME / 1000, permissions: permissionsFor(user.role) };
}
export function authenticate(token) {
  const session = SESSIONS.get(token || '');
  if (!session) return null;
  if (Date.now() >= session.expires) {
    SESSIONS.delete(token);
    return null;
  }
  const user = readUsers().find(x => x.username === session.username);
  if (!user || user.disabled || user.hash !== session.revision || !permissionsFor(user.role)) {
    SESSIONS.delete(token);
    return null;
  }
  return { ...publicUser(user), permissions: permissionsFor(user.role) };
}
export function logout(token) {
  return SESSIONS.delete(token || '');
}
export function listAccounts() {
  return readUsers()
    .map(u => ({
      username: u.username,
      name: u.name || u.username,
      role: u.role,
      disabled: !!u.disabled,
      mustChangePassword: !!u.mustChangePassword
    }))
    .sort((a, b) => a.username.localeCompare(b.username));
}
const activeAdmins = users => users.filter(u => u.role === 'administrador' && !u.disabled).length;
const normalizeUsername = x =>
  String(x || '')
    .trim()
    .toLowerCase();
const validName = name => typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 100;
export function createAccount(input) {
  const username = normalizeUsername(input?.username),
    role = input?.role;
  if (!USERNAME_PATTERN.test(username))
    throw new AccountError(
      400,
      'Usuário deve ter 3 a 60 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.'
    );
  if (!validName(input?.name)) throw new AccountError(400, 'Informe o nome do funcionário (2 a 100 caracteres).');
  if (!permissionsFor(role)) throw new AccountError(400, 'Perfil de acesso inválido.');
  const users = readUsers();
  if (users.some(x => x.username === username)) throw new AccountError(409, 'Este nome de usuário já existe.');
  const secret = passwordHash(input.password);
  users.push({ username, name: input.name.trim(), role, ...secret, disabled: false, mustChangePassword: true });
  writeUsers(USERS_PATH, users);
  return { username, name: input.name.trim(), role, disabled: false, mustChangePassword: true };
}
export class AccountError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function updateAccount(usernameRaw, action, input = {}, actor = '') {
  const username = normalizeUsername(usernameRaw),
    users = readUsers();
  const account = users.find(x => x.username === username);
  if (!account) throw new AccountError(404, 'Funcionário não encontrado.');
  if (!['role', 'disable', 'enable', 'reset-password', 'rename'].includes(action))
    throw new AccountError(400, 'Ação inválida.');
  if (action === 'role') {
    if (!permissionsFor(input.role)) throw new AccountError(400, 'Perfil de acesso inválido.');
    if (account.role === 'administrador' && input.role !== 'administrador' && activeAdmins(users) <= 1)
      throw new AccountError(409, 'É necessário manter pelo menos um administrador ativo.');
    if (account.username === actor && input.role !== 'administrador')
      throw new AccountError(409, 'Não é possível retirar o próprio acesso de administrador.');
    account.role = input.role;
  } else if (action === 'disable') {
    if (account.username === actor) throw new AccountError(409, 'Não é possível bloquear a própria conta.');
    if (account.role === 'administrador' && activeAdmins(users) <= 1)
      throw new AccountError(409, 'É necessário manter pelo menos um administrador ativo.');
    account.disabled = true;
  } else if (action === 'enable') account.disabled = false;
  else if (action === 'rename') {
    if (!validName(input.name)) throw new AccountError(400, 'Nome precisa ter de 2 a 100 caracteres.');
    account.name = input.name.trim();
  } else if (action === 'reset-password') {
    Object.assign(account, passwordHash(input.password), { mustChangePassword: true });
  }
  writeUsers(USERS_PATH, users);
  return {
    username: account.username,
    name: account.name || account.username,
    role: account.role,
    disabled: !!account.disabled,
    mustChangePassword: !!account.mustChangePassword
  };
}
export function changeOwnPassword(username, oldPassword, newPassword) {
  const users = readUsers(),
    account = users.find(x => x.username === username);
  if (!account || account.disabled || !passwordValid(oldPassword, account))
    throw new AccountError(401, 'Senha atual incorreta.');
  if (oldPassword === newPassword) throw new AccountError(400, 'A nova senha deve ser diferente da anterior.');
  Object.assign(account, passwordHash(newPassword), { mustChangePassword: false });
  writeUsers(USERS_PATH, users);
  // Sessão antiga é invalidada pela alteração do hash; exigir novo login.
  return { ok: true };
}
