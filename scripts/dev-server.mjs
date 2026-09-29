import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('.');
const config = JSON.parse(await readFile('vercel.json', 'utf8'));
const routes = new Map(config.rewrites.map(r => [r.source, r.destination]));
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.gif':'image/gif','.wasm':'application/wasm'};
const allowed = ['/tierly/', '/ops/tierly/', '/hub/logos/', '/uploads/'];
createServer(async (req, res) => {
 try {
  const requestUrl = new URL(req.url, 'http://localhost');
  const path = decodeURIComponent(requestUrl.pathname);
  const redirect = config.redirects?.find(r => r.source === path);
  if (redirect) { res.writeHead(redirect.permanent ? 308 : 307, {Location: redirect.destination + requestUrl.search}); res.end(); return; }
  let target = routes.get(path) || path;
  if (!allowed.some(prefix => target.startsWith(prefix)) || target.split('/').some(part => part.startsWith('.'))) throw new Error('not public');
  let file = resolve(root, '.' + target);
  if (!file.startsWith(root + sep)) throw new Error('outside root');
  if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
  const body = await readFile(file);
  res.writeHead(200, {'Content-Type': types[extname(file)] || 'application/octet-stream'});
  res.end(body);
 } catch { res.writeHead(404); res.end('Not found'); }
}).listen(Number(process.env.PORT || 8080), '127.0.0.1', () => console.log(`Tierly: http://127.0.0.1:${process.env.PORT || 8080}`));
