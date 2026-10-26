import { randomUUID } from 'node:crypto';
import { companyIdentity } from '../src/companies.mjs';
import { alertReferences } from '../src/operational.mjs';
import { archivePage, pendingNotices, archivedAlert } from '../src/pending-data.mjs';
import { normalizeOverview } from '../src/dss-mapping.mjs';
import { operationalDataset } from '../src/access-ui.mjs';
import { projectOverview } from './access.mjs';
import { renderPendingArchive } from '../src/pending-ui.mjs';
const fail = (message, status = 400) => Object.assign(Error(message), { status });
/** Meses (contados do fim do período) cujos alertas ganham registro automático de primeira detecção. */
const OBSERVE_MONTHS = Math.max(1, Math.min(24, Number(process.env.PENDING_OBSERVE_MONTHS) || 3));
const monthsBefore = (iso, months) => {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 - months, 1)).toISOString().slice(0, 10);
};
export function createPendingService({ store, sessions }) {
  const previews = new Map();
  const normalized = (payload, company) => {
    const projected = projectOverview(payload, 'operacional', company),
      data = operationalDataset(normalizeOverview(projected));
    data.clearedOccurrenceIds = new Set(
      (projected.data.pedidos || [])
        .filter(row => row.pf_id && typeof row.ocorrencia === 'string' && !row.ocorrencia.trim())
        .map(row => companyIdentity(row) + '~' + row.pf_id)
    );
    return data;
  };
  function source(ref, data) {
    const row = ref.record,
      trip = ref.view === 'viagens' ? row : data.viagens.find(v => v.id === row.viagemId);
    return {
      entity: row.id.split('~')[0],
      number: String(row.pedidoNumero || row.numero || row.id).slice(0, 150),
      refDate: row.data || '',
      customer: String(row.cliente || '').slice(0, 200),
      plate: String(row.placa || '').slice(0, 30),
      tripId: trip?.id || '',
      serviceType: String(row.tipoServico || '').slice(0, 100),
      rvStage: trip?.status || ''
    };
  }
  return {
    normalized,
    async observed(payload, { from, to, signal, prepared }) {
      const freshPeriods = (payload.quality?.periods || []).filter(p => !p.reused);
      for (const company of ['costalog', 'ideallog']) {
        signal?.throwIfAborted();
        const data = prepared?.get(company) || normalized(payload, company);
        try {
          const stall = (await store.policy(company)).stall;
          await store.observe(company, {
            references: alertReferences(data, { stall }),
            data,
            freshPeriods,
            coverage: { from, to },
            at: payload.updatedAt,
            signal,
            observeFrom: monthsBefore(to, OBSERVE_MONTHS - 1)
          });
        } catch (error) {
          signal?.throwIfAborted();
          console.warn('[WORKFLOW] observação indisponível', error.code || error.name);
          payload.workflowUnavailable = true;
        }
      }
    },
    async context(company, input, user) {
      if (!input.snapshot) return undefined;
      const snapshot = sessions.get(input.snapshot, user),
        data = snapshot.normalized?.get(company) || normalized(snapshot.payload, company);
      const stall = (await store.policy(company).catch(() => null))?.stall || null;
      for (const ref of alertReferences(data, { stall }))
        if ([ref.type, ref.view, ref.record.id].join(':') === input.key) return source(ref, data);
      // An archived treatment may no longer be an active alert.
      if (await store.get(company, input.key)) return undefined;
      throw fail('Pendência não localizada. Atualize a lista.', 409);
    },
    async action(company, input, user) {
      const state = { ...(input.state || {}), user };
      if (input.action === 'rules') return { policy: await store.policy(company) };
      if (input.action === 'save-rules') {
        if (!user.permissions.admin) throw fail('Somente administradores podem configurar os prazos.', 403);
        return { policy: await store.savePolicy(company, input.policy, user.username) };
      }
      if (input.action === 'notices') return pendingNotices(await store.get(company), user, state.legalEntity || '');
      if (input.action === 'archive' || input.action === 'export-archive') {
        const tasks = await store.get(company),
          page = archivePage(tasks, state, input.action === 'export-archive' ? Infinity : 25);
        if (input.action === 'export-archive')
          return {
            models: [
              {
                title: 'Arquivo de pendências tratadas',
                columns: [
                  ['title', 'Pendência'],
                  ['recordId', 'Registro'],
                  ['detail', 'Referência'],
                  ['owner', 'Responsável'],
                  ['due', 'Prazo'],
                  ['status', 'Situação'],
                  ['resolutionReason', 'Motivo da resolução'],
                  ['resolvedAt', 'Resolvida em'],
                  ['resolvedBy', 'Resolvida por'],
                  ['presence', 'Presença na última observação'],
                  ['recurrenceCount', 'Reincidências'],
                  ['updatedAt', 'Última alteração']
                ],
                rows: page.rows.map(row =>
                  Object.fromEntries(
                    [
                      'title',
                      'recordId',
                      'detail',
                      'owner',
                      'due',
                      'status',
                      'resolutionReason',
                      'resolvedAt',
                      'resolvedBy',
                      'presence',
                      'recurrenceCount',
                      'updatedAt'
                    ].map(k => [k, row[k] ?? ''])
                  )
                )
              }
            ]
          };
        return {
          html: renderPendingArchive(page, state),
          visibleAlerts: page.rows,
          page: page.page,
          total: page.total
        };
      }
      if (input.action === 'preview-batch') {
        const changes = { ...input.changes };
        // A text reassignment must not inherit the previous account's explicit username.
        if (Object.hasOwn(changes, 'owner'))
          changes.ownerUsername =
            changes.owner && changes.owner === (user.displayName || user.username) ? user.username : '';
        const items = await store.batch(company, input.items, changes, user.username, { preview: true });
        for (const [key, p] of previews) if (p.expires < Date.now()) previews.delete(key);
        if (previews.size >= 100) throw fail('Muitas prévias. Aguarde e tente novamente.', 429);
        const token = randomUUID();
        previews.set(token, {
          company,
          user: user.username,
          items: input.items,
          changes,
          expires: Date.now() + 5 * 60000
        });
        return {
          token,
          rows: items.map(({ key, task }) => ({ ...archivedAlert(key, task), revision: task.revision })),
          count: items.length,
          changes
        };
      }
      if (input.action === 'apply-batch') {
        const preview = previews.get(input.token);
        if (!preview || preview.company !== company || preview.user !== user.username || preview.expires < Date.now())
          throw fail('A prévia expirou. Gere uma nova prévia.', 409);
        previews.delete(input.token);
        return { tasks: await store.batch(company, preview.items, preview.changes, user.username) };
      }
      throw fail('Ação de pendências inválida.');
    }
  };
}
