-- Execute SOMENTE após confirmar que o nome viagens_pf_period_cache está livre.
-- Utiliza o banco atual selecionado no Plesk. Nenhuma outra tabela é alterada.
-- Faça backup antes da execução. Recomenda-se usuário limitado a esta tabela.
CREATE TABLE IF NOT EXISTS viagens_pf_period_cache (
  period_from VARCHAR(10) NOT NULL,
  period_to VARCHAR(10) NOT NULL,
  payload_json LONGTEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (period_from,period_to),
  KEY viagens_pf_period_cache_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
