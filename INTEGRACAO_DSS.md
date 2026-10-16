# Integração DSS — Portal Viagens-PF

## Estado atual

O site agora possui duas camadas distintas:
- **Frontend GitHub Pages:** HTML/CSS/JS, gráficos, tabelas, relatórios e login. Se nenhum backend HTTPS estiver definido, fica em **DEMONSTRAÇÃO** com dados fictícios e contas apenas do navegador.
- **Backend privado Node.js:** autentica funcionários, autoriza perfis (Operacional, Financeiro, Administrador) e chama o DSS por **Basic Auth**, sem expor a senha DSS. Pode hospedar o mesmo frontend na própria origem.

A documentação Swagger `https://costalog.dssinformatica.com.br/wsdss/docs` é uma interface de documentação; **não é o endpoint** usado para consultar viagens.

## Operações DSS integradas

| Serviço | Método | Parâmetros | Resposta |
|---|---|---|---|
| `/listarViagens` | GET | `data_inicio`, `data_fim` em `dd/mm/aaaa` | `registros` com relatórios de viagem (RV) |
| `/listarPedidosFrete` | GET | `data_inicio`, `data_fim` em `dd/mm/aaaa` | `registros` com pedidos e CT-e |

Base configurável: `DSS_BASE_URL=https://costalog.dssinformatica.com.br/wsdss`.

O backend converte o período selecionado no navegador (`AAAA-MM-DD`) para `dd/mm/aaaa`, encaminha o Basic Auth ao DSS, lê `status`, `mensagemErro`, `qtd_registros` e `registros`, e retorna uma visão sanitizada por perfil no `GET /api/overview`.

Vínculos: `rv_viagem` por `rv_id` ou `nro_rv` (apenas quando a correspondência é única); referência `nro_mdf` não significa status fiscal validado. `total_frete` representa **valor do pedido**, não pagamento; `valor_total_abastecido` é custo parcial, não lucro completo.

## Ativação no servidor COSTALOG

**Não adicione senhas ao repositório, aos arquivos JavaScript ou ao GitHub Pages.**

1. Instale o código mais recente no servidor. Copie `.env.example` para `.env` **somente no servidor privado**. Preencha `DSS_USERNAME`, `DSS_PASSWORD`, `DSS_BASE_URL`, `PORTAL_USERS_FILE` e `PORTAL_ALLOWED_ORIGINS=https://joaopedrocostalog-netizen.github.io`. Mantenha `PORTAL_ALLOW_LEGACY_TOKEN=false`.
2. Crie o primeiro administrador na pasta privada (ver `ADMINISTRACAO.md`):

   No PowerShell Windows:

   ```powershell
   New-Item -ItemType Directory -Force private
   $env:PORTAL_USERS_FILE = (Join-Path (Get-Location) "private\portal-users.json")
   node api/users.mjs bootstrap admin
   ```

   No Linux, use `export PORTAL_USERS_FILE="$PWD/private/portal-users.json"` e `node api/users.mjs bootstrap admin`.

3. Para executar sem Docker: `node --env-file=.env api/server.mjs`. Em Docker, configure as permissões do volume privado conforme `ADMINISTRACAO.md` e rode `docker compose up -d --build`.
4. Coloque o backend **atrás de HTTPS e de controles de rede corporativos**. A porta `3001` do Docker está vinculada a `127.0.0.1` e não deve ser aberta diretamente à internet. Escolha um endereço de domínio, por exemplo `https://api.seu-dominio.com.br`. Esse endereço não existe até a TI configurá-lo.
5. No GitHub, altere **somente** `src/site-config.mjs`:

   ```js
   export const API_BASE_URL = 'https://api.seu-dominio.com.br';
   ```

   Não coloque `/wsdss/docs`, `/api/login`, senha, token nem porta HTTP insegura. Ao publicar no GitHub Pages, ele automaticamente passará a solicitar o login **real** do backend, não o login demonstrativo. A tela de login **não exige digitar a URL da API**.
6. Entre com seu usuário do portal criado no servidor. A consulta real das viagens e pedidos ocorrerá automaticamente após o login e a cada mudança do período. O portal não solicita a senha DSS ao funcionário.

## Verificações técnicas

No backend, antes de ativar no GitHub Pages:
- `GET /api/health` indica `accounts:true` e `configured:true` se os pré-requisitos estão presentes. **Isso não comprova conexão bem-sucedida com DSS**.
- `POST /api/login` autentica funcionários. O token de sessão é temporário e permanece na memória do navegador.
- `GET /api/overview?from=2026-10-01&to=2026-10-16` (com `Authorization: Bearer <sessão>`) exige login e retorna dados filtrados conforme o papel. A rota `/api/status` é restrita ao Administrador.
- Teste perfis **operacional** e **financeiro**: o primeiro jamais recebe custos, fretes, tributos ou faturas; o segundo pode consultar valores de pedidos.
- Respostas HTTP 401 do DSS indicam credenciais inválidas; HTTP 403 pode significar falta do módulo `tms_integr_prog_pg_motorista` ou permissão; HTTP 404 sugere base/rota incorreta. Erros de rede/CORS exigem validar HTTPS e `PORTAL_ALLOWED_ORIGINS`.

O Swagger não pôde ser consultado automaticamente deste ambiente; o mapeamento e as rotas seguem os esquemas que foram fornecidos na conversa. Testes automatizados usam **um DSS simulado**, não dados reais da empresa. A validação final depende da instalação e das credenciais autorizadas no servidor COSTALOG.
