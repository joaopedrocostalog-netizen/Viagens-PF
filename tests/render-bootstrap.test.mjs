import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootstrapTemporaryAdmin } from '../api/render-bootstrap.mjs';
import { passwordValid } from '../api/auth.mjs';

test('Bootstrap só cria administrador quando explicitamente ligado, usando senha de ambiente', () => {
  const folder = mkdtempSync(join(tmpdir(), 'costalog-render-'));
  const filepath = join(folder, 'portal-users.json');
  const env = {
    RENDER_FREE_BOOTSTRAP: 'true',
    PORTAL_USERS_FILE: filepath,
    RENDER_FREE_ADMIN_USERNAME: 'admin',
    RENDER_FREE_ADMIN_PASSWORD: 'MinhaSenhaDeTeste2026MuitoForte!'
  };
  try {
    const created = bootstrapTemporaryAdmin(env);
    assert.equal(created.created, true);
    assert(existsSync(filepath));
    const users = JSON.parse(readFileSync(filepath, 'utf8')).users;
    assert.equal(users.length, 1);
    assert.equal(users[0].username, 'admin');
    assert.equal(users[0].role, 'administrador');
    assert.equal(users[0].mustChangePassword, true);
    assert(!readFileSync(filepath, 'utf8').includes(env.RENDER_FREE_ADMIN_PASSWORD));
    assert(passwordValid(env.RENDER_FREE_ADMIN_PASSWORD, users[0]));
    const same = bootstrapTemporaryAdmin({ ...env, RENDER_FREE_ADMIN_PASSWORD: 'NovaSenhaSegura2026!' });
    assert.equal(same.created, false);
    assert(passwordValid(env.RENDER_FREE_ADMIN_PASSWORD, JSON.parse(readFileSync(filepath, 'utf8')).users[0]));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
test('Sem opt-in e sem senha segura, não cria conta nem vaza segredo', () => {
  const folder = mkdtempSync(join(tmpdir(), 'costalog-test-'));
  const filepath = join(folder, 'test-users.json');
  try {
    const e = { PORTAL_USERS_FILE: filepath, RENDER_FREE_ADMIN_PASSWORD: 'abc' };
    assert.equal(bootstrapTemporaryAdmin(e).reason, 'disabled');
    assert(!existsSync(filepath));
    assert.throws(() => bootstrapTemporaryAdmin({ ...e, RENDER_FREE_BOOTSTRAP: 'true' }), /16 e 256/);
    assert(!existsSync(filepath));
    assert.throws(
      () =>
        bootstrapTemporaryAdmin({
          ...e,
          RENDER_FREE_BOOTSTRAP: 'true',
          RENDER_FREE_ADMIN_PASSWORD: 'abcdefghijklmnop'
        }),
      /letras e números/
    );
    assert.throws(
      () =>
        bootstrapTemporaryAdmin({
          ...e,
          RENDER_FREE_BOOTSTRAP: 'true',
          PORTAL_USERS_FILE: '/app/private/users.json',
          RENDER_FREE_ADMIN_PASSWORD: 'ValidaSenha2026SuperForte!'
        }),
      /tmp/
    );
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
