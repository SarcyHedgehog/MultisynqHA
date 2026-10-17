import * as THREE from "three";
import { GLTFLoader } from "./vendor/GLTFLoader.js";

export function createStudyScene(canvas, config) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .92;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07131f);
  scene.fog = new THREE.Fog(0x07131f, 15, 27);
  const camera = new THREE.PerspectiveCamera(39, 1, .05, 50);
  const target = new THREE.Vector3(config.room.width / 2, 1.05, config.room.depth / 2);
  const orbit = { yaw: config.room.camera.yaw, pitch: config.room.camera.pitch, radius: 10.6 };
  const hemisphere = new THREE.HemisphereLight(0xcbe4f4, 0x36261b, .85);
  const sun = new THREE.DirectionalLight(0xfff0d1, 1.2);
  sun.position.set(3, 7, 6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left=-7;sun.shadow.camera.right=7;sun.shadow.camera.top=7;sun.shadow.camera.bottom=-7;
  scene.add(hemisphere, sun);

  const nodes = new Map();
  const effects = new Map();
  const animated = [];
  let latestEntities = new Map();
  let loaded = false;
  let sofaPlaceholder = null;
  const bind=(id,fn)=>{if(!effects.has(id))effects.set(id,[]);effects.get(id).push(fn);};
  const active=e=>e?.available&&["on","open","detected","heat"].includes(String(e.state).toLowerCase());
  const material=(color,o={})=>new THREE.MeshStandardMaterial({color,roughness:o.roughness??.7,metalness:o.metalness??0,emissive:o.emissive??0x000000,emissiveIntensity:o.emissiveIntensity??0});
  const addMesh=(geometry,mat,position,parent=scene)=>{const m=new THREE.Mesh(geometry,mat);m.position.set(...position);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
  const hideNodes=(names)=>names.forEach(name=>{const object=nodes.get(name);if(object)object.visible=false;});

  function addRod(a,b,radius,mat,parent=scene){
    const delta=new THREE.Vector3().subVectors(b,a),mesh=addMesh(new THREE.CylinderGeometry(radius,radius,delta.length(),10),mat,[0,0,0],parent);
    mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());return mesh;
  }

  async function loadSizedModel(url,item,{width,height,floor=false,rotation=item?.rotation||0,setup}={}){
    const gltf=await new GLTFLoader().loadAsync(url),model=gltf.scene;
    model.traverse(object=>{if(object.isMesh){object.castShadow=true;object.receiveShadow=true;}});
    let bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
    const scale=width?width/size.x:height/size.y;model.scale.setScalar(scale);
    bounds=new THREE.Box3().setFromObject(model);const center=bounds.getCenter(new THREE.Vector3());
    model.position.set(-center.x,floor?-bounds.min.y:-center.y,-center.z);
    const wrapper=new THREE.Group();wrapper.position.set(...item.position);wrapper.rotation.y=rotation;wrapper.add(model);scene.add(wrapper);
    setup?.(model,wrapper);return wrapper;
  }

  function makeWallBadge(position,width,height,paint) {
    const canvas=document.createElement("canvas");canvas.width=256;canvas.height=128;
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const group=new THREE.Group();group.position.set(...position);scene.add(group);
    addMesh(new THREE.BoxGeometry(width+.035,height+.035,.035),material(0x142331,{metalness:.25}),[0,0,0],group).castShadow=false;
    const face=addMesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture,transparent:true}),[0,0,.022],group);face.castShadow=false;
    const draw=value=>{const ctx=canvas.getContext("2d");ctx.clearRect(0,0,256,128);paint(ctx,value);texture.needsUpdate=true;};
    return {group,draw};
  }

  function addWallStatus() {
    const temperature=config.devices.find(x=>x.type==="temperature");
    if(temperature){
      const badge=makeWallBadge(temperature.position,.46,.23,(ctx,value)=>{ctx.fillStyle="#0b1825";ctx.fillRect(0,0,256,128);ctx.strokeStyle="#3e789b";ctx.lineWidth=6;ctx.strokeRect(3,3,250,122);ctx.fillStyle="#eaf7ff";ctx.font="700 49px system-ui";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(value||"—",128,66);});
      badge.draw("—");bind(temperature.entityId,(_on,e)=>badge.draw(e?.available?`${e.state}${e.unit||"°C"}`:"—"));
    }
    const presence=config.devices.find(x=>x.type==="presence");
    if(presence){
      const badge=makeWallBadge(presence.position,.23,.23,ctx=>{ctx.strokeStyle="#60edff";ctx.fillStyle="#60edff";ctx.lineWidth=12;ctx.lineCap="round";ctx.beginPath();ctx.arc(128,30,17,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(128,55);ctx.lineTo(128,88);ctx.moveTo(128,64);ctx.lineTo(91,80);ctx.moveTo(128,64);ctx.lineTo(165,80);ctx.moveTo(128,88);ctx.lineTo(101,119);ctx.moveTo(128,88);ctx.lineTo(155,119);ctx.stroke();});
      badge.draw();badge.group.visible=false;bind(presence.entityId,on=>badge.group.visible=on);
    }
  }

  function addLiveEffects() {
    const trackEntities=["light.office_light_switch_l1","light.office_light_switch_l2"];
    for(const [index,id] of trackEntities.entries()){
      const d=config.devices.find(x=>x.entityId===id), group=new THREE.Group();group.position.set(...d.position);scene.add(group);
      const lamps=[],spots=[];
      for(const z of [-.43,0,.43]){
        const bulb=addMesh(new THREE.SphereGeometry(.065,18,12),material(0xd8d8ce,{emissive:0xffc66d}),[0,-.23,z],group);bulb.castShadow=false;lamps.push(bulb);
        const spot=new THREE.SpotLight(0xffd18a,0,5.2,Math.PI/5,.55,1.7);spot.position.set(0,-.2,z);spot.castShadow=false;const aim=new THREE.Object3D();aim.position.set(0,-2.5,z);group.add(spot,aim);spot.target=aim;spots.push(spot);
      }
      bind(id,on=>{lamps.forEach(x=>x.material.emissiveIntensity=on?3:0);spots.forEach(x=>x.intensity=on?18:0);});
    }

    const lamp=config.devices.find(x=>x.type==="floor-lamp"),lg=new THREE.Group();lg.position.set(lamp.position[0],0,lamp.position[2]);scene.add(lg);
    const cageMaterial=material(0x252b2e,{metalness:.8,roughness:.25});
    addMesh(new THREE.CylinderGeometry(.22,.22,.045,28),cageMaterial,[0,.025,0],lg);
    addMesh(new THREE.CylinderGeometry(.025,.025,1.4,12),cageMaterial,[0,.73,0],lg);
    for(const y of [1.2,1.44,1.68]){const ring=addMesh(new THREE.TorusGeometry(.19,.012,8,32),cageMaterial,[0,y,0],lg);ring.rotation.x=Math.PI/2;}
    for(let i=0;i<10;i++){const a=i*Math.PI/5,x=Math.cos(a)*.19,z=Math.sin(a)*.19;addRod(new THREE.Vector3(x,1.2,z),new THREE.Vector3(x,1.68,z),.008,cageMaterial,lg);}
    const bulb=addMesh(new THREE.SphereGeometry(.095,24,16),material(0xffe1a3,{emissive:0xffb849}),[0,1.44,0],lg);
    const lampLight=new THREE.PointLight(0xffc46b,0,4.8,1.8);lampLight.position.set(0,1.44,0);lampLight.castShadow=true;lg.add(lampLight);
    bind(lamp.entityId,on=>{bulb.material.emissiveIntensity=on?4:0;lampLight.intensity=on?16:0;});

    const ledLights=[-2.6,0,2.6].map(x=>{const l=new THREE.PointLight(0xff2aa6,0,3.3,2);l.position.set(4+x,2.32,.28);scene.add(l);return l;});
    bind("light.rgb_strip_lights",(on,e)=>{const color=entityColor(e),level=Math.max(.15,Math.min(1,(Number(e?.attributes?.brightness)||180)/255));const strip=nodes.get("Entity_LEDStrip");if(strip){ownMaterial(strip);strip.material.color.copy(on?color:new THREE.Color(0x140520));strip.material.emissive.copy(color);strip.material.emissiveIntensity=on?3.2*level:0;}ledLights.forEach(l=>{l.color.copy(color);l.intensity=on?5*level:0;});});

    bind("binary_sensor.study_door_contact",on=>{const door=nodes.get("Entity_StudyDoor_Left");if(door)door.rotation.y=on?Math.PI*.42:0;});

    const leak=config.devices.find(x=>x.type==="leak"),leakGroup=new THREE.Group();leakGroup.position.set(...leak.position);scene.add(leakGroup);
    const leakBody=addMesh(new THREE.CylinderGeometry(.08,.08,.035,24),material(0xdbe8ed,{roughness:.45}),[0,.018,0],leakGroup);
    const leakRing=addMesh(new THREE.TorusGeometry(.09,.008,8,32),material(0x48ddff,{emissive:0x48ddff}),[0,.04,0],leakGroup);leakRing.rotation.x=Math.PI/2;
    bind(leak.entityId,on=>{leakBody.material.emissive.setHex(on?0xff291f:0x164b5a);leakBody.material.emissiveIntensity=on?2.5:.25;leakRing.material.color.setHex(on?0xff291f:0x48ddff);leakRing.material.emissive.setHex(on?0xff291f:0x48ddff);leakRing.userData.alert=on;});
    animated.push(t=>{const pulse=leakRing.userData.alert?1+.18*Math.sin(t*.008):1;leakRing.scale.setScalar(pulse);});
  }

  function ownMaterial(object){if(object?.isMesh&&!object.userData.ownMaterial){object.material=object.material.clone();object.userData.ownMaterial=true;}}
  function setGlow(name,on,color,intensity){const object=nodes.get(name);if(!object)return;ownMaterial(object);object.material.color.setHex(on?color:0x071016);object.material.emissive.setHex(color);object.material.emissiveIntensity=on?intensity:0;}
  function entityColor(entity){const a=entity?.attributes||{};if(Array.isArray(a.rgb_color))return new THREE.Color(a.rgb_color[0]/255,a.rgb_color[1]/255,a.rgb_color[2]/255);if(Array.isArray(a.hs_color))return new THREE.Color().setHSL((a.hs_color[0]%360)/360,Math.min(1,a.hs_color[1]/100),.55);return new THREE.Color(0xff2aa6);}

  async function replaceSofaPlaceholder() {
    const item=config.furniture.find(x=>x.type==="rounded-sofa");
    if(!item)return;
    const gltf=await new GLTFLoader().loadAsync("models/ritchie-sofa/scene.gltf");
    const model=gltf.scene,staging=[];
    model.traverse(object=>{
      if(object.name==="FLOOR"||object.name==="Plane001")staging.push(object);
      if(object.isMesh){
        object.castShadow=true;object.receiveShadow=true;
        if(object.name==="FABRIC"||object.name==="BUTTONS"){
          object.material=object.material.clone();object.material.color.set(item.color||0x034536);object.material.roughness=.88;object.material.metalness=0;
        }
      }
    });
    staging.forEach(object=>object.removeFromParent());
    let bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),scale=item.size[0]/Math.max(size.x,size.z);
    model.scale.setScalar(scale);bounds=new THREE.Box3().setFromObject(model);const center=bounds.getCenter(new THREE.Vector3());
    const wrapper=new THREE.Group();wrapper.name="Furniture_Sofa_Detailed";wrapper.position.set(...item.position);wrapper.rotation.y=item.rotation||0;
    model.position.set(-center.x,-bounds.min.y,-center.z);wrapper.add(model);scene.add(wrapper);
  }

  async function replaceChairPlaceholder(){
    const item=config.furniture.find(x=>x.type==="office-chair");if(!item)return;
    const placed={...item,position:[item.position[0],0,item.position[2]]};
    await loadSizedModel("models/study/chair/scene.gltf",placed,{height:item.size[1]*1.15,floor:true,rotation:(item.rotation||0)+Math.PI});
    hideNodes(["Furniture_OfficeChair_Seat_REPLACEABLE","Furniture_OfficeChair_Back","Furniture_OfficeChair_Stem"]);
  }

  function replaceRug(){
    const item=config.furniture.find(x=>x.type==="rug");if(!item)return;
    const texture=new THREE.TextureLoader().load("models/study/rug/carpet-cutout.png");texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=renderer.capabilities.getMaxAnisotropy();
    const rug=addMesh(new THREE.PlaneGeometry(item.size[0],item.size[2]),new THREE.MeshStandardMaterial({map:texture,transparent:true,alphaTest:.08,roughness:.94,metalness:0}),[item.position[0],.034,item.position[2]]);rug.rotation.x=-Math.PI/2;rug.castShadow=false;
    hideNodes(["Furniture_Rug_REPLACEABLE"]);
  }

  function replaceDeskTop(){
    const item=config.furniture.find(x=>x.type==="executive-desk");if(!item)return;
    const w=item.size[0],d=item.size[2],returnDepth=.82,returnWidth=.48,shape=new THREE.Shape();
    shape.moveTo(-w/2,-d/2);shape.lineTo(w/2,-d/2);shape.lineTo(w/2,d/2+returnDepth);shape.lineTo(w/2-returnWidth,d/2+returnDepth);shape.lineTo(w/2-returnWidth,d/2+.23);
    shape.quadraticCurveTo(w/2-returnWidth,d/2,w/2-returnWidth-.28,d/2);shape.lineTo(-w/2,d/2);shape.closePath();
    const top=addMesh(new THREE.ExtrudeGeometry(shape,{depth:item.size[1],bevelEnabled:true,bevelSize:.018,bevelThickness:.012,bevelSegments:3}),material(item.color,{roughness:.58}),[item.position[0],item.position[1]+item.size[1]/2,item.position[2]]);
    top.rotation.x=Math.PI/2;top.name="Furniture_MainDesk_CurvedTop";hideNodes(["Furniture_MainDesk_Top_REPLACEABLE","Furniture_MainDesk_Return"]);
  }

  function buildRadiator(){
    const item=config.devices.find(x=>x.type==="heater");if(!item)return;
    const group=new THREE.Group();group.position.set(...item.position);scene.add(group);
    const enamel=material(0xe8ece9,{metalness:.08,roughness:.45}),dark=material(0x6f7777,{metalness:.45,roughness:.3}),fins=[];
    for(let i=-4;i<=4;i++){const fin=addMesh(new THREE.CapsuleGeometry(.075,.48,6,16),enamel,[i*.095,.41,0],group);fin.scale.z=.5;fins.push(fin);}
    addRod(new THREE.Vector3(-.43,.2,0),new THREE.Vector3(.43,.2,0),.025,dark,group);addRod(new THREE.Vector3(-.43,.64,0),new THREE.Vector3(.43,.64,0),.025,dark,group);
    for(const x of [-.32,.32]){addMesh(new THREE.BoxGeometry(.12,.035,.36),dark,[x,.04,0],group);addMesh(new THREE.CylinderGeometry(.025,.025,.13,10),dark,[x,.11,0],group);}
    addMesh(new THREE.BoxGeometry(.13,.2,.18),material(0xf2f3ef,{roughness:.4}),[.5,.62,0],group);
    const heatLight=new THREE.PointLight(0xff6d34,0,2.1,2);heatLight.position.set(0,.7,0);group.add(heatLight);
    const waves=[0,1,2].map(i=>{const ring=addMesh(new THREE.TorusGeometry(.23,.012,8,28),material(0xff6d34,{emissive:0xff6d34}),[0,.83+i*.13,0],group);ring.rotation.x=Math.PI/2;ring.visible=false;return ring;});
    bind(item.entityId,on=>{fins.forEach(fin=>{fin.material.emissive.setHex(0xa83d20);fin.material.emissiveIntensity=on?.18:0;});heatLight.intensity=on?1.2:0;waves.forEach(w=>w.visible=on);});
    animated.push(t=>waves.forEach((wave,i)=>{if(wave.visible){const phase=(t*.00035+i/3)%1;wave.scale.setScalar(.72+phase*.55);wave.material.opacity=1-phase;wave.material.transparent=true;}}));
    hideNodes(Array.from({length:9},(_,i)=>`Entity_Heater_Fin_${i-4}`));
  }

  function addOutsideSockets(){
    const shell=material(0x20272c,{roughness:.55}),face=material(0x0d1114,{roughness:.4});
    for(const z of [2.68,3.08]){const group=new THREE.Group();group.position.set(-.12,.55,z);group.rotation.y=Math.PI/2;scene.add(group);addMesh(new THREE.BoxGeometry(.27,.22,.08),shell,[0,0,0],group);addMesh(new THREE.BoxGeometry(.23,.17,.025),face,[0,0,-.052],group);for(const dx of [-.045,.045])addMesh(new THREE.CylinderGeometry(.014,.014,.012,10),material(0x050607),[dx,.01,-.071],group).rotation.x=Math.PI/2;}
  }

  async function replaceScreens(){
    const tv=config.furniture.find(x=>x.type==="screen"),monitors=config.furniture.find(x=>x.type==="dual-monitors");
    const tvLight=new THREE.PointLight(0x45c8ff,0,3.2,2);tvLight.position.set(tv.position[0],tv.position[1],.45);scene.add(tvLight);
    const tvSurfaces=[];await loadSizedModel("models/study/television/scene.gltf",tv,{width:tv.size[0],setup:model=>model.traverse(object=>{if(object.isMesh&&object.material?.name?.includes("Screen")){ownMaterial(object);tvSurfaces.push(object);}})});
    hideNodes(["Entity_Screen_Frame","Entity_Screen_Surface"]);bind(tv.entityId,on=>{tvSurfaces.forEach(object=>{object.material.emissive.setHex(0x168ec0);object.material.emissiveIntensity=on?2.2:0;});tvLight.intensity=on?8:0;});
    const monitorLight=new THREE.PointLight(0x55ccff,0,2.3,2);monitorLight.position.set(monitors.position[0],monitors.position[1],monitors.position[2]+.35);scene.add(monitorLight);
    const monitorSurfaces=[];await loadSizedModel("models/study/dual-monitor/scene.gltf",monitors,{width:monitors.size[0],setup:model=>model.traverse(object=>{if(object.isMesh&&object.material?.name?.includes("Screen")){ownMaterial(object);monitorSurfaces.push(object);}})});
    hideNodes(["Entity_Monitor_Frame_6.42","Entity_Monitor_Surface_6.42","Furniture_Monitor_Stand_6.42","Entity_Monitor_Frame_7.02","Entity_Monitor_Surface_7.02","Furniture_Monitor_Stand_7.02"]);
    bind(monitors.entityId,on=>{monitorSurfaces.forEach(object=>{object.material.emissive.setHex(0x178dbb);object.material.emissiveIntensity=on?1.8:0;});monitorLight.intensity=on?4.5:0;});
  }

  async function replaceOutsideLight(){
    const item=config.devices.find(x=>x.type==="wall-light"),surfaces=[];
    await loadSizedModel("models/study/outdoor-light/scene.gltf",item,{height:.5,rotation:Math.PI,setup:model=>model.traverse(object=>{if(object.isMesh&&object.material?.name==="Material_49"){ownMaterial(object);surfaces.push(object);}})});
    const light=new THREE.PointLight(0xffc98a,0,3,2);light.position.set(item.position[0],item.position[1]-.08,item.position[2]-.18);scene.add(light);
    bind(item.entityId,on=>{surfaces.forEach(object=>{object.material.emissive.setHex(0xffc98a);object.material.emissiveIntensity=on?3:0;});light.intensity=on?5:0;});
  }

  new GLTFLoader().load("models/study/study.glb",gltf=>{
    gltf.scene.traverse(object=>{nodes.set(object.name,object);if(object.name.includes("Furniture_Sofa_REPLACEABLE")||object.userData?.source==="placeholder"){sofaPlaceholder=object;object.visible=false;}if(object.isMesh){object.castShadow=true;object.receiveShadow=true;}});
    scene.add(gltf.scene);addLiveEffects();addWallStatus();replaceRug();replaceDeskTop();buildRadiator();addOutsideSockets();
    replaceSofaPlaceholder().catch(error=>{if(sofaPlaceholder)sofaPlaceholder.visible=true;console.error("Could not load the detailed Study sofa",error);});
    replaceChairPlaceholder().catch(error=>console.error("Could not load the Study chair",error));
    replaceScreens().then(()=>apply(latestEntities)).catch(error=>console.error("Could not load the Study screens",error));
    replaceOutsideLight().then(()=>apply(latestEntities)).catch(error=>console.error("Could not load the outside Study light",error));
    loaded=true;apply(latestEntities);
  },undefined,error=>console.error("Could not load the Blender Study model",error));

  function updateDaylight(entities){const e=entities.get("sensor.back_garden_motion_illuminance"),lux=Math.max(0,Number(e?.state)||0),day=lux<=60?0:Math.max(0,Math.min(1,(Math.log10(lux+1)-Math.log10(61))/2.2));hemisphere.intensity=.25+1.1*day;sun.intensity=.05+2.15*day;renderer.toneMappingExposure=.7+.3*day;const sky=new THREE.Color(0x020711).lerp(new THREE.Color(0x0f2c43),day);scene.background.copy(sky);scene.fog.color.copy(sky);}
  function apply(entities){if(!loaded)return;for(const[id,setters]of effects){const e=entities.get(id),on=active(e);setters.forEach(fn=>fn(on,e));}updateDaylight(entities);}
  function update(entities){latestEntities=entities;apply(entities);}

  const updateCamera=()=>{const h=orbit.radius*Math.cos(orbit.pitch);camera.position.set(target.x+Math.sin(orbit.yaw)*h,target.y+Math.sin(orbit.pitch)*orbit.radius,target.z+Math.cos(orbit.yaw)*h);camera.lookAt(target);};
  const resize=()=>{const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();};
  const pointers=new Map();let drag=null,pinch=null;
  canvas.addEventListener("pointerdown",e=>{canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);drag=[e.clientX,e.clientY];});
  canvas.addEventListener("pointermove",e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,[e.clientX,e.clientY]);if(pointers.size===2){const p=[...pointers.values()],d=Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]);if(pinch)orbit.radius=Math.max(6.5,Math.min(17,orbit.radius*pinch/d));pinch=d;}else if(drag){orbit.yaw-=(e.clientX-drag[0])*.008;orbit.pitch=Math.max(.16,Math.min(1.05,orbit.pitch+(e.clientY-drag[1])*.006));drag=[e.clientX,e.clientY];}updateCamera();});
  const end=e=>{pointers.delete(e.pointerId);drag=pointers.size?[...pointers.values()][0]:null;pinch=null;};canvas.addEventListener("pointerup",end);canvas.addEventListener("pointercancel",end);
  canvas.addEventListener("wheel",e=>{e.preventDefault();orbit.radius=Math.max(6.5,Math.min(17,orbit.radius*(e.deltaY>0?1.08:.92)));updateCamera();},{passive:false});
  document.querySelectorAll("[data-camera]").forEach(b=>b.addEventListener("click",()=>{if(b.dataset.camera==="left")orbit.yaw+=.22;if(b.dataset.camera==="right")orbit.yaw-=.22;if(b.dataset.camera==="home"){orbit.yaw=config.room.camera.yaw;orbit.pitch=config.room.camera.pitch;orbit.radius=10.6;}updateCamera();}));
  new ResizeObserver(resize).observe(canvas);updateCamera();resize();
  const render=time=>{animated.forEach(fn=>fn(time));renderer.render(scene,camera);requestAnimationFrame(render);};requestAnimationFrame(render);
  return {update,resize};
}
