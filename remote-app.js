const EVENT = Object.freeze({ AUTH_REQUEST: 1, AUTH_RESULT: 2, COMMAND_REQUEST: 3, COMMAND_RESULT: 4, SNAPSHOT: 5, BRIDGE_HELLO: 6 });
const config = window.PHOTON_HA_CONFIG || {};
const dom = {
  loginPanel: document.querySelector("#login-panel"),
  loginForm: document.querySelector("#login-form"),
  password: document.querySelector("#password"),
  loginError: document.querySelector("#login-error"),
  remotePanel: document.querySelector("#remote-panel"),
  groups: document.querySelector("#entity-groups"),
  search: document.querySelector("#entity-search"),
  disconnect: document.querySelector("#disconnect"),
  pill: document.querySelector("#connection-pill"),
  detail: document.querySelector("#connection-detail"),
};

let client;
let bridgeActor = null;
let authenticated = false;
let snapshot = null;
const pending = new Map();

dom.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  dom.loginError.textContent = "";
  try {
    setConnection("connecting", "Connecting to Photon…");
    await connect(dom.password.value);
  } catch (error) {
    dom.loginError.textContent = error.message;
    setConnection("offline", "Connection failed");
  }
});
dom.search.addEventListener("input", render);
dom.disconnect.addEventListener("click", () => {
  client?.disconnect();
  authenticated = false;
  snapshot = null;
  dom.remotePanel.hidden = true;
  dom.loginPanel.hidden = false;
  setConnection("offline", "Disconnected");
});

async function connect(password) {
  if (!config.PHOTON_APP_ID) throw new Error("Photon App ID is not configured.");
  await loadPhoton(config.PHOTON_SDK_URL || "vendor/photon.min.js");
  const Photon = window.Photon;
  const Client = Photon.LoadBalancing.LoadBalancingClient;
  const State = Client.State;
  const passwordHash = await hash(password);
  let authRequested = false;
  client = new Client(Photon.ConnectionProtocol.Wss, config.PHOTON_APP_ID, "photon-ha-1");
  client.setUserId(`remote-${crypto.randomUUID()}`);
  client.setLogLevel(config.DEBUG ? Photon.LogLevel.DEBUG : Photon.LogLevel.WARN);

  const result = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Connection timed out.")), 20000);
    client.onStateChange = (state) => {
      if (state === State.JoinedLobby) {
        client.joinRoom(config.ROOM_NAME, { createIfNotExists: false });
      }
      if (state === State.Disconnected && !authenticated) {
        clearTimeout(timer);
        reject(new Error("The Home Assistant bridge is not currently available."));
      }
    };
    const authenticateWith = (actorNr) => {
      if (authRequested || !actorNr) return;
      authRequested = true;
      bridgeActor = actorNr;
      setConnection("connecting", "Authenticating with the home bridge…");
      client.raiseEvent(EVENT.AUTH_REQUEST, { passwordHash }, {
        targetActors: [bridgeActor],
      });
    };
    const findBridge = () => client.myRoomActorsArray?.().find((actor) => actor.getCustomProperty?.("pha_role") === "bridge");
    client.onJoinRoom = () => {
      const bridge = findBridge();
      if (bridge) authenticateWith(bridge.actorNr);
      else setConnection("connecting", "Waiting for the home bridge…");
    };
    client.onActorPropertiesChange = (actor) => {
      if (actor.getCustomProperty?.("pha_role") === "bridge") authenticateWith(actor.actorNr);
    };
    client.onEvent = (code, content, actorNr) => {
      if (code === EVENT.BRIDGE_HELLO) {
        const actor = client.myRoomActors?.()[actorNr];
        if (actor?.getCustomProperty?.("pha_role") === "bridge") authenticateWith(actorNr);
        return;
      }
      if (code === EVENT.AUTH_RESULT) {
        if (actorNr !== bridgeActor) return;
        if (!content.ok) {
          clearTimeout(timer);
          reject(new Error(content.message || "Authentication failed."));
          client.leaveRoom();
          return;
        }
        authenticated = true;
        bridgeActor = content.bridgeActor || actorNr;
        clearTimeout(timer);
        dom.loginPanel.hidden = true;
        dom.remotePanel.hidden = false;
        setConnection("online", "Connected to the Home Assistant bridge");
        resolve();
        return;
      }
      if (actorNr !== bridgeActor) return;
      if (code === EVENT.SNAPSHOT) {
        snapshot = content;
        setConnection(content.haConnected ? "online" : "warning", content.haConnected ? "Home Assistant is online" : "Bridge online; Home Assistant unavailable");
        render();
      }
      if (code === EVENT.COMMAND_RESULT) {
        pending.set(content.requestId, content);
        render();
        setTimeout(() => { pending.delete(content.requestId); render(); }, 3500);
      }
    };
    client.onError = (_code, message) => reject(new Error(message || "Photon error"));
    client.onOperationResponse = (code, message) => { if (code) reject(new Error(message || `Photon operation failed (${code})`)); };
  });
  client.connectToNameServer({ region: config.PHOTON_REGION || "eu" });
  return result;
}

function render() {
  if (!snapshot) {
    dom.groups.innerHTML = '<div class="panel empty">Waiting for the first Home Assistant state…</div>';
    return;
  }
  const query = dom.search.value.trim().toLowerCase();
  const entities = snapshot.entities.filter((entity) => `${entity.name} ${entity.entityId} ${entity.areaName}`.toLowerCase().includes(query));
  const groups = Map.groupBy ? Map.groupBy(entities, (entity) => entity.areaName || "Home") : groupBy(entities);
  dom.groups.innerHTML = [...groups.entries()].map(([area, items]) => `
    <section class="entity-section">
      <div class="section-heading"><h2>${escapeHtml(area)}</h2><span>${items.length}</span></div>
      <div class="entity-grid">${items.map(entityCard).join("")}</div>
    </section>`).join("") || '<div class="panel empty">No matching controls.</div>';
  dom.groups.querySelectorAll("[data-command]").forEach((button) => button.addEventListener("click", () => sendFromElement(button)));
  dom.groups.querySelectorAll("select[data-entity]").forEach((select) => select.addEventListener("change", () => sendCommand(select.dataset.entity, "select_option", select.value)));
  dom.groups.querySelectorAll("input[type=range][data-entity]").forEach((input) => input.addEventListener("change", () => sendCommand(input.dataset.entity, "set_value", input.value)));
}

function entityCard(entity) {
  const stateClass = entity.available ? "" : " unavailable";
  return `<article class="entity-card${stateClass}">
    <div class="entity-copy">
      <p class="entity-name">${escapeHtml(entity.name)}</p>
      <p class="entity-id">${escapeHtml(entity.entityId)}</p>
    </div>
    <div class="state-line"><strong>${escapeHtml(displayState(entity))}</strong>${entity.unit ? `<span>${escapeHtml(entity.unit)}</span>` : ""}</div>
    ${controlHtml(entity)}
  </article>`;
}

function controlHtml(entity) {
  if (!entity.writable || !entity.available || entity.control.type === "read_only") return '<span class="read-only">View only</span>';
  const data = `data-entity="${escapeHtml(entity.entityId)}"`;
  if (entity.control.type === "toggle") {
    const on = entity.state === "on";
    return `<button class="control-button ${on ? "on" : ""}" data-command="toggle" ${data}>${on ? "Turn off" : "Turn on"}</button>`;
  }
  if (entity.control.type === "button") return `<button class="control-button" data-command="press" ${data}>Run</button>`;
  if (entity.control.type === "number") return `<input type="range" ${data} min="${entity.control.min}" max="${entity.control.max}" step="${entity.control.step}" value="${Number(entity.state) || 0}">`;
  if (entity.control.type === "select") return `<select ${data}>${entity.control.options.map((option) => `<option ${option === entity.state ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select>`;
  if (entity.control.type === "cover") return `<div class="button-row"><button data-command="open_cover" ${data}>Open</button><button data-command="stop_cover" ${data}>Stop</button><button data-command="close_cover" ${data}>Close</button></div>`;
  if (entity.control.type === "lock") return `<div class="button-row"><button data-command="lock" ${data}>Lock</button><button class="danger" data-command="unlock" ${data}>Unlock</button></div>`;
  return '<span class="read-only">View only</span>';
}

function sendFromElement(element) { sendCommand(element.dataset.entity, element.dataset.command); }
function sendCommand(entityId, action, value) {
  if (!authenticated || !bridgeActor) return;
  const requestId = crypto.randomUUID();
  pending.set(requestId, { requestId, message: "Sending…" });
  client.raiseEvent(EVENT.COMMAND_REQUEST, { requestId, entityId, action, value }, { targetActors: [bridgeActor] });
  render();
}

function displayState(entity) {
  if (!entity.available) return "Unavailable";
  if (entity.state === "on") return "On";
  if (entity.state === "off") return "Off";
  return entity.state;
}
function setConnection(kind, detail) {
  dom.pill.className = `status ${kind}`;
  dom.pill.textContent = kind === "online" ? "Online" : kind === "connecting" ? "Connecting" : kind === "warning" ? "Limited" : "Offline";
  dom.detail.textContent = detail;
}
function groupBy(items) {
  const map = new Map();
  items.forEach((item) => { const key = item.areaName || "Home"; map.set(key, [...(map.get(key) || []), item]); });
  return map;
}
async function hash(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function loadPhoton(url) {
  if (window.Photon?.LoadBalancing) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script"); script.src = url; script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load the Photon SDK.")); document.head.appendChild(script);
  });
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}
