// Definitive probe for wss://wsn-c6o3.onrender.com/ with CORRECT wisp protocol:
//   0x01 CONNECT | 0x02 DATA | 0x03 CONTINUE | 0x04 CLOSE | 0x05 INFO(v2)
// Client v2 connects with subprotocol "wisp-v2" and mirrors the INFO handshake.
// Usage: node probe-wisp2.mjs [url] [mode] [host] [port]
//   mode: v2 | v1
import WebSocket from 'ws';

const URL = process.argv[2] || 'wss://wsn-c6o3.onrender.com/';
const MODE = process.argv[3] || 'v2';
const HOST = process.argv[4] || 'example.com';
const PORT = parseInt(process.argv[5] || '80', 10);

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

const ws = new WebSocket(URL, MODE === 'v2' ? ['wisp-v2'] : [], { handshakeTimeout: 70000 });
const t = setTimeout(() => { log('GLOBAL TIMEOUT'); process.exit(2); }, 75000);

let httpBuf = Buffer.alloc(0);
let infoSeen = false;

ws.on('unexpected-response', (req, res) => {
  log('HTTP reject on upgrade:', res.statusCode, res.statusMessage);
  let body = ''; res.on('data', (c) => (body += c));
  res.on('end', () => { log('body:', body.slice(0, 300)); process.exit(1); });
});
ws.on('error', (e) => { log('WS ERROR:', e.message); process.exit(1); });

ws.on('open', () => {
  log(`WS OPEN ✔ (${MODE})`, URL, '| protocol:', ws.protocol || '(none)');
  if (MODE === 'v2') {
    // wait for server INFO first (server-initiated handshake)
  } else {
    // v1: server sends initial CONTINUE(0x03) stream 0; we can CONNECT right away
    log('-- v1: sending CONNECT + HTTP GET immediately (wisp-server-node needs no stream CONTINUE)');
    ws.send(frame(T.CONNECT, 1, connectPayload(PORT, HOST)));
    ws.send(frame(T.DATA, 1, Buffer.from(`GET / HTTP/1.1\r\nHost: ${HOST}\r\nConnection: close\r\nUser-Agent: axcs-probe\r\n\r\n`)));
  }
});

ws.on('message', (data) => {
  const b = Buffer.from(data);
  const type = b.readUInt8(0);
  const sid = b.readUInt32LE(1);
  const payload = b.subarray(5);
  const name = Object.entries(T).find(([, v]) => v === type)?.[0] || `0x${type.toString(16)}`;

  if (type === T.INFO) {
    const major = payload[0], minor = payload[1], extCount = payload.readUInt16LE(2);
    log(`RX INFO stream=${sid} server wisp v${major}.${minor} extensions=${extCount}`, payload.toString('hex'));
    if (!infoSeen) {
      infoSeen = true;
      // reply INFO: major=2 minor=0, 0 extensions
      const reply = Buffer.from([0x02, 0x00, 0x00, 0x00]); // major, minor, extCount(u16 LE)=0
      ws.send(frame(T.INFO, 0, reply));
      log('TX INFO (v2.0, 0 ext) — handshake complete, sending CONNECT');
      ws.send(frame(T.CONNECT, 1, connectPayload(PORT, HOST)));
    }
    return;
  }
  if (type === T.CONTINUE) {
    log(`RX CONTINUE stream=${sid} buffer=${payload.readUInt32LE(0)}`);
    if (sid === 1 && httpBuf.length === 0) {
      log('-- sending HTTP GET as DATA');
      ws.send(frame(T.DATA, 1, Buffer.from(`GET / HTTP/1.1\r\nHost: ${HOST}\r\nConnection: close\r\nUser-Agent: axcs-probe\r\n\r\n`)));
    }
    return;
  }
  // wisp-server-node (v1): no CONTINUE on stream 1 — send DATA right after CONNECT
  if (type === T.CONNECT_SENT_ECHO) return;
  if (type === T.DATA) {
    httpBuf = Buffer.concat([httpBuf, payload]);
    log(`RX DATA stream=${sid} len=${payload.length} total=${httpBuf.length}`);
    const s = httpBuf.toString('utf8');
    if (/HTTP\/1\.[01] \d{3}/.test(s.slice(0, 32))) {
      log('*** REAL HTTP RESPONSE THROUGH WISP TUNNEL ***');
      log(s.split('\r\n\r\n')[0].slice(0, 200));
      const body = s.split('\r\n\r\n').slice(1).join('\r\n\r\n');
      if (body.length > 50 || /connection: close/i.test(s)) {
        log('--- body sample:', body.replace(/\s+/g, ' ').slice(0, 150));
        clearTimeout(t); ws.close(); process.exit(0);
      }
    }
    return;
  }
  if (type === T.CLOSE) {
    const reasons = { 1: 'UNKNOWN', 2: 'VOLUNTARY', 3: 'NETWORK_ERROR', 4: 'INCOMPATIBLE_EXTENSIONS', 5: 'TIMEOUT', 6: 'SERVER_ERROR', 7: 'REFUSED', 8: 'UNSUPPORTED' };
    log(`RX CLOSE stream=${sid} reason=${payload[0]} (${reasons[payload[0]] || '?'})`);
    clearTimeout(t); process.exit(1);
  }
  log(`RX ? type=${name} stream=${sid} len=${payload.length}`, payload.toString('hex').slice(0, 40));
});

ws.on('close', (code, reason) => { log('WS CLOSED', code, reason.toString()); process.exit(0); });
