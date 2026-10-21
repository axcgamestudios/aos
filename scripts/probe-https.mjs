// Sonda HTTPS a través del túnel wisp (TLS dentro del túnel, como hace libcurl en el OS).
// Sigue hasta 4 redirecciones y reporta estado + cabeceras clave de cada salto.
// Uso: node probe-https.mjs https://hbomax.com [wispUrl]
import WebSocket from 'ws';
import { Duplex } from 'node:stream';
import tls from 'node:tls';

const START_URL = process.argv[2] || 'https://hbomax.com';
const WISP = process.argv[3] || 'wss://wsn-c6o3.onrender.com/';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const T = { CONNECT: 0x01, DATA: 0x02, CONTINUE: 0x03, CLOSE: 0x04, INFO: 0x05 };
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);

function frame(type, streamId, payload = Buffer.alloc(0)) {
  const buf = Buffer.alloc(5 + payload.length);
  buf.writeUInt8(type, 0);
  buf.writeUInt32LE(streamId, 1);
  payload.copy(buf, 5);
  return buf;
}
function connectPayload(port, host) {
  const hb = Buffer.from(host, 'utf8');
  const p = Buffer.alloc(3 + hb.length);
  p.writeUInt8(0x01, 0); // TCP
  p.writeUInt16LE(port, 1);
  hb.copy(p, 3);
  return p;
}

let ws;
let nextStream = 1;
let currentSocket = null;

function makeWispSocket(host, port) {
  const streamId = nextStream++;
  let closed = false;
  const sock = new Duplex({
    write(chunk, _enc, cb) {
      if (!closed && ws.readyState === WebSocket.OPEN) {
        ws.send(frame(T.DATA, streamId, chunk));
      }
      cb();
    },
    read() {},
  });
  ws.send(frame(T.CONNECT, streamId, connectPayload(port, host)));
  sock.__sid = streamId;
  sock.__onData = (payload) => sock.push(payload);
  sock.__onClose = (reason) => {
    closed = true;
    sock.__closeReason = reason;
    sock.push(null);
    sock.emit('close');
  };
  currentSocket = sock;
  return sock;
}

async function fetchHop(url, timeoutMs = 25000) {
  const u = new URL(url);
  const port = u.protocol === 'https:' ? 443 : 80;
  return new Promise((resolve, reject) => {
    const raw = makeWispSocket(u.hostname, port);
    const timer = setTimeout(() => {
      try { raw.destroy(); } catch {}
      reject(new Error(`timeout ${timeoutMs}ms en ${u.hostname}`));
    }, timeoutMs);

    const finish = (err, result) => {
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(result);
    };

    const onTls = () => {
      const req =
        `GET ${u.pathname || '/'}${u.search || ''} HTTP/1.1\r\n` +
        `Host: ${u.hostname}\r\n` +
        `User-Agent: ${UA}\r\n` +
        `Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8\r\n` +
        `Accept-Language: es-ES,es;q=0.9,en;q=0.8\r\n` +
        `Connection: close\r\n\r\n`;
      raw.write(req);

      let buf = Buffer.alloc(0);
      raw.on('data', (c) => {
        buf = Buffer.concat([buf, c]);
        const head = buf.toString('latin1');
        const idx = head.indexOf('\r\n\r\n');
        if (idx >= 0) {
          const statusLine = head.slice(0, head.indexOf('\r\n'));
          const headers = head.slice(0, idx);
          const body = buf.subarray(idx + 4);
          try { raw.destroy(); } catch {}
          finish(null, { statusLine, headers, bodyBytes: body.length, body });
        }
      });
      raw.on('error', (e) => finish(e));
      raw.on('close', () => finish(new Error(`conexión cerrada sin respuesta HTTP (wisp CLOSE reason=${raw.__closeReason ?? '?'})`)));
    };

    if (u.protocol === 'https:') {
      const tlsSock = tls.connect({ socket: raw, servername: u.hostname, rejectUnauthorized: false }, onTls);
      tlsSock.on('error', (e) => { clearTimeout(timer); reject(e); });
    } else {
      raw.on('connect', onTls);
      // HTTP plano: pequeño margen para que el CONNECT llegue
      setTimeout(onTls, 300);
    }
  });
}

function headerValue(headers, name) {
  const m = headers.match(new RegExp(`^${name}:\\s*(.*)$`, 'mi'));
  return m ? m[1].trim() : '';
}

ws = new WebSocket(WISP, [], { handshakeTimeout: 30000 });
const globalTimer = setTimeout(() => { log('GLOBAL TIMEOUT'); process.exit(2); }, 120000);

ws.on('open', async () => {
  log(`WS OPEN ✔ ${WISP}`);
  let url = START_URL;
  if (!/^https?:\/\//.test(url)) url = 'https://' + url;
  for (let hop = 1; hop <= 5; hop++) {
    try {
      log(`\n=== SALTO ${hop}: ${url} ===`);
      const r = await fetchHop(url);
      log('STATUS :', r.statusLine);
      const loc = headerValue(r.headers, 'location');
      const interesting = ['server', 'cf-ray', 'cf-mitigated', 'x-frame-options', 'content-security-policy', 'content-type', 'set-cookie', 'x-served-by', 'x-cache', 'via'];
      for (const h of interesting) {
        const v = headerValue(r.headers, h);
        if (v) log(`${h.padEnd(24)}: ${v.slice(0, 140)}`);
      }
      log(`body: ${r.bodyBytes} bytes | muestra: ${r.body.toString('utf8').replace(/\s+/g, ' ').slice(0, 180)}`);
      if (loc) {
        url = new URL(loc, url).href;
        continue;
      }
      break;
    } catch (e) {
      log('ERROR en salto:', e.message);
      break;
    }
  }
  clearTimeout(globalTimer);
  try { ws.close(); } catch {}
  setTimeout(() => process.exit(0), 500);
});

ws.on('message', (data) => {
  const b = Buffer.from(data);
  const type = b.readUInt8(0);
  const sid = b.readUInt32LE(1);
  const payload = b.subarray(5);
  if (type === T.DATA && currentSocket && currentSocket.__sid === sid) currentSocket.__onData(payload);
  else if (type === T.CLOSE && currentSocket && currentSocket.__sid === sid) currentSocket.__onClose(payload[0]);
});

ws.on('error', (e) => { log('WS ERROR:', e.message); process.exit(1); });
