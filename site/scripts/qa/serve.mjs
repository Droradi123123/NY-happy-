/** QA only: serve a built dist folder the way Cloudflare does (/x -> x.html). node scripts/qa/serve.mjs <dist> <port> */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
const [dist, port] = process.argv.slice(2);
const T = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  const f = [join(dist, u), join(dist, `${u}.html`), join(dist, u, 'index.html')].find((c) => existsSync(c) && statSync(c).isFile());
  if (!f) { r.writeHead(404); return r.end('not found'); }
  r.writeHead(200, { 'content-type': T[extname(f)] ?? 'application/octet-stream', 'cache-control': 'public, max-age=3600' });
  r.end(readFileSync(f));
}).listen(Number(port));
