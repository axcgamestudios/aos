// Probe the new engine: what protocol does wss://wsn-c6o3.onrender.com/ speak?
// Tests: passive wait (server-first protocol?), wisp v2 INFO handshake, wisp v1 CONNECT, MQTT CONNECT.
import WebSocket from 'ws';

const URL = process.argv[2] || 'wss://wsn-c6o3.onrender.com/';

function frame(type, streamId, payload) {
  const buf = Buffer.alloc(5 + payload.length);
  buf.writeUInt8(type, 0);
  buf.writeUInt32LE(streamId, 1);
  payload.copy(buf, 5);
  return buf;
}

const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const hexdump = (b) => {
  const s = b.toString('utf8').replace(/[^\x20-\x7e]/g, '.');
  return `hex=${b.subarray(0, 48).toString('hex')} | txt=${s.slice(0, 120)}`;
};

const ws = new WebSocket(URL, { handshakeTimeout: 75000 });
const t = setTimeout(() => { log('GLOBAL TIMEOUT'); process.exit(2); }, 100000);

ws.on('unexpected-response', (req, res) => {
  log('HTTP reject on upgrade:', res.statusCode, res.statusMessage);
  let body = '';
  res.on('data', (c) => (body += c));
  res.on('end', () => { log('body:', body.slice(0, 300)); process.exit(1); });
});
ws.on('error', (e) => { log('WS ERROR:', e.message); process.exit(1); });

ws.on('open', () => {
  log('WS OPEN ✔', URL);

  // Phase 1: wait 3s in case server speaks first (wisp v2 servers send INFO 0x21 first)
  setTimeout(() => {
    log('-- no server-first packet; sending wisp v1 CONNECT (example.com:80) as client-init');
    ws.send(frame(0x01, 1, (() => {
      const hb = Buffer.from('example.com');
      const p = Buffer.alloc(3 + hb.length);
      p.writeUInt8(0x01, 0); p.writeUInt16LE(80, 1); hb.copy(p, 3);
      return p;
    })()));
    // also send wisp v2 client INFO (0x21) on stream 0 to be permissive
    const info = Buffer.from([0x21, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00]);
    try { ws.send(info); } catch {}
  }, 3000);
});

ws.on('message', (data, isBinary) => {
  const b = Buffer.from(data);
  const type = b.readUInt8(0);
  const sid = b.readUInt32LE(1);
  const names = { 0x01: 'CONNECT', 0x02: 'CONTINUE', 0x03: 'DATA', 0x04: 'CLOSE', 0x10: 'DNS', 0x21: 'INFO/ARM', 0x22: 'ACL' };
  log(`RX type=0x${type.toString(16)} (${names[type] || '?'}) stream=${sid} len=${b.length}`);
  log('   ', hexdump(b));

  if (type === 0x02) {
    log('-- got CONTINUE: real wisp! sending HTTP GET via DATA');
    ws.send(frame(0x03, sid, Buffer.from('GET / HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\nUser-Agent: axcs-probe\r\n\r\n')));
  }
  if (type === 0x21) {
    log('-- got INFO (wisp v2 server) ✔ version bytes:', b.subarray(5, 9).toString('hex'));
  }
  if (type === 0x03) {
    const body = b.subarray(5).toString('utf8');
    if (body.includes('Example Domain') || /HTTP\/1\.[01] 200/.test(body)) {
      log('*** WISP CONFIRMED: real HTTP response through tunnel ***');
      log(body.slice(0, 200));
      clearTimeout(t); ws.close(); process.exit(0);
    }
  }
});
ws.on('close', (code, reason) => { log('WS CLOSED', code, reason.toString()); process.exit(0); });
