const EVENT = Object.freeze({ AUTH_REQUEST: 1, AUTH_RESULT: 2, COMMAND_REQUEST: 3, COMMAND_RESULT: 4, SNAPSHOT: 5, BRIDGE_HELLO: 6 });
const connection = window.PHOTON_HA_CONFIG || {};
const study = window.PHOTON_HA_STUDY_CONFIG;
const REMEMBERED_KEY = "photon-ha-remote-access-key";

if (!study) throw new Error("Study configuration is missing.");

const dom = {
  loginPanel: document.querySelector("#login-panel"), loginForm: document.querySelector("#login-form"),
  password: document.querySelector("#password"), remember: document.querySelector("#remember-device"),
  loginError: document.querySelector("#login-error"), panel: document.querySelector("#study-panel"),
  devices: document.querySelector("#study-devices"), disconnect: document.querySelector("#disconnect"),
  pill: document.querySelector("#connection-pill"), detail: document.querySelector("#connection-detail"),
  canvas: document.querySelector("#study-canvas"),
};

let client;
let bridgeActor = null;
let authenticated = false;
let snapshot = null;
const pending = new Map();
const liveEntities = new Map();
const previewMode = new URLSearchParams(location.search).has("preview");

dom.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  dom.loginError.textContent = "";
  try {
    setConnection("connecting", "Connecting to the house…");
    const passwordHash = await hash(dom.password.value);
    await connect(passwordHash);
    setRememberedCredential(dom.remember.checked ? passwordHash : null);
    dom.password.value = "";
  } catch (error) {
    dom.loginError.textContent = error.message;
    setConnection("offline", "Connection failed");
  }
});

dom.disconnect.addEventListener("click", () => {
  client?.disconnect();
  setRememberedCredential(null);
  dom.remember.checked = false;
  authenticated = false;
  snapshot = null;
  liveEntities.clear();
  dom.panel.hidden = true;
  dom.loginPanel.hidden = false;
  setConnection("offline", "Disconnected");
  renderDeviceCards();
});

async function connect(passwordHash) {
  if (!connection.PHOTON_APP_ID) throw new Error("Photon App ID is not configured.");
  await loadPhoton(connection.PHOTON_SDK_URL || "vendor/photon.min.js");
  const Photon = window.Photon;
  const Client = Photon.LoadBalancing.LoadBalancingClient;
  const State = Client.State;
  let authRequested = false;
  client = new Client(Photon.ConnectionProtocol.Wss, connection.PHOTON_APP_ID, "photon-ha-1");
  client.setUserId(`study-${crypto.randomUUID()}`);
  client.setLogLevel(connection.DEBUG ? Photon.LogLevel.DEBUG : Photon.LogLevel.WARN);

  const result = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Connection timed out.")), 20000);
    const authenticateWith = (actorNr) => {
      if (authRequested || !actorNr) return;
      authRequested = true;
      bridgeActor = actorNr;
      setConnection("connecting", "Authenticating with the home bridge…");
      client.raiseEvent(EVENT.AUTH_REQUEST, { passwordHash }, { targetActors: [bridgeActor] });
    };
    const findBridge = () => client.myRoomActorsArray?.().find((actor) => actor.getCustomProperty?.("pha_role") === "bridge");
    client.onStateChange = (state) => {
      if (state === State.JoinedLobby) client.joinRoom(connection.ROOM_NAME, { createIfNotExists: false });
      if (state === State.Disconnected && !authenticated) {
        clearTimeout(timer);
        reject(new Error("The Home Assistant bridge is not currently available."));
      }
    };
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
        dom.panel.hidden = false;
        setConnection("online", "Connected · drag the room to look around");
        resizeCanvas();
        resolve();
        return;
      }
      if (actorNr !== bridgeActor) return;
      if (code === EVENT.SNAPSHOT) {
        snapshot = content;
        liveEntities.clear();
        for (const entity of content.entities || []) liveEntities.set(entity.entityId, entity);
        setConnection(content.haConnected ? "online" : "warning", content.haConnected ? "Study live from Home Assistant" : "Bridge online; Home Assistant unavailable");
        renderDeviceCards();
      }
      if (code === EVENT.COMMAND_RESULT) {
        pending.set(content.requestId, content);
        setTimeout(() => pending.delete(content.requestId), 3000);
      }
    };
    client.onError = (_code, message) => reject(new Error(message || "Photon error"));
    client.onOperationResponse = (code, message) => { if (code) reject(new Error(message || `Photon operation failed (${code})`)); };
  });
  client.connectToNameServer({ region: connection.PHOTON_REGION || "eu" });
  return result;
}

function renderDeviceCards() {
  dom.devices.innerHTML = study.devices.map((device) => {
    const entity = liveEntities.get(device.entityId);
    const active = isActive(entity);
    const available = Boolean(entity?.available);
    const state = entity ? displayState(entity) : "Not shared";
    const icon = deviceIcon(device.type);
    const canToggle = available && entity.writable && entity.control?.type === "toggle";
    return `<button type="button" class="study-device${active ? " active" : ""}${available ? "" : " unavailable"}" data-entity="${escapeHtml(device.entityId)}" ${canToggle ? "" : "disabled"}>
      <span class="study-device-icon" aria-hidden="true">${icon}</span>
      <span><strong>${escapeHtml(device.name)}</strong><small>${escapeHtml(device.type.replaceAll("-", " "))}</small></span>
      <span class="device-state">${escapeHtml(state)}</span>
    </button>`;
  }).join("");
  dom.devices.querySelectorAll("button:not([disabled])").forEach((button) => button.addEventListener("click", () => sendCommand(button.dataset.entity, "toggle")));
}

function sendCommand(entityId, action) {
  if (!authenticated || !bridgeActor) return;
  const requestId = crypto.randomUUID();
  pending.set(requestId, { requestId });
  client.raiseEvent(EVENT.COMMAND_REQUEST, { requestId, entityId, action }, { targetActors: [bridgeActor] });
}

function isActive(entity) { return entity?.available && ["on", "open", "detected", "heat"].includes(String(entity.state).toLowerCase()); }
function displayState(entity) {
  if (!entity?.available) return "Unavailable";
  if (entity.state === "on") return "On";
  if (entity.state === "off") return "Off";
  return `${entity.state}${entity.unit ? ` ${entity.unit}` : ""}`;
}
function deviceIcon(type) {
  if (type.includes("light") || type.includes("track") || type.includes("lamp")) return "✦";
  if (type === "temperature") return "°";
  if (type === "heater") return "♨";
  if (type === "screen") return "▣";
  if (type === "presence") return "◎";
  if (type === "leak") return "◒";
  if (type === "door-sensor") return "▥";
  return "◆";
}

// Lightweight canvas renderer: true 3D coordinates with an orbiting orthographic camera.
const ctx = dom.canvas.getContext("2d");
const camera = { ...study.room.camera };
let pixelRatio = 1;
let dragging = false;
let dragPoint = null;
const pointers = new Map();
let pinchDistance = null;

function resizeCanvas() {
  const rect = dom.canvas.getBoundingClientRect();
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  dom.canvas.width = Math.max(1, Math.round(rect.width * pixelRatio));
  dom.canvas.height = Math.max(1, Math.round(rect.height * pixelRatio));
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function project(point) {
  const room = study.room;
  const x = point[0] - room.width / 2;
  const y = point[1] - room.height * 0.42;
  const z = point[2] - room.depth / 2;
  const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw);
  const cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch);
  const rx = x * cy - z * sy;
  const rz = x * sy + z * cy;
  const ry = y * cp - rz * sp;
  const depth = y * sp + rz * cp;
  const rect = dom.canvas.getBoundingClientRect();
  const scale = Math.min(rect.width / 11, rect.height / 6.8) * camera.zoom;
  return { x: rect.width / 2 + rx * scale, y: rect.height * 0.5 - ry * scale, depth, scale };
}

function polygon(points, fill, stroke = null, alpha = 1) {
  const projected = points.map(project);
  ctx.save(); ctx.globalAlpha = alpha; ctx.beginPath(); ctx.moveTo(projected[0].x, projected[0].y);
  for (let i = 1; i < projected.length; i++) ctx.lineTo(projected[i].x, projected[i].y);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  ctx.restore();
}

function line3(points, color, width = 2, alpha = 1) {
  const projected = points.map(project);
  ctx.save(); ctx.globalAlpha = alpha; ctx.beginPath(); ctx.moveTo(projected[0].x, projected[0].y);
  for (let i = 1; i < projected.length; i++) ctx.lineTo(projected[i].x, projected[i].y);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = "round"; ctx.stroke(); ctx.restore();
}

function rotateXZ(point, center, angle) {
  const dx = point[0] - center[0], dz = point[2] - center[2], c = Math.cos(angle || 0), s = Math.sin(angle || 0);
  return [center[0] + dx * c - dz * s, point[1], center[2] + dx * s + dz * c];
}

function box(position, size, color, rotation = 0, edge = "rgba(10,20,30,.35)") {
  const [cx, cy, cz] = position, [sx, sy, sz] = size;
  const raw = [
    [cx-sx/2,cy-sy/2,cz-sz/2],[cx+sx/2,cy-sy/2,cz-sz/2],[cx+sx/2,cy-sy/2,cz+sz/2],[cx-sx/2,cy-sy/2,cz+sz/2],
    [cx-sx/2,cy+sy/2,cz-sz/2],[cx+sx/2,cy+sy/2,cz-sz/2],[cx+sx/2,cy+sy/2,cz+sz/2],[cx-sx/2,cy+sy/2,cz+sz/2],
  ].map((p) => rotateXZ(p, position, rotation));
  const faces = [[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]]
    .map((indices, i) => ({ points: indices.map((index) => raw[index]), shade: i }))
    .sort((a,b) => averageDepth(b.points)-averageDepth(a.points));
  const shades = [shade(color,-18),shade(color,18),shade(color,-8),shade(color,-14),shade(color,-22),shade(color,-4)];
  for (const face of faces) polygon(face.points, shades[face.shade], edge);
}

function averageDepth(points) { return points.reduce((sum, point) => sum + project(point).depth, 0) / points.length; }
function shade(hex, amount) {
  const value = parseInt(hex.replace("#", ""), 16), clamp = (n) => Math.max(0, Math.min(255, n));
  return `rgb(${clamp((value>>16)+amount)},${clamp(((value>>8)&255)+amount)},${clamp((value&255)+amount)})`;
}

function drawRoom() {
  const r = study.room;
  polygon([[0,0,0],[r.width,0,0],[r.width,0,r.depth],[0,0,r.depth]], r.floorColor, "#8b735c");
  for (let x=0; x<=r.width; x+=.5) line3([[x,.006,0],[x,.006,r.depth]], "rgba(224,202,177,.12)", .7);
  polygon([[0,0,0],[r.width,0,0],[r.width,r.height,0],[0,r.height,0]], r.wallColor, "#c6cdcd", .9);
  polygon([[0,0,0],[0,0,r.depth],[0,r.height,r.depth],[0,r.height,0]], shade(r.wallColor,-12), "#c6cdcd", .92);
  polygon([[r.width,0,0],[r.width,0,r.depth],[r.width,r.height,r.depth],[r.width,r.height,0]], shade(r.wallColor,-20), "#c6cdcd", .86);
  drawOpenings();
}

function drawOpenings() {
  for (const opening of study.room.openings) {
    const bottom = opening.sill || 0;
    if (opening.wall === "back") {
      const x1=opening.center-opening.width/2, x2=opening.center+opening.width/2, z=-.012;
      const color = opening.type.includes("door") ? "#26333d" : "#78b7d1";
      polygon([[x1,bottom,z],[x2,bottom,z],[x2,bottom+opening.height,z],[x1,bottom+opening.height,z]], color, "#d0e3e8", .88);
      if (opening.type === "double-door") line3([[opening.center,bottom,z-.01],[opening.center,bottom+opening.height,z-.01]], "#a6b3ba", 1.2);
      else { line3([[x1,bottom+opening.height/2,z-.01],[x2,bottom+opening.height/2,z-.01]], "rgba(230,250,255,.7)", 1); line3([[opening.center,bottom,z-.01],[opening.center,bottom+opening.height,z-.01]], "rgba(230,250,255,.7)", 1); }
    } else {
      const z1=opening.center-opening.width/2, z2=opening.center+opening.width/2, x=-.012;
      polygon([[x,bottom,z1],[x,bottom,z2],[x,bottom+opening.height,z2],[x,bottom+opening.height,z1]], "#78b7d1", "#d0e3e8", .85);
    }
  }
}

function drawFurniture() {
  for (const item of study.furniture) {
    const on = isActive(liveEntities.get(item.entityId));
    if (item.type === "rug") { box(item.position,item.size,item.color,item.rotation); continue; }
    if (item.type === "desk") {
      box(item.position,item.size,item.color,item.rotation);
      if (item.legs) for (const dx of [-.62,.62]) for (const dz of [-.2,.2]) box([item.position[0]+dx,.36,item.position[2]+dz],[.06,.72,.06],"#34251e");
      continue;
    }
    if (item.type === "screen") {
      box(item.position,item.size,on ? "#1c8ccb" : item.color,item.rotation);
      if (on) drawPointGlow(item.position,"rgba(65,183,255,.55)",1.25);
      continue;
    }
    box(item.position,item.size,item.color,item.rotation);
    if (item.type === "sofa" || item.type === "sectional") {
      box([item.position[0],item.position[1]+.45,item.position[2]+item.size[2]*.36],[item.size[0],.58,.18],shade(item.color,-7),item.rotation);
    }
  }
}

function drawDeviceEffects(time) {
  for (const device of study.devices) {
    const entity = liveEntities.get(device.entityId), active = isActive(entity);
    if (device.type === "gu10-track") drawGu10Track(device, active);
    if (device.type === "floor-lamp") drawFloorLamp(device, active);
    if (device.type === "led-strip") drawLedStrip(device, active, time);
    if (device.type === "wall-light") drawWallLight(device, active);
    if (device.type === "heater") drawHeater(device, active, time);
    if (device.type === "presence" && active) drawPulse(device.position,"#55dcff",time);
    if (device.type === "leak") { drawSensor(device.position, active ? "#ff425f" : "#67dafa"); if (active) drawPulse(device.position,"#ff425f",time); }
    if (device.type === "temperature") drawTemperature(device, entity);
    if (["door-sensor","socket","equipment"].includes(device.type)) drawSensor(device.position, active ? "#58e5a4" : "#71879d");
  }
}

function drawGu10Track(device, active) {
  const angle=device.rotation||0, c=Math.cos(angle),s=Math.sin(angle), [x,y,z]=device.position;
  const along=(offset,height=y)=>[x+offset*c,height,z+offset*s];
  line3([along(-.55),along(.55)],"#26313d",7);
  for (const offset of [-.43,0,.43]) {
    const lamp=along(offset,y-.06), floor=along(offset,0.02);
    if (active) {
      polygon([[lamp[0]-.07,lamp[1],lamp[2]-.07],[lamp[0]+.07,lamp[1],lamp[2]+.07],[floor[0]+.62,0.02,floor[2]+.62],[floor[0]-.62,0.02,floor[2]-.62]],"#ffe3a1",null,.095);
      drawFloorGlow(floor,"rgba(255,210,118,.48)",.92);
    }
    box(lamp,[.12,.1,.12],active?"#ffe0a0":"#40505e",angle);
  }
}

function drawFloorLamp(device, active) {
  const [x,,z]=device.position;
  line3([[x,0,z],[x,1.35,z]],"#3f4b55",4);
  box([x,1.38,z],[.42,.32,.42],active?"#f5d99d":"#59636b",0);
  if (active) { drawFloorGlow([x,0.02,z],"rgba(255,202,107,.48)",1.4); drawPointGlow([x,1.38,z],"rgba(255,211,128,.5)",.75); }
}

function drawLedStrip(device, active, time) {
  const [x,y,z]=device.position, width=device.size?.[0]||1.7;
  const hue=(time/35)%360, color=active?`hsl(${hue} 92% 66%)`:"#374859";
  line3([[x-width/2,y,z],[x+width/2,y,z]],color,active?7:3,active?.95:.75);
  if(active) drawPointGlow([x,y,z],`hsla(${hue} 95% 62% / .45)`,1.5);
}

function drawWallLight(device, active) { box(device.position,[.22,.38,.18],active?"#ffe0a0":"#495967"); if(active) drawPointGlow(device.position,"rgba(255,213,127,.5)",1.05); }
function drawHeater(device, active, time) {
  const [x,,z]=device.position; box([x,.28,z],[.68,.56,.18],active?"#9e5435":"#4d5a62");
  if(!active)return;
  for(let i=-1;i<=1;i++){const phase=time/270+i; line3([[x+i*.16,.62,z],[x+i*.13+Math.sin(phase)*.04,.85,z],[x+i*.16+Math.sin(phase+1)*.05,1.08,z]],"#ff9c5e",2,.65);}
}

function drawSensor(position,color){const p=project(position);ctx.save();ctx.beginPath();ctx.arc(p.x,p.y,5,0,Math.PI*2);ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=10;ctx.fill();ctx.restore();}
function drawPulse(position,color,time){const p=project(position),radius=8+(time/40)%18;ctx.save();ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.strokeStyle=color;ctx.globalAlpha=1-(radius-8)/20;ctx.lineWidth=2;ctx.stroke();ctx.restore();}
function drawTemperature(device,entity){const p=project(device.position);const text=entity?.available?`${entity.state}${entity.unit||"°"}`:"—";ctx.save();ctx.fillStyle="rgba(5,16,28,.82)";ctx.strokeStyle="#4d7898";ctx.lineWidth=1;roundRect(p.x-25,p.y-13,50,26,9);ctx.fill();ctx.stroke();ctx.fillStyle="#eaf5ff";ctx.font="700 11px system-ui";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(text,p.x,p.y);ctx.restore();}
function roundRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function drawFloorGlow(position,color,radius){const p=project(position),r=radius*p.scale;const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r);g.addColorStop(0,color);g.addColorStop(1,"rgba(255,210,120,0)");ctx.save();ctx.globalCompositeOperation="screen";ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(p.x,p.y,r,r*.42,0,0,Math.PI*2);ctx.fill();ctx.restore();}
function drawPointGlow(position,color,radius){const p=project(position),r=radius*p.scale;const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r);g.addColorStop(0,color);g.addColorStop(1,"rgba(50,150,255,0)");ctx.save();ctx.globalCompositeOperation="screen";ctx.fillStyle=g;ctx.fillRect(p.x-r,p.y-r,r*2,r*2);ctx.restore();}

function renderScene(time=0) {
  const rect=dom.canvas.getBoundingClientRect();ctx.clearRect(0,0,rect.width,rect.height);
  const sky=ctx.createLinearGradient(0,0,0,rect.height);sky.addColorStop(0,"#172f44");sky.addColorStop(1,"#08131f");ctx.fillStyle=sky;ctx.fillRect(0,0,rect.width,rect.height);
  drawRoom();drawDeviceEffects(time);drawFurniture();
  requestAnimationFrame(renderScene);
}

dom.canvas.addEventListener("pointerdown",(event)=>{dom.canvas.setPointerCapture(event.pointerId);pointers.set(event.pointerId,[event.clientX,event.clientY]);dragging=true;dragPoint=[event.clientX,event.clientY];});
dom.canvas.addEventListener("pointermove",(event)=>{
  if(!pointers.has(event.pointerId))return;pointers.set(event.pointerId,[event.clientX,event.clientY]);
  if(pointers.size===2){const pts=[...pointers.values()],distance=Math.hypot(pts[0][0]-pts[1][0],pts[0][1]-pts[1][1]);if(pinchDistance)camera.zoom=Math.max(.62,Math.min(1.7,camera.zoom*distance/pinchDistance));pinchDistance=distance;return;}
  if(!dragging||!dragPoint)return;const dx=event.clientX-dragPoint[0],dy=event.clientY-dragPoint[1];camera.yaw+=dx*.008;camera.pitch=Math.max(.18,Math.min(1.05,camera.pitch+dy*.006));dragPoint=[event.clientX,event.clientY];
});
const endPointer=(event)=>{pointers.delete(event.pointerId);dragging=pointers.size>0;dragPoint=pointers.size?[...pointers.values()][0]:null;pinchDistance=null;};
dom.canvas.addEventListener("pointerup",endPointer);dom.canvas.addEventListener("pointercancel",endPointer);
dom.canvas.addEventListener("wheel",(event)=>{event.preventDefault();camera.zoom=Math.max(.62,Math.min(1.7,camera.zoom*(event.deltaY>0?.92:1.08)));},{passive:false});
document.querySelectorAll("[data-camera]").forEach((button)=>button.addEventListener("click",()=>{if(button.dataset.camera==="left")camera.yaw-=.22;if(button.dataset.camera==="right")camera.yaw+=.22;if(button.dataset.camera==="home")Object.assign(camera,study.room.camera);}));
new ResizeObserver(resizeCanvas).observe(dom.canvas);

function setConnection(kind, detail) { dom.pill.className=`status ${kind}`;dom.pill.textContent=kind==="online"?"Online":kind==="connecting"?"Connecting":kind==="warning"?"Limited":"Offline";dom.detail.textContent=detail; }
function setRememberedCredential(value){try{if(value)localStorage.setItem(REMEMBERED_KEY,value);else localStorage.removeItem(REMEMBERED_KEY);}catch(_error){}}
function getRememberedCredential(){try{return localStorage.getItem(REMEMBERED_KEY);}catch(_error){return null;}}
async function hash(value){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return[...new Uint8Array(bytes)].map((byte)=>byte.toString(16).padStart(2,"0")).join("");}
async function loadPhoton(url){if(window.Photon?.LoadBalancing)return;await new Promise((resolve,reject)=>{const script=document.createElement("script");script.src=url;script.onload=resolve;script.onerror=()=>reject(new Error("Could not load the Photon SDK."));document.head.appendChild(script);});}
function escapeHtml(value){return String(value??"").replace(/[&<>'"]/g,(character)=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[character]));}

if (previewMode) {
  for (const device of study.devices) liveEntities.set(device.entityId, {
    entityId: device.entityId, state: ["gu10-track", "floor-lamp", "led-strip", "screen", "heater", "presence"].includes(device.type) ? "on" : "off",
    available: true, writable: false, unit: device.type === "temperature" ? "°C" : "", control: { type: "read_only" },
  });
  liveEntities.get("sensor.study_door_device_temperature").state = "21.4";
  dom.loginPanel.hidden = true; dom.panel.hidden = false;
  setConnection("warning", "Visual preview · live Home Assistant data is not connected");
}
renderDeviceCards();resizeCanvas();requestAnimationFrame(renderScene);
const rememberedCredential=previewMode ? null : getRememberedCredential();
if(rememberedCredential){dom.remember.checked=true;setConnection("connecting","Reconnecting to the home bridge…");connect(rememberedCredential).catch((error)=>{setRememberedCredential(null);dom.remember.checked=false;dom.loginError.textContent=`${error.message} Please enter the remote password again.`;setConnection("offline","Automatic connection failed");});}
