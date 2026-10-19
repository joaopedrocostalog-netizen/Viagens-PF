# Render Free — teste privado do backend DSS COSTALOG

> **Apenas ambiente de teste.** O Render Free utiliza armazenamento efêmero; contas, alterações de senha, sessões e cadastros feitos localmente podem desaparecer quando o container for reconstruído/reiniciado. Não o utilize como sistema definitivo de gestão de usuários.

## 1. Criar Web Service

1. Acesse [Render Dashboard](https://dashboard.render.com/) e conecte o GitHub.
2. **New > Web Service** e escolha **joaopedrocostalog-netizen/Viagens-PF**, branch \`main\`.
3. Selecione **Language: Node**, ambiente gratuito **Free**, root directory vazio.
4. **Build Command:** \`node --check api/server.mjs && node --check api/render-bootstrap.mjs\`
5. **Start Command:** \`node api/render-bootstrap.mjs && node api/server.mjs\`
6. Não configure disco permanente no Free. O backend usa a porta definida automaticamente pelo Render em \`PORT\`; não é necessário criá-la.
7. Configure as variáveis privadas abaixo em **Environment**. Nunca as coloque no repositório.

> O script é executado **antes** do servidor: se faltar a senha temporária ou houver erro, a inicialização será interrompida, sem abrir um backend sem contas.

## 2. Variáveis privadas no Render

| Key | Value | Observação |
|---|---|---|
| \`NODE_ENV\` | \`production\` | |
| \`PORTAL_USERS_FILE\` | \`/tmp/costalog/portal-users.json\` | Em disco efêmero |
| \`RENDER_FREE_BOOTSTRAP\` | \`true\` | Ativa bootstrap **somente para testes** |
| \`RENDER_FREE_ADMIN_USERNAME\` | \`admin\` | Nome do usuário administrativo de teste |
| \`RENDER_FREE_ADMIN_PASSWORD\` | **defina uma senha exclusiva** | No mínimo 16 caracteres, com letras e números. Não reutilizar a senha DSS. |
| \`PORTAL_ALLOW_LEGACY_TOKEN\` | \`false\` | Desabilita login legado |
| \`PORTAL_ALLOWED_ORIGINS\` | \`https://joaopedrocostalog-netizen.github.io\` | CORS do GitHub Pages |
| \`DSS_BASE_URL\` | \`https://costalog.dssinformatica.com.br/wsdss\` | **Confirme a base na documentação oficial.** |
| \`DSS_AUTH_TYPE\` | \`basic\` | Conforme integração DSS |
| \`DSS_USERNAME\` | **credencial DSS autorizada** | Só na área Environment do Render |
| \`DSS_PASSWORD\` | **senha DSS autorizada** | Só na área Environment do Render |
| \`DSS_VIAGENS_PATH\` | \`/listarViagens\` | Confirmar endpoint real |
| \`DSS_PEDIDOS_PATH\` | \`/listarPedidosFrete\` | Confirmar endpoint real |
| \`DSS_VIAGENS_QUERY_FROM\` | \`data_inicio\` | Data convertida para dd/mm/aaaa |
| \`DSS_VIAGENS_QUERY_TO\` | \`data_fim\` | |
| \`DSS_PEDIDOS_QUERY_FROM\` | \`data_inicio\` | |
| \`DSS_PEDIDOS_QUERY_TO\` | \`data_fim\` | |
| \`DSS_VIAGENS_DATA_PATH\` | \`registros\` | Confirmar formato de resposta |
| \`DSS_PEDIDOS_DATA_PATH\` | \`registros\` | Confirmar formato de resposta |
| \`API_CACHE_SECONDS\` | \`60\` | |
| \`DSS_TIMEOUT_MS\` | \`20000\` | |

Não configure \`DSS_CTES_PATH\` e \`DSS_MDFES_PATH\` até que essas rotas sejam confirmadas no Swagger. O sistema extrai referências documentais de RV e PF, mas isso não certifica situação fiscal.

## 3. Primeiro login

Quando o Render exibir **Live**, teste:

- \`https://SEU-SERVICO.onrender.com/api/health\` — confirmar \`status: "ok"\`, \`accounts: true\` e \`configured: true\`. **configured não significa que a autenticação DSS foi testada com sucesso**.
- \`https://SEU-SERVICO.onrender.com/\` — a própria interface COSTALOG é servida pelo backend na mesma origem. Este é o caminho mais simples para testar antes de configurar o GitHub Pages.
- No login use \`admin\` e a senha de \`RENDER_FREE_ADMIN_PASSWORD\`. A primeira sessão exige a troca de senha. A senha nova ficará no arquivo efêmero do Render.

**Atenção:** depois de um reinício com perda do disco efêmero, o script recria o administrador **com a senha original definida em Environment**; a senha alterada no primeiro login deixa de valer. Isso é esperado nesse modo de teste. Não utilize o bootstrap para produção. O armazenamento seguro definitivo deve ser em banco persistente/serviço de segredos e com autenticação corporativa.

## 4. Validar consulta DSS

Após o login administrativo, selecione um intervalo em que existam viagens. O navegador chama \`GET /api/overview?from=AAAA-MM-DD&to=AAAA-MM-DD\`, enviando apenas um token de sessão do portal. O Render consulta a DSS por Basic Auth internamente.

- 401: revise usuário/senha DSS (ou login no portal caso seja retorno da autenticação do portal).
- 403: confirme autorização para as operações DSS.
- 404: revise \`DSS_BASE_URL\` e o caminho dos endpoints.
- 502: verifique logs privados em **Render > Logs** e acesso da rede do Render à DSS. Alguns fornecedores permitem acesso apenas de IPs liberados/VPN; Render Free não garante IP de saída fixo.
- Se retornar vazio: confira as datas e os formatos esperados no Swagger; não assuma erro apenas por zero registros.

**Importante:** não envie capturas contendo cabeçalhos Authorization, CPF, senha, token, URL com credenciais ou dados sigilosos.

## 5. Conectar o GitHub Pages ao Render (após validar)

1. Copie o URL HTTPS real do seu Web Service, como \`https://SEU-SERVICO.onrender.com\` (**sem barra final, /api ou /docs**).
2. No GitHub, edite somente \`src/site-config.mjs\`:

   \`\`\`js
   export const API_BASE_URL = 'https://SEU-SERVICO.onrender.com';
   \`\`\`

3. Aguarde o GitHub Actions publicar o frontend e abra \`https://joaopedrocostalog-netizen.github.io/Viagens-PF/\`. Faça **Ctrl+F5** se necessário.
4. O login do Pages passa a ser o login real do backend Render. A senha de demonstração do GitHub Pages **não funciona no backend real**. O navegador não recebe a senha DSS.
5. Não instale um backend HTTP público: o GitHub Pages usa HTTPS e exige API HTTPS.

Como alternativa, mantenha a URL da API vazia no GitHub Pages até o backend estar pronto. Assim o site público permanece demonstrativo; o site de teste real funciona diretamente em \`https://SEU-SERVICO.onrender.com/\`.

## 6. Para passar a produção

Desative \`RENDER_FREE_BOOTSTRAP\`, use armazenamento persistente apropriado, senha individual por funcionário, proteção do serviço contra acessos não autorizados, domínios HTTPS corporativos, políticas de backup e retenção de dados. A versão Free é adequada apenas para validar integração e interface, não para dados corporativos sensíveis em uso diário.


## Consultas DSS intermitentes (outubro de 2026)

Logs reais mostraram sucessos de 6–17 segundos com milhares de RVs/PFs, alternando com respostas que excedem 20 segundos. O backend agora reutiliza chamadas simultâneas **do mesmo período** e permite configurar timeout até 38 segundos. Para usar 32 segundos, no Render > Environment altere `DSS_TIMEOUT_MS=32000` e faça redeploy. O frontend tem limite próprio próximo de 45 segundos; não aumente acima de 38000. Períodos diferentes ainda geram consultas distintas e podem sobrecarregar o DSS. Em `Render > Logs`, verifique `[DSS] serviço viagens` e `[DSS] serviço pedidos`. O portal jamais deve mostrar dados de períodos distintos como se fossem atuais.


## Integração /listarMotoristas

O backend tenta consultar automaticamente `/listarMotoristas` no mesmo domínio DSS usando as credenciais já configuradas no Render. Essa consulta é opcional, não utiliza datas e não interrompe as viagens nem pedidos quando falha. Armazena em cache apenas a associação entre `motorista_id` e nome, durante 15 minutos; CPF e outros dados da resposta não são enviados ao portal.

O esquema da resposta foi confirmado pelo Swagger: objeto com `status`, `registros`, identificador `id` e nome `nome_motorista`. **O método e os parâmetros da operação ainda precisam ser confirmados**; a implementação atual usa GET sem parâmetros. Se o Swagger mostrar estrutura diferente, configure no Render `DSS_MOTORISTAS_PATH`, `DSS_MOTORISTAS_DATA_PATH`, `DSS_MOTORISTAS_ID_FIELD` e `DSS_MOTORISTAS_NAME_FIELD` de acordo com os campos reais. Se a operação exigir POST ou parâmetros, será necessário adaptar o código. Para desativar a consulta opcional temporariamente, configure `DSS_MOTORISTAS_PATH` com valor vazio no Render.

Veja em **Render > Logs** a mensagem `[DSS] motoristas: catálogo atualizado` ou `[DSS] listarMotoristas indisponível`. Se houver divergência, envie somente o status HTTP e um exemplo da **estrutura sem dados pessoais**, não a resposta integral com CPF ou outros dados.
