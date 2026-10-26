/** Painel de usuários, somente visível para administradores.
 * A autorização real de cada operação é feita no backend.
 */
const escape = x =>
  String(x ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const roles = {
  operacional: 'Operacional — viagens e pedidos',
  financeiro: 'Financeiro — viagens e pedidos',
  administrador: 'Administrador — operações e usuários'
};
const options = selected =>
  Object.entries(roles)
    .map(
      ([key, value]) =>
        '<option value="' + key + '" ' + (key === selected ? 'selected' : '') + '>' + escape(value) + '</option>'
    )
    .join('');
export function renderUsersManagement(users, loading = false, error = '') {
  const rows = users?.length
    ? users
        .map(u => {
          const isAdmin = u.role === 'administrador';
          return (
            '<tr>' +
            '<td><strong>' +
            escape(u.name || u.username) +
            '</strong><br><small>' +
            escape(u.username) +
            '</small></td>' +
            '<td><select class="control admin-role-change" data-admin-role="' +
            escape(u.username) +
            '">' +
            options(u.role) +
            '</select></td>' +
            '<td><span class="pill ' +
            (u.disabled ? 'red' : 'green') +
            '">' +
            (u.disabled ? 'Bloqueado' : 'Ativo') +
            '</span>' +
            (u.mustChangePassword ? '<br><small>Senha provisória</small>' : '') +
            '</td>' +
            '<td><div class="admin-row-actions"><button type="button" class="btn btn-sm" data-admin-reset="' +
            escape(u.username) +
            '">Redefinir senha</button> ' +
            '<button type="button" class="btn btn-sm" data-admin-toggle="' +
            escape(u.username) +
            '" data-disabled="' +
            (u.disabled ? '1' : '0') +
            '">' +
            (u.disabled ? 'Reativar' : 'Bloquear') +
            '</button></div></td>' +
            '</tr>'
          );
        })
        .join('')
    : '<tr><td colspan="4" class="empty">Nenhum usuário carregado. Clique em Atualizar lista.</td></tr>';
  return (
    '<section class="card" id="userAdminPanel"><div class="card-head"><h3>Gerenciamento de funcionários</h3><span>Somente administrador</span></div>' +
    '<div class="info-strip">Contas individuais, permissões aplicadas no servidor. Todos os perfis consultam viagens, RVs e pedidos de frete. O perfil <strong>Administrador</strong> também pode criar e bloquear usuários.</div>' +
    '<div class="admin-user-columns">' +
    '<form id="createPortalUser" class="admin-user-create" autocomplete="off">' +
    '<h3>Cadastrar funcionário</h3>' +
    '<label for="adminNewName">Nome completo</label><input class="control full" id="adminNewName" name="name" required minlength="2" maxlength="100" placeholder="Nome do funcionário">' +
    '<label for="adminNewUsername">Usuário de acesso</label><input class="control full" id="adminNewUsername" name="username" required minlength="3" maxlength="60" pattern="[a-z0-9._-]+" placeholder="nome.sobrenome" autocapitalize="none">' +
    '<label for="adminNewRole">Permissão</label><select id="adminNewRole" class="control full" name="role">' +
    options('operacional') +
    '</select>' +
    '<label for="adminNewPassword">Senha provisória</label><input class="control full" id="adminNewPassword" type="password" name="password" required minlength="12" maxlength="256" autocomplete="new-password" placeholder="Pelo menos 12 caracteres">' +
    '<p class="help">Entregue a senha provisória por um canal seguro. O funcionário deverá criar uma senha própria no primeiro login. Não compartilhe senhas no GitHub.</p>' +
    '<button class="btn btn-red" type="submit">Criar usuário</button>' +
    '</form>' +
    '<div class="admin-user-table"><div class="section-title"><h3>Usuários cadastrados</h3><button type="button" class="btn btn-sm" data-action="reload-users">Atualizar lista</button></div>' +
    (error ? '<p class="admin-message admin-error">' + escape(error) + '</p>' : '') +
    (loading ? '<p class="help">Consultando usuários...</p>' : '') +
    '<div class="table-wrap"><table><thead><tr><th>Funcionário</th><th>Permissão</th><th>Situação</th><th>Ações</th></tr></thead><tbody>' +
    rows +
    '</tbody></table></div></div></div></section>'
  );
}
export function renderForcePasswordChange() {
  return (
    '<div class="overlay admin-password-overlay"><aside class="drawer" role="dialog" aria-modal="true" aria-label="Alteração obrigatória de senha">' +
    '<div class="drawer-top"><h2>Defina sua senha pessoal</h2></div>' +
    '<p class="help">Sua conta foi criada com uma senha provisória. Para acessar viagens e pedidos de frete, você precisa alterá-la.</p>' +
    '<form id="forcePasswordChange">' +
    '<label for="currentPortalPassword">Senha provisória</label><input class="control full" type="password" id="currentPortalPassword" autocomplete="current-password" required>' +
    '<label for="newPortalPassword">Nova senha (mínimo 12 caracteres)</label><input class="control full" type="password" id="newPortalPassword" autocomplete="new-password" minlength="12" maxlength="256" required>' +
    '<label for="confirmPortalPassword">Confirmar nova senha</label><input class="control full" type="password" id="confirmPortalPassword" autocomplete="new-password" minlength="12" maxlength="256" required>' +
    '<button class="btn btn-red" type="submit">Alterar senha e continuar</button> ' +
    '<button class="btn" type="button" data-action="logout">Sair</button></form></aside></div>'
  );
}
