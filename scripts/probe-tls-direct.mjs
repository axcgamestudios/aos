// TLS directo desde el sandbox (sin túnel) para comparar con el túnel wisp
import tls from 'node:tls';

const hosts = process.argv.slice(2).length ? process.argv.slice(2) : ['flixpire.sc', 'hbomax.com', 'www.hbomax.com', 'www.max.com'];

for (const host of hosts) {
  const r = await new Promise((resolve) => {
    const t0 = Date.now();
    const s = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, ALPNProtocols: ['h2', 'http/1.1'] }, () => {
      const cert = s.getPeerCertificate();
      resolve(`OK ${Date.now() - t0}ms proto=${s.getProtocol()} alpn=${s.alpnProtocol || '-'} certCN=${cert?.subject?.CN ?? '?'} issuer=${(cert?.issuer?.O ?? '?')}`);
      s.destroy();
    });
    s.on('error', (e) => resolve(`FALLO ${Date.now() - t0}ms: ${e.message.slice(0, 120)}`));
    setTimeout(() => { try { s.destroy(); } catch {}; resolve(`TIMEOUT 8000ms`); }, 8000);
  });
  console.log(`${host.padEnd(20)} ${r}`);
}
