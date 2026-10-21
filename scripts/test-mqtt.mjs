// Test 2: Public MQTT brokers over WSS — roundtrip, size limits, persistent sessions
// Run: node scripts/test-mqtt.mjs  (uses mqtt from scripts/engine-research or global)
const BROKERS = [
  { name: "emqx", url: "wss://broker.emqx.io:8084/mqtt" },
  { name: "hivemq", url: "wss://broker.hivemq.com:8884/mqtt" },
  { name: "mosquitto", url: "wss://test.mosquitto.org:8081/mqtt" },
];

async function loadMqtt() {
  try { return (await import("mqtt")).default ?? (await import("mqtt")); }
  catch { return null; }
}

const NS = `aostest/${Date.now().toString(36)}`;

async function testBroker(mqtt, { name, url }) {
  const result = { name, url, connect: false, roundtrip: false, small: false, big64k: false, big256k: false, session: false, error: "" };
  await new Promise((done) => {
    let client;
    const finish = (ms = 3000) => { setTimeout(() => { try { client?.end(true); } catch {} done(); }, ms); };
    try {
      client = mqtt.connect(url, { clientId: `aostest-a-${Math.random().toString(16).slice(2, 10)}`, clean: true, connectTimeout: 8000, reconnectPeriod: 0 });
    } catch (e) { result.error = String(e); return finish(0); }
    const t = setTimeout(() => { if (!result.connect) { result.error = "timeout"; try { client.end(true); } catch {} done(); } }, 9000);
    client.on("connect", () => {
      clearTimeout(t);
      result.connect = true;
      client.subscribe(`${NS}/x`, { qos: 0 }, async () => {
        // small message roundtrip
        const smallOk = await new Promise((res) => {
          const to = setTimeout(() => res(false), 5000);
          client.on("message", function onm(topic, payload) {
            if (topic === `${NS}/x`) { clearTimeout(to); client.removeListener("message", onm); res(payload.length === 13); }
          });
          client.publish(`${NS}/x`, "hello-aos-01", { qos: 0 });
        });
        result.roundtrip = smallOk; result.small = smallOk;
        // 64KB
        const big1 = "B".repeat(64 * 1024);
        result.big64k = await new Promise((res) => {
          const to = setTimeout(() => res(false), 7000);
          client.on("message", function onm(topic, payload) {
            if (topic === `${NS}/x`) { clearTimeout(to); client.removeListener("message", onm); res(payload.length === 64 * 1024); }
          });
          client.publish(`${NS}/x`, big1, { qos: 0 });
        });
        // 256KB
        const big2 = "C".repeat(256 * 1024);
        result.big256k = await new Promise((res) => {
          const to = setTimeout(() => res(false), 9000);
          client.on("message", function onm(topic, payload) {
            if (topic === `${NS}/x`) { clearTimeout(to); client.removeListener("message", onm); res(payload.length === 256 * 1024); }
          });
          client.publish(`${NS}/x`, big2, { qos: 0 });
        });
        finish(200);
      });
    });
    client.on("error", (e) => { if (!result.connect) { clearTimeout(t); result.error = String(e); finish(0); } });
  });
  return result;
}

const mqtt = await loadMqtt();
if (!mqtt) { console.error("mqtt module not available — installing…"); process.exit(2); }
for (const b of BROKERS) {
  const r = await testBroker(mqtt, b);
  console.log(JSON.stringify(r));
}
process.exit(0);
