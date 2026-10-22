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


## Campos confirmados para Viagens, Rotas e Programações

O esquema do DSS informa para `listarViagens` os campos `total_km_rodados`, `km_previsto` e `valor_total_abastecido`. Para `listarRotas`, há `rota_id` e `km_previsto_rota`, que representa distância **prevista**, jamais distância realizada. A consulta opcional `listarRotas` pode preencher a previsão de uma RV pelo `rota_id`, somente quando o `km_previsto` da viagem está ausente. A consulta opcional `listarProgramacoes` utiliza `data_inicio` e `data_fim` por data de emissão; seus dados documentais são mantidos separados dos fretes de pedidos para não gerar somas duplicadas. As consultas opcionais não invalidam RVs e PFs se falharem. Para desabilitá-las temporariamente no Render, deixe `DSS_ROTAS_PATH` e/ou `DSS_PROGRAMACOES_PATH` vazios.


## Cache mensal privado (primeira etapa de sincronização)

O backend agora suporta `DSS_PERIOD_CACHE_DIR` (pasta privada de armazenamento) e `DSS_PERIOD_CACHE_HOURS` (validade padrão: 24 horas). Quando configurados, os resultados de viagens/pedidos de um mesmo período são guardados apenas após consulta integral concluída. Em novas consultas desse mesmo período, o backend reutiliza o arquivo até expirar. O cache bruto pode conter informações comerciais e pessoais: armazene **somente em volume privado protegido**, nunca no GitHub, em GitHub Pages nem numa pasta pública. No Render Free, o disco local é efêmero: **não é cache persistente entre deploys ou reinícios**. Não configure um caminho supondo que seja armazenamento durável. O cache mensal também suporta o MariaDB já previsto para o Plesk, conforme o procedimento de migração em `CLAUDE.md`.

### Tratamentos de pendências

O acompanhamento das pendências é independente do cache da DSS. `PORTAL_WORKFLOW_FILE` indica o arquivo JSON privado de tratamentos, comentários e histórico. Sem essa variável, o backend usa `viagens-pf-workflow.json` no mesmo diretório de `PORTAL_USERS_FILE`; sem nenhum caminho configurado, a interface informa que não pode salvar.

- O processo Node precisa de permissão de leitura/escrita no diretório privado. O arquivo é criado com permissão 0600 e substituído atomicamente.
- Em produção, aponte para armazenamento persistente e inclua o arquivo nos backups. No Render Free, um caminho em `/tmp` permite testar a função, mas **o histórico pode desaparecer no próximo deploy/reinício**. Cache mensal no MariaDB não torna esse arquivo persistente.
- O armazenamento atual pressupõe uma única instância Node. Antes de escalar para múltiplas instâncias, migrar o repositório de tratamentos para um armazenamento transacional compartilhado, com revisão otimista e isolamento por empresa. Não executar DDL no banco compartilhado sem autorização.
- `GET /api/workflow?company=costalog` retorna o índice sem comentários; acrescentar `key` busca um tratamento. `PATCH` recebe chave, responsável, prazo, prioridade, situação, comentário novo e revisão lida anteriormente. Todos exigem autenticação operacional e senha provisória já alterada. Revisão desatualizada retorna 409.
- Tratamentos são compartilhados pelos usuários do portal dentro da empresa ativa. Demonstração usa somente armazenamento local separado no navegador e não grava no backend.

As variáveis são opcionais: sem elas, o portal continua como antes. A atualização da DSS permanece manual pelo botão. O cache tem validade e **não é uma atualização em tempo real**; estabeleça a validade conforme a necessidade operacional. É possível verificar se está habilitado no campo `periodStoreEnabled` de `/api/status`, acessível apenas para administradores autenticados.


## Migração opcional para MariaDB do Plesk (banco compartilhado)

**Não ativar no Render antes de testar o Plesk.** A integração é opt-in e não acessa nem altera as tabelas dos outros sistemas. No banco MariaDB já existente, confirme antes que o nome `viagens_pf_period_cache` não está em uso e execute manualmente `database/viagens_pf_schema.sql` **após backup e autorização**. Nenhum comando CREATE/ALTER/DROP é executado automaticamente pelo portal. A aplicação só executa SELECT e INSERT/UPDATE nessa tabela.

No painel da aplicação Node.js do Plesk, configurar exclusivamente como variáveis do servidor (nunca no frontend ou GitHub):

- `MARIADB_ENABLED=true`
- `MARIADB_HOST` (host MariaDB atribuído pelo Plesk)
- `MARIADB_PORT=3306` (se aplicável)
- `MARIADB_DATABASE` (nome do banco compartilhado existente)
- `MARIADB_USER` e `MARIADB_PASSWORD` (preferencialmente um usuário de acesso limitado à tabela `viagens_pf_period_cache`)
- `MARIADB_SSL=true` somente se exigido pela instalação, com configuração TLS validada pelo administrador
- `MARIADB_CACHE_HOURS=24` (prazo de expiração da cópia)

A aplicação exige Node.js 20+ e instalação de dependências com `npm install --omit=dev` no Plesk. O arquivo `package.json` contém o driver privado `mysql2`. Se o banco estiver indisponível, a aplicação continua consultando a DSS, com aviso sem revelar credenciais. A sincronização continua **manual pelo botão Atualizar**, e períodos em cache serão reutilizados dentro da validade; portanto, o botão **Atualizar dados da DSS** envia `refresh=1` e consulta novamente a DSS, renovando a cópia mensal somente após uma resposta completa. Consultas normais, como períodos de comparação não presentes nos dados já carregados, podem reutilizar cache dentro da validade.

**Importante:** esta etapa cria cache mensal de viagens/pedidos, não migra automaticamente todos os dados históricos nem substitui as demais funcionalidades. Até ativar as variáveis, a execução no Render permanece idêntica. A resposta da API continua filtrada pelas permissões de cada perfil.
