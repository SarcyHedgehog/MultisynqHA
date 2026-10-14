import * as THREE from "three";
import { GLTFLoader } from "./vendor/GLTFLoader.js";

export function createStudyScene(canvas, config) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1d2c);
  scene.fog = new THREE.Fog(0x0b1d2c, 15, 25);
  const camera = new THREE.PerspectiveCamera(39, 1, .05, 50);
  const target = new THREE.Vector3(config.room.width / 2, 1.05, config.room.depth / 2);
  const orbit = { yaw: config.room.camera.yaw, pitch: config.room.camera.pitch, radius: 10.6 };
  const visuals = new Map();
  const animated = [];
  const daylightSurfaces=[];
  const daylightLights=[];

  const hemisphere=new THREE.HemisphereLight(0xcbe4f4,0x4b3526,2.1);scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xfff0d1, 3.4);
  sun.position.set(3, 7, 6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left=-7;sun.shadow.camera.right=7;sun.shadow.camera.top=7;sun.shadow.camera.bottom=-7;scene.add(sun);

  const mat=(color,o={})=>new THREE.MeshStandardMaterial({color,roughness:o.roughness??.72,metalness:o.metalness??0,emissive:o.emissive??0x000000,emissiveIntensity:o.emissiveIntensity??0,side:o.side??THREE.FrontSide});
  const mesh=(parent,geometry,material,position=[0,0,0],rotation=[0,0,0],shadow=true)=>{const m=new THREE.Mesh(geometry,material);m.position.set(...position);m.rotation.set(...rotation);m.castShadow=shadow;m.receiveShadow=shadow;parent.add(m);return m;};
  const box=(parent,size,position,color,o={})=>mesh(parent,new THREE.BoxGeometry(...size),mat(color,o),position,o.rotation||[0,0,0],o.shadow!==false);
  const cylinder=(parent,rt,rb,h,n,position,color,o={})=>mesh(parent,new THREE.CylinderGeometry(rt,rb,h,n),mat(color,o),position,o.rotation||[0,0,0],o.shadow!==false);
  const rod=(parent,a,b,r,color,o={})=>{const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),d=vb.clone().sub(va);const m=cylinder(parent,r,r,d.length(),o.segments||12,va.clone().add(vb).multiplyScalar(.5).toArray(),color,o);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return m;};
  const bind=(id,setter)=>{if(!visuals.has(id))visuals.set(id,[]);visuals.get(id).push(setter);};

  function buildRoom(){
    const r=config.room;
    box(scene,[r.width,.1,r.depth],[r.width/2,-.05,r.depth/2],r.floorColor,{roughness:.92});
    const wall=mat(r.wallColor,{roughness:.95,side:THREE.DoubleSide});
    for(const [s,p] of [[[r.width,r.height,.12],[r.width/2,r.height/2,-.06]],[[.12,r.height,r.depth],[-.06,r.height/2,r.depth/2]],[[.12,r.height,r.depth],[r.width+.06,r.height/2,r.depth/2]]])mesh(scene,new THREE.BoxGeometry(...s),wall,p);
    box(scene,[r.width,.07,.1],[r.width/2,r.height-.035,.02],0xf1f1e9);box(scene,[.1,.07,r.depth],[.02,r.height-.035,r.depth/2],0xf1f1e9);box(scene,[.1,.07,r.depth],[r.width-.02,r.height-.035,r.depth/2],0xf1f1e9);
    for(let x=.25;x<r.width;x+=.5)box(scene,[.012,.008,r.depth],[x,.008,r.depth/2],0x85684f,{shadow:false});
    const glassMaterial=()=>new THREE.MeshStandardMaterial({color:0x5b9fb9,roughness:.18,metalness:.08,transparent:true,opacity:.48,emissive:0x173a4b,emissiveIntensity:.35,side:THREE.DoubleSide});
    const addDaylight=(position,color=0xb9e8ff)=>{const light=new THREE.PointLight(color,0,5.5,1.45);light.position.set(...position);scene.add(light);daylightLights.push(light);};
    const buildDoor=(o)=>{const y=o.height/2,leaf=o.width/2,frame=0x27343e;
      const makeLeaf=(hingeX,direction)=>{const g=new THREE.Group();g.position.set(hingeX,0,.02);scene.add(g);box(g,[leaf,.07,.07],[direction*leaf/2,.055,0],frame,{metalness:.35});box(g,[leaf,.07,.07],[direction*leaf/2,o.height-.055,0],frame,{metalness:.35});box(g,[.07,o.height,.07],[direction*.035,y,0],frame,{metalness:.35});box(g,[.07,o.height,.07],[direction*(leaf-.035),y,0],frame,{metalness:.35});const glass=mesh(g,new THREE.BoxGeometry(leaf-.14,o.height-.18,.025),glassMaterial(),[direction*leaf/2,y,0],[0,0,0],false);daylightSurfaces.push(glass.material);return g;};
      const left=makeLeaf(o.center-o.width/2,1);makeLeaf(o.center+o.width/2,-1);bind(config.devices.find(d=>d.type==="door-sensor")?.entityId,on=>{left.rotation.y=on?Math.PI*.42:0;});addDaylight([o.center,1.25,.5]);
    };
    for(const o of r.openings){const y=(o.sill||0)+o.height/2;if(o.type==="double-door"){buildDoor(o);continue;}const glass= o.wall==="back"?mesh(scene,new THREE.BoxGeometry(o.width,o.height,.025),glassMaterial(),[o.center,y,.018],[0,0,0],false):mesh(scene,new THREE.BoxGeometry(.025,o.height,o.width),glassMaterial(),[.018,y,o.center],[0,0,0],false);daylightSurfaces.push(glass.material);addDaylight(o.wall==="back"?[o.center,y,.45]:[.45,y,o.center]);}
  }

  function buildDesk(item){
    const g=new THREE.Group();g.position.set(...item.position);g.rotation.y=item.rotation||0;scene.add(g);const w=item.size[0],d=item.size[2],s=new THREE.Shape();
    s.moveTo(-w/2,-d/2);s.lineTo(w/2,-d/2);s.lineTo(w/2,d/2);s.quadraticCurveTo(w*.38,d*.56,w*.23,d*.39);s.quadraticCurveTo(0,d*.14,-w*.23,d*.39);s.quadraticCurveTo(-w*.38,d*.56,-w/2,d/2);s.closePath();
    mesh(g,new THREE.ExtrudeGeometry(s,{depth:.085,bevelEnabled:true,bevelSize:.018,bevelThickness:.018,bevelSegments:3,curveSegments:16}),mat(item.color,{roughness:.55}),[0,.045,0],[Math.PI/2,0,0]);
    box(g,[w*.7,.46,.055],[0,-.25,-.23],0x8d4f2b);for(const x of [-.82,.82]){box(g,[.075,.72,.075],[x,-.4,0],0x9aa0a3,{metalness:.8});box(g,[.5,.055,.14],[x,-.75,.02],0x7f878b,{metalness:.75});}
    if(item.returnSide==="right"){const x=w/2-.25;box(g,[.5,.085,1.12],[x,.045,.62],item.color,{roughness:.55});box(g,[.46,.055,.68],[x,-.25,.82],0x8d4f2b);for(const z of [.32,.94]){box(g,[.075,.72,.075],[x,-.4,z],0x9aa0a3,{metalness:.8});box(g,[.5,.055,.14],[x,-.75,z],0x7f878b,{metalness:.75});}}
  }
  function buildTable(item){const g=new THREE.Group();g.position.set(...item.position);scene.add(g);box(g,item.size,[0,0,0],item.color);for(const x of [-.68,.68])for(const z of [-.18,.18])box(g,[.052,.7,.052],[x,-.39,z],0x8b9499,{metalness:.7});}
  function buildChair(item){const g=new THREE.Group();g.position.set(...item.position);g.rotation.y=item.rotation||0;scene.add(g);mesh(g,new THREE.CapsuleGeometry(.22,.2,8,20),mat(item.color),[0,0,0],[0,0,Math.PI/2]);const back=mesh(g,new THREE.CapsuleGeometry(.23,.3,8,20),mat(0x495862),[0,.46,.25],[0,0,Math.PI/2]);back.scale.z=.4;rod(g,[0,-.06,0],[0,-.45,0],.035,0x657078,{metalness:.8});for(let i=0;i<5;i++){const a=i*Math.PI*2/5;rod(g,[0,-.45,0],[Math.cos(a)*.32,-.48,Math.sin(a)*.32],.018,0x566169);}}
  function buildScreen(item){const g=new THREE.Group();g.position.set(...item.position);scene.add(g);box(g,[item.size[0]+.08,item.size[1]+.08,.055],[0,0,0],0x141b20,{metalness:.45});const face=box(g,[item.size[0],item.size[1],.02],[0,0,.04],0x071016,{emissive:0x29b8ef});const light=new THREE.PointLight(0x45c8ff,0,3.2,2);light.position.set(0,0,.35);g.add(light);bind(item.entityId,on=>{face.material.color.setHex(on?0x168ec0:0x071016);face.material.emissiveIntensity=on?2.2:0;light.intensity=on?9:0;});}
  function buildMonitors(item){const g=new THREE.Group();g.position.set(...item.position);scene.add(g);const faces=[];for(const x of [-.3,.3]){box(g,[.56,.38,.055],[x,0,0],0x111820,{metalness:.5});faces.push(box(g,[.5,.32,.018],[x,0,.04],0x071016,{emissive:0x29b8ef}));rod(g,[x,-.2,0],[x,-.37,0],.025,0x687279);box(g,[.24,.025,.15],[x,-.39,.02],0x5e686e,{metalness:.75});}bind(item.entityId,on=>faces.forEach(f=>{f.material.color.setHex(on?0x178dbb:0x071016);f.material.emissiveIntensity=on?1.8:0;}));}

  async function buildSofa(item){
    const gltf=await new GLTFLoader().loadAsync("models/ritchie-sofa/scene.gltf");const model=gltf.scene;
    const staging=[];
    model.traverse(o=>{if(o.name==="FLOOR"||o.name==="Plane001")staging.push(o);if(o.isMesh){o.castShadow=true;o.receiveShadow=true;if(o.name==="FABRIC"||o.name==="BUTTONS"){o.material=o.material.clone();o.material.color.set(item.color||0x034536);o.material.roughness=.88;o.material.metalness=0;}}});
    staging.forEach(o=>o.removeFromParent());
    let bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),scale=1.82/Math.max(size.x,size.z);model.scale.setScalar(scale);bounds=new THREE.Box3().setFromObject(model);const center=bounds.getCenter(new THREE.Vector3());
    const wrapper=new THREE.Group();wrapper.position.set(...item.position);wrapper.rotation.y=item.rotation||0;model.position.set(-center.x,-bounds.min.y,-center.z);wrapper.add(model);scene.add(wrapper);
  }
  function buildLamp(d){const g=new THREE.Group();g.position.set(d.position[0],0,d.position[2]);scene.add(g);cylinder(g,.22,.22,.045,28,[0,.025,0],0x343e44,{metalness:.65});rod(g,[0,.05,0],[0,1.4,0],.025,0x434d52);for(const y of [1.2,1.44,1.68])mesh(g,new THREE.TorusGeometry(y===1.44?.2:.12,.012,10,32),mat(0x252d31,{metalness:.7}),[0,y,0],[Math.PI/2,0,0]);for(let i=0;i<10;i++){const a=i*Math.PI*2/10;rod(g,[Math.cos(a)*.12,1.2,Math.sin(a)*.12],[Math.cos(a)*.12,1.68,Math.sin(a)*.12],.009,0x252d31,{segments:8});}const bulb=mesh(g,new THREE.SphereGeometry(.095,24,16),mat(0xffe1a3,{emissive:0xffb849}),[0,1.44,0]);const light=new THREE.PointLight(0xffc46b,0,4.8,1.8);light.position.set(0,1.44,0);light.castShadow=true;g.add(light);bind(d.entityId,on=>{bulb.material.emissiveIntensity=on?4:0;light.intensity=on?16:0;});}
  function buildTrack(d){const g=new THREE.Group();g.position.set(...d.position);g.rotation.y=d.rotation||0;scene.add(g);box(g,[1.3,.055,.1],[0,0,0],0xe9ece8,{metalness:.35,shadow:false});const bulbs=[],lights=[];for(const x of [-.43,0,.43]){rod(g,[x,-.02,0],[x,-.12,0],.018,0x3d474d,{shadow:false});cylinder(g,.07,.095,.15,20,[x,-.18,0],0x3b464d,{metalness:.5,shadow:false});bulbs.push(mesh(g,new THREE.SphereGeometry(.064,20,12),mat(0xd5d4c8,{emissive:0xffc76c}),[x,-.26,0],[0,0,0],false));const spot=new THREE.SpotLight(0xffd18a,0,5.2,Math.PI/5,.55,1.7);spot.position.set(x,-.23,0);spot.castShadow=false;const t=new THREE.Object3D();t.position.set(x,-2.5,0);g.add(spot,t);spot.target=t;lights.push(spot);}bind(d.entityId,on=>{bulbs.forEach(b=>b.material.emissiveIntensity=on?3:0);lights.forEach(l=>l.intensity=on?18:0);});}
  const entityColor=(entity,fallback=0xff2aa6)=>{const a=entity?.attributes||{};if(Array.isArray(a.rgb_color)&&a.rgb_color.length>=3)return new THREE.Color(a.rgb_color[0]/255,a.rgb_color[1]/255,a.rgb_color[2]/255);if(Array.isArray(a.hs_color)&&a.hs_color.length>=2)return new THREE.Color().setHSL((a.hs_color[0]%360)/360,Math.min(1,a.hs_color[1]/100),.55);return new THREE.Color(fallback);};
  function buildLed(d){const g=new THREE.Group();g.position.set(...d.position);scene.add(g);const strip=box(g,[d.size[0],.045,.05],[0,0,0],0x171b24,{emissive:0xff2aa6,shadow:false});const lights=[-2.6,0,2.6].map(x=>{const light=new THREE.PointLight(0xff2aa6,0,3.2,2);light.position.set(x,-.16,.24);light.castShadow=false;g.add(light);return light;});bind(d.entityId,(on,e)=>{const color=entityColor(e),level=Math.max(.15,Math.min(1,(Number(e?.attributes?.brightness)||180)/255));strip.material.color.copy(on?color:new THREE.Color(0x171b24));strip.material.emissive.copy(color);strip.material.emissiveIntensity=on?3.4*level:0;lights.forEach(light=>{light.color.copy(color);light.intensity=on?5*level:0;});});}
  function buildOutside(d){const g=new THREE.Group();g.position.set(...d.position);scene.add(g);box(g,[.25,.4,.16],[0,0,-.08],0x3f4b52,{metalness:.4});const face=box(g,[.18,.28,.018],[0,0,-.17],0xd7c386,{emissive:0xffc766});const light=new THREE.PointLight(0xffc56f,0,4.5,1.8);light.position.set(0,0,-.35);g.add(light);bind(d.entityId,on=>{face.material.emissiveIntensity=on?3.5:0;light.intensity=on?18:0;});}
  function buildHeater(d){const g=new THREE.Group();g.position.set(d.position[0],0,d.position[2]);scene.add(g);const fins=[];for(let i=0;i<9;i++){const f=mesh(g,new THREE.CapsuleGeometry(.115,.48,8,18),mat(0xdfe3e1),[(i-4)*.075,.43,0]);f.scale.set(.24,1,1.05);fins.push(f);}rod(g,[-.34,.68,0],[.34,.68,0],.035,0x9aa3a4);rod(g,[-.34,.18,0],[.34,.18,0],.035,0x9aa3a4);box(g,[.17,.34,.25],[.43,.53,0],0xc8cecc);for(const x of [-.27,.27])box(g,[.24,.045,.28],[x,.075,0],0x6d777b,{metalness:.6});const glow=new THREE.PointLight(0xff8b45,0,2.2,2);glow.position.set(0,.55,.2);glow.castShadow=false;g.add(glow);const ripples=[0,.18,.36].map((offset)=>{const ring=mesh(g,new THREE.TorusGeometry(.16,.008,8,32),new THREE.MeshBasicMaterial({color:0xffa45f,transparent:true,opacity:0}),[0,.78+offset,0],[Math.PI/2,0,0],false);ring.userData.offset=offset;return ring;});bind(d.entityId,on=>{g.userData.on=on;glow.intensity=on?3:0;fins.forEach(f=>{f.material.emissive.setHex(0x8e351f);f.material.emissiveIntensity=on?.28:0;});ripples.forEach(r=>r.visible=on);});animated.push(t=>{if(!g.userData.on)return;ripples.forEach((r,i)=>{const phase=(t*.00045+i/3)%1;r.position.y=.78+phase*.72;r.scale.setScalar(.7+phase*.7);r.material.opacity=.2*(1-phase);});});}
  function buildSensors(d){if(d.type==="presence"){const sensor=cylinder(scene,.075,.075,.035,24,d.position,0xd7dddc,{shadow:false});const ring=mesh(scene,new THREE.TorusGeometry(.095,.01,8,28),new THREE.MeshBasicMaterial({color:0x31e7e9,transparent:true,opacity:0}),[d.position[0],d.position[1]-.022,d.position[2]],[Math.PI/2,0,0],false);bind(d.entityId,on=>{sensor.material.emissive.setHex(on?0x31e7e9:0);sensor.material.emissiveIntensity=on?1.2:0;ring.material.opacity=on?.75:0;});}else if(d.type==="door-sensor")box(scene,[.055,.2,.045],d.position,0xe9eeee,{shadow:false});else if(d.type==="leak")cylinder(scene,.12,.12,.035,28,d.position,0x8fa4aa);}

  buildRoom();
  for(const item of config.furniture){if(item.type==="rug")box(scene,item.size,item.position,item.color,{roughness:1});else if(item.type==="executive-desk")buildDesk(item);else if(item.type==="window-table")buildTable(item);else if(item.type==="office-chair")buildChair(item);else if(item.type==="screen")buildScreen(item);else if(item.type==="dual-monitors")buildMonitors(item);else if(item.type==="rounded-sofa")buildSofa(item).catch(console.error);}
  for(const d of config.devices){if(d.type==="gu10-track")buildTrack(d);else if(d.type==="floor-lamp")buildLamp(d);else if(d.type==="led-strip")buildLed(d);else if(d.type==="wall-light")buildOutside(d);else if(d.type==="heater")buildHeater(d);else if(["presence","door-sensor","leak"].includes(d.type))buildSensors(d);}

  const updateCamera=()=>{const h=orbit.radius*Math.cos(orbit.pitch);camera.position.set(target.x+Math.sin(orbit.yaw)*h,target.y+Math.sin(orbit.pitch)*orbit.radius,target.z+Math.cos(orbit.yaw)*h);camera.lookAt(target);};
  const resize=()=>{const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();};
  let drag=null,pinch=null;const pointers=new Map();canvas.addEventListener("pointerdown",e=>{canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);drag=[e.clientX,e.clientY];});canvas.addEventListener("pointermove",e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,[e.clientX,e.clientY]);if(pointers.size===2){const p=[...pointers.values()],d=Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]);if(pinch)orbit.radius=Math.max(6.5,Math.min(17,orbit.radius*pinch/d));pinch=d;}else if(drag){orbit.yaw-=(e.clientX-drag[0])*.008;orbit.pitch=Math.max(.16,Math.min(1.05,orbit.pitch+(e.clientY-drag[1])*.006));drag=[e.clientX,e.clientY];}updateCamera();});const end=e=>{pointers.delete(e.pointerId);drag=pointers.size?[...pointers.values()][0]:null;pinch=null;};canvas.addEventListener("pointerup",end);canvas.addEventListener("pointercancel",end);canvas.addEventListener("wheel",e=>{e.preventDefault();orbit.radius=Math.max(6.5,Math.min(17,orbit.radius*(e.deltaY>0?1.08:.92)));updateCamera();},{passive:false});
  document.querySelectorAll("[data-camera]").forEach(b=>b.addEventListener("click",()=>{if(b.dataset.camera==="left")orbit.yaw+=.22;if(b.dataset.camera==="right")orbit.yaw-=.22;if(b.dataset.camera==="home"){orbit.yaw=config.room.camera.yaw;orbit.pitch=config.room.camera.pitch;orbit.radius=10.6;}updateCamera();}));new ResizeObserver(resize).observe(canvas);
  const updateDaylight=entities=>{const entity=entities.get("sensor.front_drive_motion_illuminance"),lux=Math.max(0,Number(entity?.state)||0),day=lux<=60?0:Math.max(0,Math.min(1,(Math.log10(lux+1)-Math.log10(61))/2.2));hemisphere.intensity=.34+1.15*day;sun.intensity=.08+2.2*day;renderer.toneMappingExposure=.64+.33*day;const sky=new THREE.Color(0x020711).lerp(new THREE.Color(0x0f2c43),day);scene.background.copy(sky);scene.fog.color.copy(sky);daylightSurfaces.forEach(material=>{material.emissiveIntensity=.08+.75*day;material.opacity=.27+.31*day;});daylightLights.forEach(light=>light.intensity=.25+3.2*day);};
  const update=entities=>{for(const[id,setters]of visuals){if(!id)continue;const e=entities.get(id),on=e?.available&&["on","open","detected","heat"].includes(String(e.state).toLowerCase());setters.forEach(fn=>fn(on,e));}updateDaylight(entities);};
  const render=t=>{animated.forEach(fn=>fn(t));renderer.render(scene,camera);requestAnimationFrame(render);};updateCamera();resize();requestAnimationFrame(render);
  return { update, resize };
}
