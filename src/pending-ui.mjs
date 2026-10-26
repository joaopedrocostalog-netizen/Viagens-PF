import { KM_FROM_API } from './data-availability.mjs';
import { PENDING_TYPES, STALL_STAGES, stallRules } from './pending-data.mjs';
import { TASK_STATUSES, TASK_PRIORITIES, alertKey } from './workflow.mjs';
const h = v =>
  String(v ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const date = v =>
  /^\d{4}-\d{2}-\d{2}/.test(v || '') ? v.slice(8, 10) + '/' + v.slice(5, 7) + '/' + v.slice(0, 4) : '—';
const options = (values, current, first = 'Todas') =>
  '<option value="todos">' +
  first +
  '</option>' +
  Object.entries(values)
    .map(
      ([k, label]) => '<option value="' + k + '" ' + (current === k ? 'selected' : '') + '>' + h(label) + '</option>'
    )
    .join('');
export function renderPendingToolbar(s) {
  return (
    '<div class="pending-toolbar"><div role="group" aria-label="Consulta de pendências"><button class="btn btn-sm ' +
    (!s.alertArchive ? 'btn-red' : '') +
    '" data-pending-tab="active">Pendências da consulta</button><button class="btn btn-sm ' +
    (s.alertArchive ? 'btn-red' : '') +
    '" data-pending-tab="archive">Arquivo de tratadas</button></div><div><label><input type="checkbox" data-pending-select-page> Selecionar página</label><span id="pendingSelectionCount">0 selecionadas</span><button id="pendingBatchButton" class="btn btn-sm" data-pending-action="batch" disabled>Ações em lote</button>' +
    (s.permissions?.admin ? '<button class="btn btn-sm" data-pending-action="rules">Prazos por tipo</button>' : '') +
    '</div></div>'
  );
}
export function renderPendingSelection(row) {
  return (
    '<label class="pending-select"><input type="checkbox" data-pending-select="' +
    h(alertKey(row)) +
    '" aria-label="Selecionar ' +
    h(row.title) +
    '"></label>'
  );
}
export function renderPendingLifecycle(row) {
  return (
    (row.presence === 'unknown' ? '<span class="pill gray">Sem confirmação para este período</span>' : '') +
    (row.recurrenceCount ? '<span class="pill yellow">Reincidência ' + h(row.recurrenceCount) + '</span>' : '') +
    (row.presence === 'absent' ? '<span class="pill gray">Ausência confirmada na última observação</span>' : '') +
    (row.status === 'resolvida' && row.presence === 'present'
      ? '<span class="pill yellow">Resolvida no portal · alerta ainda observado</span>'
      : '')
  );
}
export function renderPendingArchive(result, s) {
  const rows = result.rows;
  return (
    renderPendingToolbar(s) +
    '<section class="ins-module"><div class="ins-toolbar"><div><h2>' +
    (s.alertAllTracked ? 'AVISOS DA OPERAÇÃO' : 'ARQUIVO DE PENDÊNCIAS TRATADAS') +
    '</h2><p>Inclui acompanhamentos de outros períodos. Não consulta a DSS.</p></div><div><button class="btn btn-sm" data-pending-export="csv">CSV</button><button class="btn btn-sm" data-pending-export="xlsx">Excel</button><button class="btn btn-sm" data-pending-export="pdf">PDF</button></div></div><p class="help">A presença da pendência reflete a última observação válida da fonte; não é uma consulta em tempo real.</p>' +
    // Mesmo painel do botão "Filtros avançados" da barra superior: sempre desenhado, aberto/fechado por CSS.
    '<div class="v-extra-filters" id="advancedFiltersPanel">' +
    ('<div class="ins-alert-filters"><label>Situação<select id="alertStatusFilter" class="control">' +
      options(TASK_STATUSES, s.alertStatus) +
      '</select></label><label>Tipo<select id="alertKindFilter" class="control">' +
      options(PENDING_TYPES, s.alertKind) +
      '</select></label><label>Prioridade<select id="alertPriorityFilter" class="control">' +
      options(TASK_PRIORITIES, s.alertPriority) +
      '</select></label><label>Responsável<input id="alertOwnerFilter" class="control" value="' +
      h(s.alertOwner || '') +
      '"></label><label>Prazo<select id="alertDueFilter" class="control">' +
      options({ vencidas: 'Vencidas', hoje: 'Para hoje', proximas: 'Próximas', sem_prazo: 'Sem prazo' }, s.alertDue) +
      '</select></label><button class="btn btn-sm" data-pending-action="clear-archive-filters">Limpar filtros do arquivo</button></div>') +
    '</div>' +
    (rows.length
      ? '<div class="ins-alert-list">' +
        rows
          .map(
            row =>
              '<article class="ins-alert-item">' +
              renderPendingSelection(row) +
              '<div><strong>' +
              h(row.title) +
              '</strong><p>' +
              h(row.detail) +
              '</p><small>Referência: ' +
              date(row.refDate) +
              ' · Última alteração: ' +
              date(row.updatedAt) +
              '</small>' +
              renderPendingLifecycle(row) +
              (row.resolutionReason
                ? '<p><b>Motivo da resolução:</b> ' + h(row.resolutionReason) + '</p>'
                : row.status === 'resolvida'
                  ? '<p class="help">Motivo não informado neste registro.</p>'
                  : '') +
              '</div><div class="task-card-actions"><small>' +
              h(TASK_STATUSES[row.status] || 'Aberta') +
              ' · ' +
              h(row.owner || 'Sem responsável') +
              (row.due ? ' · Prazo: ' + date(row.due) : '') +
              '</small><button class="btn btn-sm" data-alert-manage="' +
              h(row.key) +
              '">Abrir tratamento</button><button class="btn btn-sm" data-alert-detail="' +
              h(row.view + ':' + row.recordId) +
              '">Abrir registro</button></div></article>'
          )
          .join('') +
        '</div>'
      : '<p class="help">Nenhum acompanhamento encontrado para estes filtros.</p>') +
    '<div class="pagination"><span>' +
    result.total +
    ' registros · Página ' +
    result.page +
    ' de ' +
    result.pages +
    '</span><div><button class="btn btn-sm" data-action="prev" ' +
    (result.page <= 1 ? 'disabled' : '') +
    '>Anterior</button><button class="btn btn-sm" data-action="next" ' +
    (result.page >= result.pages ? 'disabled' : '') +
    '>Próxima</button></div></div></section>'
  );
}
export function renderPendingBell(s) {
  if (!s.user || !s.serverMode || s.user.mustChangePassword) return '';
  const notices = s.pendingNotices,
    labels = {
      vencidas: 'Minhas pendências vencidas',
      hoje: 'Meus prazos para hoje',
      sem_responsavel: 'Sem responsável',
      reincidentes: 'Reincidentes da minha fila'
    };
  return (
    '<div class="pending-bell"><button class="btn btn-sm" data-pending-action="notices" aria-expanded="' +
    !!s.noticesOpen +
    '">Avisos' +
    (notices ? ' (' + notices.total + ')' : '') +
    '</button>' +
    (s.noticesOpen
      ? '<section class="pending-notices" aria-label="Avisos da operação"><h3>Avisos da operação</h3>' +
        (s.pendingNoticeError
          ? '<p role="alert">' + h(s.pendingNoticeError) + '</p>'
          : notices
            ? Object.entries(labels)
                .map(
                  ([key, label]) =>
                    '<button data-pending-notice="' +
                    key +
                    '" class="btn"><span>' +
                    label +
                    '</span><b>' +
                    notices.counts[key] +
                    '</b></button>'
                )
                .join('')
            : '<p>Carregando avisos…</p>') +
        '<p class="help">Acompanhamentos já registrados no portal. As categorias podem compartilhar registros.</p><button class="btn btn-sm" data-pending-action="reload-notices">Atualizar avisos</button></section>'
      : '') +
    '</div>'
  );
}
export function renderPendingDialogs(s) {
  const disabled = s.pendingSaving ? 'disabled' : '',
    error = s.pendingError ? '<p class="ins-inline-error" role="alert">' + h(s.pendingError) + '</p>' : '';
  if (s.pendingDialog === 'rules')
    return (
      '<div class="overlay"><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="pendingRulesTitle"><div class="drawer-top"><h2 id="pendingRulesTitle">Prazos por tipo</h2><button class="btn btn-sm" data-pending-action="close-dialog" ' +
      disabled +
      '>Fechar</button></div><p class="help">Dias corridos a partir da primeira detecção no portal. Vazio deixa sem prazo automático; 0 vence no mesmo dia. Novas regras valem para novos alertas e reincidências e preservam prazos manuais.</p>' +
      error +
      (s.pendingRules
        ? '<form id="pendingRulesForm">' +
          Object.entries(PENDING_TYPES)
            .filter(([type]) => KM_FROM_API || type !== 'km_acima')
            .filter(([type]) => !type.startsWith('rv_parada_') || stallRules(s.pendingRules)[type.slice(10)] !== null)
            .map(
              ([type, label]) =>
                '<label class="filter">' +
                label +
                '<input class="control" type="number" min="0" max="365" step="1" data-pending-rule="' +
                type +
                '" value="' +
                h(s.pendingRules.days[type] ?? '') +
                '"></label>'
            )
            .join('') +
          '<fieldset class="stall-rules"><legend>RV parada · dias desde o início informado pela DSS</legend><p class="help">A DSS não informa quando a RV mudou de etapa; o alerta conta a partir da data de início. Vazio desliga o alerta.</p>' +
          STALL_STAGES.map(
            ([key, , label]) =>
              '<label class="filter">' +
              label +
              ' (dias)<input class="control" type="number" min="0" max="365" step="1" data-pending-stall="' +
              key +
              '" value="' +
              h(stallRules(s.pendingRules)[key] ?? '') +
              '"></label>'
          ).join('') +
          '</fieldset>' +
          '<label><input id="policyApplyUnscheduled" type="checkbox"> Aplicar também aos alertas abertos ainda sem prazo automático</label><button class="btn btn-red" ' +
          disabled +
          '>Salvar prazos</button></form>'
        : '<p>Carregando regras…</p>') +
      '</aside></div>'
    );
  if (s.pendingDialog !== 'batch') return '';
  const preview = s.pendingPreview;
  return (
    '<div class="overlay"><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="pendingBatchTitle"><div class="drawer-top"><h2 id="pendingBatchTitle">Ações em lote</h2><button class="btn btn-sm" data-pending-action="close-dialog" ' +
    disabled +
    '>Fechar</button></div>' +
    error +
    (preview
      ? '<p><strong>' +
        preview.count +
        ' pendências</strong> serão atualizadas. Nenhuma alteração foi aplicada ainda.</p><div class="pending-batch-preview">' +
        preview.rows
          .map(
            row =>
              '<div><b>' +
              h(row.detail) +
              '</b><small>' +
              h(TASK_STATUSES[row.status]) +
              ' · ' +
              h(row.owner || 'Sem responsável') +
              ' · Prazo ' +
              date(row.due) +
              '</small>' +
              (row.resolutionReason ? '<p>' + h(row.resolutionReason) + '</p>' : '') +
              '</div>'
          )
          .join('') +
        '</div><button class="btn btn-sm" data-pending-action="edit-batch" ' +
        disabled +
        '>Voltar à edição</button><button class="btn btn-red" data-pending-action="apply-batch" ' +
        disabled +
        '>Confirmar aplicação</button>'
      : '<p>' +
        s.selectedPendingKeys?.length +
        ' pendências da página selecionadas. Somente os campos escolhidos serão alterados.</p><form id="pendingBatchForm"><label class="filter">Situação<select id="batchStatus" class="control"><option value="">Manter</option>' +
        Object.entries(TASK_STATUSES)
          .map(([key, label]) => '<option value="' + key + '">' + label + '</option>')
          .join('') +
        '</select></label><label class="filter">Prioridade<select id="batchPriority" class="control"><option value="">Manter</option>' +
        Object.entries(TASK_PRIORITIES)
          .map(([key, label]) => '<option value="' + key + '">' + label + '</option>')
          .join('') +
        '</select></label><label><input id="batchChangeOwner" type="checkbox"> Alterar responsável</label><input id="batchOwner" class="control" maxlength="100" placeholder="Vazio remove o responsável"><label><input id="batchChangeDue" type="checkbox"> Alterar prazo</label><input id="batchDue" class="control" placeholder="dd/mm/aaaa" inputmode="numeric"><label class="filter">Motivo da resolução<textarea id="batchResolutionReason" class="control" maxlength="2000" placeholder="Obrigatório ao resolver"></textarea></label><label class="filter">Comentário<textarea id="batchComment" class="control" maxlength="2000"></textarea></label><button class="btn btn-red" ' +
        disabled +
        '>Conferir prévia</button></form>') +
    '</aside></div>'
  );
}
