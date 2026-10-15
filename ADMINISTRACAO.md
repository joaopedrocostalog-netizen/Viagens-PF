# Ativação do Administrador COSTALOG

**Atenção:** não foi criada nenhuma conta real no servidor da empresa nesta etapa. O sistema e o comando de inicialização foram implementados. A TI deverá criar a primeira senha privada no servidor; não existe senha padrão no repositório público.

## 1. Inicializar a conta admin no servidor

Na pasta do projeto Viagens-PF, com Node.js 24:

Linux:

    mkdir -p private
    chmod 700 private
    export PORTAL_USERS_FILE="$PWD/private/portal-users.json"
    node api/users.mjs bootstrap admin

Windows PowerShell:

    New-Item -ItemType Directory -Force private
    $env:PORTAL_USERS_FILE = (Join-Path (Get-Location) "private\portal-users.json")
    node api/users.mjs bootstrap admin

O terminal pedirá uma senha administrativa com pelo menos 12 caracteres, sem mostrar o texto digitado. O nome de usuário inicial será **admin** e o perfil será **administrador**. Não há senha fixa no GitHub.

O bootstrap só funciona em um cadastro ainda vazio. Se já houver usuários, não substitua ou apague o arquivo: use a conta administradora existente.

Para ver os perfis existentes:

    node api/users.mjs list

## 2. Ligar o backend privado

Copie .env.example para .env. Não publique .env nem a pasta private.

Configure no arquivo privado:

    PORT=3001
    PORTAL_USERS_FILE=/app/private/portal-users.json
    PORTAL_ALLOW_LEGACY_TOKEN=false
    DSS_BASE_URL=https://costalog.dssinformatica.com.br/wsdss
    DSS_AUTH_TYPE=basic
    DSS_USERNAME=USUARIO_DSS_PRIVADO
    DSS_PASSWORD=SENHA_DSS_PRIVADA

Os valores USER/SENHA são placeholders. Complete somente no servidor.

Para Docker, o compose.yaml monta a pasta private em /app/private como volume gravável. O servidor deve ter permissão de leitura/escrita para salvar novas contas. No Linux o contêiner usa UID 1000; após criar o admin:

    sudo chown -R 1000:1000 private
    chmod 700 private
    chmod 600 private/portal-users.json
    docker compose up -d --build

No Windows/Docker Desktop, confirme as permissões de compartilhamento da pasta e impeça acesso externo ao arquivo de usuários.

Coloque a API atrás de HTTPS, autenticação de rede corporativa e origens CORS autorizadas. Esta implementação de arquivo JSON é adequada a uma única instância de backend; para múltiplos servidores use armazenamento transacional.

## 3. Criar funcionários pelo painel

Abra https://joaopedrocostalog-netizen.github.io/Viagens-PF/ e clique em **Entrar**. Informe a URL HTTPS do backend, usuário admin e a senha escolhida na inicialização. Acesse **Administração → Gerenciamento de funcionários**.

O administrador poderá:
- Cadastrar um funcionário com nome, login, senha provisória e permissão.
- Escolher **Operacional** (viagens/CT-e/entregas sem valores), **Financeiro** (faturamento completo, clientes e relatórios financeiros) ou **Administrador** (acesso total e gestão de contas).
- Alterar o perfil, bloquear/reativar e redefinir a senha de funcionários existentes.

O funcionário é obrigado a substituir sua senha provisória no primeiro acesso. A API bloqueia consultas reais antes dessa troca. A senha provisória deve ser enviada por canal privado, não pelo GitHub.

O administrador não consegue bloquear a própria conta nem remover o último administrador ativo.

## 4. Segurança e testes

As rotas GET/POST /api/users e PATCH /api/users/:username exigem sessão administrativa válida; os demais perfis recebem HTTP 403. Nenhuma listagem inclui hash ou senha. Para o Operacional, o backend exclui custos, fretes, valores a receber, tributos e outras informações financeiras **antes** de responder, inclusive quando utiliza cache.

A conta inicial ainda não foi provisionada no servidor real. Os testes automatizados verificam bootstrap, permissões, criação de usuários, senhas provisórias, bloqueios e revogações usando apenas dados simulados. Antes de produção, valide o backend, backups do arquivo privado, o HTTPS e os resultados retornados pelo DSS.
