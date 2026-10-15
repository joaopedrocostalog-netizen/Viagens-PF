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
