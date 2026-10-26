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


## Pendências paginadas sob demanda — 22/10/2026

- Pendências exibe **25 itens por página**, com Anterior/Próxima. Alterar prioridade ou tipo volta à primeira página; trocar empresa/período invalida o índice anterior.
- `createAlertPager` mantém referências aos registros ordenados e contagens por tipo/prioridade. Títulos, detalhes e cartões são gerados somente para a página solicitada; não guardar arrays ou HTML de outras páginas nem usar `makeAlerts` para materializar a lista inteira nesta tela.
- A verificação de RVs sem pedido usa um `Set` de vínculos, evitando a varredura de todos os PFs para cada RV. O cálculo financeiro legado de `totals` não é executado nas telas operacionais.
- Esta paginação opera sobre os dados-base já sincronizados por `/api/overview`; não equivale a buscar os registros DSS no servidor em lotes de 25. Preservar a separação por empresa e os filtros ao evoluir a sincronização.


## Painel, relatórios e filtros — 22/10/2026

- O Painel voltou a ser a tela inicial. A aba Relatórios oferece relatórios operacionais de RVs, PF/CT-e, entregas, rotas, frota, motoristas, MDF-e, pendências, ocorrências e resumo mensal. Administração e faturamento permanecem ocultos.
- `src/filtering.mjs` centraliza buscas sem distinção de acentos, placas com/sem separadores, vários termos e datas brasileiras. Buscas locais se aplicam ao conteúdo da aba; a pesquisa global abre registros da empresa e do período ativos.
- Opções dos filtros vêm da empresa/período antes dos filtros de cliente, placa e serviço, permitindo mudar uma seleção diretamente. MDF-e e ocorrências também respeitam os vínculos dos registros filtrados. Situação do registro e vínculo documental são controles separados.
- `buildOperationalReport` usa o mesmo modelo filtrado, ordenado e com colunas operacionais na prévia e nas exportações CSV/Excel/PDF. A prévia pagina em 25 itens; pendências conserva o gerador sob demanda. Somente exportações explícitas produzem relatórios completos.
- Digitação tem atraso de 160 ms para atualizar a tela, preservando foco e cursor. Filtros avançados continuam abertos após alterações. Limpar filtros restaura a consulta, e filtros salvos incluem situação/vínculo/ordenação; a troca de empresa limpa filtros e seleções.
- A consulta DSS continua manual. Ao selecionar um intervalo ainda não carregado, a interface solicita Atualizar dados da DSS; não iniciar uma consulta automaticamente por causa de busca, filtros ou navegação.

## Acompanhamento operacional e desempenho — 22/10/2026

- Pendências agora permite responsável (texto), prazo, prioridade, situação (`aberta`, `tratamento`, `resolvida`) e comentários com autor/data. Alterações possuem histórico e revisão otimista: HTTP 409 impede sobrescrever uma versão alterada por outra pessoa. Trata-se de acompanhamento do portal, não de alteração da situação oficial da DSS. Um alerta ainda presente na DSS pode estar marcado como resolvido no portal.
- A API autenticada `GET/PATCH /api/workflow?company=costalog|ideallog` armazena tratamentos separados por empresa e pela chave tipo/área/ID com namespace da pessoa jurídica. GET sem `key` retorna somente o índice de metadados; comentários e histórico são buscados ao abrir o tratamento. O botão **Atualizar tratamentos** renova esse índice sem consultar a DSS.
- `api/workflow-store.mjs` grava arquivo privado com modo 0600, substituição atômica, fila de escritas e verificação de revisão. `PORTAL_WORKFLOW_FILE` define o caminho; por padrão usa `viagens-pf-workflow.json` ao lado de `PORTAL_USERS_FILE`. Sem ambos, devolve 503 sem fingir que salvou. **No Render Free, `/tmp` é efêmero: histórico só sobrevive a deploys/reinícios quando o arquivo estiver em armazenamento persistente.** Não criar ou alterar tabelas do MariaDB compartilhado para esta função sem autorização. Não publicar o arquivo de tratamentos nem copiar dados de demonstração para produção.
- Os indicadores do Painel têm **Ver registros**, que abre a área correta com filtro explícito e removível. PF sem CT-e, CT-e sem RV localizada e entrega concluída sem comprovante usam as mesmas regras dos indicadores. O filtro do painel também é respeitado na exportação.
- O seletor **Empresa Costalog** permite todas/AC da Costa/CRC/Comex antes de buscas, contagens, detalhes e exportações. Ideallog continua em portal separado. A classificação mantém vínculos documentais inequívocos; empresas desconhecidas e referências ambíguas não entram por aproximação de nome, cliente ou placa.
- A ficha de RV tem **Linha do tempo**, em páginas de 25 eventos. `createTripTimeline` mantém referências e só cria descrições da página aberta. Início, término, emissão de PF/CT-e e ocorrências usam datas fornecidas. Booleanos de entrega/comprovante e referências MDF-e derivadas não recebem datas presumidas. Ocorrências por placa/período são contexto explícito; IDs repetidos entre pessoas jurídicas não comprovam vínculo.
- A faixa **Atualização e qualidade** mostra empresa, período selecionado/carregado, conclusão da última consulta, disponibilidade de fontes e lacunas dos campos exibidos. `quality.periods` mantém a data real da consulta DSS de cada mês (`_syncedAt` no cache privado), mesmo quando esse mês é reutilizado. Servidores/caches antigos sem metadados mostram data/disponibilidade não informada. Falha opcional não é apresentada como confirmação de zero ocorrências.
- Modelos de relatório são preferências locais por usuário/empresa: período, filtros, pessoa jurídica, colunas, ordem das colunas, ordenação de linhas, escopo Excel e formato XLSX/CSV/PDF. Não contêm dados operacionais. Aplicar um modelo não consulta a DSS automaticamente. Prévia e exportação usam os mesmos filtros; pendências inclui o tratamento do portal. Campos financeiros continuam indisponíveis.
- `src/view-cache.mjs` mantém um único índice/conjunto de referências por consumidor. Abas calculam somente sua área; buscas vazias preservam referências, ordenações e agrupamentos são reutilizados até mudar dados/filtros. Opções dos filtros avançados só são montadas ao abrir o controle. Entregas, viagens, PF, MDF-e, ocorrências, frota, rotas, motoristas e prévias exibem 25 linhas por página; detalhes de rota/motorista também são paginados. Não manter HTML ou conteúdo de páginas futuras. Somente exportações explícitas materializam o relatório completo.
- Isso otimiza a renderização sobre a base já sincronizada por `/api/overview`, **não substitui essa sincronização por paginação de rede**. O endpoint `/api/records` continua disponível para a futura migração gradual das consultas.
- Manter os módulos novos na lista pública explícita do backend e na cópia de arquivos do workflow Pages. Preservar Administração/faturamento ocultos, autenticação, atualização DSS manual e as regras da futura migração Plesk/MariaDB.

## Minhas pendências e checklist de RV — 22/10/2026

- Implementada a primeira etapa das sugestões priorizadas pelo proprietário: **Minhas pendências** e **checklist de encerramento da RV**. Não confundir com a futura programação diária, agrupamento de alertas por RV, links compartilháveis ou reativação dos comparativos.
- O Painel mostra as pendências do usuário autenticado em **Vencidas, Para hoje, Próximas e Sem prazo**, com atalhos para a central. Na aba Pendências, **Todas as pendências / Minhas pendências** alterna o modo, preservando o escopo da empresa e do período. Minhas abre por padrão somente `aberta`/`tratamento`; resolvidas não contam como vencidas. A disponibilidade dos dados e dos tratamentos é exibida antes de apresentar contagens.
- `ownerUsername` é opcional no armazenamento de tratamentos e nas respostas de índice/detalhe, com o mesmo padrão de nomes de usuário do portal. O botão **Atribuir a mim** vincula a conta autenticada ao responsável quando o tratamento é salvo. Campo `owner` continua sendo o nome exibido, e responsáveis antigos sem vínculo são reconhecidos por correspondência completa com login/nome, ignorando acentos/caixa/espaços. Nunca usar correspondência parcial. Um `ownerUsername` explícito tem precedência sobre nomes homônimos. Alterar prazo/prioridade não deve reassociar silenciosamente uma conta já vinculada; mudar para outro nome limpa a associação anterior.
- O campo novo não exige migração SQL nem mudança da versão do arquivo. Clientes anteriores que omitem `ownerUsername` preservam a associação se o responsável não mudou. Revisão, comentários, histórico, isolamento por empresa e acesso autenticado continuam obrigatórios; não consultar `/api/users` para montar a visão pessoal.
- Datas de prazo e a classificação diária usam `America/Sao_Paulo`, inclusive perto da meia-noite UTC. `cachedAlertPager` compartilha o índice entre Painel e Pendências; mantém até quatro conjuntos de contagens/filtros, **sem conteúdo ou HTML de páginas**. O resumo usa `includeRows:false`; a central segue com 25 descrições por página. Filtros salvos/modelos e a exportação de pendências respeitam usuário atual, prazo e situação.
- A ficha da RV mostra um checklist somente de leitura com quatro etapas: PF vinculado, número de CT-e, entrega registrada e comprovante registrado. Distingue **Conferido**, **Pendente** e **Sem informação suficiente**; números zero/vazios não validam CT-e, booleans ausentes não viram `false`, e ausência de PF é limitada ao período consultado. Conferência não significa autorização fiscal nem encerra/edita a RV na DSS.
- A ficha completa, a linha do tempo e o checklist consultam os vínculos da empresa/período, sem perder PFs porque a tabela está filtrada por outro cliente/status. Os atalhos **Ver PFs vinculados** abrem Pedidos ou Entregas com `tripFocus` (ID completo com namespace da pessoa jurídica); o filtro também vale para exportações e pode ser removido. Navegar ou trocar de empresa limpa esse contexto. Nunca usar apenas placa/número da RV para unir documentos de CRC/Comex/AC com identificadores repetidos.
- `src/rv-checklist.mjs` deve permanecer na lista de arquivos públicos do backend e no workflow de publicação Pages. A consulta DSS continua manual; carregar o índice dos tratamentos no painel não consulta a DSS. A limitação de durabilidade do arquivo no Render Free permanece a descrita acima.

## Pesquisa única, filtros compactos e rotina diária — 23/10/2026

- Cada aba usa somente **um campo de pesquisa**, com alcance **Nesta aba / Todo o portal**. Resultados globais reutilizam esse texto e não criam outro input. A pesquisa continua limitada à empresa e ao período disponíveis, com atraso de digitação e sem consulta automática à DSS.
- **Filtros avançados** ficam em uma faixa recolhível acima da tabela/lista de cada área. Situação e vínculo foram movidos para essa faixa junto a cliente, placa, serviço, ordenação e preferências. Opções só são montadas ao abrir; o controle permanece aberto durante as alterações.
- Informações de cobertura, sincronização, fontes e observações técnicas ficam no final do conteúdo, antes do rodapé, atrás de uma **seta acessível**. Somente conta autenticada com papel administrador e `permissions.admin` vê o controle. Conteúdo e cálculos não são criados enquanto fechado; navegar/trocar de empresa/sair recolhe a seção. A API também remove `quality` das respostas de operacional/financeiro. Avisos de ação necessária, falhas e indisponibilidade da fonte da aba continuam visíveis para evitar confundir falha com zero registros.
- **Programação do dia** mostra RVs com início/término na data e RVs explicitamente em andamento que atravessam a data. Categorias usam somente situações fornecidas. A seção complementar de programações é carregada visualmente ao abrir, com paginação própria de 25 linhas; `data_emissao` é **emissão**, nunca saída prevista. Fonte indisponível/não informada e data fora da consulta são indicadas. Não inventar agendamento nem alterar o endpoint configurado sem validar a fonte. Programações preservam empresa; referências ambíguas de RV não são vinculadas.
- Pendências oferece **Lista / Agrupar por RV**. O índice conserva referências e contagens; gera somente 25 rótulos de grupos por página. Abrir um grupo gera somente 25 pendências desse grupo, mantendo responsáveis, prazos e revisões individuais. PF sem RV segura fica em grupo próprio. IDs com namespace mantêm CRC/Comex/AC separados. Exportações, modelos e filtros salvos respeitam o grupo selecionado.
- **Copiar link** compartilha a consulta filtrada; a ficha também tem **Copiar link deste registro**. URLs levam somente empresa, pessoa jurídica, área, filtros permitidos e referência de registro. Nunca incluir token, credenciais, comentários, dados completos ou endereço privado da API. A abertura preserva o destino durante o login e exige consulta manual antes de abrir o registro real; registro fora do período é informado, sem usar demonstração como resultado. Parâmetros inválidos e namespaces de outra empresa são descartados. Navegação do navegador é tratada sem consultas automáticas.
- **Comparativos** voltou à navegação, exclusivamente com RV/PF/CT-e/KM conhecidos. A consulta manual envia a empresa ativa, divide meses com no máximo duas chamadas simultâneas e aproveita intervalos já carregados. Mudança de empresa/sessão/datas invalida respostas antigas. Filtros de pessoa jurídica, cliente, placa, serviço e pesquisa são reaplicados aos dois períodos; projeções/métricas são reutilizadas enquanto seus parâmetros não mudam. Nenhuma métrica financeira foi restaurada.
- No celular, tabelas da página atual destacam registro, placa e situação quando disponíveis. **Mais detalhes** expande os demais campos sem nova renderização do portal e sem gerar páginas futuras. A apresentação desktop e as exportações preservam as colunas escolhidas.
- Módulos novos: `portal-links.mjs`, `programming-data.mjs`, `programming.mjs`, `mobile-tables.mjs`, incluídos no backend público e Pages. Manter faturamento/administração ocultos, isolamento empresarial, atualização DSS manual e restrições de Plesk/MariaDB. A paginação continua sendo da apresentação sobre a base sincronizada, não paginação de rede da DSS.

## Pesquisa sempre global e sincronização conjunta das empresas — 23/10/2026

- Removido o seletor **Nesta aba / Todo o portal**. A pesquisa única sempre oferece resultados globais da empresa, pessoa jurídica e período ativos; links antigos com `pesquisa=aba` não restauram o modo local. O campo também continua filtrando a tabela aberta, sem chamadas à DSS por digitação.
- O botão manual **Atualizar dados da DSS** solicita `include_companies=1` no `/api/overview`. A mesma consulta DSS já contém Costalog e Ideallog: o servidor projeta a empresa solicitada na resposta principal e a outra em `companions.<empresa>`, com a mesma proteção de perfil e sem duplicar a empresa principal. Cada conjunto permanece isolado antes de chegar ao navegador; não devolver cache bruto nem campos financeiros. Sem o parâmetro, a API mantém a resposta anterior de uma única empresa.
- A sessão guarda uma cópia normalizada por empresa, com intervalo, última consulta e metadados próprios. Os conjuntos só são substituídos após o recebimento completo de todos os meses. Trocar Costalog/Ideallog usa imediatamente a cópia pronta e **não consulta a DSS**; intervalos menores dentro do período sincronizado também são reaproveitados. Período não coberto solicita atualização manual, sem apresentar uma consulta incompleta como vazia.
- Uma troca de empresa durante a sincronização não inicia outra consulta nem mistura respostas: a consulta compartilhada pode terminar e aplicar somente a base da empresa que estiver ativa. Sair, trocar de sessão ou abrir outro contexto de link invalida respostas pendentes; logout elimina ambas as cópias. Em backend antigo sem `companions`, não presumir que a outra empresa foi carregada e não fazer fallback que repita chamadas DSS automaticamente.
- Autenticação, permissão do rodapé técnico, isolamento de tratamentos e faturamento/administração ocultos permanecem obrigatórios. A cópia do navegador é somente da sessão, não substitui o cache privado/MariaDB e não altera objetos no banco compartilhado.

## Datas digitáveis e etapas de RV da DSS — 23/10/2026

- Campos de período, comparativos, programação diária e prazo do tratamento agora usam texto **dd/mm/aaaa**, com botão de calendário ao lado. Aceitam também oito dígitos (`23102026`) e colagem ISO; a interface formata em português e mantém **ISO** nas consultas, preferências e gravação dos tratamentos.
- `date-controls.mjs` valida dia/mês/ano e ano completo, inclusive bissextos. Não aplicar texto incompleto nem datas impossíveis; período principal rejeita datas futuras. Digitação não recria o campo a cada segmento do ano. Rascunhos, foco e cursor sobrevivem a atualizações de interface; data válida atualiza após breve pausa, Enter ou calendário. Datas inválidas impedem consulta/salvamento, sem consultar a DSS por digitação. Prazo pode ser limpo.
- Em Viagens/RV, a faixa de filtros segue a sequência fornecida pelo proprietário: **Incluído → Escalado → Viajando → Finalizado → Encerrado**, com contagens e opção Todas. A ficha destaca somente a etapa atual declarada, sem presumir passagens anteriores nem editar a DSS. O painel mostra essas mesmas situações separadamente, e os filtros avançados mantêm essa ordem.
- `rv-status.mjs` centraliza nomes e classificação operacional. Somente variações de grafia/gênero das cinco etapas são padronizadas (`Encerrada` → `Encerrado`, por exemplo). **Finalizado e Encerrado permanecem distintos**; “Concluída” e códigos numéricos sem mapeamento validado não recebem etapa presumida. Outras situações continuam visíveis. Indicadores, atalhos, pendências e programação reconhecem **Viajando** como andamento e mantêm conclusão/encerramento distintos na apresentação.
- Tipo de RV (`tipo_rv`, por exemplo RODO/LS) aparece na tabela, ficha, pesquisa e relatório de viagens, preservando o valor recebido. Tipo e situação não são o mesmo campo.
- Novos módulos públicos: `date-controls.mjs` e `rv-status.mjs`, registrados no backend e no Pages. Preservar sincronização conjunta Costalog/Ideallog, permissões, isolamento empresarial, paginação sob demanda, administração/faturamento ocultos e limites Plesk/MariaDB.

## Paginação de rede, sincronização cancelável e preferências da conta — 23/10/2026

- A interface negocia `portalVersion:2` no login. Com esse backend, todas as áreas passam a consultar `/api/portal/view` ou `/api/portal/metrics`, recebendo somente a página/indicadores pedidos. Nenhuma navegação baixa bases completas pelo `/api/overview`. Exportação completa continua explícita. Demonstração e servidores anteriores mantêm o modo de compatibilidade.
- `api/portal-sessions.mjs` prepara snapshots privados e publica a consulta somente após conclusão. Progresso é consultado por identificador; cancelar aborta as conexões DSS e não substitui a última consulta completa. Duas empresas continuam sendo preparadas juntas, sem repetir DSS ao trocar o portal. Detalhes, filtros, pesquisas, relatórios e exportações usam as mesmas projeções operacionais no servidor.
- `src/rv-stage-filter.mjs` aplica as etapas do anexo às áreas relacionadas, com indicação **Etapa da RV vinculada**. Somente IDs vinculados com namespace recebem o filtro; não atribuir etapa a PF/ocorrência por placa ou cliente. Situação do documento é independente da RV.
- `api/private-state.mjs` oferece documentos duráveis em MariaDB ou diretório persistente. `api/preferences-store.mjs` guarda preferências por conta/empresa com revisão otimista e sem conteúdo DSS. No Render, armazenamento temporário não é apresentado como definitivo; falhas aparecem na interface. Compatibilidade de arquivo local continua disponível para ambientes anteriores fora do Render.
- `database/viagens_pf_portal_state.sql` é apenas proposta para a tabela privada do portal. **NÃO foi executado no banco compartilhado.** Requer backup, acesso e autorização para implantação. Não modificar a tabela de cache existente nem outros sistemas. `api/migrate-private-state.mjs` importa explicitamente tratamentos antigos com backup e sem sobrescrever destino preenchido.
- Procedimento e limitações em `PERSISTENCIA_E_PAGINACAO.md`. Código publicado não significa armazenamento de produção provisionado. Contas/sessões mantêm o comportamento atual. Render/Pages devem continuar ativos durante futura migração Plesk.


## Publicação sem banco, conforme decisão do proprietário — 23/10/2026

- O proprietário pediu **pular a etapa de banco de dados** e seguir com as demais melhorias. Não solicitar Plesk/MariaDB como pré-requisito de publicação, não executar SQL, não provisionar banco/disco e não alterar os serviços de Faturamento.
- Sem `PORTAL_STATE_DRIVER`/diretório durável configurado, `/api/preferences` declara `storage:browser`; preferências e modelos ficam em chave local por API/conta/empresa, sem sincronização entre dispositivos e sem chamadas PATCH ao servidor. Falha de um banco explicitamente habilitado não provoca fallback silencioso.
- Tratamentos continuam usando o arquivo privado já utilizado. A condição Render não deve selecionar um adaptador durável indisponível e bloquear os tratamentos. Login/respostas de tratamento informam `workflowStorage`/`storage.durable`; a ficha alerta quando o armazenamento é temporário. Não prometer sobrevivência a deploys/reinícios no Render Free.
- A decisão adia persistência definitiva; paginação no servidor, indicadores separados, progresso, cancelamento e etapas de RV nas áreas relacionadas devem ser publicados normalmente. Preservar autenticação, separação das empresas, atualização DSS manual e diagnóstico recolhido no rodapé.

## Gestão de pendências: prazos, resoluções, arquivo, reincidência, lotes e avisos — 23/10/2026

- **Sem banco de dados**, conforme a decisão vigente. Tudo continua no arquivo privado de tratamentos já configurado; regras ficam em `policies.<empresa>`, preservando `version:1` e `companies` para os tratamentos existentes. O adaptador opcional de documentos aceita mapas antigos e envelope v2, sem criar SQL. No Render Free, regras/histórico/arquivo continuam temporários e podem desaparecer em reinícios/publicações. Não prometer persistência definitiva.
- Administradores configuram **Prazos por tipo** dentro de Pendências, com 0–365 dias corridos; vazio deixa sem prazo automático. Não inventar SLA inicial: todos começam sem regra. Contagem parte da **primeira detecção no portal**, em São Paulo, nunca da emissão antiga do documento. Regras novas valem para alertas novos/reincidentes; opção explícita aplica também aos abertos sem prazo automático. Datas manuais, inclusive removidas manualmente, são preservadas. Revisões impedem sobrescrever regras concorrentes.
- Resolver exige **motivo da resolução**. Comentários de clientes antigos podem fornecer o motivo por compatibilidade quando não enviam o campo novo; o formulário atual envia o campo explicitamente, e o lote exige motivo explícito. Resoluções ficam em `resolutions`, preservadas nas reaberturas, com autor/data; campos antigos ausentes não recebem motivo inventado. Tratamento não altera DSS.
- O backend observa alertas somente após uma **sincronização manual completa**, para as duas empresas isoladamente. Comparativos em cache e falhas/cancelamentos de consulta não estabelecem novos ciclos. Preservar namespace por pessoa jurídica e metadados somente operacionais. Se o arquivo falhar, informar que o acompanhamento não foi atualizado e manter a consulta DSS disponível.
- Reincidência exige ausência confirmada seguida de retorno em uma observação posterior, recente e com cobertura suficiente. Campo ausente, documento fora da consulta, resposta antiga ou mês reutilizado não comprovam ausência. Para alertas dependentes de vínculos, consultas menores que a cobertura da ausência anterior não bastam para reabrir. Um alerta contínuo marcado como resolvido no portal não é reaberto em cada atualização. Reabertura confirmada incrementa contador/revisão e conserva resoluções anteriores; o histórico começa na implantação, sem datas retroativas presumidas.
- **Arquivo de tratadas** é paginado no servidor em 25 itens, independente das datas principais e de nova consulta DSS. Aplica empresa/pessoa jurídica, pesquisa e filtros de tratamento; exibe registros já tratados, inclusive fora do período ou que não geram mais alerta. Os avisos podem abrir uma fila de todos os alertas registrados ainda ativos, inclusive sem tratamento humano. Somente exportação explícita materializa todos os resultados. Abrir documento sem consulta carregada pede atualização manual; não consultar DSS automaticamente.
- Ações em lote selecionam somente a página visível. Prévia no servidor, token de uso único por usuário/empresa com validade de cinco minutos e confirmação explícita antecedem gravação. Máximo 100 chaves por API; a interface seleciona até 25 por página. Verificar todas as revisões antes de qualquer escrita: um conflito recusa o lote inteiro. Registro de autor/data/motivo por pendência; redefinir responsável não conserva vínculo indevido com conta anterior.
- **Avisos** no cabeçalho mostram minhas vencidas, meus prazos para hoje, sem responsável e reincidentes da minha fila/sem responsável. Total conta registros distintos; categorias podem se sobrepor. Atualizam ao entrar/trocar empresa, após sincronizar/tratar ou por botão, sem polling DSS e sem envio de mensagens externas. Cada categoria abre a fila filtrada correspondente.
- Novos módulos `pending-data.mjs`, `pending-ui.mjs`, `pending-client.mjs` na lista pública do backend e no Pages; `api/pending-service.mjs` orquestra os endpoints autenticados `/api/workflow/actions`. Manter faturamento/Administração ocultos e informações técnicas recolhidas no rodapé. Incluir motivo/reincidência nos relatórios operacionais e preservar os filtros de arquivo nos modelos/links.

## Programação do dia e navegação mais rápida — 26/10/2026

- Na **Programação do dia**, a barra **Etapa da RV vinculada** conta somente as RVs da **Data da programação** (mesma regra de `dayTrips` da tabela "Viagens do dia"), e não todo o período De/Até. Data fora da consulta carregada zera a barra. Helper `dayStageData` em `src/programming.mjs`, usado no servidor e na demonstração.
- `src/portal-client.mjs` guarda até 30 páginas já recebidas por 5 minutos; voltar a uma página/filtro já visto não consulta o servidor. **Painel** e **Pendências** (inclusive relatório de pendências) nunca usam esse cache, porque dependem dos tratamentos. `invalidate`, `reset`, nova consulta DSS, comparativo e importação de MDF-e limpam o cache.
- Durante a consulta de uma página da mesma área/empresa/consulta, a página anterior permanece **esmaecida e inativa** (`inert`, `aria-busy`) sob a barra "Atualizando…". Ela nunca aparece como página atual; trocar de área ou empresa mostra apenas o aviso de carregamento.
- `selected` e `timelinePage` não fazem parte da chave da lista: abrir ou paginar a ficha consulta somente `/api/portal/detail`.
- `api/portal-render.mjs` memoriza a separação por empresa/pessoa jurídica + período (até 8 combinações por snapshot, descartadas com ele). Em teste com ~5 mil RVs, cada clique caiu de ~100 ms para ~30 ms de processamento.
- **Render acordado:** `.github/workflows/manter-render-acordado.yml` acessa `GET /api/health` a cada 10 min (o Render Free dorme após ~15 min sem acesso e perde os snapshots em memória). O health não consulta a DSS nem exige login. O GitHub pode atrasar agendamentos e os desativa após 60 dias sem commits.
- **Filtros avançados e demais `<details>`:** um `<details open>` recriado pela tela dispara `toggle` sozinho. `app.js` guarda o estado desenhado (`renderedOpen`) e ignora esse evento e os da página anterior esmaecida; antes o filtro reabria logo após ser fechado.
- **Tipo de serviço:** `serviceTypeLabel` (`src/filtering.mjs`) aplica só acentos e maiúscula inicial ao `tipo_servico` da DSS (`subcontratacao` → `Subcontratação`). Filtros/links salvos com o valor antigo continuam funcionando. **Vínculo** usa o mesmo formato de rótulo dos demais filtros.
