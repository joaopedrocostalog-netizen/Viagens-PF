// Primeiro import: ajusta o teto de memória do Node ao contêiner (Render Free) antes de qualquer outra coisa.
import { containerMemoryMB } from './memory-launch.mjs';
import { readFileSync } from 'node:fs';
/**
 * Proxy privado DSS -> Portal COSTALOG.
 * Node.js >=20. Nunca guardar credenciais DSS no frontend.
 * Caminhos e parâmetros são configurados após validar o Swagger.
 */
import http from 'node:http';
import { createPendingService } from './pending-service.mjs';
import { createPrivateState } from './private-state.mjs';
import { createPreferencesStore } from './preferences-store.mjs';
import { createPortalSessions } from './portal-sessions.mjs';
import { portalResponse } from './portal-render.mjs';
import { validCompany } from '../src/companies.mjs';
import { createWorkflowStore } from './workflow-store.mjs';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { gzip } from 'node:zlib';
import {
  configuredUsers,
  login,
  authenticate,
  logout,
  listAccounts,
  createAccount,
  updateAccount,
  changeOwnPassword,
  AccountError
} from './auth.mjs';
import { projectOverview, projectPortalOverview, permissionsFor, OP_TRIPS, OP_ORDERS } from './access.mjs';
import { getHeapStatistics } from 'node:v8';
import { monthWindows, mergeDssRows } from './dss-periods.mjs';
import { createPeriodStore } from './period-store.mjs';
import { createMariaDbPeriodStore } from './mariadb-store.mjs';
import { createErrorLog, clientErrorInput } from './error-log.mjs';
const env = process.env;
const useAccounts = configuredUsers();
const allowLegacy = env.PORTAL_ALLOW_LEGACY_TOKEN === 'true';
const port = Number(env.PORT || 3001);
const base = env.DSS_BASE_URL || '';
const origins = (env.PORTAL_ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const timeout = Math.min(38000, Math.max(1000, Number(env.DSS_TIMEOUT_MS || 32000)));
const cacheMaxAge = Math.min(3600000, Math.max(0, Number(env.API_CACHE_SECONDS ?? 60) * 1000));
const CACHE = new Map(),
  CACHE_LIMIT = 3; // Render Free: evitar manter dezenas de respostas DSS enormes em memória.
const periodStore =
  env.MARIADB_ENABLED === 'true'
    ? createMariaDbPeriodStore({ env })
    : createPeriodStore({
        dir: env.DSS_PERIOD_CACHE_DIR || '',
        ttlMs: Math.max(60000, Number(env.DSS_PERIOD_CACHE_HOURS || 24) * 3600000)
      });
const workflowFile =
  env.PORTAL_WORKFLOW_FILE ||
  (env.PORTAL_USERS_FILE ? join(dirname(env.PORTAL_USERS_FILE), 'viagens-pf-workflow.json') : '');
const privateState = createPrivateState({ env });
const preferencesStore = createPreferencesStore(privateState);
const workflowStore = createWorkflowStore(privateState.enabled ? { documents: privateState } : { file: workflowFile });
const workflowStorage = { kind: privateState.enabled ? privateState.driver : 'file', durable: privateState.durable };
const portalSessions = createPortalSessions({
  synchronize,
  // Bases por empresa preparadas uma vez; a resposta bruta da DSS é descartada em seguida.
  prepare: payload =>
    new Map(['costalog', 'ideallog'].map(company => [company, pendingService.normalized(payload, company)])),
  onFailure: error =>
    errorLog.record('dss', 'Atualização da DSS não concluída: ' + (error?.code || error?.name || 'Error'), {
      detail: error?.message
    }),
  afterSync: (payload, context) => pendingService.observed(payload, context)
});
const pendingService = createPendingService({ store: workflowStore, sessions: portalSessions });
const INFLIGHT = new Map(); // Reutilizar consultas idênticas que chegam ao mesmo tempo.
// Erros do navegador, do servidor e da DSS, visíveis ao administrador; aviso opcional por ERROR_WEBHOOK_URL.
const errorLog = createErrorLog({ webhook: env.ERROR_WEBHOOK_URL || '' });
process.on('uncaughtExceptionMonitor', error =>
  errorLog.record('servidor', 'Erro não tratado: ' + (error?.name || 'Error'), { detail: error?.message })
);
const clientErrorRate = new Map();
function allowedClientError(req) {
  const remote = req.socket.remoteAddress || 'unknown',
    now = Date.now(),
    row = clientErrorRate.get(remote);
  if (clientErrorRate.size > 5000) clientErrorRate.clear();
  if (!row || now - row.start >= 600000) {
    clientErrorRate.set(remote, { start: now, count: 1 });
    return true;
  }
  return ++row.count <= 20;
}
const rateTable = new Map();
const rateLimit = Math.max(10, Number(env.PORTAL_REQUESTS_PER_MINUTE || 120));
let apiStats = { success: 0, failed: 0, cached: 0, lastSuccess: null, lastFailure: null };
function allowedRate(req) {
  const remote = req.socket.remoteAddress || 'unknown';
  const now = Date.now(),
    row = rateTable.get(remote);
  if (!row || now - row.start >= 60000) {
    rateTable.set(remote, { start: now, count: 1 });
    return true;
  }
  row.count++;
  return row.count <= rateLimit;
}
function cacheGet(key) {
  if (!cacheMaxAge) return null;
  const entry = CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.time > cacheMaxAge) {
    CACHE.delete(key);
    return null;
  }
  return entry.data;
}
/** Campos da DSS realmente usados pelo portal (os mesmos da projeção operacional de todos os perfis).
 * Guardar só eles corta a memória por linha; strings repetidas (cliente, cidade, empresa...) são compartilhadas. */
const SLIM_FIELDS = { viagens: OP_TRIPS, pedidos: OP_ORDERS, ctes: OP_ORDERS };
function createSlimmer() {
  const strings = new Map();
  const intern = value => {
    if (typeof value !== 'string') return value;
    const saved = strings.get(value);
    if (saved !== undefined) return saved;
    if (strings.size < 400000) strings.set(value, value);
    return value;
  };
  return (name, rows) => {
    const fields = SLIM_FIELDS[name];
    if (!fields || !Array.isArray(rows)) return rows;
    return rows.map(row => {
      const slim = {};
      for (const field of fields) if (row && Object.hasOwn(row, field)) slim[field] = intern(row[field]);
      return slim;
    });
  };
}
/**
 * Quantas linhas (RVs + pedidos) cabem com folga na memória deste servidor. Medido: ~670 bytes por linha
 * preparada e ~1 MB a cada 1.000 linhas no pico do preparo. Usa o menor entre o limite do Node e metade da
 * memória do contêiner (Render Free: 512 MB). PORTAL_MAX_ROWS substitui o cálculo.
 */
const heapLimitMB = Math.round(getHeapStatistics().heap_size_limit / 1048576);
const memoryForDataMB = Math.min(heapLimitMB, containerMemoryMB() ? containerMemoryMB() / 2 : heapLimitMB) - 60;
const ROW_BUDGET =
  Number(env.PORTAL_MAX_ROWS) > 0 ? Number(env.PORTAL_MAX_ROWS) : Math.max(20000, Math.round(memoryForDataMB * 650));
console.info(
  '[MEMÓRIA] limite do Node',
  heapLimitMB,
  'MB · contêiner',
  containerMemoryMB() || 'n/d',
  'MB · até',
  ROW_BUDGET,
  'linhas por consulta'
);
/** Data mais antiga que "Desde o início" tenta alcançar. */
const HISTORY_FLOOR = /^\d{4}-\d{2}-\d{2}$/.test(env.DSS_HISTORY_FLOOR || '') ? env.DSS_HISTORY_FLOOR : '2000-01-01';
const brMonth = iso => iso.slice(5, 7) + '/' + iso.slice(0, 4);
const isoAdd = (iso, days) => new Date(Date.parse(iso + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10);
const transientDss = error =>
  /não é JSON|conteúdo inválido|tempo limite|falha de conexão|HTTP 50[0234]/i.test(String(error?.message || ''));
function waitFor(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener('abort', abort);
      resolve();
    }
    function abort() {
      clearTimeout(timer);
      reject(signal.reason);
    }
    signal?.addEventListener('abort', abort, { once: true });
  });
}
/**
 * Busca um período na DSS sem desistir à toa: até 2 tentativas no período inteiro e, se ainda falhar por
 * tempo/instabilidade, divide ao meio (e assim por diante, até 1 dia). Meses pesados passam em pedaços.
 */
async function fetchDssRange(name, from, to, signal, onSplit = () => {}) {
  let last;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await queryDss(name, from, to, signal);
    } catch (error) {
      signal?.throwIfAborted();
      if (!transientDss(error)) throw error;
      last = error;
      console.warn('[DSS] repetindo serviço', name, 'período', from, to, 'causa', String(error.message).slice(0, 130));
      if (attempt < 2) await waitFor(2000, signal);
    }
  }
  if (from >= to) throw last;
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
  const middle = isoAdd(from, Math.floor(days / 2));
  onSplit(from, to);
  const first = await fetchDssRange(name, from, middle, signal, onSplit);
  const second = await fetchDssRange(name, isoAdd(middle, 1), to, signal, onSplit);
  return [...(first || []), ...(second || [])];
}
function cachePut(key, data) {
  if (!cacheMaxAge) return;
  // Uma única consulta pode ter dezenas de milhares de linhas: cache com no máximo 3 períodos.
  if (CACHE.has(key)) CACHE.delete(key);
  while (CACHE.size >= CACHE_LIMIT) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(key, { time: Date.now(), data });
}
function config(name) {
  const k = 'DSS_' + name.toUpperCase();
  return {
    path: env[k + '_PATH'] || { DSS_VIAGENS: '/listarViagens', DSS_PEDIDOS: '/listarPedidosFrete' }[k] || '',
    method: (env[k + '_METHOD'] || 'GET').toUpperCase(),
    from: env[k + '_QUERY_FROM'] || (name === 'viagens' || name === 'pedidos' ? 'data_inicio' : ''),
    to: env[k + '_QUERY_TO'] || (name === 'viagens' || name === 'pedidos' ? 'data_fim' : ''),
    body: env[k + '_BODY_TEMPLATE'] || '',
    dataPath: env[k + '_DATA_PATH'] || (name === 'viagens' || name === 'pedidos' ? 'registros' : '')
  };
}
const cfg = Object.fromEntries(['viagens', 'pedidos', 'ctes', 'mdfes'].map(k => [k, config(k)]));
/** Catálogo opcional de motoristas. Uma falha aqui não invalida viagens/pedidos. */
const driversPath = env.DSS_MOTORISTAS_PATH ?? '/listarMotoristas';
const optionalCatalogs = [
  {
    name: 'ocorrencias',
    path: env.DSS_OCORRENCIAS_PATH ?? '/listarOcorrencias',
    fields: [
      'empresa',
      'rv_id',
      'nro_rv',
      'pf_id',
      'nro_mdf',
      'ocorrencia_id',
      'data_ocorrencia',
      'descricao',
      'veiculo_id',
      'placa_veiculo',
      'ocorrencia_de',
      'relato',
      'causa_raiz',
      'providencia_tomada',
      'responsavel_atendimento',
      'envolvido',
      'data',
      'status'
    ]
  },
  {
    name: 'rotas',
    path: env.DSS_ROTAS_PATH ?? '/listarRotas',
    fields: ['empresa', 'rota_id', 'km_previsto_rota', 'dsc_rota', 'cidade_origem_rota', 'cidade_destino_rota']
  },
  {
    name: 'programacoes',
    path: env.DSS_PROGRAMACOES_PATH ?? '/listarProgramacoes',
    fields: [
      'empresa',
      'programacao_id',
      'nro_programacao',
      'rv_id',
      'nro_rv',
      'pf_id',
      'motorista_id',
      'veiculo_id',
      'data_emissao',
      'nro_cte',
      'total_frete_pedido_frete'
    ]
  }
];
const optionalCache = new Map();
/** Motivo curto e sem dados sensíveis para mostrar ao usuário quando uma fonte opcional falha. */
function unavailableReason(err) {
  const text = String(err?.message || '');
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError' || /timeout|timed out/i.test(text))
    return 'tempo esgotado na DSS';
  const http = text.match(/HTTP (\d{3})/);
  if (http) return 'DSS respondeu HTTP ' + http[1];
  const dss = text.match(/status DSS (\d+)/);
  if (dss) return 'DSS respondeu status ' + dss[1];
  if (/sem registros/.test(text)) return 'resposta da DSS sem registros';
  if (err instanceof SyntaxError) return 'resposta da DSS em formato inválido';
  return 'falha de conexão com a DSS';
}
async function optionalCatalog(c, from, to, signal) {
  if (!c.path) return [];
  const key = c.name + '|' + (c.name === 'rotas' ? 'catalogo' : from + '|' + to),
    saved = optionalCache.get(key);
  if (saved && saved.expires > Date.now()) return saved.rows;
  const url = new URL(c.path.startsWith('/') ? c.path.slice(1) : c.path, base.endsWith('/') ? base : base + '/');
  if (url.origin !== new URL(base).origin) throw Error('Origem de catálogo inválida');
  if (c.name === 'programacoes' || c.name === 'ocorrencias') {
    const format = d => d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);
    url.searchParams.set('data_inicio', format(from));
    url.searchParams.set('data_fim', format(to));
  }
  // Rotas é um catálogo pequeno (6 s). Programações/ocorrências de um mês podem demorar tanto quanto viagens/pedidos.
  const limit = c.name === 'rotas' ? Math.min(timeout, 6000) : timeout;
  const response = await fetch(url, {
    headers: { Accept: 'application/json', ...dssAuthHeaders() },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(limit)]) : AbortSignal.timeout(limit),
    redirect: 'error'
  });
  if (!response.ok) throw Error(c.name + ' HTTP ' + response.status);
  const json = await response.json();
  if (typeof json?.status === 'number' && json.status !== 200) throw Error(c.name + ' status DSS ' + json.status);
  const list = listFrom(json.registros);
  if (!Array.isArray(list)) throw Error(c.name + ' resposta sem registros');
  const rows = list.map(record =>
    Object.fromEntries(c.fields.filter(field => Object.hasOwn(record, field)).map(field => [field, record[field]]))
  );
  optionalCache.set(key, { rows, expires: Date.now() + 10 * 60_000 });
  if (optionalCache.size > 8) optionalCache.delete(optionalCache.keys().next().value);
  console.info('[DSS] catálogo', c.name, 'obtidos', rows.length);
  return rows;
}

let driverCatalog = { expires: 0, items: [], status: 'disabled' };
async function driverNames(signal) {
  if (!driversPath) return driverCatalog.items;
  if (Date.now() < driverCatalog.expires) return driverCatalog.items;
  const endpoint = new URL(
    driversPath.startsWith('/') ? driversPath.slice(1) : driversPath,
    base.endsWith('/') ? base : base + '/'
  );
  if (endpoint.origin !== new URL(base).origin) throw Error('Origem de motoristas inválida');
  const req = await fetch(endpoint, {
    headers: { Accept: 'application/json', ...dssAuthHeaders() },
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(Math.min(timeout, 12000))])
      : AbortSignal.timeout(Math.min(timeout, 12000)),
    redirect: 'error'
  });
  if (!req.ok) throw Error('listarMotoristas HTTP ' + req.status);
  const raw = await req.json();
  if (typeof raw?.status === 'number' && raw.status !== 200) throw Error('listarMotoristas status DSS ' + raw.status);
  const rows = listFrom(getPath(raw, env.DSS_MOTORISTAS_DATA_PATH || 'registros'));
  if (!Array.isArray(rows)) throw Error('listarMotoristas: registros não encontrados, confira DATA_PATH');
  const idField = env.DSS_MOTORISTAS_ID_FIELD || 'id',
    nameField = env.DSS_MOTORISTAS_NAME_FIELD || 'nome_motorista';
  const names = new Map();
  for (const item of rows) {
    const id = String(item?.[idField] ?? '').trim(),
      name = String(item?.[nameField] ?? '').trim();
    if (
      id &&
      name &&
      name.toLowerCase() !== 'null' &&
      !name.toLowerCase().startsWith('motorista id ') &&
      name.length <= 150
    ) {
      if (names.has(id) && names.get(id) !== name) names.set(id, null);
      else if (!names.has(id)) names.set(id, name);
    }
  }
  driverCatalog = { items: [...names].filter(([, name]) => name), expires: Date.now() + 15 * 60_000, status: 'ok' };
  console.info('[DSS] motoristas: catálogo atualizado, IDs com nome', driverCatalog.items.length);
  return driverCatalog.items;
}
function attachDriverNames(data, names) {
  const lookup = new Map(names);
  for (const kind of ['viagens', 'pedidos']) {
    for (const row of data[kind] || []) {
      const id = String(row.motorista_id ?? '').trim();
      if (id && lookup.has(id) && !String(row.motorista_nome ?? '').trim()) row.motorista_nome = lookup.get(id);
    }
  }
}

/** Auth do DSS e auth do portal são diferentes.
 * DSS: Basic Auth (somente backend). Portal: token Bearer de acesso à nossa API.
 */
const authType = (env.DSS_AUTH_TYPE || 'basic').toLowerCase();
function dssCredentialsReady() {
  if (authType === 'basic') return !!(env.DSS_USERNAME && env.DSS_PASSWORD);
  if (authType === 'header') return !!(env.DSS_AUTH_HEADER && env.DSS_AUTH_VALUE);
  return false;
}
function dssAuthHeaders() {
  if (authType === 'basic') {
    if (!dssCredentialsReady())
      throw Error('Basic Auth do DSS não configurado no servidor: defina DSS_USERNAME e DSS_PASSWORD.');
    if (env.DSS_USERNAME.includes(':'))
      throw Error('DSS_USERNAME inválido: o caractere dois-pontos não é permitido no usuário Basic Auth.');
    return {
      Authorization: 'Basic ' + Buffer.from(env.DSS_USERNAME + ':' + env.DSS_PASSWORD, 'utf8').toString('base64')
    };
  }
  if (authType === 'header') {
    if (!dssCredentialsReady()) throw Error('Cabeçalho de autenticação DSS não configurado.');
    return { [env.DSS_AUTH_HEADER]: env.DSS_AUTH_VALUE };
  }
  throw Error('DSS_AUTH_TYPE inválido. Use basic ou header.');
}
function reply(res, code, body, origin, acceptEncoding = '') {
  const str = JSON.stringify(body),
    h = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    };
  if (origin && origins.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Vary'] = 'Origin';
    h['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    h['Access-Control-Allow-Methods'] = 'GET, POST, PATCH, OPTIONS';
  }
  // Compactar só respostas grandes. Browser descomprime gzip automaticamente.
  if (str.length > 50000 && /\bgzip\b/i.test(acceptEncoding)) {
    h.Vary = h.Vary ? 'Origin, Accept-Encoding' : 'Accept-Encoding';
    return gzip(str, { level: 4 }, (error, data) => {
      if (res.destroyed || res.writableEnded) return;
      if (!error) {
        h['Content-Encoding'] = 'gzip';
        h['Content-Length'] = data.length;
        res.writeHead(code, h);
        res.end(data);
      } else {
        h['Content-Length'] = Buffer.byteLength(str);
        res.writeHead(code, h);
        res.end(str);
      }
    });
  }
  h['Content-Length'] = Buffer.byteLength(str);
  res.writeHead(code, h);
  res.end(str);
}
function legacyAuthorized(req) {
  const s = env.PORTAL_ACCESS_TOKEN;
  if (!s) return false;
  const a = Buffer.from(s),
    b = Buffer.from((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  return a.length === b.length && timingSafeEqual(a, b);
}
function bearer(req) {
  return (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
}
function identify(req) {
  if (useAccounts) return authenticate(bearer(req));
  if (allowLegacy && legacyAuthorized(req))
    return {
      username: 'legado-admin',
      displayName: 'Administrador',
      role: 'administrador',
      permissions: permissionsFor('administrador')
    };
  return null;
}
async function bodyJSON(req, maxBytes = 8192) {
  const parts = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Error('Corpo da requisição excede o limite permitido.');
    parts.push(chunk);
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
const loginAttempts = new Map();
function canTryLogin(req) {
  const ip = req.socket.remoteAddress || 'none',
    now = Date.now(),
    record = loginAttempts.get(ip);
  if (!record || now - record.start > 600000) {
    loginAttempts.set(ip, { start: now, n: 1 });
    return true;
  }
  record.n++;
  return record.n <= 12;
}
function getPath(value, path) {
  return path
    ? path
        .split('.')
        .filter(Boolean)
        .reduce((x, k) => x?.[k], value)
    : value;
}
function listFrom(v) {
  if (Array.isArray(v)) return v;
  if (!v || typeof v !== 'object') return null;
  for (const k of Object.keys(v)) {
    if (
      ['data', 'dados', 'result', 'results', 'items', 'lista', 'registros', 'retorno', 'content'].includes(
        k.toLowerCase()
      )
    ) {
      const r = listFrom(v[k]);
      if (r) return r;
    }
  }
  return null;
}
async function queryDss(name, from, to, signal) {
  const c = cfg[name];
  if (!c.path) return null;
  if (!['GET', 'POST'].includes(c.method)) throw Error('Método inválido em ' + name);
  if (!base) throw Error('DSS_BASE_URL não informado');
  const url = new URL(c.path.replace(/^\//, ''), base.replace(/\/?$/, '/'));
  if (url.origin !== new URL(base).origin) throw Error('Origem DSS inválida');
  const fmt =
    name === 'viagens' || name === 'pedidos' ? d => d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : d => d;
  if (c.from) url.searchParams.set(c.from, fmt(from));
  if (c.to) url.searchParams.set(c.to, fmt(to));
  const headers = { Accept: 'application/json', ...dssAuthHeaders() };
  let body;
  if (c.method === 'POST') {
    headers['Content-Type'] = 'application/json';
    body = (c.body || '{}').replaceAll('{{from}}', from).replaceAll('{{to}}', to);
    JSON.parse(body);
  }
  let r;
  const startedAt = Date.now();
  try {
    r = await fetch(url, {
      method: c.method,
      headers,
      body,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
      redirect: 'error'
    });
  } catch (err) {
    const reason = err?.name === 'TimeoutError' || err?.name === 'AbortError' ? 'tempo limite' : 'falha de conexão';
    console.error('[DSS] serviço', name, reason, 'após', Date.now() - startedAt, 'ms', 'tipo', err?.name || 'Error');
    throw Error(
      'Serviço ' +
        name +
        ': ' +
        reason +
        ' após ' +
        Math.round((Date.now() - startedAt) / 1000) +
        's. Verifique acesso de rede, liberação de IP/VPN e desempenho do DSS.'
    );
  }
  console.info('[DSS] serviço', name, 'HTTP', r.status, 'em', Date.now() - startedAt, 'ms');
  if (!r.ok) {
    if (r.status === 401)
      throw Error(
        'DSS recusou o usuário ou senha (HTTP 401). Confira DSS_USERNAME e DSS_PASSWORD no servidor privado.'
      );
    if (r.status === 403)
      throw Error(
        'DSS negou acesso à operação (HTTP 403). Confira permissões e o módulo tms_integr_prog_pg_motorista.'
      );
    if (r.status === 404)
      throw Error(
        'Rota ' +
          name +
          ' não encontrada no DSS (HTTP 404). Confira DSS_BASE_URL e DSS_' +
          name.toUpperCase() +
          '_PATH.'
      );
    throw Error('Consulta ' + name + ' retornou HTTP ' + r.status);
  }
  let v;
  try {
    v = await r.json();
  } catch {
    // DSS eventualmente responde HTML/texto com HTTP 200 (gateway/proxy), não um JSON.
    // Não aceitar esse conteúdo como lista vazia, nem registrar payload potencialmente sensível.
    console.warn(
      '[DSS] serviço',
      name,
      'resposta inválida HTTP',
      r.status,
      'content-type',
      String(r.headers.get('content-type') || 'não informado').slice(0, 80)
    );
    throw Error(
      'DSS devolveu conteúdo inválido em ' +
        name +
        ' (HTTP ' +
        r.status +
        ', não é JSON). Tente um período menor ou novamente em alguns minutos.'
    );
  }
  if (v && typeof v.status === 'number' && v.status !== 200)
    throw Error(
      'DSS ' +
        name +
        ' recusou a consulta (status ' +
        v.status +
        '): ' +
        String(v.mensagemErro || 'verifique permissões e credenciais').slice(0, 180)
    );
  const list = listFrom(getPath(v, c.dataPath));
  if (!list) throw Error('Resposta ' + name + ' não contém lista; confira o DATA_PATH.');
  if (Number.isInteger(v?.qtd_registros) && v.qtd_registros > list.length)
    throw Error(
      'DSS ' +
        name +
        ' indicou ' +
        v.qtd_registros +
        ' registros, mas retornou ' +
        list.length +
        '. Verifique a paginação antes de gerar relatórios.'
    );
  return list;
}
/** Frontend local no MESMO servidor e origem da API.
 * Lista explícita: nunca servir .env, private/, api/ ou outros arquivos do disco.
 */
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const staticFiles = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/styles.css', 'styles.css'],
  ['/logo-costalog-sem-fundo-1024x876.png', 'logo-costalog-sem-fundo-1024x876.png'],
  ['/Ideallog.png', 'Ideallog.png'],
  ...[
    'pending-data.mjs',
    'pending-ui.mjs',
    'pending-client.mjs',
    'portal-client.mjs',
    'rv-stage-filter.mjs',
    'date-controls.mjs',
    'rv-status.mjs',
    'data-availability.mjs',
    'portal-view.mjs',
    'demo-data.mjs',
    'demo-accounts.mjs',
    'mdfe-csv.mjs',
    'metric-drag.mjs',
    'portal-links.mjs',
    'programming.mjs',
    'programming-data.mjs',
    'mobile-tables.mjs',
    'rv-checklist.mjs',
    'view-cache.mjs',
    'workflow.mjs',
    'workflow-ui.mjs',
    'trip-timeline.mjs',
    'data-quality.mjs',
    'report-templates.mjs',
    'filtering.mjs',
    'companies.mjs',
    'app.js',
    'dss-mapping.mjs',
    'operational.mjs',
    'reporting.mjs',
    'advanced-ui.mjs',
    'access-ui.mjs',
    'admin-users.mjs',
    'site-config.mjs',
    'visual-dashboard.mjs',
    'intelligence.mjs',
    'intelligence-ui.mjs'
  ].map(name => ['/src/' + name, 'src/' + name])
]);
async function serveLocalFrontend(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const path = staticFiles.get(url.pathname);
  if (!path) return false;
  const mime = path.endsWith('.css')
    ? 'text/css; charset=utf-8'
    : path.endsWith('.js') || path.endsWith('.mjs')
      ? 'text/javascript; charset=utf-8'
      : path.endsWith('.png')
        ? 'image/png'
        : 'text/html; charset=utf-8';
  try {
    const bytes = await readFile(join(webRoot, path));
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': bytes.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch (err) {
    if (err.code === 'ENOENT')
      reply(res, 404, {
        error: 'Arquivo da interface não encontrado. Execute o projeto na pasta completa Viagens-PF, não somente api/.'
      });
    else reply(res, 500, { error: 'Falha ao carregar a interface local.' });
  }
  return true;
}
async function synchronize(
  from,
  to,
  {
    refreshMode = 'recent',
    syncTo = to,
    signal,
    onProgress = () => {},
    fullHistory = false,
    rowBudget = ROW_BUDGET,
    remember = true
  } = {}
) {
  const started = Date.now();
  const services = Object.keys(cfg).filter(name => cfg[name].path);
  const slim = createSlimmer();
  const combined = Object.fromEntries(Object.keys(cfg).map(k => [k, []]));
  const quality = { periods: [], sources: [] };
  // Do mês mais recente para o mais antigo: se a memória acabar, o que fica de fora é o mais antigo.
  const planned = fullHistory ? null : monthWindows(from, to).reverse();
  const monthOf = iso => ({
    from: iso.slice(0, 8) + '01',
    to: new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7), 0)).toISOString().slice(0, 10)
  });
  const step = window => 'mes:' + window.from.slice(0, 7);
  if (planned)
    for (const window of planned)
      onProgress({ key: step(window), label: 'Viagens e pedidos', period: brMonth(window.from), status: 'pending' });
  for (const name of [...optionalCatalogs.map(c => c.name), 'motoristas'])
    onProgress({
      key: name,
      label: { rotas: 'Rotas', ocorrencias: 'Ocorrências', programacoes: 'Programações', motoristas: 'Motoristas' }[
        name
      ],
      status: 'pending'
    });
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(syncTo) && syncTo >= to ? syncTo : to;
  const recentBoundary = new Date(Date.UTC(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)) - 2, 1))
    .toISOString()
    .slice(0, 10);
  let totalRows = 0,
    emptyRun = 0,
    oldestIncluded = null,
    oldestWithData = null,
    limited = null,
    cursor = { from: monthOf(to).from < from && !fullHistory ? from : monthOf(to).from, to };
  for (let index = 0; ; index++) {
    signal?.throwIfAborted();
    const window = planned ? planned[index] : cursor;
    if (!window) break;
    if (fullHistory && window.to < HISTORY_FLOOR) break;
    const key = step(window);
    onProgress({ key, label: 'Viagens e pedidos', period: brMonth(window.from), status: 'running' });
    // Modo incremental: meses anteriores aos dois mais recentes usam o cache privado, quando houver.
    const refreshWindow = refreshMode === '1' || (refreshMode === 'recent' && window.to >= recentBoundary);
    let result = refreshWindow ? null : await periodStore.read(window.from, window.to);
    const reused = !!result;
    if (result) {
      for (const name of services) result[name] = slim(name, result[name] || []);
      console.info('[DSS] mês reutilizado do cache privado', window.from, window.to);
    } else {
      try {
        const pairs = await Promise.all(
          services.map(async name => [
            name,
            slim(
              name,
              await fetchDssRange(name, window.from, window.to, signal, () =>
                onProgress({ key, detail: 'dividindo o período em partes menores' })
              )
            )
          ])
        );
        result = { ...Object.fromEntries(pairs), _syncedAt: new Date().toISOString() };
      } catch (error) {
        signal?.throwIfAborted();
        // Mensagem com o mês que falhou, para o usuário saber onde parou.
        throw Object.assign(
          Error('Mês ' + brMonth(window.from) + ': ' + String(error.message || error).slice(0, 220)),
          {
            code: error.code
          }
        );
      }
      // Só guardar o mês se todos os serviços principais terminaram com sucesso.
      await periodStore.write(window.from, window.to, result);
      console.info('[DSS] mês consultado', window.from, window.to);
    }
    const rows = services.reduce((sum, name) => sum + (result[name]?.length || 0), 0);
    if (totalRows > 0 && totalRows + rows > rowBudget) {
      // Não cabe na memória deste servidor: publica o que já foi carregado (os meses mais recentes).
      limited = { from: oldestIncluded, reason: 'memoria', rows: totalRows, budget: rowBudget };
      onProgress({ key, status: 'skipped', detail: 'limite de memória do servidor' });
      for (const rest of planned ? planned.slice(index + 1) : [])
        onProgress({ key: step(rest), status: 'skipped', detail: 'limite de memória do servidor' });
      break;
    }
    if (fullHistory && rows === 0) {
      emptyRun++;
      onProgress({ key, status: 'done', detail: 'sem registros' });
      // Seis meses seguidos sem nada: chegou ao início dos dados da DSS.
      if (emptyRun >= 6 || (oldestWithData === null && emptyRun >= 3)) break;
    } else {
      emptyRun = 0;
      for (const [name, list] of Object.entries(result))
        if (Object.hasOwn(combined, name)) combined[name].push(list || []);
      totalRows += rows;
      oldestIncluded = window.from;
      if (rows > 0) oldestWithData = window.from;
      quality.periods.push({ from: window.from, to: window.to, syncedAt: result._syncedAt || null, reused });
      onProgress({ key, status: reused ? 'reused' : 'done', detail: rows.toLocaleString('pt-BR') + ' registros' });
    }
    if (fullHistory) cursor = monthOf(isoAdd(window.from, -1));
  }
  // Período efetivamente carregado (pode ser menor que o pedido, por memória, ou o início real do histórico).
  const effectiveFrom = fullHistory ? oldestWithData || to : limited ? limited.from : from;
  from = effectiveFrom > to ? to : effectiveFrom;
  quality.periods.sort((a, b) => a.from.localeCompare(b.from));
  const data = Object.fromEntries(Object.entries(combined).map(([name, groups]) => [name, mergeDssRows(groups, name)]));
  for (const catalog of optionalCatalogs) {
    signal?.throwIfAborted();
    onProgress({
      key: catalog.name,
      label: { rotas: 'Rotas', ocorrencias: 'Ocorrências', programacoes: 'Programações' }[catalog.name],
      status: 'running'
    });
    if (!catalog.path) {
      quality.sources.push({ name: catalog.name, status: 'disabled' });
      onProgress({ key: catalog.name, status: 'disabled' });
      continue;
    }
    try {
      if (catalog.name === 'rotas') data.rotas = await optionalCatalog(catalog, from, to, signal);
      else if (catalog.name === 'ocorrencias') {
        // Consulta adicional limitada a um mês para evitar atrasar o painel principal.
        if (monthWindows(from, to).length > 1) {
          quality.sources.push({ name: catalog.name, status: 'skipped' });
          onProgress({ key: catalog.name, status: 'skipped' });
          continue;
        }
        data.ocorrencias = await optionalCatalog(catalog, from, to, signal);
      } else {
        // Programacoes sao enriquecimento opcional e muito custoso em periodos longos.
        if (monthWindows(from, to).length > 1) {
          quality.sources.push({ name: catalog.name, status: 'skipped' });
          onProgress({ key: catalog.name, status: 'skipped' });
          continue;
        }
        const windows = monthWindows(from, to);
        const sets = [];
        sets.push(...(await Promise.all(windows.map(win => optionalCatalog(catalog, win.from, win.to, signal)))));
        const ids = new Set();
        data.programacoes = sets.flat().filter(row => {
          const id = String(row.empresa ?? '') + '~' + String(row.programacao_id ?? '');
          if (!row.programacao_id) return true;
          if (ids.has(id)) return false;
          ids.add(id);
          return true;
        });
      }
      quality.sources.push({ name: catalog.name, status: 'ok' });
      onProgress({ key: catalog.name, status: 'done' });
    } catch (err) {
      signal?.throwIfAborted();
      const reason = unavailableReason(err);
      onProgress({ key: catalog.name, status: 'unavailable', detail: reason });
      quality.sources.push({ name: catalog.name, status: 'unavailable', detail: reason });
      errorLog.record('dss', 'Fonte opcional indisponível: ' + catalog.name, {
        level: 'aviso',
        detail: reason + ' · ' + String(err.message).slice(0, 110)
      });
    }
  }
  signal?.throwIfAborted();
  onProgress({ key: 'motoristas', label: 'Motoristas', status: 'running' });
  if (driversPath) {
    try {
      const names = await driverNames(signal);
      attachDriverNames(data, names);
      quality.sources.push({ name: 'motoristas', status: 'ok' });
    } catch (err) {
      quality.sources.push({ name: 'motoristas', status: 'unavailable' });
      driverCatalog.expires = Date.now() + 60_000;
      errorLog.record('dss', 'Fonte opcional indisponível: motoristas', {
        level: 'aviso',
        detail: (err.name || 'Error') + ' · ' + String(err.message).slice(0, 120)
      });
      attachDriverNames(data, driverCatalog.items);
    }
  }
  signal?.throwIfAborted();
  onProgress({
    key: 'motoristas',
    status:
      quality.sources.find(s => s.name === 'motoristas')?.status === 'ok'
        ? 'done'
        : driversPath
          ? 'unavailable'
          : 'disabled'
  });
  if (!driversPath) quality.sources.push({ name: 'motoristas', status: 'disabled' });
  quality.sources.push(
    { name: 'viagens', status: 'ok' },
    { name: 'pedidos', status: 'ok' },
    { name: 'mdfes', status: cfg.mdfes.path ? 'ok' : 'reference' }
  );
  const payload = {
    mode: 'live',
    quality,
    updatedAt: new Date().toISOString(),
    cacheHit: false,
    data: {
      viagens: data.viagens || [],
      pedidos: data.pedidos || [],
      ctes: data.ctes || [],
      mdfes: data.mdfes || [],
      rotas: data.rotas || [],
      programacoes: data.programacoes || [],
      ocorrencias: data.ocorrencias || [],
      sources: {
        viagens: true,
        pedidos: true,
        ctes: !!cfg.ctes.path,
        mdfes: !!cfg.mdfes.path,
        programacoes: quality.sources.some(s => s.name === 'programacoes' && s.status === 'ok'),
        ocorrencias: quality.sources.some(s => s.name === 'ocorrencias' && s.status === 'ok')
      }
    }
  };
  payload.range = { from, to };
  if (limited) payload.limited = limited;
  if (fullHistory) payload.history = { start: oldestWithData, floor: HISTORY_FLOOR };
  signal?.throwIfAborted();
  if (remember) cachePut(from + '|' + to, payload);
  apiStats.success++;
  apiStats.lastSuccess = payload.updatedAt;
  console.info(
    '[DSS] consulta concluída',
    'período',
    from,
    to,
    'duração(ms)',
    Date.now() - started,
    'RVs',
    payload.data.viagens.length,
    'PFs',
    payload.data.pedidos.length
  );
  return payload;
}
const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  if (req.method === 'OPTIONS') {
    if (origin && !origins.includes(origin)) return reply(res, 403, { error: 'Origem não permitida' });
    res.writeHead(
      204,
      origin
        ? {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Headers': 'Authorization, Content-Type',
            'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
            Vary: 'Origin'
          }
        : {}
    );
    res.end();
    return;
  }
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    return reply(res, 400, { error: 'Requisição inválida' }, origin);
  }
  if (await serveLocalFrontend(req, res, url)) return;
  const company = url.searchParams.get('company') || 'costalog';
  if (['/api/overview', '/api/records'].includes(url.pathname) && !validCompany(company))
    return reply(res, 400, { error: 'Empresa inválida.' }, origin);
  if (url.pathname === '/api/client-error') {
    if (req.method !== 'POST') return reply(res, 405, { error: 'Método não permitido' }, origin);
    if (origin && !origins.includes(origin)) return reply(res, 403, { error: 'Origem não permitida' });
    if (!allowedClientError(req)) return reply(res, 429, { error: 'Muitos registros de erro.' }, origin);
    try {
      const input = clientErrorInput(await bodyJSON(req, 4096));
      if (input) errorLog.record('navegador', input.message, { where: input.where, detail: input.detail });
    } catch {}
    return reply(res, 202, { ok: true }, origin);
  }
  if (url.pathname === '/api/errors') {
    const user = identify(req);
    if (!user) return reply(res, 401, { error: 'Sessão inválida ou expirada.' }, origin);
    if (!user.permissions.admin || user.mustChangePassword)
      return reply(res, 403, { error: 'Somente administradores.' }, origin);
    if (req.method === 'GET') return reply(res, 200, { errors: errorLog.list() }, origin);
    return reply(res, 405, { error: 'Método não permitido' }, origin);
  }
  if (url.pathname === '/api/login') {
    if (req.method !== 'POST') return reply(res, 405, { error: 'Método não permitido' }, origin);
    if (!useAccounts)
      return reply(
        res,
        503,
        { error: 'Login individual indisponível: configure PORTAL_USERS_FILE no servidor privado.' },
        origin
      );
    if (!canTryLogin(req))
      return reply(res, 429, { error: 'Tentativas de login excedidas. Aguarde 10 minutos.' }, origin);
    try {
      const body = await bodyJSON(req);
      const session = login(body.username, body.password);
      if (!session) return reply(res, 401, { error: 'Usuário ou senha inválidos.' }, origin);
      return reply(res, 200, { ...session, portalVersion: 2, workflowStorage }, origin);
    } catch {
      return reply(res, 400, { error: 'Dados de login inválidos.' }, origin);
    }
  }
  if (url.pathname === '/api/logout') {
    if (req.method !== 'POST') return reply(res, 405, { error: 'Método não permitido' }, origin);
    const exiting = identify(req);
    if (exiting) portalSessions.release(exiting);
    if (useAccounts) logout(bearer(req));
    return reply(res, 200, { ok: true }, origin);
  }
  // Administração: apenas sessões individuais no servidor e role de administrador.
  if (url.pathname === '/api/change-password') {
    if (req.method !== 'POST') return reply(res, 405, { error: 'Método não permitido' }, origin);
    const user = useAccounts ? identify(req) : null;
    if (!user) return reply(res, 401, { error: 'Sessão inválida ou expirada.' }, origin);
    if (!allowedRate(req)) return reply(res, 429, { error: 'Aguarde antes de realizar outra tentativa.' }, origin);
    try {
      const input = await bodyJSON(req);
      changeOwnPassword(user.username, input.currentPassword, input.newPassword);
      return reply(res, 200, { ok: true, message: 'Senha alterada. Faça login novamente.' }, origin);
    } catch (err) {
      return reply(
        res,
        err instanceof AccountError ? err.status : 400,
        { error: err instanceof AccountError ? err.message : 'Não foi possível alterar a senha.' },
        origin
      );
    }
  }
  if (url.pathname === '/api/users' || url.pathname.startsWith('/api/users/')) {
    const user = useAccounts ? identify(req) : null;
    if (!user) return reply(res, 401, { error: 'Sessão inválida ou expirada.' }, origin);
    if (!user.permissions.admin)
      return reply(res, 403, { error: 'Apenas administradores podem gerenciar contas.' }, origin);
    if (user.mustChangePassword)
      return reply(res, 403, { error: 'Altere sua senha provisória antes de gerenciar usuários.' }, origin);
    if (!allowedRate(req)) return reply(res, 429, { error: 'Limite de solicitações atingido.' }, origin);
    try {
      if (url.pathname === '/api/users') {
        if (req.method === 'GET') return reply(res, 200, { users: listAccounts() }, origin);
        if (req.method === 'POST') {
          const input = await bodyJSON(req);
          const created = createAccount(input);
          console.info('[USERS]', user.username, 'criou', created.username, 'perfil', created.role);
          return reply(res, 201, { user: created }, origin);
        }
      } else if (req.method === 'PATCH') {
        const target = decodeURIComponent(url.pathname.slice('/api/users/'.length));
        if (target.includes('/') || !target) return reply(res, 400, { error: 'Nome de usuário inválido.' }, origin);
        const input = await bodyJSON(req);
        const updated = updateAccount(target, input.action, input, user.username);
        console.info('[USERS]', user.username, 'alterou', updated.username, 'ação', input.action);
        return reply(res, 200, { user: updated }, origin);
      }
      return reply(res, 405, { error: 'Método não permitido.' }, origin);
    } catch (err) {
      if (err instanceof AccountError) return reply(res, err.status, { error: err.message }, origin);
      if (err.message?.includes('Senha precisa')) return reply(res, 400, { error: err.message }, origin);
      console.error('[USERS] falha ao atualizar contas:', err.code || err.name);
      return reply(
        res,
        500,
        { error: 'Não foi possível salvar as contas. Verifique permissões do volume privado no servidor.' },
        origin
      );
    }
  }
  if (url.pathname === '/api/workflow' || url.pathname === '/api/workflow/actions') {
    const user = identify(req);
    if (!user) return reply(res, 401, { error: 'Sessão inválida ou expirada.' }, origin);
    if (user.mustChangePassword) return reply(res, 403, { error: 'Altere sua senha provisória.' }, origin);
    if (!user.permissions.operacional) return reply(res, 403, { error: 'Acesso operacional necessário.' }, origin);
    if (!validCompany(company)) return reply(res, 400, { error: 'Empresa inválida.' }, origin);
    if (!allowedRate(req)) return reply(res, 429, { error: 'Limite de solicitações atingido.' }, origin);
    try {
      if (url.pathname === '/api/workflow/actions') {
        if (req.method !== 'POST') return reply(res, 405, { error: 'Método não permitido.' }, origin);
        const input = await bodyJSON(req, 60000);
        return reply(res, 200, await pendingService.action(company, input, user), origin);
      }
      if (req.method === 'GET') {
        const key = url.searchParams.get('key') || '';
        const result = await workflowStore.get(company, key);
        return reply(
          res,
          200,
          key ? { task: result, storage: workflowStorage } : { tasks: result, storage: workflowStorage },
          origin
        );
      }
      if (req.method === 'PATCH') {
        const input = await bodyJSON(req, 20000).catch(() => {
          const error = Error('Dados do tratamento inválidos.');
          error.status = 400;
          throw error;
        });
        const source = await pendingService.context(company, input, user);
        const task = await workflowStore.save(company, input.key, input, user.username, source);
        return reply(res, 200, { task, storage: workflowStorage }, origin);
      }
      return reply(res, 405, { error: 'Método não permitido.' }, origin);
    } catch (error) {
      const status =
        error.status ||
        (/inválid|Prazo|Responsável|Situação|Histórico|Versão|motivo da resolução/.test(error.message) ? 400 : 500);
      return reply(
        res,
        status,
        { error: status === 500 ? 'Não foi possível acessar os tratamentos no armazenamento privado.' : error.message },
        origin
      );
    }
  }
  if (url.pathname.startsWith('/api/portal/') || url.pathname === '/api/preferences') {
    const user = identify(req);
    if (!user) return reply(res, 401, { error: 'Sessão inválida ou expirada.' }, origin);
    if (user.mustChangePassword || !user.permissions.operacional)
      return reply(res, 403, { error: 'Acesso operacional necessário e senha provisória deve ser alterada.' }, origin);
    if (!validCompany(company)) return reply(res, 400, { error: 'Empresa inválida.' }, origin);
    if (!allowedRate(req)) return reply(res, 429, { error: 'Limite de consultas atingido. Aguarde.' }, origin);
    try {
      if (url.pathname === '/api/preferences') {
        if (req.method === 'GET')
          return reply(
            res,
            200,
            privateState.enabled
              ? { ...(await preferencesStore.get(company, user.username)), storage: 'server', durable: true }
              : { revision: 0, values: {}, storage: 'browser', durable: false },
            origin
          );
        if (req.method === 'PATCH') {
          if (!privateState.enabled)
            return reply(
              res,
              409,
              {
                error: 'As preferências deste ambiente são salvas no navegador, por usuário e empresa.',
                code: 'BROWSER_PREFERENCES'
              },
              origin
            );
          return reply(
            res,
            200,
            await preferencesStore.save(company, user.username, await bodyJSON(req, 110000)),
            origin
          );
        }
      }
      if (url.pathname === '/api/portal/latest' && req.method === 'GET')
        return reply(res, 200, { snapshot: portalSessions.latest() }, origin);
      if (url.pathname === '/api/portal/sync') {
        if (req.method === 'POST') return reply(res, 202, portalSessions.start(await bodyJSON(req), user), origin);
        if (req.method === 'GET')
          return reply(res, 200, portalSessions.status(url.searchParams.get('id'), user), origin);
        if (req.method === 'PATCH')
          return reply(res, 200, portalSessions.cancel((await bodyJSON(req)).id, user), origin);
      }
      if (
        req.method === 'POST' &&
        [
          '/api/portal/view',
          '/api/portal/metrics',
          '/api/portal/detail',
          '/api/portal/export',
          '/api/portal/compare',
          '/api/portal/import'
        ].includes(url.pathname)
      ) {
        const input = await bodyJSON(req, 110000),
          snapshot = portalSessions.get(input.snapshot, user);
        const result = await portalResponse({
          action: url.pathname.split('/').at(-1),
          input,
          snapshot,
          user,
          company,
          workflowStore,
          portalSessions
        });
        return reply(res, 200, result, origin, req.headers['accept-encoding'] || '');
      }
      return reply(res, 405, { error: 'Método não permitido.' }, origin);
    } catch (error) {
      if (!(error.status && error.status < 500))
        errorLog.record('servidor', 'Falha ao montar página: ' + (error.code || error.name || 'Error'), {
          where: url.pathname,
          detail: error.message
        });
      else console.warn('[PORTAL] falha', error.code || error.name);
      return reply(
        res,
        error.status || 503,
        {
          error:
            error.status && error.status < 500
              ? error.message
              : 'Serviço indisponível. Verifique o armazenamento privado ou tente novamente.'
        },
        origin
      );
    }
  }
  if (req.method !== 'GET') return reply(res, 405, { error: 'Método não permitido' }, origin);
  if (url.pathname === '/api/health')
    return reply(
      res,
      200,
      {
        status: 'ok',
        configured: !!(
          base &&
          cfg.viagens.path &&
          cfg.pedidos.path &&
          dssCredentialsReady() &&
          (useAccounts || (allowLegacy && env.PORTAL_ACCESS_TOKEN))
        ),
        accounts: useAccounts
      },
      origin
    );
  const user = identify(req);
  if (url.pathname === '/api/me') {
    if (!user) return reply(res, 401, { error: 'Sessão inválida ou expirada' }, origin);
    return reply(
      res,
      200,
      {
        user: {
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          mustChangePassword: !!user.mustChangePassword
        },
        permissions: user.permissions
      },
      origin
    );
  }
  if (url.pathname === '/api/status') {
    if (!user) return reply(res, 401, { error: 'Não autorizado' }, origin);
    if (user.mustChangePassword) return reply(res, 403, { error: 'Altere a senha provisória.' }, origin);
    if (!user.permissions.admin)
      return reply(res, 403, { error: 'Somente administradores podem consultar diagnósticos.' }, origin);
    return reply(
      res,
      200,
      {
        status: 'ok',
        configured: !!(base && dssCredentialsReady()),
        lastSuccess: apiStats.lastSuccess,
        lastFailure: apiStats.lastFailure,
        counters: { ...apiStats },
        cacheEntries: CACHE.size,
        cacheSeconds: cacheMaxAge / 1000,
        periodStoreEnabled: periodStore.enabled,
        privateState: { driver: privateState.driver, durable: privateState.durable },
        periodStoreType: env.MARIADB_ENABLED === 'true' ? 'mariadb' : env.DSS_PERIOD_CACHE_DIR ? 'file' : 'disabled'
      },
      origin
    );
  }
  if (url.pathname === '/api/records') {
    if (!user) return reply(res, 401, { error: 'Sessão inválida ou expirada' }, origin);
    if (user.mustChangePassword)
      return reply(res, 403, { error: 'Altere sua senha antes de consultar registros.' }, origin);
    if (!allowedRate(req)) return reply(res, 429, { error: 'Muitas consultas. Tente novamente.' }, origin);
    const from = url.searchParams.get('from') || '',
      to = url.searchParams.get('to') || '',
      kind = url.searchParams.get('kind') || 'viagens';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to)
      return reply(res, 400, { error: 'Período inválido' }, origin);
    if (!['viagens', 'pedidos'].includes(kind)) return reply(res, 400, { error: 'Tipo inválido' }, origin);
    const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const size = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('page_size') || '15', 10) || 15));
    const search = String(url.searchParams.get('search') || '')
      .trim()
      .toLocaleLowerCase('pt-BR')
      .slice(0, 100);
    const sortField = url.searchParams.get('sort') || '',
      sortDir = url.searchParams.get('direction') === 'asc' ? 1 : -1;
    const permittedSort =
      kind === 'viagens'
        ? ['data_inicio', 'nro_rv', 'cliente_nome', 'placa_veiculo']
        : ['nro_pf', 'nro_cte', 'total_frete'];
    if (sortField && !permittedSort.includes(sortField))
      return reply(res, 400, { error: 'Ordenação inválida' }, origin);
    const months = monthWindows(from, to);
    if (months.length > 12) return reply(res, 400, { error: 'Selecione no máximo 12 meses' }, origin);
    const source = { viagens: [], pedidos: [] };
    for (const month of months) {
      const cachedMonth = await periodStore.read(month.from, month.to);
      if (!cachedMonth)
        return reply(
          res,
          409,
          { error: 'Dados deste período ainda não sincronizados. Use Atualizar dados da DSS.', missingPeriod: month },
          origin
        );
      for (const type of ['viagens', 'pedidos']) source[type].push(cachedMonth[type] || []);
    }
    // Primeiro aplicar projeção por perfil, antes de pesquisar, ordenar ou devolver registros.
    const scoped = projectOverview(
      {
        data: {
          viagens: mergeDssRows(source.viagens, 'viagens'),
          pedidos: mergeDssRows(source.pedidos, 'pedidos'),
          ctes: [],
          mdfes: [],
          rotas: [],
          programacoes: [],
          ocorrencias: [],
          sources: {}
        }
      },
      user.role,
      company
    ).data[kind];
    let rows = scoped;
    if (search)
      rows = rows.filter(record =>
        Object.values(record).some(
          v => (typeof v === 'string' || typeof v === 'number') && String(v).toLocaleLowerCase('pt-BR').includes(search)
        )
      );
    if (sortField)
      rows = [...rows].sort((a, b) => {
        const x = a[sortField],
          y = b[sortField];
        return String(x ?? '').localeCompare(String(y ?? ''), 'pt-BR', { numeric: true }) * sortDir;
      });
    const total = rows.length,
      pages = Math.max(1, Math.ceil(total / size));
    return reply(
      res,
      200,
      {
        kind,
        company,
        from,
        to,
        page: Math.min(page, pages),
        pageSize: size,
        total,
        pages,
        rows: rows.slice((Math.min(page, pages) - 1) * size, Math.min(page, pages) * size),
        source: 'cache'
      },
      origin,
      req.headers['accept-encoding'] || ''
    );
  }
  if (url.pathname !== '/api/overview') return reply(res, 404, { error: 'Rota não encontrada' }, origin);
  if (!user) return reply(res, 401, { error: 'Sessão inválida ou expirada' }, origin);
  if (user.mustChangePassword)
    return reply(
      res,
      403,
      { error: 'Altere sua senha provisória antes de consultar o DSS.', code: 'PASSWORD_CHANGE_REQUIRED' },
      origin
    );
  if (!allowedRate(req))
    return reply(res, 429, { error: 'Limite de consultas atingido. Aguarde um minuto e tente novamente.' }, origin);
  if (!base) return reply(res, 503, { error: 'DSS_BASE_URL não configurado no servidor privado.' }, origin);
  if (!dssCredentialsReady())
    return reply(
      res,
      503,
      {
        error:
          'Basic Auth do DSS não configurado no backend. Informe DSS_USERNAME e DSS_PASSWORD no arquivo .env privado.'
      },
      origin
    );
  const from = url.searchParams.get('from') || '',
    to = url.searchParams.get('to') || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to)
    return reply(res, 400, { error: 'Intervalo de datas inválido' }, origin);
  const refreshMode = url.searchParams.get('refresh') || '';
  const forceRefresh = refreshMode === '1' || refreshMode === 'recent';
  const cacheKey = from + '|' + to + (forceRefresh ? '|refresh' : '');
  const includeCompanies = url.searchParams.get('include_companies') === '1';
  const cached = forceRefresh ? null : cacheGet(cacheKey);
  if (cached) {
    apiStats.cached++;
    return reply(
      res,
      200,
      projectPortalOverview({ ...cached, cacheHit: true }, user.role, company, { includeCompanies }),
      origin,
      req.headers['accept-encoding'] || ''
    );
  }
  const started = Date.now();
  let pending = INFLIGHT.get(cacheKey);
  if (!pending) {
    pending = (async () => {
      return synchronize(from, to, { refreshMode, syncTo: url.searchParams.get('sync_to') || to });
    })();
    INFLIGHT.set(cacheKey, pending);
    pending
      .finally(() => {
        if (INFLIGHT.get(cacheKey) === pending) INFLIGHT.delete(cacheKey);
      })
      .catch(() => {});
  } else console.info('[DSS] consulta idêntica reutilizada, período', from, to);
  try {
    const payload = await pending;
    return reply(
      res,
      200,
      projectPortalOverview(payload, user.role, company, { includeCompanies }),
      origin,
      req.headers['accept-encoding'] || ''
    );
  } catch (err) {
    apiStats.failed++;
    apiStats.lastFailure = new Date().toISOString();
    errorLog.record('dss', 'Falha na consulta ao DSS', {
      where: '/api/overview',
      detail: err.name + ' ' + err.message
    });
    return reply(res, 502, { error: 'Falha na consulta ao DSS: ' + err.message }, origin);
  }
});
server.listen(port, '0.0.0.0', () => console.log('Portal COSTALOG API na porta ' + port));
