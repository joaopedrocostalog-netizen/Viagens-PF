# CLAUDE.md — Instruções de migração do Portal COSTALOG para Plesk

> Leia este arquivo **antes de modificar ou implantar o repositório**. Este documento registra a intenção do proprietário para uma futura migração; não dá permissão para alterar outros sistemas ou executar operações destrutivas sem validação e autorização.

## Objetivo e infraestrutura confirmada

- Projeto: Portal COSTALOG — Viagens e Fretes, repositório `joaopedrocostalog-netizen/Viagens-PF`.
- Hoje: frontend GitHub Pages e backend privado no Render. **Manter ambos funcionando até o ambiente Plesk passar nos testes de aceitação.**
- Destino: hospedagem Plesk da COSTALOG. Usuário informou disponibilidade de **Node.js 26.11.1** e de **MariaDB**.
- Banco MariaDB existente e **compartilhado** com outros sistemas: `wp_n32k4`. **Não criar outro banco**, a menos que o proprietário mude essa orientação.
- O proprietário informou que a tabela **`viagens_pf_period_cache` já foi criada no phpMyAdmin**, com cinco colunas, chave primária composta e índice para expiração. **Não executar novamente a criação nem modificar a tabela sem verificação e autorização.**
- Confirmar no Plesk o domínio/subdomínio, raiz exclusiva da aplicação, versão ativa do Node, permissões e instalação de dependências. Evitar alterar o `httpdocs`, `.node-version` ou a aplicação do site principal sem autorização explícita.

## Procedimento de migração — executar somente quando solicitado e com acesso autorizado

1. Inspecionar o repositório, o Plesk e os serviços existentes antes de mudar qualquer configuração. Fazer backup completo e planejar rollback.
2. Criar/configurar **uma aplicação Node.js isolada** para o portal, em diretório próprio. Dependências: `npm install --omit=dev`; inicialização: `node api/server.mjs` (`npm start`). O backend exige Node 20+.
3. Configurar **variáveis de ambiente privadas no servidor**, sem inserir senhas/tokens no código, no GitHub, no navegador, em logs ou neste arquivo. A integração DSS existente usa `DSS_BASE_URL`, `DSS_AUTH_TYPE`, `DSS_USERNAME`, `DSS_PASSWORD`; preservar também as variáveis de autenticação/permissões do portal e as origens HTTPS permitidas.
4. Configurar MariaDB somente na aplicação do portal: `MARIADB_ENABLED=true`, `MARIADB_HOST` (valor real do Plesk), `MARIADB_PORT` (geralmente 3306), `MARIADB_DATABASE=wp_n32k4`, `MARIADB_USER`, `MARIADB_PASSWORD`, `MARIADB_CACHE_HOURS=24`. `MARIADB_SSL` somente com a configuração de segurança exigida pelo servidor.
5. Criar, se possível, **usuário MariaDB exclusivo** com privilégio mínimo de `SELECT`, `INSERT`, `UPDATE` exclusivamente na tabela `wp_n32k4.viagens_pf_period_cache`. Nunca usar credenciais de administrador de todo o banco se houver alternativa.
6. Inspecionar com `SHOW CREATE TABLE viagens_pf_period_cache` para validar a estrutura, sem reexecutar DDL automaticamente:
   - `period_from VARCHAR(10) NOT NULL`
   - `period_to VARCHAR(10) NOT NULL`
   - `payload_json LONGTEXT NOT NULL`
   - `expires_at DATETIME NOT NULL`
   - `updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
   - Chave primária composta (`period_from`, `period_to`) e índice de `expires_at`.
7. Executar testes em ambiente isolado: `npm test`, `GET /api/health`, autenticação, consulta limitada da DSS, gravação/leitura do cache em MariaDB, consulta em cache, botão de atualização forçada `refresh=1`, comparação de períodos e permissões por perfil. Confirmar que **nenhuma tabela externa ao prefixo do portal foi tocada**.
8. Configurar HTTPS, CORS e frontend para a URL do backend Plesk, com verificação de login/logout, dados financeiros por perfil, consultas mensais e relatórios. Fazer migração gradual e rollback disponível; só desativar Render após aceitação expressa.

## Regras de arquitetura que NÃO podem ser quebradas

- A DSS é a fonte oficial dos dados de viagens/fretes. Consultas da DSS devem sair somente do backend com autenticação privada.
- **Atualização automática desativada.** O botão **Atualizar dados da DSS** inicia consulta nova (`refresh=1`) e renova o cache somente após resposta completa. Comparativos e leituras normais podem aproveitar dados no banco dentro da validade.
- Backend atual possui `api/mariadb-store.mjs` (MariaDB opt-in), `api/period-store.mjs` (cache opcional em disco) e `api/server.mjs` (seleção de repositório). A tabela é **um cache mensal de respostas DSS**, não a migração completa dos dados em tabelas normalizadas; não prometer que já implementa armazenamento integral.
- A aplicação deve continuar funcionando em modo DSS/Render quando `MARIADB_ENABLED` não estiver ativado ou se o banco estiver indisponível.
- Preservar painel, viagens, pedidos/CT-e, motoristas, rotas, ocorrências, comparativos com períodos livres, relatórios, filtros, autenticação, permissões e indicadores. Não inventar dados ausentes (KM, custo, faturamento, vínculo de pedidos).
- Não criar, alterar, renomear ou excluir objetos de outros sistemas da COSTALOG. Antes de qualquer migração SQL, obter backup e autorização; utilizar somente objetos com prefixo `viagens_pf_`.
- Não guardar informações sensíveis na pasta pública `httpdocs` (cache, `.env`, arquivos de usuários, logs privados). Manter backend e arquivos privados fora do diretório servido, conforme as capacidades da hospedagem.

## Documentos técnicos

- `database/viagens_pf_schema.sql`: modelo da tabela, **referência de conferência**, não para aplicar cegamente porque a tabela já existe.
- `RENDER_FREE.md`: parâmetros DSS e notas de migração MariaDB.
- `package.json`: dependência `mysql2` e comandos de execução.
- `tests/mariadb-store.test.mjs`: testes de acesso isolado ao cache.


## Melhorias recentes: atualização incremental e visão 360°

- O frontend continua consultando a API por mês. Ao clicar em **Atualizar dados da DSS**, envia `refresh=recent&sync_to=<data final do intervalo total>`.
- O backend renova os **dois meses mais recentes do intervalo solicitado** e tenta aproveitar períodos anteriores do cache privado/MariaDB. Se não houver cache, consulta a DSS normalmente. Uma atualização histórica integral pode continuar sendo solicitada com `refresh=1` pela API autorizada. O cache não significa sincronização em tempo real.
- Ao abrir detalhes de uma viagem, a interface exibe dados da RV, documentos/pedidos vinculados e ocorrências que coincidem por **placa e período**; estas são apenas contexto, não vínculo comprovado. Valores financeiros continuam condicionados ao perfil de acesso.
- A tabela de viagens já pagina no navegador em grupos de 15 registros. **Paginação server-side real ainda não foi implementada**; isso exigirá endpoints adicionais com autorização, filtros e contagens consistentes, sem quebrar relatórios completos.


## Paginação de registros no backend (implementação inicial)

- Endpoint privado `GET /api/records?kind=viagens&from=2026-10-01&to=2026-10-19&page=1&page_size=15&search=texto&sort=data_inicio&direction=desc`. Também suporta `kind=pedidos`.
- Requer o token do portal e respeita projeção dos campos de cada perfil. Páginas de 1 a 100 registros, total de registros e páginas. Busca e ordenação executadas no servidor **sobre dados mensais já sincronizados**.
- Retorna HTTP 409 se um mês do intervalo ainda não estiver no armazenamento persistente. Não consulta a DSS automaticamente, preservando atualização manual.
- A interface ainda usa o carregamento completo do `/api/overview` para relatórios, métricas e gráficos. A troca da tabela para a paginação do backend deve ser feita gradualmente, garantindo coerência dos filtros, detalhes e permissões; **não anunciar paginação integral do site até essa segunda etapa**.


## Escopo atual do portal — 22/10/2026

- A pedido do proprietário, a navegação de negócio mantém somente **Viagens / RV** e **Pedidos de frete**. Administração fica disponível apenas para gestão das contas.
- Faturamento, clientes/fretes, análises financeiras e as demais telas ficam ocultos. As referências operacionais de CT-e/MDF-e continuam disponíveis nos registros de RV/PF.
- Todos os perfis, inclusive financeiro e administrador, recebem somente campos operacionais. A projeção vale para `/api/overview`, cache e `/api/records`; exportações de viagens/PF também removem campos financeiros.
- Preservar autenticação, contas existentes, sincronização DSS e armazenamento. Não reativar dados de faturamento por perfil nem restaurar abas ocultas sem novo pedido.


## Revisão do escopo operacional — 22/10/2026

- A solicitação mais recente oculta **Administração** para todos os perfis e restaura **Entregas, Pendências, Rotas, Frota, Motoristas, MDF-e e Ocorrências**, além de viagens/RV e pedidos de frete. Dados de faturamento continuam ocultos.
- A alternância no topo e o parâmetro `?empresa=costalog|ideallog` identificam o portal ativo. **Costalog inclui AC da Costa, CRC e Comex; Ideallog permanece separada.**
- `/api/overview` e `/api/records` aceitam `company=costalog|ideallog` (padrão Costalog), rejeitam empresas inválidas e filtram cada resposta, inclusive a partir de caches privados compartilhados. O navegador também filtra respostas de backends antigos antes de normalizar os registros.
- A classificação usa `empresa` e vínculos documentais inequívocos, nunca o cliente ou a placa isoladamente. Registros com empresa desconhecida ou vínculos ambíguos não entram em nenhuma visão. Ocorrências sem empresa precisam de referência segura a RV/PF/MDF-e para serem exibidas.
- Trocar de empresa limpa seleções e filtros. Dados já carregados são guardados separadamente por empresa e intervalo; respostas de consultas iniciadas antes da troca são descartadas. Exportações usam somente o conjunto da empresa ativa e sua identificação.
- A logo `Ideallog.png` foi reaproveitada do repositório Faturamento e faz parte dos arquivos publicados no Pages e no backend. As contas e endpoints de gestão continuam preservados para manutenção, sem aba ou consulta automática de usuários na interface.
