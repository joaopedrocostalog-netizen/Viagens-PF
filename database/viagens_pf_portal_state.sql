-- Execute somente após backup e autorização do responsável pelo banco compartilhado.
-- Não executado automaticamente pela aplicação. Não altera a tabela de cache existente.
CREATE TABLE IF NOT EXISTS viagens_pf_portal_state (
 state_key VARCHAR(191) NOT NULL PRIMARY KEY,
 payload_json LONGTEXT NOT NULL,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
