// E2E: segunda parte real del correo de axcsOS (protocolo idéntico a src/os/services/mail.ts)
// 1. se conecta al broker MQTT con SU dirección (peeruser@axcs.os)
// 2. envía una carta real a la dirección del navegador (probatest@axcs.os por defecto)
// 3. espera la RESPUESTA del navegador (enviada desde la app Mail) y la imprime
// Uso: node scripts/e2e-mail-peer.mjs [direcciónDestino] [--broker wss://...] [--once]
import mqtt from "mqtt";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const TO = args[0] || "probatest@axcs.os";
const BROKER = process.argv.includes("--broker")
  ? process.argv[process.argv.indexOf("--broker") + 1]
  : "wss://broker.emqx.io:8084/mqtt";
const ONCE = process.argv.includes("--once"); // envía y sale (sin esperar respuesta)

const NS = "axcsos/mail/v1";
const topicInbox = (local) => `${NS}/i/${local}`;
const MY_LOCAL = "peeruser";

const log = (m) => console.log(`[peer ${new Date().toISOString().slice(11, 19)}] ${m}`);

const me = {
  v: 1,
  t: "letter",
  id: `peer${Date.now().toString(36)}`,
  from: `${MY_LOCAL}@axcs.os`,
  fromName: "Usuaria Peer (Node)",
  to: TO,
  subject: "Prueba real de entrega",
  body: "Esta carta viajó de verdad por la red MQTT de axcsOS. Si la estás leyendo en Mail, la entrega funciona.",
  ts: Date.now(),
};

log(`conectando a ${BROKER} como ${MY_LOCAL}@axcs.os …`);
const client = mqtt.connect(BROKER, {
  clientId: `aosmail-peer-${Math.random().toString(36).slice(2, 8)}`,
  clean: true,
  connectTimeout: 9000,
  keepalive: 30,
});

const timeout = ONCE
  ? null
  : setTimeout(() => {
      log("TIMEOUT: no llegó respuesta del navegador");
      process.exit(1);
    }, 120000);

let sent = false;
["reconnect", "close", "offline", "end"].forEach((ev) =>
  client.on(ev, () => log(`evento ${ev}${sent ? " (tras enviar)" : ""}`))
);

client.on("connect", () => {
  log("conectado al broker");
  client.subscribe(topicInbox(MY_LOCAL), { qos: 1 }, (err) => {
    if (err) {
      log(`error de suscripción: ${err.message}`);
      process.exit(1);
    }
    client.publish(topicInbox(TO.split("@")[0]), JSON.stringify(me), { qos: 1 }, (err2) => {
      if (err2) {
        log(`error enviando: ${err2.message}`);
        process.exit(1);
      }
      sent = true;
      log(`CARTA ENVIADA a ${TO}: "${me.subject}"`);
      if (ONCE) {
        setTimeout(() => process.exit(0), 1500);
      }
    });
  });
});

client.on("message", (_topic, payload) => {
  let env;
  try {
    env = JSON.parse(payload.toString());
  } catch {
    return;
  }
  if (env.v !== 1 || env.t !== "letter" || !env.to || !env.to.startsWith(`${MY_LOCAL}@`)) return;
  if (env.from === me.from && env.id === me.id) return; // eco propio
  log("RESPUESTA RECIBIDA del navegador:");
  log(`  de:     ${env.from} (${env.fromName ?? ""})`);
  log(`  asunto: ${env.subject}`);
  log(`  cuerpo: ${String(env.body).slice(0, 160).replace(/\n/g, " ⏎ ")}`);
  log("E2E MAIL: OK — ida y vuelta reales verificadas");
  if (timeout) clearTimeout(timeout);
  setTimeout(() => process.exit(0), 300);
});

client.on("error", (e) => {
  log(`error mqtt: ${e.message}`);
  if (!sent) process.exit(1);
});

process.on("exit", (code) => log(`proceso terminado con código ${code}`));
