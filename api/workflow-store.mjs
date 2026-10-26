import { readFile, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { validCompany } from '../src/companies.mjs';
import { validTaskKey, updateTask, taskSummary } from '../src/workflow.mjs';
import {
  emptyPolicy,
  dueFromPolicy,
  PENDING_TYPES,
  absenceConclusive,
  STALL_STAGES,
  stallRules
} from '../src/pending-data.mjs';
const bad = (message, status = 400) => Object.assign(Error(message), { status });
const decode = value =>
  value?.version === 2 && value.tasks ? value : { version: 2, tasks: value || {}, policy: emptyPolicy() };
/** Same private file; old task maps remain compatible. SQL objects are never created here. */
export function createWorkflowStore({ file = '', documents } = {}) {
  let queue = Promise.resolve();
  const validate = (company, key = '') => {
    if (!validCompany(company) || (key && !validTaskKey(key, company))) throw bad('Empresa ou pendência inválida.');
  };
  async function readFileState() {
    if (!file) throw bad('Armazenamento de tratamentos indisponível.', 503);
    try {
      const data = JSON.parse(await readFile(file, 'utf8'));
      if (data.version !== 1 || !data.companies) throw Error('Formato inválido');
      return data;
    } catch (e) {
      if (e.code === 'ENOENT') return { version: 1, companies: { costalog: {}, ideallog: {} } };
      throw e;
    }
  }
  async function read(company) {
    validate(company);
    if (documents) return decode(await documents.read('workflow:' + company));
    await queue;
    const data = await readFileState();
    return { version: 2, tasks: data.companies[company] || {}, policy: data.policies?.[company] || emptyPolicy() };
  }
  function transact(company, change) {
    validate(company);
    if (documents) return documents.transact('workflow:' + company, value => change(decode(value)));
    const operation = queue.then(async () => {
      const data = await readFileState(),
        bundle = {
          version: 2,
          tasks: data.companies[company] || {},
          policy: data.policies?.[company] || emptyPolicy()
        };
      const next = await change(bundle);
      data.companies[company] = next.tasks;
      data.policies ||= {};
      data.policies[company] = next.policy;
      await mkdir(dirname(file), { recursive: true, mode: 0o700 });
      const temp = join(dirname(file), '.workflow-' + randomBytes(10).toString('hex') + '.tmp');
      try {
        await writeFile(temp, JSON.stringify(data), { mode: 0o600, flag: 'wx', flush: true });
        await rename(temp, file);
      } catch (e) {
        await unlink(temp).catch(() => {});
        throw e;
      }
      return next;
    });
    queue = operation.catch(() => {});
    return operation;
  }
  const summaries = bundle =>
    Object.fromEntries(Object.entries(bundle.tasks).map(([key, task]) => [key, taskSummary(task)]));
  return {
    enabled: documents ? documents.enabled : !!file,
    async get(company, key = '') {
      validate(company, key);
      const data = await read(company);
      return key ? data.tasks[key] || null : summaries(data);
    },
    async policy(company) {
      const policy = (await read(company)).policy;
      return { ...policy, stall: stallRules(policy) };
    },
    async savePolicy(company, input, actor) {
      if (
        !Number.isSafeInteger(input.revision) ||
        !input.days ||
        typeof input.days !== 'object' ||
        Array.isArray(input.days)
      )
        throw bad('Regra de prazo inválida.');
      const days = Object.fromEntries(
        Object.keys(PENDING_TYPES).map(type => {
          const value = input.days[type] ?? null;
          if (value !== null && (!Number.isInteger(value) || value < 0 || value > 365))
            throw bad('Prazo por tipo: de 0 a 365 dias corridos.');
          return [type, value];
        })
      );
      const stall = Object.fromEntries(
        STALL_STAGES.map(([key]) => {
          const value = input.stall && Object.hasOwn(input.stall, key) ? input.stall[key] : undefined;
          if (value !== undefined && value !== null && (!Number.isInteger(value) || value < 0 || value > 365))
            throw bad('RV parada: de 0 a 365 dias.');
          return [key, value];
        })
      );
      const next = await transact(company, b => {
        if (b.policy.revision !== input.revision) throw bad('Prazos alterados por outra pessoa. Recarregue.', 409);
        // Clientes antigos sem o campo "stall" preservam o que já estava salvo.
        const previous = stallRules(b.policy);
        b.policy = {
          revision: input.revision + 1,
          days,
          stall: Object.fromEntries(Object.entries(stall).map(([k, v]) => [k, v === undefined ? previous[k] : v])),
          updatedBy: actor,
          updatedAt: new Date().toISOString()
        };
        if (input.applyUnscheduled)
          for (const [key, task] of Object.entries(b.tasks))
            if (task.status !== 'resolvida' && !task.due && task.dueOrigin !== 'manual') {
              const due = dueFromPolicy(key.split(':')[0], task.firstSeenAt || b.policy.updatedAt, b.policy);
              if (due && (task.history || []).length >= 2000) throw bad('Histórico atingiu o limite deste tratamento.');
              if (due)
                b.tasks[key] = {
                  ...task,
                  due,
                  dueOrigin: 'policy',
                  policyDays: days[key.split(':')[0]],
                  revision: (task.revision || 0) + 1,
                  history: [
                    ...(task.history || []),
                    { author: actor, at: b.policy.updatedAt, changes: { due: { from: '', to: due } } }
                  ]
                };
            }
        return b;
      });
      return next.policy;
    },
    async save(company, key, input, actor, source, now) {
      validate(company, key);
      const next = await transact(company, b => {
        const previous = b.tasks[key];
        const task = updateTask(previous, input, actor, now);
        if (source && !previous?.source) task.source = source;
        b.tasks[key] = task;
        return b;
      });
      return next.tasks[key];
    },
    async batch(company, items, changes, actor, { preview = false } = {}) {
      if (
        !Array.isArray(items) ||
        !items.length ||
        items.length > 100 ||
        new Set(items.map(x => x.key)).size !== items.length
      )
        throw bad('Selecione de 1 a 100 pendências distintas.');
      if (
        changes?.status === 'resolvida' &&
        (typeof changes.resolutionReason !== 'string' || !changes.resolutionReason.trim())
      )
        throw bad('Informe o motivo da resolução para o lote.');
      const allowed = ['owner', 'ownerUsername', 'due', 'priority', 'status', 'resolutionReason', 'comment'];
      if (!changes || !Object.keys(changes).length || Object.keys(changes).some(k => !allowed.includes(k)))
        throw bad('Ação em lote inválida.');
      const apply = b => {
        const output = [];
        for (const item of items) {
          validate(company, item.key);
          const previous = b.tasks[item.key];
          if (!previous) throw bad('Pendência não disponível. Atualize a lista.', 409);
          const next = updateTask(
            previous,
            { ...previous, ...changes, comment: changes.comment || '', revision: item.revision },
            actor
          );
          output.push({ key: item.key, task: next });
        }
        return output;
      };
      if (preview) return apply(await read(company)).map(({ key, task }) => ({ key, task: taskSummary(task) }));
      const next = await transact(company, b => {
        for (const { key, task } of apply(b)) b.tasks[key] = task;
        return b;
      });
      return items.map(({ key }) => ({ key, task: taskSummary(next.tasks[key]) }));
    },
    async observe(company, { references, data, freshPeriods, coverage, at = new Date().toISOString(), signal } = {}) {
      return transact(company, b => {
        signal?.throwIfAborted();
        const present = new Set(),
          index = {
            tripIds: new Set((data.viagens || []).map(r => r.id)),
            linkedTripIds: new Set((data.pedidos || []).map(r => r.viagemId).filter(Boolean))
          },
          byId = {
            viagens: new Map((data.viagens || []).map(r => [r.id, r])),
            ctes: new Map((data.pedidos || []).map(r => [r.id, r]))
          };
        const fresh = date => !!date && freshPeriods.some(p => date >= p.from && date <= p.to);
        for (const ref of references) {
          const key = [ref.type, ref.view, ref.record.id].join(':');
          validate(company, key);
          present.add(key);
          const source = {
            entity: String(ref.record.id).split('~')[0],
            number: String(ref.record.pedidoNumero || ref.record.numero || ref.record.id).slice(0, 150),
            refDate: ref.record.data || '',
            customer: String(ref.record.cliente || '').slice(0, 200),
            plate: String(ref.record.placa || '').slice(0, 30),
            tripId: ref.view === 'viagens' ? ref.record.id : ref.record.viagemId || '',
            serviceType: String(ref.record.tipoServico || '').slice(0, 100),
            rvStage: ref.view === 'viagens' ? ref.record.status : byId.viagens.get(ref.record.viagemId)?.status || ''
          };
          let task = b.tasks[key];
          if (!task) {
            const due = dueFromPolicy(ref.type, at, b.policy);
            task = {
              owner: '',
              ownerUsername: '',
              status: 'aberta',
              priority: ref.level,
              due,
              dueOrigin: due ? 'policy' : 'none',
              policyDays: b.policy.days[ref.type],
              revision: 0,
              createdAt: at,
              firstSeenAt: at,
              source,
              recurrenceCount: 0,
              comments: [],
              history: []
            };
          }
          if ((task.lastObservedAt && task.lastObservedAt >= at) || (task.updatedAt && task.updatedAt >= at)) continue;
          // Reused months can seed a first observation, but cannot establish a new lifecycle transition.
          const rangeSensitive = ['cte_sem_rv', 'rv_nao_localizada', 'rv_ambigua', 'rv_sem_pedido'].includes(ref.type),
            sameCoverage =
              !rangeSensitive ||
              !task.absenceCoverage ||
              (coverage && coverage.from <= task.absenceCoverage.from && coverage.to >= task.absenceCoverage.to);
          const returned = !!(task.presence === 'absent' || task.confirmedAbsentAt);
          if (fresh(source.refDate) && returned && sameCoverage) {
            task = {
              ...task,
              confirmedAbsentAt: null,
              absenceCoverage: null,
              recurrenceCount: (task.recurrenceCount || 0) + 1,
              reopenedAt: at,
              reopenedBy: 'DSS',
              updatedAt: at,
              updatedBy: 'DSS',
              revision: task.revision + 1,
              status: task.status === 'resolvida' ? 'aberta' : task.status,
              resolutionReason: '',
              history: [
                ...(task.history || []),
                {
                  at,
                  author: 'DSS',
                  changes: {
                    reincidencia: { from: task.recurrenceCount || 0, to: (task.recurrenceCount || 0) + 1 },
                    status: { from: task.status, to: task.status === 'resolvida' ? 'aberta' : task.status }
                  }
                }
              ]
            };
            if (task.dueOrigin !== 'manual') {
              task.due = dueFromPolicy(ref.type, at, b.policy);
              task.policyDays = b.policy.days[ref.type];
              task.dueOrigin = task.due ? 'policy' : 'none';
            }
          }
          if ((task.history || []).length > 2000) throw bad('Histórico atingiu o limite deste tratamento.');
          b.tasks[key] = {
            ...task,
            source,
            presence:
              !fresh(source.refDate) && task.presence
                ? task.presence
                : returned && !sameCoverage
                  ? 'unknown'
                  : 'present',
            lastSeenAt: fresh(source.refDate) || !task.lastSeenAt ? at : task.lastSeenAt,
            lastObservedAt: at
          };
        }
        for (const [key, task] of Object.entries(b.tasks)) {
          if (
            present.has(key) ||
            !fresh(task.source?.refDate) ||
            (task.lastObservedAt && task.lastObservedAt >= at) ||
            (task.updatedAt && task.updatedAt >= at)
          )
            continue;
          const [type, view, id] = key.split(':'),
            row = byId[view]?.get(id);
          if (absenceConclusive(type, row, data, index))
            b.tasks[key] = {
              ...task,
              presence: 'absent',
              confirmedAbsentAt: at,
              absenceCoverage: coverage || null,
              lastObservedAt: at,
              absentAt: task.presence === 'absent' ? task.absentAt : at
            };
        }
        signal?.throwIfAborted();
        return b;
      });
    }
  };
}
