// Probe wisp protocol handshake against a wisp server (v1 CONNECT + HTTP GET example.com)
import WebSocket from 'ws';

const url = process.argv[2] || 'wss://wisp.mercurywork.shop/';
const host = process.argv[3] || 'example.com';
const port = parseInt(process.argv[4] || '80');

function frame(type, streamId, payload) {
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

const ws = new WebSocket(url);
const t = setTimeout(() => { console.log('TIMEOUT waiting for server response'); process.exit(1); }, 12000);
ws.on('open', () => {
  console.log('WS open:', url);
  ws.send(frame(0x01, 1, connectPayload(port, host)));
});
ws.on('message', (data) => {
  const b = Buffer.from(data);
  const type = b.readUInt8(0);
  const sid = b.readUInt32LE(1);
  const names = { 2: 'CONTINUE', 3: 'DATA', 4: 'CLOSE' };
  if (type === 2) {
    console.log('CONTINUE stream', sid, 'buffer=', b.readUInt32LE(5));
    const req = Buffer.from(`GET / HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\nUser-Agent: probe\r\n\r\n`);
    ws.send(frame(0x03, 1, req));
  } else if (type === 3) {
    const body = b.slice(5).toString('utf8');
    console.log('DATA', body.length, 'bytes:\n' + body.slice(0, 300));
    clearTimeout(t);
    ws.close();
    process.exit(0);
  } else if (type === 4) {
    console.log('CLOSE reason', b.readUInt8(5));
    clearTimeout(t);
    process.exit(1);
  } else {
    console.log('packet type', type, 'len', b.length, b.slice(0, 40).toString('hex'));
  }
});
ws.on('error', (e) => { console.log('WS ERROR:', e.message); clearTimeout(t); process.exit(1); });
ws.on('unexpected-response', (req, res) => { console.log('HTTP', res.statusCode, 'on upgrade'); clearTimeout(t); process.exit(1); });
