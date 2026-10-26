export const TASK_STATUSES = Object.freeze({ aberta: 'Aberta', tratamento: 'Em tratamento', resolvida: 'Resolvida' });
export const TASK_PRIORITIES = Object.freeze({ high: 'Alta', warning: 'Verificação', info: 'Informativa' });
export const alertKey = alert => [alert.type, alert.view, alert.recordId].join(':');
export const normalizeOwner = value =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
/** Prazos seguem o calendário da operação, inclusive perto da meia-noite UTC. */
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});
export function operationalToday(now = new Date()) {
  const parts = Object.fromEntries(dayFormatter.formatToParts(now).map(part => [part.type, part.value]));
  return parts.year + '-' + parts.month + '-' + parts.day;
}
export function taskBelongsToUser(task, user) {
  if (!user?.username) return false;
  if (task.ownerUsername) return normalizeOwner(task.ownerUsername) === normalizeOwner(user.username);
  const owner = normalizeOwner(task.owner);
  return (
    !!owner && [user.username, user.displayName, user.name].filter(Boolean).some(name => normalizeOwner(name) === owner)
  );
}
export function assignmentForOwner(owner, user, previous = {}, self = false) {
  if (self && taskBelongsToUser({ owner }, user)) return String(user.username).toLowerCase();
  if (previous.ownerUsername && normalizeOwner(owner) === normalizeOwner(previous.owner)) return previous.ownerUsername;
  if (taskBelongsToUser({ owner }, user)) return String(user.username).toLowerCase();
  return normalizeOwner(owner) === normalizeOwner(previous.owner) ? previous.ownerUsername || '' : '';
}
export function taskDueBucket(task, today = operationalToday()) {
  if (task.status === 'resolvida') return 'resolvidas';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(task.due || '')) return 'sem_prazo';
  return task.due < today ? 'vencidas' : task.due === today ? 'hoje' : 'proximas';
}
export function taskFor(alert, tasks = {}) {
  const saved = tasks[alertKey(alert)] || {};
  return {
    key: alertKey(alert),
    owner: '',
    ownerUsername: '',
    due: '',
    status: 'aberta',
    revision: 0,
    ...saved,
    priority: saved.priority || alert.level
  };
}
export function validTaskKey(key, company) {
  if (typeof key !== 'string' || key.length > 240) return false;
  const match = key.match(
    /^(cte_pendente|cte_sem_rv|rv_nao_localizada|rv_ambigua|comprovante_pendente|ocorrencia|rv_sem_pedido|rv_sem_termino|km_acima):(ctes|viagens):([^:\s]+)$/
  );
  if (!match) return false;
  if (match[2] !== (['rv_sem_pedido', 'rv_sem_termino', 'km_acima'].includes(match[1]) ? 'viagens' : 'ctes'))
    return false;
  const entity = match[3].split('~')[0];
  return (
    !match[3].includes('~') ||
    (company === 'ideallog' ? entity === 'ideallog' : ['acdacosta', 'crc', 'comex', 'costalog'].includes(entity))
  );
}
export function validateTask(input) {
  if (!input || typeof input !== 'object') throw Error('Tratamento inválido.');
  const { owner = '', due = '', priority, status, comment = '', revision } = input;
  const resolutionReason =
    input.resolutionReason === undefined ? (status === 'resolvida' ? comment : '') : input.resolutionReason;
  if (typeof resolutionReason !== 'string' || resolutionReason.length > 2000)
    throw Error('Motivo da resolução inválido: até 2.000 caracteres.');
  if (status === 'resolvida' && !resolutionReason.trim()) throw Error('Informe o motivo da resolução.');
  if (
    input.ownerUsername !== undefined &&
    (typeof input.ownerUsername !== 'string' ||
      (input.ownerUsername && !/^[a-z0-9._-]{3,60}$/.test(input.ownerUsername)))
  )
    throw Error('Conta responsável inválida.');
  if (typeof owner !== 'string' || owner.length > 100 || typeof comment !== 'string' || comment.length > 2000)
    throw Error('Responsável: até 100 caracteres. Comentário: até 2.000 caracteres.');
  if (!Object.hasOwn(TASK_STATUSES, status) || !Object.hasOwn(TASK_PRIORITIES, priority))
    throw Error('Situação ou prioridade inválida.');
  if (
    typeof due !== 'string' ||
    (due &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(due) ||
        !Number.isFinite(Date.parse(due + 'T12:00:00Z')) ||
        new Date(due + 'T12:00:00Z').toISOString().slice(0, 10) !== due))
  )
    throw Error('Prazo inválido.');
  if (!Number.isSafeInteger(revision) || revision < 0) throw Error('Versão inválida. Reabra a pendência.');
  return {
    resolutionReason: resolutionReason.trim(),
    owner: owner.trim(),
    ...(input.ownerUsername !== undefined ? { ownerUsername: input.ownerUsername } : {}),
    due,
    priority,
    status,
    comment: comment.trim(),
    revision
  };
}
export function updateTask(previous, input, actor, now = new Date().toISOString()) {
  const value = validateTask(input);
  if ((previous?.revision || 0) !== value.revision) {
    const error = Error('Outra pessoa atualizou esta pendência. Reabra para ver a versão atual.');
    error.status = 409;
    throw error;
  }
  const { comment, revision, ...fields } = value;
  if (fields.status !== 'resolvida') fields.resolutionReason = '';
  fields.ownerUsername =
    value.ownerUsername ??
    (normalizeOwner(value.owner) === normalizeOwner(previous?.owner) ? previous?.ownerUsername || '' : '');
  const changes = Object.keys(fields).filter(key => fields[key] !== (previous?.[key] ?? ''));
  const entry = {
    ...previous,
    ...fields,
    createdAt: previous?.createdAt || now,
    handledAt: previous?.handledAt || now,
    revision: revision + 1,
    updatedAt: now,
    updatedBy: actor,
    comments: [...(previous?.comments || []), ...(comment ? [{ text: comment, author: actor, at: now }] : [])],
    history: [
      ...(previous?.history || []),
      {
        author: actor,
        at: now,
        changes: Object.fromEntries(changes.map(key => [key, { from: previous?.[key] ?? '', to: fields[key] }]))
      }
    ]
  };
  if (entry.status === 'resolvida' && previous?.status !== 'resolvida') {
    entry.resolvedAt = now;
    entry.resolvedBy = actor;
    entry.resolutions = [
      ...(previous?.resolutions || []),
      { at: now, by: actor, reason: fields.resolutionReason, cycle: (previous?.recurrenceCount || 0) + 1 }
    ];
  }
  if (previous?.status === 'resolvida' && entry.status !== 'resolvida') {
    entry.reopenedAt = now;
    entry.reopenedBy = actor;
    entry.reopenCount = (previous.reopenCount || 0) + 1;
  }
  if (entry.due !== previous?.due) entry.dueOrigin = 'manual';
  if (entry.comments.length > 500 || entry.history.length > 2000)
    throw Error('Histórico atingiu o limite deste tratamento.');
  return entry;
}
export function taskSummary(task) {
  const { comments, history, resolutions, ...summary } = task;
  return summary;
}
