/**
 * Contas da DEMONSTRAÇÃO (GitHub Pages sem backend): ficam só no armazenamento deste navegador,
 * com senha em PBKDF2. Nunca dão acesso a dados reais da DSS.
 */
const DEMO_USERS_KEY = 'costalog_demo_users_v1';
const TEMP_ADMIN_SALT = '0586030c9088763dba9e1cde008cce5a';
const TEMP_ADMIN_HASH = '977b36fdad10f371180e01878f3d4331ae80c73e7b422eaeabb058ac48e65bdd';
const PBKDF2_ITERATIONS = 120000;
const demoRoles = ['operacional', 'financeiro', 'administrador'];
export const demoRights = role => ({ operacional: true, financeiro: false, admin: role === 'administrador' });
function demoUsers() {
  try {
    const rows = JSON.parse(localStorage.getItem(DEMO_USERS_KEY) || 'null');
    if (Array.isArray(rows) && rows.length) return rows;
  } catch {}
  return [
    {
      username: 'admin',
      name: 'Administrador (demonstração)',
      role: 'administrador',
      salt: TEMP_ADMIN_SALT,
      hash: TEMP_ADMIN_HASH,
      disabled: false,
      mustChangePassword: true
    }
  ];
}
function demoSave(rows) {
  localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(rows));
}
const randomHex = n =>
  [...crypto.getRandomValues(new Uint8Array(n))].map(x => x.toString(16).padStart(2, '0')).join('');
async function demoHash(password, salt) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256)
    throw Error('Use uma senha de 12 a 256 caracteres.');
  if (!crypto?.subtle) throw Error('O modo de demonstração exige HTTPS e navegador atualizado.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(salt.match(/../g).map(x => parseInt(x, 16))),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    key,
    256
  );
  return [...new Uint8Array(derived)].map(x => x.toString(16).padStart(2, '0')).join('');
}
const demoPublic = u => ({
  username: u.username,
  displayName: u.name || u.username,
  name: u.name || u.username,
  role: u.role,
  disabled: !!u.disabled,
  mustChangePassword: !!u.mustChangePassword
});
export async function demoSignin(username, password) {
  const u = demoUsers().find(
    x =>
      x.username ===
        String(username || '')
          .toLowerCase()
          .trim() && !x.disabled
  );
  if (!u || (await demoHash(password, u.salt)) !== u.hash) throw Error('Usuário ou senha temporária incorretos.');
  return demoPublic(u);
}
export async function demoAccountAction(state, path = '', options = {}) {
  if (state.role !== 'administrador' || !state.user || state.user.mustChangePassword)
    throw Error('Somente o administrador pode modificar contas demonstrativas.');
  const rows = demoUsers(),
    operation = options.method || 'GET',
    input = options.body ? JSON.parse(options.body) : {};
  const admins = () => rows.filter(x => x.role === 'administrador' && !x.disabled).length;
  if (!path && operation === 'GET') return { users: rows.map(demoPublic) };
  if (!path && operation === 'POST') {
    const username = String(input.username || '')
        .trim()
        .toLowerCase(),
      name = String(input.name || '').trim();
    if (!/^[a-z0-9._-]{3,60}$/.test(username) || name.length < 2 || name.length > 100)
      throw Error('Informe nome e login válidos.');
    if (!demoRoles.includes(input.role)) throw Error('Permissão inválida.');
    if (rows.some(x => x.username === username)) throw Error('Este login já está cadastrado neste navegador.');
    const salt = randomHex(16),
      hash = await demoHash(input.password, salt);
    const newUser = { username, name, role: input.role, salt, hash, disabled: false, mustChangePassword: true };
    rows.push(newUser);
    demoSave(rows);
    return { user: demoPublic(newUser) };
  }
  if (path.startsWith('/') && operation === 'PATCH') {
    const username = decodeURIComponent(path.slice(1)),
      target = rows.find(x => x.username === username);
    if (!target) throw Error('Funcionário não encontrado.');
    switch (input.action) {
      case 'role':
        if (!demoRoles.includes(input.role)) throw Error('Permissão inválida.');
        if (target.username === state.user.username && input.role !== 'administrador')
          throw Error('Não é possível rebaixar sua própria conta.');
        if (target.role === 'administrador' && input.role !== 'administrador' && admins() <= 1)
          throw Error('Mantenha um administrador.');
        target.role = input.role;
        break;
      case 'disable':
        if (target.username === state.user.username) throw Error('Não pode bloquear sua própria conta.');
        if (target.role === 'administrador' && admins() <= 1) throw Error('Mantenha um administrador.');
        target.disabled = true;
        break;
      case 'enable':
        target.disabled = false;
        break;
      case 'reset-password':
        target.salt = randomHex(16);
        target.hash = await demoHash(input.password, target.salt);
        target.mustChangePassword = true;
        break;
      default:
        throw Error('Ação inválida.');
    }
    demoSave(rows);
    return { user: demoPublic(target) };
  }
  throw Error('Operação inválida.');
}
export async function demoChangeOwnPassword(state, currentPassword, newPassword) {
  const rows = demoUsers(),
    u = rows.find(x => x.username === state.user?.username);
  if (!u || (await demoHash(currentPassword, u.salt)) !== u.hash) throw Error('Senha provisória incorreta.');
  if (currentPassword === newPassword) throw Error('A nova senha deve ser diferente.');
  const salt = randomHex(16),
    hash = await demoHash(newPassword, salt);
  Object.assign(u, { salt, hash, mustChangePassword: false });
  demoSave(rows);
}
