// Probe con el cliente real wisp-js (v2 con fallback v1) contra un servidor wisp
import { ClientConnection } from './wispjs/package/src/client/index.mjs';

const url = process.argv[2] || 'wss://wisp.mercurywork.shop/';
const host = process.argv[3] || 'example.com';
const port = parseInt(process.argv[4] || '80');

const conn = new ClientConnection(url, {});
const t = setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 15000);
conn.onopen = () => {
  console.log('CONNECTED. wisp_version =', conn.wisp_version, 'motd =', JSON.stringify(conn.server_motd), 'udp =', conn.udp_enabled);
  const stream = conn.create_stream();
  stream.connect(host, port);
  stream.onopen = () => {
    console.log('STREAM open to', host + ':' + port);
    stream.send(new TextEncoder().encode(`GET / HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\nUser-Agent: wisp-probe\r\n\r\n`));
  };
  let total = 0;
  stream.onmessage = (data) => {
    const s = new TextDecoder().decode(data);
    total += data.length;
    if (total < 400) console.log('DATA:', s.slice(0, 200));
    if (total > 0) {
      clearTimeout(t);
      console.log('TOTAL BYTES:', total, '=> handshake + relay OK');
      process.exit(0);
    }
  };
  stream.onclose = () => { console.log('stream closed, total', total); };
};
conn.onerror = (e) => { console.log('CONN ERROR', e); clearTimeout(t); process.exit(1); };
conn.onclose = () => { console.log('CONN CLOSED'); };
