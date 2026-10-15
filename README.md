# COSTALOG — Portal de Viagens e Fretes

Site corporativo com visual preto, vermelho e branco, inspirado no Controle de Pneus das imagens. Frontend HTML/CSS/JavaScript com backend Node.js privado para o DSS.

## Funcionalidades criadas

- Dashboard com viagens, receita, custo, resultado e alertas de CT-e/MDF-e.
- Tabelas de viagens, pedidos de frete e CT-e, clientes e MDF-e com filtros e detalhes.
- Custo, receita e margem por viagem/cliente (apenas quando os valores estão disponíveis).
- Gráficos por mês, ranking por cliente, CSV compatível com Excel e impressão.
- Conciliação de MDF-e por ID de viagem e importação manual de CSV.
- Menu responsivo e demonstração com números FICTÍCIOS, sempre identificados.

## Rodar frontend

Execute na raiz do projeto:

    python -m http.server 8080

Abra http://localhost:8080. É possível publicar também via GitHub Pages.

## Integrar com DSS

Documentação fornecida: https://costalog.dssinformatica.com.br/wsdss/docs?urls.primaryName=APIs+Gerais

A documentação Swagger da instalação NÃO pôde ser acessada no desenvolvimento. Antes de conectar, obtenha as informações reais de listarViagens e listarPedidosFrete (caminho, método, autenticação, filtros, estrutura da resposta e paginação). Os endpoints não foram inventados.

1. Em servidor PRIVADO, copie .env.example para .env e configure DSS_BASE_URL, DSS_AUTH_HEADER, DSS_AUTH_VALUE, DSS_VIAGENS_PATH, DSS_PEDIDOS_PATH e PORTAL_ACCESS_TOKEN.
2. Ajuste as variáveis opcionais DSS_VIAGENS_METHOD / QUERY_FROM / QUERY_TO / BODY_TEMPLATE / DATA_PATH e equivalentes de pedidos e MDF-e conforme o Swagger.
3. Execute com Node.js 20 ou superior:

       node --env-file=.env api/server.mjs

4. Consulte GET http://localhost:3001/api/health.
5. No portal, clique em Conectar API, informe o endereço HTTPS do backend e o token PORTAL_ACCESS_TOKEN. O token da tela só fica na memória da aba.
6. Valide no arquivo src/app.js os adaptadores normalizeViagem, normalizeDoc e normalizeMdfe de acordo com respostas reais da DSS.

Backend implementado: GET /api/overview?from=AAAA-MM-DD&to=AAAA-MM-DD, protegido por Authorization: Bearer PORTAL_ACCESS_TOKEN. DSS_AUTH_VALUE fica SOMENTE no backend. Para POST JSON, BODY_TEMPLATE aceita os placeholders {{from}} e {{to}}.

## CT-e e MDF-e

Um pedido de frete não é automaticamente um CT-e. O painel só reconhece CT-e quando existe número ou chave de CT-e na resposta, ou quando uma fonte específica é configurada. Há suporte opcional a DSS_CTES_PATH e DSS_MDFES_PATH, quando forem verificados na documentação.

Caso não exista API de MDF-e, importe um CSV UTF-8 com colunas numero;data;viagemId;placa;status na página de MDF-e. O cruzamento por ID de viagem evita assumir que datas ou placas semelhantes comprovam a vinculação.

Receitas e custos não retornados são exibidos como desconhecidos (—), sem tratá-los como zero. Se a API retornar dados paginados, implemente todas as páginas antes de usar totais reais.

## Publicação na empresa

Habilite Settings > Pages > Source: GitHub Actions no repositório para publicar o frontend. URL prevista, somente após a ativação:

https://joaopedrocostalog-netizen.github.io/Viagens-PF/

O frontend pode ser colocado em rota interna ou incorporado em iframe pela empresa.

GitHub Pages NÃO executa o backend privado. Coloque api/server.mjs em servidor corporativo protegido por HTTPS, controle de acesso/SSO e auditoria. Configure PORTAL_ALLOWED_ORIGINS para os domínios realmente autorizados.

## Segurança e pendências

- Repositório público: nunca envie tokens, .env ou dados reais de clientes, viagens e documentos fiscais.
- Backend exige autenticação por token de portal. Para produção, ampliar com SSO e autorização individual.
- A integração real ainda requer acesso técnico à documentação Swagger e validação dos campos do DSS.
- Os dados de demonstração NÃO correspondem a dados da COSTALOG.
