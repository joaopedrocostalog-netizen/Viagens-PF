import { readFile, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { join, resolve, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
const failure = message => Object.assign(Error(message), { status: 503 });
/** Private durable documents. No schema changes at startup; DB failure never falls back to /tmp. */
export function createPrivateState({ env = process.env, pool: providedPool } = {}) {
  const database = env.PORTAL_STATE_DRIVER === 'mariadb';
  const dir = env.PORTAL_DATA_DIR || '';
  const fileReady =
    !!dir &&
    isAbsolute(dir) &&
    (!env.RENDER || env.PORTAL_DATA_PERSISTENT === 'true') &&
    !/^\/(?:var\/)?tmp(?:\/|$)/.test(resolve(dir));
  let poolPromise;
  const queues = new Map();
  async function pool() {
    if (providedPool) return providedPool;
    if (!poolPromise)
      poolPromise = import('mysql2/promise').then(({ createPool }) =>
        createPool({
          host: env.MARIADB_HOST,
          port: Number(env.MARIADB_PORT || 3306),
          database: env.MARIADB_DATABASE,
          user: env.MARIADB_USER,
          password: env.MARIADB_PASSWORD,
          ssl: env.MARIADB_SSL === 'true' ? {} : undefined,
          connectionLimit: 3,
          connectTimeout: 8000
        })
      );
    return poolPromise;
  }
  const check = key => {
    if (!/^(workflow:(costalog|ideallog)|preferences:(costalog|ideallog):[a-z0-9._-]{3,60})$/.test(key))
      throw failure('Chave privada inválida.');
  };
  async function fileRead(key) {
    try {
      const v = JSON.parse(await readFile(join(dir, key.replaceAll(':', '_') + '.json'), 'utf8'));
      if (v.version !== 1) throw Error();
      return v.value;
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw failure('Falha ao ler dados persistentes.');
    }
  }
  async function transact(key, change) {
    check(key);
    if (database) {
      const db = await (await pool()).getConnection();
      try {
        await db.beginTransaction();
        await db.execute('INSERT IGNORE INTO viagens_pf_portal_state (state_key,payload_json) VALUES (?,?)', [
          key,
          'null'
        ]);
        const [rows] = await db.execute(
          'SELECT payload_json FROM viagens_pf_portal_state WHERE state_key=? FOR UPDATE',
          [key]
        );
        const next = await change(JSON.parse(rows[0].payload_json));
        await db.execute('UPDATE viagens_pf_portal_state SET payload_json=? WHERE state_key=?', [
          JSON.stringify(next),
          key
        ]);
        await db.commit();
        return next;
      } catch (e) {
        await db.rollback();
        throw e;
      } finally {
        db.release();
      }
    }
    if (!fileReady)
      throw failure(
        'Armazenamento durável não configurado. Configure MariaDB ou um diretório privado persistente antes de salvar.'
      );
    const prior = queues.get(key) || Promise.resolve();
    const operation = prior.then(async () => {
      const value = await change(await fileRead(key));
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const target = join(dir, key.replaceAll(':', '_') + '.json'),
        temp = target + '.' + randomUUID() + '.tmp';
      try {
        await writeFile(temp, JSON.stringify({ version: 1, value }), { mode: 0o600, flag: 'wx', flush: true });
        await rename(temp, target);
      } finally {
        await unlink(temp).catch(() => {});
      }
      return value;
    });
    const tail = operation.catch(() => {});
    queues.set(key, tail);
    tail.finally(() => {
      if (queues.get(key) === tail) queues.delete(key);
    });
    return operation;
  }
  return {
    enabled: database || fileReady,
    durable: database || fileReady,
    driver: database ? 'mariadb' : fileReady ? 'persistent-file' : 'unconfigured',
    transact,
    async read(key) {
      check(key);
      if (database) {
        const [rows] = await (
          await pool()
        ).execute('SELECT payload_json FROM viagens_pf_portal_state WHERE state_key=? LIMIT 1', [key]);
        return rows.length ? JSON.parse(rows[0].payload_json) : null;
      }
      if (!fileReady) throw failure('Armazenamento durável não configurado.');
      await queues.get(key);
      return fileRead(key);
    }
  };
}
