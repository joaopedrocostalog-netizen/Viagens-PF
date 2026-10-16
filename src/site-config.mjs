/** COSTALOG - configurações PÚBLICAS da interface.
 * URL pública do backend, sem /api, /wsdss/docs ou credenciais.
 * Para GitHub Pages com backend corporativo publicado em HTTPS, por exemplo:
 * export const API_BASE_URL = 'https://api.seu-dominio-corporativo.com.br';
 * Até o servidor estar implantado, mantenha vazio para demonstração isolada.
 */
export const API_BASE_URL = '';

export function resolvePortalApi(location, configured=API_BASE_URL) {
  const host=String(location?.hostname||'').toLowerCase();
  const origin=String(location?.origin||'');
  const pages=host.endsWith('.github.io');
  const url=String(configured||'').trim().replace(/\/+$/,'');
  if(url) {
    let parsed;
    try{parsed=new URL(url);}catch{throw Error('API_BASE_URL precisa ser uma URL válida.');}
    if(parsed.pathname!=='/' || parsed.search || parsed.hash || parsed.username || parsed.password)
      throw Error('API_BASE_URL deve conter apenas a origem HTTPS do backend, sem /api, /docs, login ou parâmetros.');
    const local=/^(localhost|127\.0\.0\.1)$/.test(parsed.hostname);
    if(parsed.protocol!=='https:' && !(local && parsed.protocol==='http:' && !pages))
      throw Error('API_BASE_URL deve usar HTTPS quando o frontend estiver publicado.');
    if(pages && local)throw Error('O GitHub Pages não pode usar localhost como backend da empresa.');
  }
  return {apiUrl:url || (pages?'':origin),demoOnly:pages&&!url,remote:!!url};
}
