/**
 * serve.mjs —— 本地预览用的零依赖静态服务器（可选文件，不想用可以直接删掉）
 *
 * 用法：node serve.mjs  [端口]
 * 然后浏览器打开 http://127.0.0.1:8000/
 *
 * 等价于 python -m http.server：只为 .html/.css/.js 提供正确的 Content-Type，
 * 不做任何打包、不做任何改写，和静态托管上的行为一致。
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 8000);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^[\\/]+/, '');
  let file = join(ROOT, rel);
  if (url.pathname === '/' || url.pathname.endsWith('/')) file = join(file, 'index.html');

  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('403');
    return;
  }

  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found: ' + url.pathname);
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`NightWander serving ${ROOT}`);
  console.log(`  -> http://127.0.0.1:${PORT}/`);
});
