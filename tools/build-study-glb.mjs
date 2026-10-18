import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(here, "../models/study/study.glb");

const materials = [
  ["Wall", [0.578, 0.578, 0.539, 1], 0.95],
  ["Floor", [0.375, 0.267, 0.184, 1], 0.92],
  ["Lawn", [0.041, 0.278, 0.063, 1], 1],
  ["White", [0.82, 0.84, 0.82, 1], 0.75],
  ["DarkMetal", [0.035, 0.053, 0.067, 1], 0.36, 0.65],
  ["Glass", [0.12, 0.46, 0.62, 0.32], 0.15, 0.08, "BLEND"],
  ["Wood", [0.55, 0.25, 0.085, 1], 0.58],
  ["Grey", [0.43, 0.47, 0.49, 1], 0.72],
  ["Emerald", [0.006, 0.19, 0.125, 1], 0.9],
  ["Black", [0.008, 0.012, 0.017, 1], 0.55],
  ["Rug", [0.034, 0.064, 0.102, 1], 1],
  ["LED", [0.08, 0.01, 0.22, 1], 0.35, 0, "OPAQUE", [0.2, 0.02, 0.7]],
  ["Heater", [0.72, 0.75, 0.74, 1], 0.72],
];

const chunks = [];
let byteLength = 0;
const bufferViews = [];
const accessors = [];
const nodes = [];
const meshes = [];

function addBuffer(typed, target) {
  const padding = (4 - (byteLength % 4)) % 4;
  if (padding) { chunks.push(Buffer.alloc(padding)); byteLength += padding; }
  const data = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
  const index = bufferViews.length;
  bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: data.length, target });
  chunks.push(data); byteLength += data.length;
  return index;
}

function addAccessor(typed, target, componentType, type, count, min, max) {
  const accessor = { bufferView: addBuffer(typed, target), componentType, count, type };
  if (min) accessor.min = min;
  if (max) accessor.max = max;
  accessors.push(accessor);
  return accessors.length - 1;
}

const positions = new Float32Array([
  -.5,-.5,.5, .5,-.5,.5, .5,.5,.5, -.5,.5,.5,
  .5,-.5,-.5, -.5,-.5,-.5, -.5,.5,-.5, .5,.5,-.5,
  -.5,.5,.5, .5,.5,.5, .5,.5,-.5, -.5,.5,-.5,
  -.5,-.5,-.5, .5,-.5,-.5, .5,-.5,.5, -.5,-.5,.5,
  .5,-.5,.5, .5,-.5,-.5, .5,.5,-.5, .5,.5,.5,
  -.5,-.5,-.5, -.5,-.5,.5, -.5,.5,.5, -.5,.5,-.5,
]);
const normals = new Float32Array([
  0,0,1,0,0,1,0,0,1,0,0,1, 0,0,-1,0,0,-1,0,0,-1,0,0,-1,
  0,1,0,0,1,0,0,1,0,0,1,0, 0,-1,0,0,-1,0,0,-1,0,0,-1,0,
  1,0,0,1,0,0,1,0,0,1,0,0, -1,0,0,-1,0,0,-1,0,0,-1,0,0,
]);
const indices = new Uint16Array([
  0,1,2,0,2,3, 4,5,6,4,6,7, 8,9,10,8,10,11,
  12,13,14,12,14,15, 16,17,18,16,18,19, 20,21,22,20,22,23,
]);
const posAccessor = addAccessor(positions, 34962, 5126, "VEC3", 24, [-.5,-.5,-.5], [.5,.5,.5]);
const normalAccessor = addAccessor(normals, 34962, 5126, "VEC3", 24);
const indexAccessor = addAccessor(indices, 34963, 5123, "SCALAR", 36, [0], [23]);

for (let i = 0; i < materials.length; i++) {
  meshes.push({ name: `Cube_${materials[i][0]}`, primitives: [{ attributes: { POSITION: posAccessor, NORMAL: normalAccessor }, indices: indexAccessor, material: i }] });
}

const materialIndex = Object.fromEntries(materials.map((m, i) => [m[0], i]));
function addBox(name, position, scale, material, extras = {}) {
  nodes.push({ name, mesh: materialIndex[material], translation: position, scale, extras });
  return nodes.length - 1;
}
function addGroup(name, position, extras = {}) {
  nodes.push({ name, translation: position, extras, children: [] });
  return nodes.length - 1;
}
function addChildBox(parent, name, position, scale, material, extras = {}) {
  const child = addBox(name, position, scale, material, extras);
  nodes[parent].children.push(child);
  return child;
}

const width = 8, depth = 3.8, height = 2.55;
addBox("Architecture_Floor", [width/2,-.05,depth/2], [width,.1,depth], "Floor");
addBox("Outside_Lawn_Front", [width/2,-.11,-1.2], [width+4,.12,2.4], "Lawn");
addBox("Outside_Lawn_Left", [-1,-.11,depth/2], [2,.12,depth], "Lawn");
addBox("Outside_Lawn_Right", [width+1,-.11,depth/2], [2,.12,depth], "Lawn");

const openings = [
  { type:"double-door", wall:"back", center:1.6, width:1.31, height:2.08, sill:0 },
  { type:"window", wall:"back", center:6.4, width:1.71, height:.55, sill:1.37 },
  { type:"window", wall:"left", center:1, width:.6, height:1.05, sill:.82 },
];
function segmentedWall(wallName, length) {
  const list = openings.filter(o => o.wall === wallName);
  const hs = [0,length], vs = [0,height];
  for (const o of list) { hs.push(o.center-o.width/2,o.center+o.width/2); vs.push(o.sill,o.sill+o.height); }
  hs.sort((a,b)=>a-b); vs.sort((a,b)=>a-b);
  for (let i=0;i<hs.length-1;i++) for (let j=0;j<vs.length-1;j++) {
    const a=hs[i],b=hs[i+1],c=vs[j],d=vs[j+1],mx=(a+b)/2,my=(c+d)/2;
    if (b-a<.005||d-c<.005||list.some(o=>mx>o.center-o.width/2&&mx<o.center+o.width/2&&my>o.sill&&my<o.sill+o.height)) continue;
    if (wallName === "back") addBox(`Architecture_Wall_Back_${i}_${j}`,[mx,my,-.06],[b-a,d-c,.12],"Wall");
    else addBox(`Architecture_Wall_Left_${i}_${j}`,[-.06,my,mx],[.12,d-c,b-a],"Wall");
  }
}
segmentedWall("back",width); segmentedWall("left",depth);
addBox("Architecture_Wall_Right",[width+.06,height/2,depth/2],[.12,height,depth],"Wall");

function addWindow(o, prefix) {
  const y=o.sill+o.height/2,t=.075;
  if (o.wall === "back") {
    addBox(`${prefix}_Frame_Bottom`,[o.center,o.sill-t/2,-.06],[o.width+.16,t,.2],"White");
    addBox(`${prefix}_Frame_Top`,[o.center,o.sill+o.height+t/2,-.06],[o.width+.16,t,.2],"White");
    addBox(`${prefix}_Frame_Left`,[o.center-o.width/2-t/2,y,-.06],[t,o.height,.2],"White");
    addBox(`${prefix}_Frame_Right`,[o.center+o.width/2+t/2,y,-.06],[t,o.height,.2],"White");
    addBox(`${prefix}_Glass`,[o.center,y,-.06],[o.width,o.height,.025],"Glass");
  } else {
    addBox(`${prefix}_Frame_Bottom`,[-.06,o.sill-t/2,o.center],[.2,t,o.width+.16],"White");
    addBox(`${prefix}_Frame_Top`,[-.06,o.sill+o.height+t/2,o.center],[.2,t,o.width+.16],"White");
    addBox(`${prefix}_Frame_Left`,[-.06,y,o.center-o.width/2-t/2],[.2,o.height,t],"White");
    addBox(`${prefix}_Frame_Right`,[-.06,y,o.center+o.width/2+t/2],[.2,o.height,t],"White");
    addBox(`${prefix}_Glass`,[-.06,y,o.center],[.025,o.height,o.width],"Glass");
  }
}
addWindow(openings[1],"Window_Back"); addWindow(openings[2],"Window_Left");

const door = openings[0], leaf=door.width/2, frame="DarkMetal";
addBox("Door_Frame_Left",[door.center-door.width/2,door.height/2,-.06],[.09,door.height+.11,.2],frame);
addBox("Door_Frame_Right",[door.center+door.width/2,door.height/2,-.06],[.09,door.height+.11,.2],frame);
addBox("Door_Frame_Top",[door.center,door.height+.045,-.06],[door.width+.18,.09,.2],frame);
const leftDoor=addGroup("Entity_StudyDoor_Left",[door.center-door.width/2,0,.02],{entityId:"binary_sensor.study_door_contact",replaceable:false});
addChildBox(leftDoor,"StudyDoor_Left_Glass",[leaf/2,door.height/2,0],[leaf-.14,door.height-.18,.025],"Glass");
addChildBox(leftDoor,"StudyDoor_Left_Rail",[leaf/2,.055,0],[leaf,.07,.07],frame);
addChildBox(leftDoor,"StudyDoor_Left_Stile",[leaf-.035,door.height/2,0],[.07,door.height,.07],frame);
const rightDoor=addGroup("StudyDoor_Right",[door.center+door.width/2,0,.02]);
addChildBox(rightDoor,"StudyDoor_Right_Glass",[-leaf/2,door.height/2,0],[leaf-.14,door.height-.18,.025],"Glass");
addChildBox(rightDoor,"StudyDoor_Right_Rail",[-leaf/2,.055,0],[leaf,.07,.07],frame);

addBox("Furniture_Rug_REPLACEABLE",[4.25,.015,2.15],[3.5,.03,1.75],"Rug",{replaceable:true});
addBox("Furniture_WindowTable_Top_REPLACEABLE",[6.4,.74,.42],[1.65,.09,.5],"Grey",{replaceable:true});
for (const x of [5.72,7.08]) for (const z of [.24,.6]) addBox(`Furniture_WindowTable_Leg_${x}_${z}`,[x,.35,z],[.052,.7,.052],"DarkMetal");

addBox("Furniture_MainDesk_Top_REPLACEABLE",[6.72,.76,2.05],[2.15,.09,.82],"Wood",{replaceable:true});
addBox("Furniture_MainDesk_Return",[7.545,.76,2.62],[.5,.09,1.15],"Wood");
for (const x of [5.9,7.54]) addBox(`Furniture_MainDesk_Leg_${x}`,[x,.38,2.05],[.075,.72,.075],"Grey");
for (const z of [2.35,2.95]) addBox(`Furniture_MainDesk_ReturnLeg_${z}`,[7.545,.38,z],[.075,.72,.075],"Grey");

addBox("Furniture_OfficeChair_Seat_REPLACEABLE",[6.72,.48,3.22],[.62,.18,.62],"Grey",{replaceable:true});
addBox("Furniture_OfficeChair_Back",[6.72,.88,3.48],[.56,.7,.16],"Grey");
addBox("Furniture_OfficeChair_Stem",[6.72,.23,3.22],[.08,.5,.08],"DarkMetal");

const sofa=addGroup("Furniture_Sofa_REPLACEABLE",[1.5,0,2.72],{replaceable:true,source:"placeholder"});
const sofaAngle=-3.927;nodes[sofa].rotation=[0,Math.sin(sofaAngle/2),0,Math.cos(sofaAngle/2)];
addChildBox(sofa,"Furniture_Sofa_Base",[0,.36,0],[1.82,.72,.78],"Emerald");
addChildBox(sofa,"Furniture_Sofa_Back",[0,.79,.26],[1.72,.7,.22],"Emerald");
addChildBox(sofa,"Furniture_Sofa_Arm_Left",[-.86,.58,0],[.2,.64,.78],"Emerald");
addChildBox(sofa,"Furniture_Sofa_Arm_Right",[.86,.58,0],[.2,.64,.78],"Emerald");

addBox("Entity_Screen_Frame",[4,1.35,.08],[1.18,.76,.055],"Black",{entityId:"switch.screen"});
addBox("Entity_Screen_Surface",[4,1.35,.12],[1.1,.68,.02],"Black",{entityId:"switch.screen"});
for (const x of [6.42,7.02]) {
  addBox(`Entity_Monitor_Frame_${x}`,[x,1.17,1.78],[.56,.38,.055],"Black",{entityId:"switch.office_standard"});
  addBox(`Entity_Monitor_Surface_${x}`,[x,1.17,1.74],[.5,.32,.018],"Black",{entityId:"switch.office_standard"});
  addBox(`Furniture_Monitor_Stand_${x}`,[x,.98,1.78],[.035,.2,.035],"DarkMetal");
}

for(let i=-4;i<=4;i++) addBox(`Entity_Heater_Fin_${i}`,[3.8+i*.075,.43,1.8],[.052,.72,.3],"Heater",{entityId:"switch.heater"});
addBox("Entity_LEDStrip",[4,2.48,.04],[7.8,.045,.05],"LED",{entityId:"light.rgb_strip_lights"});
for (const [x,name] of [[2.4,"Left"],[5.6,"Right"]]) addBox(`Entity_CeilingTrack_${name}`,[x,2.5,1.65],[.1,.055,1.3],"DarkMetal",{entityId:`light.office_light_switch_l${name==="Left"?1:2}`});

const gltfMaterials = materials.map(([name,color,roughness,metallic=0,alphaMode="OPAQUE",emissive]) => ({
  name, pbrMetallicRoughness:{baseColorFactor:color,metallicFactor:metallic,roughnessFactor:roughness},
  ...(alphaMode!=="OPAQUE"?{alphaMode,doubleSided:true}:{}), ...(emissive?{emissiveFactor:emissive}:{}),
}));
const rootNodes = nodes.map((_,i)=>i).filter(i=>!nodes.some(n=>n.children?.includes(i)));
const gltf = { asset:{version:"2.0",generator:"Sarcastic Hedgehog Study GLB builder"}, scene:0, scenes:[{name:"The Study",nodes:rootNodes}], nodes, meshes, materials:gltfMaterials, accessors, bufferViews, buffers:[{byteLength}], extras:{units:"metres",axes:"Y up; X left/right; Z back/front",source:"study-config.js"} };

const json = Buffer.from(JSON.stringify(gltf));
const jsonPad = (4-json.length%4)%4;
const jsonChunk = Buffer.concat([json,Buffer.alloc(jsonPad,0x20)]);
const bin = Buffer.concat(chunks);
const binPad = (4-bin.length%4)%4;
const binChunk = Buffer.concat([bin,Buffer.alloc(binPad)]);
const total = 12+8+jsonChunk.length+8+binChunk.length;
const header=Buffer.alloc(12);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(total,8);
const jh=Buffer.alloc(8);jh.writeUInt32LE(jsonChunk.length,0);jh.writeUInt32LE(0x4e4f534a,4);
const bh=Buffer.alloc(8);bh.writeUInt32LE(binChunk.length,0);bh.writeUInt32LE(0x004e4942,4);
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,Buffer.concat([header,jh,jsonChunk,bh,binChunk]));
console.log(`Wrote ${output} (${total} bytes, ${nodes.length} named objects)`);
