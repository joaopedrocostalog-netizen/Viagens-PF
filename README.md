# COSTALOG — Portal de Viagens e Fretes

Site corporativo com visual preto, vermelho e branco, inspirado no Controle de Pneus das imagens. A barra lateral utiliza o PNG original logo-costalog-sem-fundo-1024x876.png, já presente no repositório. Frontend HTML/CSS/JavaScript com backend Node.js privado para o DSS.

## Funcionalidades criadas

- Dashboard com viagens, receita, custo, resultado e alertas de CT-e/MDF-e.
- Tabelas de viagens, pedidos de frete e CT-e, clientes e MDF-e com filtros e detalhes.
- Valores de pedidos por viagem e cliente (total_frete), abastecimento por viagem (valor_total_abastecido) e apresentação explícita de custos totais/lucro como indisponíveis quando não há dados suficientes.
- Gráficos por mês, ranking por cliente, CSV compatível com Excel e impressão.
- Conciliação de MDF-e por ID de viagem e importação manual de CSV.
- Menu responsivo e demonstração com números FICTÍCIOS, sempre identificados.

## Rodar frontend

Execute na raiz do projeto:

    python -m http.server 8080

Abra http://localhost:8080. É possível publicar também via GitHub Pages.

## Integrar com DSS

Documentação fornecida: https://costalog.dssinformatica.com.br/wsdss/docs?urls.primaryName=APIs+Gerais

Os esquemas fornecidos confirmaram GET /listarViagens e GET /listarPedidosFrete, com filtros data_inicio e data_fim (dd/mm/aaaa). Ambos retornam o array registros, acompanhado de status, apiVersion, mensagemErro e qtd_registros. Foi informado que a instalação usa **Basic Auth (usuário e senha)**. Ainda é necessário confirmar o endereço-base efetivo das operações e validar o acesso real no servidor autorizado.

1. Em servidor PRIVADO, copie .env.example para .env, informe DSS_BASE_URL e PORTAL_ACCESS_TOKEN, além de DSS_AUTH_TYPE=basic, DSS_USERNAME e DSS_PASSWORD com os dados reais da conta de integração do DSS. Guarde-os somente no servidor; nunca faça commit do arquivo .env. Os demais parâmetros das duas operações já estão preenchidos conforme a documentação enviada.
2. Verifique a URL efetiva das duas rotas, o acesso ao módulo tms_integr_prog_pg_motorista e se a quantidade em qtd_registros corresponde à lista recebida. No backend os filtros ISO do navegador são convertidos para dd/mm/aaaa.
3. Execute com Node.js 20 ou superior:

       node --env-file=.env api/server.mjs

4. Consulte GET http://localhost:3001/api/health.
5. No portal, clique em Conectar API, informe o endereço HTTPS do backend e o token PORTAL_ACCESS_TOKEN. O token da tela só fica na memória da aba.
6. Confira os registros reais antes de usar o portal operacionalmente. O mapeamento documentado está em src/dss-mapping.mjs e os testes em tests/dss-mapping.test.mjs.

Backend implementado: GET /api/overview?from=AAAA-MM-DD&to=AAAA-MM-DD, protegido por Authorization: Bearer PORTAL_ACCESS_TOKEN. Nas consultas ao DSS, o backend envia **Authorization: Basic base64(usuario:senha)**. São **duas autenticações independentes**: Bearer é do portal, Basic é do DSS. Em caso de instalação diferente, o modo legado DSS_AUTH_TYPE=header permite fornecer DSS_AUTH_HEADER e DSS_AUTH_VALUE sem alterar o frontend. Para POST JSON, BODY_TEMPLATE aceita os placeholders {{from}} e {{to}}.

## CT-e e MDF-e

Nos pedidos, nro_cte com valor não nulo nem zero identifica CT-e. pf_id/nro_pf identificam pedidos. rv_viagem é conciliado com rv_id ou nro_rv; na ausência desse vínculo, nro_mdf pode sugerir vínculo apenas quando o mesmo número for único entre as viagens. Referências ambíguas são marcadas, não confirmadas. Há suporte opcional a DSS_CTES_PATH e DSS_MDFES_PATH, caso existam no ambiente.

Os campos nro_mdf nas viagens e pedidos são referências de MDF-e, não respostas fiscais completas nem confirmação de situação do documento. A aba MDF-e mostra essas referências com aviso. Para situação fiscal, conecte outra fonte ou importe um CSV UTF-8 com colunas numero;data;viagemId;placa;status.

O total_frete representa o valor do pedido e não prova faturamento/recebimento. O valor_receber é preservado separadamente. Na RV, valor_total_abastecido, valor_adiantamento_vf, valor_proventos_vf e valor_liquido_vf NÃO são somados como custo total, pois podem se sobrepor. A tela mostra abastecimento como custo parcial; sem outros custos e regra de apuração, lucro/margem ficam como desconhecidos (—). Caso qtd_registros supere a quantidade retornada, o backend bloqueia o relatório para evitar números incompletos.

## Publicação na empresa

Habilite Settings > Pages > Source: GitHub Actions no repositório para publicar o frontend. URL prevista, somente após a ativação:

https://joaopedrocostalog-netizen.github.io/Viagens-PF/

O frontend pode ser colocado em rota interna ou incorporado em iframe pela empresa.

GitHub Pages NÃO executa o backend privado. Coloque api/server.mjs em servidor corporativo protegido por HTTPS, controle de acesso/SSO e auditoria. Configure PORTAL_ALLOWED_ORIGINS para os domínios realmente autorizados.


## Módulos operacionais e melhorias adicionais (outubro de 2026)

Esta versão contém funcionalidades de consulta e análise que usam listarViagens e listarPedidosFrete, preservando o backend Basic Auth privado. O frontend permanece no GitHub Pages e exige a ativação do backend corporativo para exibir dados reais.

### Operação

- Painel: quantidade de RVs em andamento/finalizadas, pedidos, CT-e, entregas sem comprovante, fretes, abastecimento e comparação com o período anterior.
- Viagens: ficha RV com contrato, motorista, veículos, container, MDF-e referenciado, datas, rotas, KM previsto/rodado, desvio e custo parcial de abastecimento por KM.
- Pedidos e CT-e: datas, número de PF/CT-e, cliente, rota, motorista, valores, tributos, averbação, situação de entrega, comprovante, fatura e ocorrências.
- Central de pendências: CT-e não numerado, entrega sem comprovante, faturamento sem número de fatura, vínculo RV ausente/ambíguo, ocorrências e desvio de KM. São indícios para conferência, não certezas de irregularidade.
- Áreas específicas: clientes, rotas, frota, motoristas, containers, referências MDF-e, faturamento e análises mensais.

### Pesquisa e relatórios

- Períodos rápidos, filtros por cliente/placa/tipo de serviço, pesquisa textual, ordenação, paginação e personalização de colunas.
- Preferências de filtros guardadas localmente, sem persistir dados operacionais da empresa.
- Relatórios de RV, PF, CT-e, clientes, rotas, frota, motoristas, containers, MDF-e, pendências e meses.
- CSV UTF-8, arquivo Excel XLSX real com múltiplas abas e versão de impressão preparada para a função Salvar como PDF do navegador.
- Horário da última sincronização, atualização automática opcional com a aba aberta, tratamento de falhas sem substituição silenciosa dos últimos dados reais.

### Backend

- Basic Auth DSS guardado apenas no servidor corporativo, separado do Bearer do portal.
- Cache limitado por TTL em memória, limite simples de consultas por IP e rota protegida de diagnóstico /api/status.
- Testes automatizados para normalização, cálculos, conciliação, exportação Excel, renderização das telas e proxy DSS simulado.
- As credenciais reais e dados de clientes não devem ser publicados no GitHub.

### Limitações expressas

Status fiscal de MDF-e/CT-e, pagamento efetivamente recebido, lucro e custo operacional completo, GPS, comprovantes digitais e SSO/login individual exigem fontes e integração complementares. A interface não deve inferir essas informações dos endpoints atuais. A implantação do backend no servidor da COSTALOG continua necessária para ligar as telas aos registros reais.

## Segurança e pendências

- Repositório público: nunca envie tokens, .env ou dados reais de clientes, viagens e documentos fiscais.
- Backend exige autenticação por token de portal. Para produção, ampliar com SSO e autorização individual.
- A integração real ainda requer implantação do backend privado, confirmação da URL de serviço, usuário/senha da conta de integração configurados no servidor e validação dos campos com respostas reais do DSS.
- Os dados de demonstração NÃO correspondem a dados da COSTALOG.

## Testes e GitHub Actions

A publicação executa verificações de sintaxe e testes automáticos de mapeamento de RV, pedido/CT-e e backend. O teste do backend usa um servidor DSS **simulado**, confere Basic Auth e testa o token do portal, sem acessar ou registrar credenciais reais. Falhas de execuções anteriores permanecem no histórico do GitHub, mesmo após a correção; sempre confira a execução mais recente no branch main.

## Diagnóstico da integração (DSS x portal)

**O frontend hospedado no GitHub Pages não se conecta diretamente ao DSS.** É obrigatório configurar e executar o backend Node.js num servidor privado, com HTTPS e controle de acesso. A própria equipe da empresa deve definir esse endereço seguro.

1. Configure no servidor o arquivo privado .env a partir do modelo .env.example, com DSS_AUTH_TYPE=basic, DSS_USERNAME, DSS_PASSWORD e um PORTAL_ACCESS_TOKEN forte (diferente da senha DSS).
2. Confirme DSS_BASE_URL. Com o padrão atual, o backend monta o destino como DSS_BASE_URL + /listarViagens ou /listarPedidosFrete. Se os caminhos reais tiverem outro prefixo, ajuste DSS_BASE_URL e as variáveis DSS_*_PATH.
3. Inicie o backend (Node.js 20+) com node --env-file=.env api/server.mjs, atrás de um proxy HTTPS. Não exponha a porta diretamente na internet.
4. Consulte /api/health no servidor: configured=true exige base URL, rotas, credenciais DSS e token do portal; não significa que a consulta DSS já funcionou.
5. No site, clique em **Conectar API**, informe a URL HTTPS do backend corporativo e o PORTAL_ACCESS_TOKEN. **Não digite a senha DSS no navegador.** O token do portal não é armazenado; depois de recarregar a página, será necessário digitá-lo novamente.
6. Clique em Atualizar e confira os resultados. Se não houver acesso ao backend, serão exibidos dados de demonstração com aviso, nunca dados reais presumidos.

Erros comuns:
- HTTP 401 no endpoint do **portal**: PORTAL_ACCESS_TOKEN incorreto. Não é a senha DSS.
- Falha DSS HTTP 401: credenciais DSS_USERNAME / DSS_PASSWORD incorretas ou conta bloqueada.
- Falha DSS HTTP 403: permissões DSS insuficientes ou módulo tms_integr_prog_pg_motorista não habilitado.
- Falha DSS HTTP 404: endereço base ou rota DSS incorreta.
- HTTP 503 no portal: base URL ou Basic Auth DSS ainda não configurados no backend.
- Erro de rede/CORS: conferir HTTPS, endereço do backend e PORTAL_ALLOWED_ORIGINS.

A interface aguarda até 45 segundos por resposta. O backend tem um limite configurável por consulta (DSS_TIMEOUT_MS, padrão 20 segundos). Os testes automatizados usam um **servidor DSS simulado**, sem credenciais nem informações reais da COSTALOG.

Os workflows antigos com falhas continuam no histórico do GitHub mesmo depois de executados os reparos: confirme o commit e o status da execução mais recente.

## Backend em Docker (opcional)

Uma forma de rodar a API em servidor Linux/Windows com Docker é configurar .env **somente no servidor**, depois iniciar:

    docker compose up -d --build

O compose.yaml expõe a porta apenas no loopback (127.0.0.1:3001), não diretamente na internet. A empresa precisa configurar um proxy reverso HTTPS autenticado para a URL usada na tela "Conectar API". Nunca hospede o arquivo .env no GitHub Pages.


## Permissões de acesso e separação de viagens e faturamento

O portal agora tem uma separação real entre módulos **Operacional** e **Financeiro**. A segurança não depende de esconder abas: a API sanitiza os dados antes de transmiti-los.

| Perfil | O que pode consultar |
|---|---|
| operacional | Painel operacional, RVs, pedidos/CT-e sem valores, entregas, pendências operacionais, rotas, frota, motoristas, containers, referências MDF-e e relatórios operacionais |
| financeiro | Tudo de operacional **e** faturamento, valores de frete, custos parciais, análises de clientes, relatórios financeiros |
| administrador | Tudo de operacional e financeiro **e** administração/diagnósticos e integração |

- Campos como total_frete, valor_receber, valor_total_abastecido, adiantamentos, proventos, tributos, valores de averbação e números de fatura **não saem da API** para usuários operacionais. O servidor usa lista explícita de campos operacionais permitidos.
- Os perfis de faturamento são restritos também em **Excel/CSV/PDF**. Links, menus ou requisições adulteradas não podem contornar o filtro de dados no servidor.
- Senhas de funcionários não são as senhas Basic Auth do DSS. Cada conta utiliza uma senha individual protegida com scrypt e sal. A sessão expira após 8 horas e é apagada no logout. Desativar uma conta ou alterar sua senha invalida a sessão existente.
- O antigo token PORTAL_ACCESS_TOKEN **está desabilitado por padrão**. Ele só funciona se PORTAL_USERS_FILE estiver ausente e PORTAL_ALLOW_LEGACY_TOKEN=true for configurado explicitamente (não recomendado em produção). Para ter separação real de acesso, configure o arquivo de usuários e não distribua um token administrador compartilhado.
- O código está em api/auth.mjs e api/access.mjs, o gerenciador de contas em api/users.mjs e a interface em src/app.js / src/access-ui.mjs.

### Criando as contas (somente no servidor privado)

Configure PORTAL_USERS_FILE para apontar para um arquivo **fora da pasta publicada no site**, nunca dentro do GitHub Pages.

Exemplo num servidor Linux com Node.js instalado, na pasta do projeto:

    mkdir -p private
    export PORTAL_USERS_FILE=./private/portal-users.json
    node api/users.mjs add gerente administrador
    node api/users.mjs add financeiro01 financeiro
    node api/users.mjs add operacional01 operacional
    node api/users.mjs list

Os comandos add pedem uma senha de **no mínimo 12 caracteres** no terminal sem mostrá-la. O comando list não mostra senhas nem hashes.

No Windows PowerShell, a configuração do caminho é:

    New-Item -ItemType Directory -Force private
    $env:PORTAL_USERS_FILE=".\private\portal-users.json"
    node api/users.mjs add gerente administrador
    node api/users.mjs add operacional01 operacional

Para alterar a função de alguém, bloquear uma conta ou redefinir a senha:

    node api/users.mjs role operacional01 financeiro
    node api/users.mjs disable operacional01
    node api/users.mjs enable operacional01
    node api/users.mjs password operacional01

Depois, no servidor privado que executará a API, ajuste o arquivo .env:

    PORTAL_USERS_FILE=/app/private/portal-users.json

A configuração acima corresponde ao caminho de dentro do Docker em compose.yaml. A pasta privada de usuários é montada **com escrita** em /app/private, para que o administrador possa cadastrar funcionários pelo portal. Para execução direta, sem Docker, use o caminho real do arquivo nesse servidor.

Configure também DSS_USERNAME e DSS_PASSWORD exclusivamente no servidor, e crie um proxy HTTPS com acesso corporativo. Se o usuário Node dentro do contêiner não tiver permissão de leitura no arquivo, ajuste a propriedade/permissões do arquivo no host, sem torná-lo público.

    docker compose up -d --build

O contêiner precisa de permissão de escrita na pasta privada para que a interface administrativa possa criar, bloquear e atualizar contas. Inicialize o primeiro administrador com node api/users.mjs bootstrap admin antes de iniciar a API. Faça backup protegido do arquivo privado e mantenha senhas sob responsabilidade da TI.

### Como funciona para o funcionário

1. Abre a página do portal.
2. Clica em Entrar e informa o endereço HTTPS do backend corporativo, seu usuário e a senha individual.
3. O portal identifica o perfil atribuído no servidor e apresenta somente as abas autorizadas.
4. Usuários operacionais não recebem valores financeiros nem em respostas diretas do endpoint /api/overview.
5. Ao clicar em Sair, a sessão é revogada e os dados anteriores são removidos da interface.

**Importante:** o GitHub Pages continua público como hospedagem do código estático e mostra apenas **dados fictícios** quando não há login. Os registros reais devem ser acessados somente por login autenticado via servidor da empresa. Para um portal integralmente privado, hospede também o frontend na rede corporativa, atrás de SSO/reverse proxy. O modo legado com token compartilhado não deve ser usado para conceder acesso a funcionários.

### Testes de proteção

Os testes automatizados validam projeções distintas de resposta DSS para operacional/financeiro; acesso negado a diagnósticos administrativos; isolamento do cache entre perfis; logout; bloqueio imediato de usuário; abas visíveis por perfil; exportação que não inclui campos financeiros para um funcionário operacional.

## Criar o primeiro administrador e liberar funcionários pelo site

Veja [ADMINISTRACAO.md](ADMINISTRACAO.md), com comandos para Linux/Windows e Docker. O painel Administração agora permite cadastrar funcionários como Operacional, Financeiro ou Administrador, alterar perfil, bloquear/reativar contas e redefinir senhas. Novos funcionários precisam trocar a senha provisória no primeiro login. A primeira conta admin só é criada **no servidor privado** após a TI escolher uma senha; não há senha padrão e nenhuma conta real é provisionada pelo GitHub Pages.

## Teste rápido no mesmo PC (Windows)

Para evitar problemas de CORS/rede ao abrir o GitHub Pages enquanto o backend está apenas no PC, execute o backend diretamente na pasta completa do projeto:

    $env:PORTAL_USERS_FILE = (Join-Path (Get-Location) "private\portal-users.json")
    node api/server.mjs

Depois abra http://localhost:3001/ — neste endereço o frontend e a API usam a mesma origem, e o formulário de login preenche o endereço do servidor local automaticamente. Teste http://localhost:3001/api/health e verifique "accounts":true. Nunca compartilhe os arquivos .env e private/portal-users.json; o servidor serve apenas uma lista explícita de arquivos estáticos públicos. Para acessar de outros dispositivos, implante o portal com HTTPS e o backend privado.

## Ativar integração DSS sem alterar o login

Veja [INTEGRACAO_DSS.md](INTEGRACAO_DSS.md). O backend Node.js já trata `GET /listarViagens` e `GET /listarPedidosFrete` com filtros `data_inicio`/`data_fim`, autenticação DSS Basic Auth no servidor, login individual e projeção de informações por perfil. No GitHub Pages, o endereço HTTPS do backend é configurado **somente** em `src/site-config.mjs`; sem isso, o frontend permanece em demonstração, sem credenciais e sem dados reais. Nunca substitua a URL da API pelo endereço Swagger `/wsdss/docs`.
