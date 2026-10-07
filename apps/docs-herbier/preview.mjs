// Serves the built site the way GitHub Pages does: under its base, `/guide/a` answered
// by `guide/a.html`, a directory by its `index.html`, and `404.html` for the rest.
//
//   node apps/docs-herbier/preview.mjs   (after `nx build docs-herbier`)
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import * as path from 'node:path';

const base = process.env.DOCS_BASE ?? '/craft/';
const root = process.env.DOCS_OUT ? path.resolve(process.cwd(), process.env.DOCS_OUT) : path.resolve(import.meta.dirname, '../../dist/apps/docs-herbier');
const port = Number(process.env.PORT ?? 4421);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const isFile = (file) => existsSync(file) && statSync(file).isFile();

const resolve = (pathname) => {
  const relative = pathname.startsWith(base) ? pathname.slice(base.length) : null;
  if (relative === null) return null;
  const candidates = relative === '' || relative.endsWith('/')
    ? [`${relative}index.html`]
    : [relative, `${relative}.html`, `${relative}/index.html`];
  return candidates.map((candidate) => path.join(root, candidate)).find(isFile) ?? null;
};

createServer((request, response) => {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost');
  if (pathname === '/') {
    response.writeHead(302, { location: base }).end();
    return;
  }
  const file = resolve(decodeURIComponent(pathname));
  const target = file ?? path.join(root, '404.html');
  response.writeHead(file ? 200 : 404, {
    'content-type': TYPES[path.extname(target)] ?? 'application/octet-stream',
  });
  createReadStream(target).pipe(response);
}).listen(port, () => console.log(`docs-herbier: http://localhost:${port}${base}`));
