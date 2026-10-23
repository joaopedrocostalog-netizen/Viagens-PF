# Consulta paginada e estado privado do portal

## Decisão atual: publicar sem banco de dados

O proprietário decidiu adiar a etapa de banco de dados. A publicação não depende de MariaDB ou de novo disco. Sem armazenamento durável configurado, os tratamentos continuam usando o arquivo privado anterior (`PORTAL_WORKFLOW_FILE` ou arquivo ao lado das contas); no Render Free esse arquivo é temporário e pode ser perdido em reinícios/publicações. A ficha de tratamento informa essa limitação. Preferências, modelos, filtros e colunas ficam no navegador, separados por API, usuário e empresa. Não há sincronização dessas preferências entre computadores. Nenhuma configuração ou migração SQL deve ser executada nesta etapa.

A interface de produção negocia `portalVersion:2` no login e usa `/api/portal/*`. Não baixa `/api/overview` para montar tabelas. Demonstração e compatibilidade com servidores anteriores conservam a apresentação local.

## Consultas

- `POST /api/portal/sync`: inicia consulta manual de até 12 meses. Retorna identificador, sem registros.
- `GET /api/portal/sync?id=...`: progresso por mês/fonte. A leitura do progresso não chama a DSS.
- `PATCH /api/portal/sync` com `{id}`: cancela a execução e aborta conexões DSS. Não substitui a consulta completa anterior.
- `POST /api/portal/view`: recebe snapshot e filtros; devolve somente a apresentação da página solicitada, no máximo 25 registros por tabela, sem conteúdo das próximas páginas. Agrupamentos/detalhes/programações têm suas páginas próprias.
- `POST /api/portal/metrics`: indicadores agregados do Painel, sem listas de documentos.
- `POST /api/portal/detail`: ficha e linha do tempo do registro solicitado.
- `POST /api/portal/export`: somente uma exportação explícita materializa todas as linhas filtradas.
- `POST /api/portal/compare`: compara snapshots já preparados. O botão do comparativo consulta períodos ausentes manualmente, sem baixar bases para o navegador.

Todos os endpoints exigem sessão individual, permissão operacional, empresa válida e senha definitiva. Snapshots são privados do usuário, expiram após duas horas sem uso, têm limite global e se perdem ao reiniciar o servidor; isso afeta a consulta de leitura e requer nova atualização manual, **não o armazenamento dos tratamentos/preferências**. Consultas DSS continuam mensais, pois a integração fornecida é por intervalo: paginação de 25 é implementada no nosso backend, não alegada como recurso da API DSS. Filtros e contagens são executados sobre a base normalizada no servidor.

A mesma sincronização contém as duas empresas. A projeção e normalização isolam Costalog (AC/CRC/Comex) e Ideallog antes da apresentação. Financeiro e Administração permanecem ocultos. Etapas de RV aparecem nas outras áreas como **Etapa da RV vinculada**; registros sem vínculo seguro não recebem status presumido. O status do documento continua independente.

## Persistência: escolher um armazenamento privado real

### MariaDB existente no Plesk

1. Fazer backup do banco compartilhado e confirmar permissão de execução. Nenhum SQL é executado automaticamente.
2. Revisar/aplicar somente `database/viagens_pf_portal_state.sql` no banco existente. Essa tabela independente não altera `viagens_pf_period_cache` nem objetos de outros sistemas.
3. Configurar no backend `PORTAL_STATE_DRIVER=mariadb` e as variáveis privadas `MARIADB_HOST`, `MARIADB_PORT`, `MARIADB_DATABASE=wp_n32k4`, `MARIADB_USER`, `MARIADB_PASSWORD`, `MARIADB_SSL` conforme o servidor. Privilégios mínimos da conta do portal: SELECT, INSERT e UPDATE sobre `viagens_pf_portal_state`, além do cache já utilizado. Credenciais nunca entram no Git ou navegador.
4. Se o backend continuar no Render, confirmar conectividade TLS e liberação restrita até o MariaDB. Não abrir o banco indiscriminadamente para a internet.
5. Se houver tratamentos no arquivo anterior, preservar o arquivo e executar, no ambiente privado com a configuração de destino validada: `node api/migrate-private-state.mjs`. O comando cria backup privado, valida empresas/chaves e recusa sobrescrever destinos com dados. Não cria tabelas.
6. Testar gravação, reiniciar o processo, autenticar novamente e confirmar leitura. Repetir com duas contas e empresas diferentes, inclusive revisão concorrente.

### Diretório persistente

Usar esta opção com um único processo da aplicação; para múltiplos processos/instâncias, usar MariaDB com transações. Configurar `PORTAL_DATA_DIR` com um caminho absoluto privado, fora da raiz pública. No Render, o diretório precisa estar dentro do disco montado e `PORTAL_DATA_PERSISTENT=true` só deve ser definido após verificar o volume. `/tmp` e `/var/tmp` não são aceitos como armazenamento durável. Sem MariaDB/diretório persistente, o portal mantém o arquivo de tratamentos anterior com indicação de armazenamento temporário e salva preferências no navegador. Não apresenta essas opções como persistência definitiva. Não contratar plano/disco automaticamente.

Contas do portal continuam usando `PORTAL_USERS_FILE`: preservar esse arquivo em volume persistente também, seguindo a migração existente. Esta alteração não migra contas automaticamente nem promete continuidade da sessão em memória entre deploys.

## Preferências da conta

`GET/PATCH /api/preferences?company=costalog|ideallog` usa exclusivamente o usuário autenticado; não aceita escolher outro usuário. Guarda cartões, filtros salvos, colunas, ordenação, modelos e formato de relatório. Não guarda registros DSS, tokens nem comentários. Revisão otimista impede sobrescrever alterações de outro acesso. Com armazenamento durável habilitado, falhas de leitura/gravação são visíveis, sem fallback silencioso. Quando a API declara explicitamente `storage:browser`, a interface usa uma chave local por API/usuário/empresa e informa o alcance nos controles de personalização/modelos. O endpoint não confirma gravação remota nesse modo. Preferências locais antigas não são importadas automaticamente para evitar associar configurações de um navegador compartilhado à conta errada.

## Restrições de implantação

A paginação, os indicadores, o progresso, o cancelamento e as etapas de RV podem ser publicados sem banco, conforme a decisão atual. Persistência definitiva em produção e preferências compartilhadas entre dispositivos permanecem adiadas e dependem do armazenamento acima. Publicar o código não cria MariaDB, disco ou backup externo. Não desativar Render/Pages nem alterar a aplicação principal no Plesk nesta etapa.

## Pendências: acompanhamento e rotina da equipe

Em Pendências, **Prazos por tipo** aparece para administrador. Defina dias corridos; vazio deixa sem regra e zero vence na detecção inicial. As regras são por empresa e não substituem prazos manuais. A opção de aplicar aos abertos sem prazo automático é explícita. O motivo é obrigatório ao resolver, individualmente ou em lote.

**Arquivo de tratadas** consulta somente o arquivo do portal, incluindo outros períodos, com páginas de 25 registros e exportação explícita. As resoluções anteriores ficam na ficha mesmo após reabertura. Os avisos abrem filas de vencidas, prazos para hoje, sem responsável e reincidentes; não enviam mensagens externas nem consultam DSS automaticamente.

A sincronização completa observa o ciclo dos alertas. Uma reincidência exige ausência confirmada e retorno posterior com dados recentes/cobertura suficiente; campo desconhecido e mudança de período não comprovam desaparecimento. A identificação começa com as observações registradas pelo portal. Os tratamentos continuam sendo acompanhamento interno e não atualizam a DSS.

Lotes têm prévia, confirmação e revisão de todas as pendências antes de gravar. A seleção fica limitada à página visível; uma versão alterada por outro usuário impede aplicar o lote inteiro. Regras, histórico e arquivo mantêm a limitação de armazenamento temporário do ambiente atual, pois a configuração do banco permanece adiada.
