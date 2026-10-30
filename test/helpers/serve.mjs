// Static file server for the fixtures. CLI: `node serve.mjs <dir> <port>`; module: `serve(dir)`.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

export const serve = (dir, { port = 0, hooks = {} } = {}) => new Promise((resolveServer) => {
  const stats = { requests: [] };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    stats.requests.push(`${req.method} ${url.pathname}`);
    if (hooks[url.pathname]) return hooks[url.pathname](req, res, stats);
    if (url.pathname === '/login') {
      res.writeHead(200, { 'content-type': TYPES['.html'] });
      return res.end('<!doctype html><title>Login</title><h1>Log in</h1><input name="user"><button>Go</button>');
    }
    if (url.pathname === '/redirect-to-login') {
      res.writeHead(302, { location: '/login' });
      return res.end();
    }
    const file = join(dir, normalize(url.pathname === '/' ? '/index.html' : url.pathname));
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  server.listen(port, '127.0.0.1', () => resolveServer({ server, stats, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) }));
});

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const s = await serve(process.argv[2], { port: Number(process.argv[3]) });
  console.log(`listening ${s.url}`);
}
