import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import WebSocket, { WebSocketServer } from "ws";

const ROOT = process.cwd();
const configPath = path.join(ROOT, "bridge.config.json");
const exposedPath = path.join(ROOT, "exposed-entities.json");
const originalConfig = fs.readFileSync(configPath, "utf8");
const originalExposed = fs.readFileSync(exposedPath, "utf8");
const baseConfig = JSON.parse(originalConfig);
const roomName = `photon-ha-test-${Date.now()}`;
const password = `test-${crypto.randomUUID()}`;
const calls = [];
let bridgeProcess;
let wss;

globalThis.WebSocket = WebSocket;

function result(socket, id, value) { socket.send(JSON.stringify({ id, type: "result", success: true, result: value })); }
function state(entityId, value, name, area = "Test Lab") {
  return { entity_id: entityId, state: value, attributes: { friendly_name: name }, last_changed: new Date().toISOString(), last_updated: new Date().toISOString(), context: { id: crypto.randomUUID() } };
}

async function startFakeHa() {
  wss = new WebSocketServer({ port: 18123 });
  wss.on("connection", (socket) => {
    socket.send(JSON.stringify({ type: "auth_required", ha_version: "test" }));
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === "auth") { socket.send(JSON.stringify({ type: "auth_ok", ha_version: "test" })); return; }
      if (message.type === "get_states") return result(socket, message.id, [state("switch.heater", "off", "Heater"), state("sensor.test_temperature", "21.5", "Temperature")]);
      if (message.type === "config/entity_registry/list") return result(socket, message.id, [
        { entity_id: "switch.heater", name: null, original_name: "Heater", device_id: "dev1", area_id: null, disabled_by: null },
        { entity_id: "sensor.test_temperature", name: null, original_name: "Temperature", device_id: "dev1", area_id: null, disabled_by: null },
      ]);
      if (message.type === "config/device_registry/list") return result(socket, message.id, [{ id: "dev1", name: "Test device", name_by_user: null, area_id: "lab" }]);
      if (message.type === "config/area_registry/list") return result(socket, message.id, [{ area_id: "lab", name: "Test Lab" }]);
      if (message.type === "subscribe_events") return result(socket, message.id, 1);
      if (message.type === "call_service") {
        calls.push(message);
        result(socket, message.id, null);
        const next = state("switch.heater", "on", "Heater");
        setTimeout(() => socket.send(JSON.stringify({ id: 999, type: "event", event: { event_type: "state_changed", data: { entity_id: "switch.heater", old_state: state("switch.heater", "off", "Heater"), new_state: next }, origin: "LOCAL", time_fired: new Date().toISOString(), context: next.context } })), 30);
      }
    });
  });
  await new Promise((resolve) => wss.once("listening", resolve));
}

async function waitForOutput(child, text, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for: ${text}`)), timeoutMs);
    const inspect = (chunk) => {
      const line = chunk.toString();
      process.stdout.write(line);
      if (line.includes(text)) { clearTimeout(timeout); resolve(); }
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.once("exit", (code) => { if (code && code !== 0) reject(new Error(`Bridge exited with ${code}`)); });
  });
}

async function photonRemoteTest() {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, "vendor/photon.min.js"), "utf8"));
  const Photon = globalThis.Photon;
  const Client = Photon.LoadBalancing.LoadBalancingClient;
  const client = new Client(Photon.ConnectionProtocol.Wss, baseConfig.photonAppId, "photon-ha-1");
  client.setUserId(`integration-${crypto.randomUUID()}`);
  client.setLogLevel(Photon.LogLevel.WARN);
  const passwordHash = crypto.createHash("sha256").update(password).digest("hex");
  let bridgeActor;
  let authenticated = false;
  let sawOnState = false;
  let commandOk = false;
  let commandSent = false;
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Photon remote integration timed out")), 30000);
    client.onStateChange = (value) => {
      console.log(`Remote Photon state: ${value}`);
      if (value === Client.State.JoinedLobby) client.joinRoom(roomName, { createIfNotExists: false });
    };
    client.onJoinRoom = () => {
      console.log("Remote joined Photon room");
      const bridge = client.myRoomActorsArray().find((actor) => actor.getCustomProperty("pha_role") === "bridge");
      if (!bridge) return reject(new Error("Bridge actor was not discoverable"));
      bridgeActor = bridge.actorNr;
      client.raiseEvent(1, { passwordHash }, { targetActors: [bridgeActor] });
    };
    client.onEvent = (code, content, actorNr) => {
      console.log(`Remote event code=${code} actor=${actorNr}`);
      if (code === 2 && content.ok) { authenticated = true; bridgeActor = content.bridgeActor || actorNr; }
      if (authenticated && actorNr === bridgeActor && code === 5) {
        const heater = content.entities.find((entity) => entity.entityId === "switch.heater");
        if (heater?.state === "off" && !commandSent) {
          commandSent = true;
          client.raiseEvent(3, { requestId: "integration-toggle", entityId: "switch.heater", action: "toggle" }, { targetActors: [bridgeActor] });
        }
        if (heater?.state === "on") sawOnState = true;
      }
      if (actorNr === bridgeActor && code === 4 && content.requestId === "integration-toggle" && content.ok) commandOk = true;
      if (commandOk && sawOnState) {
        clearTimeout(timer); resolve(); client.disconnect();
      }
    };
    client.onError = (_code, message) => reject(new Error(message));
    client.onOperationResponse = (code, message) => { if (code) reject(new Error(`Photon operation ${code}: ${message}`)); };
  });
  client.connectToNameServer({ region: baseConfig.photonRegion || "eu" });
  await done;
}

try {
  await startFakeHa();
  const testConfig = { ...baseConfig, roomName, remotePassword: password, haWebSocketUrl: "ws://127.0.0.1:18123", haToken: "integration-token", adminPort: 18765 };
  fs.writeFileSync(configPath, JSON.stringify(testConfig, null, 2));
  fs.writeFileSync(exposedPath, JSON.stringify({ version: 1, entities: [{ entityId: "switch.heater", name: "Heater", writable: true }] }, null, 2));
  bridgeProcess = spawn(process.execPath, ["photon-bridge.mjs"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  await waitForOutput(bridgeProcess, "Local entity picker:");
  const status = await fetch("http://127.0.0.1:18765/api/status").then((response) => response.json());
  const entities = await fetch("http://127.0.0.1:18765/api/entities").then((response) => response.json());
  if (!status.haConnected || entities.length !== 2) throw new Error("Admin discovery test failed");
  await photonRemoteTest();
  if (calls.length !== 1 || calls[0].domain !== "switch" || calls[0].service !== "toggle") throw new Error("HA service routing test failed");
  console.log("INTEGRATION_OK: HA discovery, admin API, Photon auth, command routing, and confirmed state sync.");
} finally {
  bridgeProcess?.kill();
  await new Promise((resolve) => wss?.close(resolve));
  fs.writeFileSync(configPath, originalConfig);
  fs.writeFileSync(exposedPath, originalExposed);
}
