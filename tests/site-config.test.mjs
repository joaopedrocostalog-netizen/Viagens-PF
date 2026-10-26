import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePortalApi } from '../src/site-config.mjs';

test('GitHub Pages sem backend definido permanece DEMO, sem envio de credenciais', () => {
  const site = resolvePortalApi(
    { hostname: 'joaopedrocostalog-netizen.github.io', origin: 'https://joaopedrocostalog-netizen.github.io' },
    ''
  );
  assert.deepEqual(site, { apiUrl: '', demoOnly: true, remote: false });
});
test('GitHub Pages com servidor HTTPS usa API de produção e desliga demo local', () => {
  const site = resolvePortalApi(
    { hostname: 'joaopedrocostalog-netizen.github.io', origin: 'https://joaopedrocostalog-netizen.github.io' },
    'https://api.costalog.example.com/'
  );
  assert.equal(site.apiUrl, 'https://api.costalog.example.com');
  assert.equal(site.demoOnly, false);
  assert.equal(site.remote, true);
});
test('Backend pode hospedar portal na mesma origem sem configuração adicional', () => {
  const site = resolvePortalApi({ hostname: 'portal.costalog.com.br', origin: 'https://portal.costalog.com.br' }, '');
  assert.equal(site.apiUrl, 'https://portal.costalog.com.br');
  assert.equal(site.demoOnly, false);
});
test('Não aceita documentação Swagger, paths, usuário/senha ou HTTP inseguro', () => {
  const page = {
    hostname: 'joaopedrocostalog-netizen.github.io',
    origin: 'https://joaopedrocostalog-netizen.github.io'
  };
  for (const url of [
    'https://costalog.dssinformatica.com.br/wsdss/docs?urls.primaryName=APIs+Gerais',
    'https://api.example.org/api/overview',
    'http://api.example.org',
    'http://localhost:3001',
    'https://usuario:senha@api.example.org',
    'https://api.example.org/#admin'
  ])
    assert.throws(() => resolvePortalApi(page, url), url);
});
test('Durante desenvolvimento local, localhost pode usar HTTP na mesma origem', () => {
  const local = resolvePortalApi({ hostname: 'localhost', origin: 'http://localhost:3001' }, 'http://localhost:3001');
  assert.equal(local.demoOnly, false);
  assert.equal(local.apiUrl, 'http://localhost:3001');
});
