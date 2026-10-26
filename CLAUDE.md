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
- `docs/HISTORICO.md`: diário das mudanças, em ordem cronológica (pode conter decisões já substituídas).

## Regras vigentes do portal

Estas regras valem hoje e substituem o que estiver diferente no histórico. Ao mudar uma delas, atualize esta seção e registre o motivo em `docs/HISTORICO.md`.

### Dados, DSS e atualização
- Consulta à DSS **somente manual**, pelo botão **Atualizar dados da DSS** ou **Desde o início** (sincronização cancelável, sem limite de meses, renovando os dois meses mais recentes e reaproveitando cache privado/MariaDB dentro da validade). Pesquisa, filtros, navegação, troca de empresa, links e login **nunca** consultam a DSS.
- Períodos longos: um mês por vez, do mais recente para o mais antigo; mês que estoura o tempo é dividido em partes menores (até 1 dia), com nova tentativa. "Desde o início" volta mês a mês até 6 meses seguidos sem registros (piso `DSS_HISTORY_FLOOR`, padrão 2000-01-01). Se o período não couber na memória do servidor (orçamento de linhas calculado pela memória do Node/contêiner, ou `PORTAL_MAX_ROWS`), carrega os meses mais recentes que cabem e avisa a partir de quando — nunca derruba o servidor. Erros informam o mês e o motivo.
- Memória: as linhas da DSS são reduzidas aos campos operacionais na chegada, a base é preparada uma vez por empresa e a resposta bruta é descartada. `api/memory-launch.mjs` ajusta o teto de memória do Node a 50% do contêiner (Render Free) — deve continuar sendo o primeiro import de `api/server.mjs`. Só alertas dos últimos 3 meses do período (`PENDING_OBSERVE_MONTHS`) ganham registro automático de primeira detecção; os demais aparecem na central, calculados na hora.
- A consulta só é publicada depois que todas as fontes obrigatórias terminam; cancelar mantém a última consulta completa. Fontes opcionais (programações, ocorrências, rotas, motoristas) podem falhar sem derrubar a consulta, e o progresso mostra o motivo curto. Programações e ocorrências usam o mesmo limite de tempo das consultas principais (`DSS_TIMEOUT_MS`); rotas, 6 s.
- A **última consulta manual completa** é compartilhada entre usuários autenticados (`GET /api/portal/latest`): ao entrar, o portal já abre com ela, sem chamar a DSS. Consultas de comparativo continuam privadas. Sair não apaga a compartilhada; ela expira pelo prazo normal. O horário aparece sob o botão ("Atualizado há X min"), em amarelo após 1 hora.
- Não inventar dados ausentes. Enquanto a DSS não enviar KM, `KM_FROM_API=false` (`src/data-availability.mjs`) tira KM de todas as telas, fichas, relatórios, comparativos e alertas; trocar para `true` reativa tudo.
- Datas na interface em dd/mm/aaaa (digitáveis, com calendário), ISO nas consultas, preferências e gravações. Classificações diárias e prazos no fuso `America/Sao_Paulo`.

### Empresas, perfis e segurança
- Portal **Costalog** (AC da Costa, CRC, Comex, com seletor de pessoa jurídica) e portal **Ideallog** separados. Classificação só por `empresa` e vínculos documentais inequívocos, nunca por cliente, placa ou número repetido entre pessoas jurídicas. Empresa desconhecida ou vínculo ambíguo fica de fora.
- Trocar de empresa limpa filtros e seleções e usa a base já preparada da outra empresa, sem nova consulta. Respostas antigas são descartadas.
- Portal **operacional**: nenhum campo financeiro (fretes, faturamento, valores, abastecimento) em tela, ficha, exportação ou resposta da API, para nenhum perfil. Administração e faturamento continuam ocultos; endpoints de contas preservados para manutenção.
- Senhas, tokens e credenciais da DSS só no servidor. Links compartilhados levam apenas empresa, área, filtros permitidos e referência de registro.
- Erros do navegador, servidor e DSS vão para `api/error-log.mjs` (memória + log do processo, sem dados sensíveis); administrador vê em Informações técnicas. `ERROR_WEBHOOK_URL` opcional (Slack/Teams/Discord).

### Telas
- Áreas: Painel (inicial), Viagens/RV, Pedidos de frete, Relatórios, Programação do dia, Comparativos, Entregas, Pendências, Rotas, Frota, Motoristas, MDF-e, Ocorrências.
- **Etapas da RV** na ordem Incluído → Escalado → Viajando → Finalizado → Encerrado; Finalizado ≠ Encerrado. Só variações de grafia são padronizadas (`Encerrada` → `Encerrado`, `cancelado` → `Cancelado`); outros códigos aparecem como a DSS envia. Nas outras áreas, "Etapa da RV vinculada" filtra só documentos com vínculo seguro.
- **Programação do dia**: RVs com início/término na data e RVs em andamento que atravessam a data. A barra de etapas, os cartões e a tabela usam as mesmas RVs. Cartões filtram a tabela; ◀ ▶ trocam o dia; exportação Excel/PDF usa o mesmo filtro; **Modo TV** em tela cheia. `data_emissao` de programação é emissão, nunca saída prevista.
- Uma única pesquisa global por tela. **Filtros avançados** recolhíveis (só abrem/fecham por ação do usuário) e **etiquetas** dos filtros ativos com remoção individual. Tabelas com 25/50/100 linhas por página (Pendências: 25, por causa da seleção em lote).
- Painel personalizável: cartões escolhidos e reordenados **arrastando com o mouse** no modo "Personalizar cartões" (setas do teclado como alternativa acessível).
- Ficha da RV: checklist somente leitura, linha do tempo paginada, documentos vinculados e ocorrências da mesma placa como **contexto** (não vínculo).
- Relatórios: prévia de 25 linhas e exportação CSV/Excel/PDF com o mesmo modelo filtrado (inclui Programação do dia). Modelos de relatório e filtros salvos são preferências por usuário/empresa, sem dados operacionais. Indicadores do Painel têm **Ver registros** com filtro explícito e removível.
- Comparativos: períodos A e B livres; indicadores e **etapas da RV** por período (a DSS não guarda histórico de mudança de etapa, então não medir transições).

### Pendências
- Tratamentos do portal (responsável, prazo, prioridade, situação, comentários, resoluções com motivo, histórico, revisão otimista com 409) não alteram a DSS. Separados por empresa e por chave tipo:área:ID com namespace.
- Alertas são observados só após sincronização manual completa; reincidência exige ausência confirmada e retorno posterior.
- **Minhas pendências** (Vencidas, Para hoje, Próximas, Sem prazo), **Agrupar por RV**, **Arquivo de tratadas** (paginado no servidor) e **Avisos** no cabeçalho, sem consultar a DSS. Ações em lote só na página visível, com prévia no servidor, token de uso único (5 min), até 100 chaves e recusa total se houver conflito de revisão.
- **Prazos por tipo** e **RV parada** configurados por administradores: Incluído/Escalado começam desligados (sem SLA inventado); "RV sem término" (Viajando) mantém 2 dias por padrão. Contagem de RV parada pela data de **início** da DSS. Clientes antigos não apagam regras salvas.
- Sem banco de dados por decisão do proprietário: arquivo privado de tratamentos; no Render Free ele é temporário. Não prometer persistência; não executar SQL sem autorização.

### Desempenho
- Paginação de rede (`portalVersion: 2`): o servidor devolve só a página pedida; exportação completa só quando explícita.
- O navegador guarda até 30 páginas por 5 minutos (exceto Painel e Pendências) e mantém a página anterior esmaecida e inativa enquanto a nova carrega. Abrir a ficha não recarrega a lista.
- O servidor memoriza a separação empresa + período por consulta preparada.
- `.github/workflows/manter-render-acordado.yml` acessa `/api/health` a cada 10 minutos para o Render Free não dormir.

## Como trabalhar no código

- **Telas**: `src/portal-view.mjs` é o renderizador **único** (servidor e navegador). Corrija telas ali ou nos módulos que ele usa (`advanced-ui`, `intelligence-ui`, `programming`, `visual-dashboard`, `rv-checklist`...). `api/portal-render.mjs` só valida estado, carrega tratamentos/regras, importa MDF-e e resolve comparativos. `src/app.js` é o casco: estado, login, eventos.
- **Módulo novo em `src/`**: registrar na lista pública de `api/server.mjs`, nos `node --check` e `cp` de `.github/workflows/pages.yml` e na lista de `tests/server.test.mjs`.
- **Estado novo que muda a página**: incluir em `fields` de `src/portal-client.mjs` e em `stateFields` de `api/portal-render.mjs` (validar lá se for número/lista).
- **Demonstração**: `src/demo-data.mjs` (formato bruto da DSS, datas relativas a hoje).
- **Comandos**: `npm test` (Node), `npm run test:e2e` (Chromium; modo demonstração e servidor real com DSS simulada), `npm run format` / `npm run format:check` (Prettier). O GitHub Actions (`testes.yml`) roda os três a cada envio.
