/**
 * Ajuste automático do teto de memória do Node em contêineres pequenos (Render Free: 512 MB).
 * Se o limite do Node estiver muito acima (risco de o contêiner ser encerrado) ou muito abaixo (desperdício)
 * da memória do contêiner, o processo se reinicia com --max-old-space-size = 50% do contêiner (o resto fica para
 * código, buffers e a memória que o Node ainda não devolveu).
 * Precisa ser o PRIMEIRO import de api/server.mjs: o await abaixo impede o resto do servidor de iniciar no
 * processo pai, que só repassa sinais e o código de saída do filho.
 * Desligar: PORTAL_AUTO_HEAP=0. Testes: PORTAL_CONTAINER_MB simula a memória do contêiner.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { getHeapStatistics } from 'node:v8';
import { fileURLToPath } from 'node:url';

export function containerMemoryMB(env = process.env) {
  if (Number(env.PORTAL_CONTAINER_MB) > 0) return Number(env.PORTAL_CONTAINER_MB);
  for (const file of ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes'])
    try {
      const value = Number(readFileSync(file, 'utf8').trim());
      if (Number.isFinite(value) && value > 0 && value < 2 ** 50) return Math.round(value / 1048576);
    } catch {}
  return 0;
}

const container = containerMemoryMB();
const heap = Math.round(getHeapStatistics().heap_size_limit / 1048576);
const target = Math.round(container * 0.5);
const needs =
  process.env.PORTAL_AUTO_HEAP !== '0' &&
  !process.env.PORTAL_HEAP_CHILD &&
  container > 0 &&
  container <= 4096 &&
  (heap > container * 0.7 || heap < container * 0.4) &&
  !process.execArgv.some(arg => arg.startsWith('--max-old-space-size'));

if (needs) {
  console.info('[MEMÓRIA] contêiner', container, 'MB · limite do Node', heap, 'MB → reiniciando com', target, 'MB');
  const args = [
    ...process.execArgv,
    '--max-old-space-size=' + target,
    '--max-semi-space-size=8',
    fileURLToPath(new URL('./server.mjs', import.meta.url))
  ];
  const env = { ...process.env, PORTAL_HEAP_CHILD: '1' };
  // Node 22.15+/23.11+: substitui o próprio processo (sem um processo pai ocupando memória).
  if (typeof process.execve === 'function') process.execve(process.execPath, [process.execPath, ...args], env);
  const child = spawn(process.execPath, args, { stdio: 'inherit', env });
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => child.kill(signal));
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
  await new Promise(() => {}); // o processo pai não segue para o servidor
}
