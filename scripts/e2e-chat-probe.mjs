// Sonda: ¿llegan los mensajes del navegador al broker? ¿los recibe el peer?
import mqtt from "mqtt";

const B = "wss://broker.emqx.io:8084/mqtt";
const c = mqtt.connect(B, { clientId: `probe-${Math.random().toString(16).slice(2, 8)}`, clean: true, connectTimeout: 8000, reconnectPeriod: 0 });

c.on("connect", () => {
  console.log("[probe] conectado");
  c.subscribe({ "aos/v2/p": { qos: 0 }, "aos/v2/i/p9fnwv": { qos: 1 } }, () => {
    console.log("[probe] suscrito a presencia y al buzón del peer");
  });
});
c.on("message", (t, p) => {
  let s = p.toString();
  try { const j = JSON.parse(s); s = `t=${j.t} from=${j.from}${j.e ? " [cifrado]" : ""}`; } catch {}
  console.log(`[probe] ${t} → ${s.slice(0, 110)}`);
});
c.on("error", (e) => console.error("[probe] error:", e.message));

setTimeout(() => { console.log("[probe] fin"); c.end(true); process.exit(0); }, 90000);
