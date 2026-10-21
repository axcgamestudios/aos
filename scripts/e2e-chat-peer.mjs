// E2E: segunda parte real del chat de axcsOS (protocolo idéntico al navegador)
// 1. genera claves ECDH P-256 + id (mismo algoritmo que services/account.ts)
// 2. se conecta al broker MQTT y anuncia presencia
// 3. espera la presencia del navegador, le envía un DM cifrado E2E
// 4. espera la respuesta del navegador, la descifra y la imprime
// Uso: node scripts/e2e-chat-peer.mjs [--broker wss://...]
import mqtt from "mqtt";

const BROKER = process.argv.includes("--broker")
  ? process.argv[process.argv.indexOf("--broker") + 1]
  : "wss://broker.emqx.io:8084/mqtt";
const NS = "aos/v2";
const topicPresence = `${NS}/p`;
const topicInbox = (id) => `${NS}/i/${id}`;

const subtle = globalThis.crypto.subtle;
const b64 = {
  enc(buf) {
    return Buffer.from(buf).toString("base64");
  },
  dec(s) {
    return new Uint8Array(Buffer.from(s, "base64"));
  },
};

async function genIdentity() {
  const pair = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
  const pub = await subtle.exportKey("jwk", pair.publicKey);
  const priv = await subtle.exportKey("jwk", pair.privateKey);
  const material = `${pub.x}|${pub.y}`;
  const digest = new Uint8Array(await subtle.digest("SHA-256", new TextEncoder().encode(material)));
  const ALPHA = "0123456789abcdefghjkmnpqrstvwxyz";
  let id = "";
  for (let i = 0; i < 6; i++) id += ALPHA[digest[i * 2] % 32];
  return { id, pub, priv };
}

async function deriveKey(privJwk, peerPubJwk) {
  const priv = await subtle.importKey("jwk", privJwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]);
  const pub = await subtle.importKey("jwk", peerPubJwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
  return subtle.deriveKey({ name: "ECDH", public: pub }, priv, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function encStr(key, text) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
  return { iv: b64.enc(iv), ct: b64.enc(ct) };
}

async function decStr(key, payload) {
  const pt = await subtle.decrypt({ name: "AES-GCM", iv: b64.dec(payload.iv) }, key, b64.dec(payload.ct));
  return new TextDecoder().decode(pt);
}

const me = await genIdentity();
console.log(`[peer] identidad @${me.id} lista sobre ${BROKER}`);

const client = mqtt.connect(BROKER, {
  clientId: `aos2-${me.id}-node`,
  clean: true,
  connectTimeout: 9000,
  reconnectPeriod: 3000,
  keepalive: 30,
});

let browser = null; // {id, name, pubkey}
let dmKey = null;
const myKeyCache = new Map();
const seenMsgs = new Set();

function announce() {
  // anuncia SIEMPRE (la presencia del navegador no es requisito para anunciarse)
  const env = {
    v: 1, t: "presence", id: me.id, name: "Tester Node", avatar: null,
    bio: "segunda parte del E2E", status: "Probando", pubkey: me.pub, ts: Date.now(),
  };
  client.publish(topicPresence, JSON.stringify(env), { qos: 0 });
}

client.on("connect", () => {
  console.log("[peer] MQTT conectado");
  client.subscribe({ [topicPresence]: { qos: 0 }, [topicInbox(me.id)]: { qos: 1 } }, () => {
    console.log("[peer] suscrito a presencia + buzón propio");
    // anuncia sin esperar (para que el navegador lo vea en el directorio)
    const env = {
      v: 1, t: "presence", id: me.id, name: "Tester Node", avatar: null,
      bio: "segunda parte del E2E", status: "Probando", pubkey: me.pub, ts: Date.now(),
    };
    client.publish(topicPresence, JSON.stringify(env), { qos: 0 });
  });
});

client.on("message", async (topic, payload) => {
  try {
    const env = JSON.parse(payload.toString());
    if (topic === topicPresence && env.t === "presence" && env.id !== me.id) {
      if (!browser || browser.id !== env.id) {
        browser = { id: env.id, name: env.name, pubkey: env.pubkey };
        dmKey = await deriveKey(me.priv, env.pubkey);
        console.log(`[peer] PRESENCIA DEL NAVEGADOR: @${env.id} (${env.name}) — clave ECDH derivada`);
        announce();
        // envía el mensaje de prueba 1.5s después
        setTimeout(async () => {
          const inner = JSON.stringify({ text: "Hola desde la segunda parte real del test 🍐", name: "Tester Node" });
          const e = await encStr(dmKey, inner);
          const msg = { v: 1, t: "msg", from: me.id, ts: Date.now(), id: "nodetest-e2e-1", e };
          client.publish(topicInbox(browser.id), JSON.stringify(msg), { qos: 1 });
          console.log("[peer] DM CIFRADO ENVIADO al buzón del navegador");
        }, 1500);
      } else {
        // refresca presencia
        browser.lastSeen = Date.now();
      }
      return;
    }
    if (topic === topicInbox(me.id)) {
      if (env.t === "msg" || env.t === "grp" || env.t === "invite") {
        if (seenMsgs.has(env.id)) return;
        seenMsgs.add(env.id);
        const key = env.t === "msg" ? dmKey : myKeyCache.get(env.g);
        if (!key) return;
        const inner = JSON.parse(await decStr(key, env.e));
        console.log(`[peer] *** RESPUESTA RECIBIDA Y DESCIFRADA de @${env.from}: ${JSON.stringify(inner)}`);
        // acuse de lectura
        client.publish(topicInbox(env.from), JSON.stringify({ v: 1, t: "read", from: me.id, ts: Date.now(), chat: `dm:${me.id}`, upto: env.id }), { qos: 1 });
        console.log("[peer] acuse de lectura enviado (✓✓ azul en el navegador)");
      } else if (env.t === "read") {
        console.log(`[peer] el navegador marcó como leído hasta ${env.upto}`);
      } else if (env.t === "typing") {
        if (env.on) console.log("[peer] el navegador está escribiendo…");
      } else if (env.t === "call") {
        console.log(`[peer] señal de llamada entrante (kind=${env.kind}) — el flujo de llamadas funciona`);
      }
    }
  } catch (e) {
    console.error("[peer] error manejando mensaje:", e?.message ?? e);
  }
});

client.on("error", (e) => console.error("[peer] mqtt error:", e?.message ?? e));

// refresca presencia cada 20s
setInterval(() => {
  if (browser) announce();
}, 20000);

// sale solo a los 6 minutos
setTimeout(() => {
  console.log("[peer] tiempo agotado — cerrando");
  client.end(true);
  process.exit(0);
}, 1200000);
