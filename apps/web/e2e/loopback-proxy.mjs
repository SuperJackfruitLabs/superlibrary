// An HTTP proxy for the WebKit project. Each artifact has its own origin, `itm-<hex>.localhost:8788`
// (plan D10). Chromium resolves any `*.localhost` itself, but WebKit asks the system resolver, which
// knows only `localhost` on macOS and on CI's Ubuntu. Through this proxy WebKit reaches the same
// origins by the same names, so CSP, frame-ancestors and the signed paths all see them unchanged.
// Upstream is `localhost` by name, so a server bound to ::1 only (Vite) is reached as well as one on
// 127.0.0.1. It forwards only to loopback: a request for any other host is refused, so nothing a test page does
// can reach the internet through it.
import http from 'node:http';
import net from 'node:net';

const PORT = Number(process.env.PW_PROXY_PORT ?? 8799);
const upstream = (host) => (host === '127.0.0.1' ? host : 'localhost');
const loopback = (host) => host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1';

const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (url.protocol !== 'http:' || !loopback(url.hostname)) {
    res.writeHead(502, { 'content-type': 'text/plain' }).end('e2e proxy: loopback only');
    return;
  }
  const headers = { ...req.headers };
  delete headers['proxy-connection'];
  const up = http.request({ host: upstream(url.hostname), autoSelectFamily: true, port: Number(url.port || 80), method: req.method, path: `${url.pathname}${url.search}`, headers }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  up.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  req.pipe(up);
});

// Tunnels (WebSocket upgrades such as Vite's HMR socket), again to loopback only.
server.on('connect', (req, client, head) => {
  const [host, port] = String(req.url).split(':');
  if (!loopback(host ?? '')) { client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'); return; }
  const up = net.connect({ port: Number(port), host: upstream(host ?? ''), autoSelectFamily: true }, () => {
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length) up.write(head);
    up.pipe(client);
    client.pipe(up);
  });
  up.on('error', () => client.destroy());
  client.on('error', () => up.destroy());
});

server.listen(PORT, '127.0.0.1');
