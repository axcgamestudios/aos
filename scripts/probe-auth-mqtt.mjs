// Escucha el topic de sesiones (axcsos/auth/s/#) en los 3 brokers
// para diagnosticar el guardián de 1-dispositivo-por-cuenta.
import mqtt from "mqtt";

const BROKERS = ["wss://broker.emqx.io:8084/mqtt", "wss://broker.hivemq.com:8884/mqtt", "wss://broker.mosquitto.org:8081/mqtt"];
const secs = parseInt(process.argv[2] || "20", 10);

for (const url of BROKERS) {
  const c = mqtt.connect(url, { clientId: `probe-auth-${Math.random().toString(36).slice(2, 8)}`, clean: true, connectTimeout: 8000, reconnectPeriod: 0 });
  c.on("connect", () => {
    c.subscribe("axcsos/auth/s/#", { qos: 1 }, (err) => {
      console.log(`[${new Date().toISOString().slice(11, 19)}] ${url} → suscrito${err ? " ERROR " + err.message : ""}`);
    });
  });
  c.on("message", (topic, msg) => {
    console.log(`[${new Date().toISOString().slice(11, 19)}] ${url} MSG ${topic}: ${msg.toString().slice(0, 120)}`);
  });
  c.on("error", (e) => console.log(`[${url}] error: ${e.message}`));
  c.on("close", () => console.log(`[${url}] conexión cerrada`));
}

setTimeout(() => {
  console.log("— fin de la escucha —");
  process.exit(0);
}, secs * 1000);
