const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const allowed = new Map([['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']], ['/style.css', ['style.css', 'text/css']], ['/app.js', ['app.js', 'text/javascript']]]);
const port = Number(process.env.PORT || 4173);
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = allowed.get(pathname);
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(path.join(root, file[0]), (error, data) => {
    if (error) { res.writeHead(500); res.end('Unable to read asset'); return; }
    res.writeHead(200, { 'Content-Type': file[1] + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`N.O.V.A. visual playground: http://127.0.0.1:${port}`));
