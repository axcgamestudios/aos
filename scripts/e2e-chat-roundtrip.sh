#!/bin/bash
# E2E completo del chat en UNA invocación: peer + navegador + verificación
cd /home/z/my-project
LOG=/tmp/e2e-peer.log
rm -f $LOG

# 1. fuerza un announce del navegador YA (la pestaña headless estrangula los timers)
agent-browser eval "window.__aosChat?.svc?.['announce']?.(); 'announced'" > /dev/null 2>&1

# 2. lanza el peer en background DE ESTA MISMA INVOCACIÓN
node scripts/e2e-chat-peer.mjs >> $LOG 2>&1 &
PEER_PID=$!

# 3. espera el handshake + el DM cifrado del peer (presence → DM a los 1.5s)
for i in $(seq 1 20); do
  if grep -q "DM CIFRADO ENVIADO" $LOG 2>/dev/null; then break; fi
  sleep 1
done

# 4. ¿qué recibió el navegador? (espera hasta 8s para la entrega del DM nuevo)
for i in $(seq 1 8); do
  NEW=$(agent-browser eval "
    (() => {
      const all = Object.values(window.__aosChat?.svc?.messages || {}).flat();
      const newest = all.filter(m => !m.mine).sort((a,b) => b.ts - a.ts)[0];
      newest && Date.now() - newest.ts < 60000 ? 'YES:' + newest.from : 'NO';
    })()
  " 2>/dev/null | tail -1)
  echo "$NEW" | grep -q "^YES" && break
  sleep 1
done
echo "=== estado del navegador ==="
agent-browser eval "
(() => {
  const svc = window.__aosChat?.svc;
  const all = Object.values(svc?.messages || {}).flat();
  const inc = all.filter(m => !m.mine);
  return JSON.stringify({
    state: svc?.state,
    received: inc.map(m => ({ from: m.from, text: (m.text || '').slice(0, 42), ts: m.ts }))
  });
})()
" 2>&1 | tail -1

# 5. responde desde el navegador AL PEER MÁS RECIENTE (por ts)
echo "=== enviando respuesta ==="
agent-browser eval "
(() => {
  const svc = window.__aosChat?.svc;
  const all = Object.values(svc?.messages || {}).flat();
  const inc = all.filter(m => !m.mine);
  const lastPeer = inc.sort((a,b) => b.ts - a.ts)[0]?.from;
  if (!lastPeer) return 'no-peer-msg';
  const peer = svc.directory.get(lastPeer) || { id: lastPeer, name: '@' + lastPeer, lastSeen: Date.now(), online: true };
  svc.sendDm(peer, { text: 'Respuesta E2E desde axcsOS: enlace y descifrado verificados 🍐' }).then(r => 'sent:' + !!r);
  return 'sending-to-' + lastPeer;
})()
" 2>&1 | tail -1

# 6. espera a que el peer reciba + descifre la respuesta
for i in $(seq 1 15); do
  if grep -q "RESPUESTA RECIBIDA" $LOG 2>/dev/null; then break; fi
  sleep 1
done

echo "=== log del peer ==="
cat $LOG
kill $PEER_PID 2>/dev/null
echo "=== fin ==="
