import { renderPendingBell, renderPendingDialogs } from './pending-ui.mjs';
import { parseEditableDate } from './date-controls.mjs';
import { alertKey, operationalToday } from './workflow.mjs';
const h = value =>
  String(value ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const queryFields = [
  'alertArchive',
  'alertRelevant',
  'page',
  'legalEntity',
  'customer',
  'vehicle',
  'serviceType',
  'rvStage',
  'tripFocus',
  'search',
  'alertScope',
  'alertKind',
  'alertPriority',
  'alertStatus',
  'alertDue',
  'alertOwner',
  'alertUnassigned',
  'alertRecurrent',
  'alertAllTracked',
  'filtersOpen',
  'view'
];
export function createPendingClient(s, render, { invalidate, exportModels } = {}) {
  let identity = '',
    noticeKey = '',
    archiveKey = '',
    archivePending = '',
    archive = null,
    selectionKey = '',
    epoch = 0;
  const active = () => s.serverMode && s.token;
  const stateQuery = () => Object.fromEntries(queryFields.map(key => [key, s[key]]));
  async function action(input) {
    const response = await fetch(s.apiUrl.replace(/\/$/, '') + '/api/workflow/actions?company=' + s.company, {
      method: 'POST',
      credentials: 'omit',
      headers: { Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(20000)
    });
    const body = await response.json();
    if (!response.ok) throw Error(body.error || 'Não foi possível concluir a operação.');
    return body;
  }
  function refresh() {
    s.workflowRefresh = (s.workflowRefresh || 0) + 1;
    archiveKey = '';
    noticeKey = '';
    invalidate?.();
  }
  function observe() {
    const id = active() ? s.token + '|' + s.company + '|' + s.legalEntity : '';
    if (id !== identity) {
      identity = id;
      epoch++;
      noticeKey = '';
      archiveKey = '';
      archivePending = '';
      archive = null;
      s.pendingNotices = null;
      s.pendingNoticeError = '';
      s.noticesOpen = false;
      s.pendingDialog = '';
      s.selectedPendingKeys = [];
    }
    if (!active()) return;
    const current = epoch,
      nk = id + '|' + operationalToday() + '|' + (s.workflowRefresh || 0);
    if (noticeKey !== nk) {
      noticeKey = nk;
      action({ action: 'notices', state: { legalEntity: s.legalEntity } })
        .then(value => {
          if (current === epoch) {
            s.pendingNotices = value;
            s.pendingNoticeError = '';
            if (!s.taskSelected && !s.pendingDialog) render();
          }
        })
        .catch(error => {
          if (current === epoch) {
            s.pendingNoticeError = error.message;
            if (!s.taskSelected && !s.pendingDialog) render();
          }
        });
    }
    const selection = JSON.stringify([id, s.remoteSnapshot, stateQuery(), s.from, s.to]);
    if (selection !== selectionKey) {
      selectionKey = selection;
      s.selectedPendingKeys = [];
    }
    if (!s.alertArchive || !(s.view === 'pendencias' || (s.view === 'relatorios' && s.reportSelected === 'pendencias')))
      return;
    const k = JSON.stringify([id, stateQuery(), s.workflowRefresh]);
    if (archiveKey !== k && archivePending !== k) {
      archivePending = k;
      archive = null;
      action({ action: 'archive', state: stateQuery() })
        .then(value => {
          if (current !== epoch || archivePending !== k) return;
          archive = value;
          s.page = value.page;
          s.visibleAlerts = value.visibleAlerts;
          archiveKey = JSON.stringify([id, stateQuery(), s.workflowRefresh]);
        })
        .catch(error => {
          if (current === epoch) {
            archive = {
              html:
                '<p class="ins-inline-error" role="alert">' +
                h(error.message) +
                '</p><button class="btn" data-pending-action="reload-notices">Tentar novamente</button>'
            };
            archiveKey = k;
          }
        })
        .finally(() => {
          if (current === epoch && archivePending === k) {
            archivePending = '';
            if (!s.taskSelected && !s.pendingDialog) render();
          }
        });
    }
  }
  function afterRender() {
    const selected = new Set(s.selectedPendingKeys || []);
    for (const input of document.querySelectorAll?.('[data-pending-select]') || [])
      input.checked = selected.has(input.dataset.pendingSelect);
    if (s.pendingDialog === 'batch' && !s.pendingPreview && s.pendingBatchDraft)
      for (const [id, value] of Object.entries(s.pendingBatchDraft)) {
        const input = document.getElementById(id);
        if (input) {
          if (typeof value === 'boolean') input.checked = value;
          else input.value = value;
        }
      }
    const count = document.getElementById('pendingSelectionCount');
    if (count) count.textContent = selected.size + ' selecionadas';
    const button = document.getElementById('pendingBatchButton');
    if (button) button.disabled = !selected.size;
  }
  async function run(work) {
    const current = epoch;
    s.pendingSaving = true;
    s.pendingError = '';
    render();
    try {
      await work(current);
    } catch (error) {
      if (current === epoch) s.pendingError = error.message;
    } finally {
      if (current === epoch) {
        s.pendingSaving = false;
        render();
      }
    }
  }
  function clearFilters() {
    Object.assign(s, {
      alertGroup: '',
      drilldown: '',
      page: 1,
      search: '',
      customer: '',
      vehicle: '',
      serviceType: '',
      rvStage: '',
      tripFocus: '',
      alertScope: 'todos',
      alertKind: 'todos',
      alertPriority: 'todos',
      alertStatus: 'todos',
      alertDue: 'todos',
      alertOwner: '',
      alertUnassigned: false,
      alertRecurrent: false,
      alertRelevant: false,
      alertAllTracked: false
    });
  }
  function handleClick(target) {
    const tab = target.closest('[data-pending-tab]');
    if (tab) {
      clearFilters();
      s.alertArchive = tab.dataset.pendingTab === 'archive';
      s.pendingDialog = '';
      render();
      return true;
    }
    const notice = target.closest('[data-pending-notice]');
    if (notice) {
      const key = notice.dataset.pendingNotice;
      clearFilters();
      Object.assign(s, {
        view: 'pendencias',
        alertArchive: true,
        alertAllTracked: true,
        alertStatus: 'ativas',
        alertScope: ['vencidas', 'hoje'].includes(key) ? 'mine' : 'todos',
        alertDue: ['vencidas', 'hoje'].includes(key) ? key : 'todos',
        alertUnassigned: key === 'sem_responsavel',
        alertRecurrent: key === 'reincidentes',
        alertRelevant: key === 'reincidentes',
        noticesOpen: false
      });
      render();
      return true;
    }
    const exportButton = target.closest('[data-pending-export]');
    if (exportButton) {
      action({ action: 'export-archive', state: stateQuery() })
        .then(value => exportModels(value.models, 'pendencias', exportButton.dataset.pendingExport, false))
        .catch(error => alert(error.message));
      return true;
    }
    const button = target.closest('[data-pending-action]');
    if (!button) return false;
    if (!active()) {
      alert('Entre no portal para acessar os acompanhamentos compartilhados.');
      return true;
    }
    const name = button.dataset.pendingAction;
    if (name === 'notices') {
      s.noticesOpen = !s.noticesOpen;
      render();
    }
    if (name === 'reload-notices') {
      refresh();
      render();
    }
    if (name === 'clear-archive-filters') {
      clearFilters();
      render();
    }
    if (name === 'close-dialog' && !s.pendingSaving) {
      s.pendingDialog = '';
      s.pendingPreview = null;
      render();
    }
    if (name === 'rules') {
      s.pendingDialog = 'rules';
      s.pendingRules = null;
      s.pendingError = '';
      render();
      run(async current => {
        const result = await action({ action: 'rules' });
        if (current === epoch) s.pendingRules = result.policy;
      });
    }
    if (name === 'batch') {
      if (!s.selectedPendingKeys?.length) return true;
      s.pendingDialog = 'batch';
      s.pendingBatchDraft = null;
      s.pendingPreview = null;
      s.pendingError = '';
      render();
    }
    if (name === 'edit-batch') {
      s.pendingPreview = null;
      render();
    }
    if (name === 'apply-batch' && !s.pendingSaving && s.pendingPreview)
      run(async current => {
        await action({ action: 'apply-batch', token: s.pendingPreview.token });
        if (current === epoch) {
          s.pendingDialog = '';
          s.pendingPreview = null;
          s.selectedPendingKeys = [];
          refresh();
        }
      });
    return true;
  }
  function handleChange(target) {
    if (target.dataset?.pendingRule) {
      const value = target.value;
      s.pendingRules.days[target.dataset.pendingRule] = value === '' ? null : Number(value);
      return true;
    }
    if (target.hasAttribute?.('data-pending-select-page')) {
      s.selectedPendingKeys = target.checked ? (s.visibleAlerts || []).map(alertKey) : [];
      afterRender();
      return true;
    }
    if (target.dataset?.pendingSelect) {
      const values = new Set(s.selectedPendingKeys || []);
      if (target.checked) values.add(target.dataset.pendingSelect);
      else values.delete(target.dataset.pendingSelect);
      s.selectedPendingKeys = [...values];
      afterRender();
      return true;
    }
    return false;
  }
  function submit(form) {
    if (form.id === 'pendingRulesForm') {
      const policy = {
        ...s.pendingRules,
        applyUnscheduled: !!document.getElementById('policyApplyUnscheduled')?.checked
      };
      if (!s.pendingSaving)
        run(async current => {
          await action({ action: 'save-rules', policy });
          if (current === epoch) {
            s.pendingDialog = '';
            refresh();
          }
        });
      return true;
    }
    if (form.id !== 'pendingBatchForm') return false;
    if (s.pendingSaving) return true;
    const field = id => document.getElementById(id),
      changes = {};
    for (const [key, id] of [
      ['status', 'batchStatus'],
      ['priority', 'batchPriority'],
      ['comment', 'batchComment'],
      ['resolutionReason', 'batchResolutionReason']
    ])
      if (field(id)?.value) changes[key] = field(id).value;
    if (changes.status === 'resolvida') changes.resolutionReason = field('batchResolutionReason')?.value || '';
    if (field('batchChangeOwner')?.checked) changes.owner = field('batchOwner')?.value || '';
    if (field('batchChangeDue')?.checked) {
      const due = parseEditableDate(field('batchDue')?.value || '');
      if (due === null) {
        s.pendingError = 'Informe um prazo válido.';
        render();
        return true;
      }
      changes.due = due;
    }
    s.pendingBatchDraft = Object.fromEntries(
      ['batchStatus', 'batchPriority', 'batchOwner', 'batchDue', 'batchResolutionReason', 'batchComment'].map(id => [
        id,
        field(id)?.value || ''
      ])
    );
    for (const id of ['batchChangeOwner', 'batchChangeDue']) s.pendingBatchDraft[id] = !!field(id)?.checked;
    const items = (s.visibleAlerts || [])
      .filter(row => s.selectedPendingKeys.includes(alertKey(row)))
      .map(row => ({ key: alertKey(row), revision: row.revision || 0 }));
    run(async current => {
      const preview = await action({ action: 'preview-batch', items, changes });
      if (current === epoch) s.pendingPreview = preview;
    });
    return true;
  }
  return {
    observe,
    afterRender,
    handleClick,
    handleChange,
    submit,
    refresh,
    bell: () => renderPendingBell(s),
    dialogs: () => renderPendingDialogs(s),
    contents: () => archive?.html || '<p class="help" role="status">Carregando os acompanhamentos registrados…</p>',
    exportArchive: () => action({ action: 'export-archive', state: stateQuery() })
  };
}
