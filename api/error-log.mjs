/**
 * Registro simples de erros do portal (navegador, servidor e DSS), sem serviço externo.
 * - Guarda os últimos 100 erros em memória, agrupando repetições (contador + último horário).
 * - Sempre escreve no log do processo (aparece nos logs do Render/Plesk).
 * - Opcional: ERROR_WEBHOOK_URL (Slack, Teams ou Discord) recebe um aviso curto, no máximo 1 vez por hora
 *   para o mesmo erro e 20 avisos por hora no total.
 * Nunca guarda tokens, senhas, parâmetros de URL nem dados da DSS: só mensagem curta, local e horário.
 */
const MAX_ENTRIES = 100;
const clean = (value, max = 300) =>
  String(value ?? '')
    .replace(/(Bearer|Basic)\s+[\w.~+/=-]+/gi, '$1 [oculto]')
    .replace(/(token|senha|password|authorization)=[^&\s]+/gi, '$1=[oculto]')
    .replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/gi, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

export function createErrorLog({ webhook = '', fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  const entries = new Map();
  const sentAt = new Map();
  let sentWindow = { start: 0, count: 0 };
  const hook = /^https:\/\//i.test(webhook || '') ? webhook : '';

  function notify(entry) {
    if (!hook || !fetchImpl) return;
    const t = now();
    if (t - (sentAt.get(entry.key) || 0) < 3600000) return;
    if (t - sentWindow.start >= 3600000) sentWindow = { start: t, count: 0 };
    if (sentWindow.count >= 20) return;
    sentAt.set(entry.key, t);
    sentWindow.count++;
    const text =
      '⚠️ Portal COSTALOG · ' +
      entry.kind +
      ': ' +
      entry.message +
      (entry.where ? ' (' + entry.where + ')' : '') +
      (entry.count > 1 ? ' · ' + entry.count + 'x' : '');
    // "text" para Slack/Teams, "content" para Discord.
    fetchImpl(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, content: text }),
      signal: AbortSignal.timeout(5000)
    }).catch(() => {});
  }

  return {
    /** kind: 'navegador' | 'servidor' | 'dss'; level: 'erro' | 'aviso' */
    record(kind, message, { where = '', level = 'erro', detail = '' } = {}) {
      const entry = {
        kind: clean(kind, 20),
        level: level === 'aviso' ? 'aviso' : 'erro',
        message: clean(message) || 'Erro sem mensagem',
        where: clean(where, 120),
        detail: clean(detail, 400)
      };
      const key = [entry.kind, entry.message, entry.where].join('|');
      const at = new Date(now()).toISOString();
      const saved = entries.get(key);
      if (saved) {
        entries.delete(key);
        Object.assign(saved, { count: saved.count + 1, lastAt: at, detail: entry.detail || saved.detail });
        entries.set(key, saved);
      } else {
        entries.set(key, { ...entry, key, count: 1, firstAt: at, lastAt: at });
        while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value);
      }
      const current = entries.get(key);
      (entry.level === 'aviso' ? console.warn : console.error)(
        '[ERRO ' + entry.kind + ']',
        entry.message,
        entry.where || '',
        current.count > 1 ? '(' + current.count + 'x)' : ''
      );
      if (entry.level === 'erro') notify(current);
      return current;
    },
    /** Mais recentes primeiro, sem a chave interna. */
    list() {
      return [...entries.values()].reverse().map(({ key, ...entry }) => entry);
    },
    clear() {
      entries.clear();
    }
  };
}

/** Aceita somente o formato enviado pelo navegador do portal, com tamanhos limitados. */
export function clientErrorInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const message = clean(body.message);
  if (!message) return null;
  const file = clean(body.source, 200)
    .replace(/^.*\/(src\/)?/, '')
    .slice(0, 60);
  const line = Number.isInteger(body.line) && body.line > 0 ? ':' + body.line : '';
  const view = /^[a-z]{2,20}$/.test(body.view || '') ? body.view : '';
  return {
    message,
    where: [file + line, view && 'tela ' + view].filter(Boolean).join(' · '),
    detail: clean(body.stack, 400)
  };
}
