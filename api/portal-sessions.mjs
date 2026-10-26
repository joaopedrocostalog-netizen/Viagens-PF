import { randomUUID } from 'node:crypto';
import { parseEditableDate } from '../src/date-controls.mjs';
import { monthWindows } from './dss-periods.mjs';
const fail = (message, status) => Object.assign(Error(message), { status });
/** Jobs carry no rows in status responses. Snapshots publish atomically after ALL sources finish. */
export function createPortalSessions({
  synchronize,
  afterSync = async () => {},
  onFailure = () => {},
  // Prepara as bases por empresa a partir da resposta bruta, que é descartada em seguida (memória).
  prepare = null,
  maxSnapshots = 6,
  maxJobs = 20,
  ttlMs = 2 * 3600000
} = {}) {
  const jobs = new Map(),
    snapshots = new Map();
  // Última consulta MANUAL completa (não a de comparativos): compartilhada com todos os usuários autenticados,
  // para o portal abrir já com dados. A apresentação continua aplicando as permissões de cada perfil.
  let latestId = '';
  const owned = (map, id, user) => {
    const v = map.get(id);
    if (!v || v.username !== user.username) throw fail('Consulta não encontrada ou expirada. Atualize os dados.', 404);
    return v;
  };
  const publicJob = j => ({
    id: j.id,
    status: j.status,
    from: j.from,
    to: j.to,
    steps: j.steps,
    completed: j.steps.filter(s => ['done', 'unavailable', 'reused', 'disabled', 'skipped'].includes(s.status)).length,
    total: j.steps.length,
    snapshot: j.snapshot || null,
    range: j.range || null,
    notice: j.notice || '',
    error: j.error || ''
  });
  const prune = () => {
    for (const map of [jobs, snapshots])
      for (const [id, v] of map) if (Date.now() - v.touched > ttlMs && v.status !== 'running') map.delete(id);
  };
  return {
    start(input, user) {
      prune();
      const fullHistory = input.history === 'all';
      const to = input.to,
        from = fullHistory ? input.to : input.from;
      if (
        !from ||
        !to ||
        parseEditableDate(from) !== from ||
        parseEditableDate(to) !== to ||
        from > to ||
        from < '2000-01-01'
      )
        throw fail('Período inválido. Confira as datas.', 400);
      monthWindows(from, to);
      if (
        [...jobs.values()].filter(j => j.status === 'running' && j.username === user.username).length >= 2 ||
        [...jobs.values()].filter(j => j.status === 'running').length >= 4
      )
        throw fail('Já existe uma consulta em andamento. Cancele ou aguarde.', 429);
      while (jobs.size >= maxJobs) {
        const old = [...jobs.values()].find(j => j.status !== 'running');
        if (!old) throw fail('Consultas ocupadas. Aguarde.', 429);
        jobs.delete(old.id);
      }
      const j = {
        id: randomUUID(),
        username: user.username,
        from,
        to,
        status: 'running',
        steps: [],
        touched: Date.now(),
        controller: new AbortController()
      };
      jobs.set(j.id, j);
      const progress = step => {
        if (j.status !== 'running') return;
        const old = j.steps.find(s => s.key === step.key);
        if (old) Object.assign(old, step);
        else j.steps.push(step);
        j.touched = Date.now();
      };
      Promise.resolve()
        .then(() =>
          synchronize(from, to, {
            signal: j.controller.signal,
            onProgress: progress,
            refreshMode: input.refresh === 'cached' ? '' : 'recent',
            syncTo: to,
            fullHistory,
            remember: false
          })
        )
        .then(async payload => {
          if (j.status !== 'running' || j.controller.signal.aborted) return;
          // Período efetivamente carregado: início real do histórico ou o que coube na memória.
          const range = payload.range || { from, to };
          const prepared = prepare ? prepare(payload) : null;
          if (input.refresh !== 'cached')
            await afterSync(payload, { from: range.from, to: range.to, signal: j.controller.signal, prepared });
          if (j.status !== 'running' || j.controller.signal.aborted) return;
          const meta = prepared
            ? {
                updatedAt: payload.updatedAt,
                quality: payload.quality,
                workflowUnavailable: payload.workflowUnavailable,
                range,
                limited: payload.limited,
                history: payload.history
              }
            : payload;
          if (prepared) payload.data = null; // libera a resposta bruta
          j.range = range;
          j.notice = payload.limited
            ? 'O período inteiro não cabe na memória deste servidor. Foram carregados os meses mais recentes, de ' +
              range.from.split('-').reverse().join('/') +
              ' até ' +
              range.to.split('-').reverse().join('/') +
              '.'
            : payload.history
              ? payload.history.start
                ? 'Histórico completo da DSS: dados desde ' + range.from.split('-').reverse().join('/') + '.'
                : 'A DSS não devolveu registros no histórico consultado.'
              : '';
          const id = randomUUID();
          for (const old of snapshots.keys()) {
            if (snapshots.size < maxSnapshots) break;
            if (old !== latestId) snapshots.delete(old);
          }
          snapshots.set(id, {
            id,
            username: j.username,
            from: range.from,
            to: range.to,
            payload: meta,
            normalized: prepared || undefined,
            touched: Date.now()
          });
          if (input.refresh !== 'cached') latestId = id;
          j.snapshot = id;
          j.status = 'complete';
          j.touched = Date.now();
        })
        .catch(error => {
          if (j.status === 'cancelled') return;
          j.controller.abort();
          j.status = 'failed';
          // Motivo curto e sem dados sensíveis (ex.: "Mês 03/2026: Serviço viagens: tempo limite após 60s").
          j.error =
            'Não foi possível concluir a consulta' +
            (error?.message ? ': ' + String(error.message).slice(0, 240) : '') +
            '. Os dados anteriores foram mantidos.';
          j.touched = Date.now();
          console.warn('[SYNC] consulta interrompida', error.code || error.name);
          onFailure(error);
        });
      return publicJob(j);
    },
    status(id, user) {
      const j = owned(jobs, id, user);
      j.touched = Date.now();
      return publicJob(j);
    },
    cancel(id, user) {
      const j = owned(jobs, id, user);
      if (j.status === 'running') {
        j.status = 'cancelled';
        j.controller.abort();
        j.touched = Date.now();
      }
      return publicJob(j);
    },
    get(id, user) {
      prune();
      const s = id && id === latestId && snapshots.has(id) ? snapshots.get(id) : owned(snapshots, id, user);
      s.touched = Date.now();
      return s;
    },
    release(user) {
      for (const j of jobs.values())
        if (j.username === user.username && j.status === 'running') {
          j.status = 'cancelled';
          j.controller.abort();
        }
      for (const [id, s] of snapshots) if (s.username === user.username && id !== latestId) snapshots.delete(id);
    },
    /** Metadados da última consulta manual completa, sem registros. */
    latest() {
      prune();
      const s = latestId && snapshots.get(latestId);
      return s ? { id: s.id, from: s.from, to: s.to, updatedAt: s.payload?.updatedAt || null } : null;
    }
  };
}
