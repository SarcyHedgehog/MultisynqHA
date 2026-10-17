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
  let latestEntities = new Map();
  let loaded = false;
  let sofaPlaceholder = null;
  const bind=(id,fn)=>{if(!effects.has(id))effects.set(id,[]);effects.get(id).push(fn);};
  const active=e=>e?.available&&["on","open","detected","heat"].includes(String(e.state).toLowerCase());
  const material=(color,o={})=>new THREE.MeshStandardMaterial({color,roughness:o.roughness??.7,metalness:o.metalness??0,emissive:o.emissive??0x000000,emissiveIntensity:o.emissiveIntensity??0});
  const addMesh=(geometry,mat,position,parent=scene)=>{const m=new THREE.Mesh(geometry,mat);m.position.set(...position);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};

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
    addMesh(new THREE.CylinderGeometry(.22,.22,.045,28),material(0x343e44,{metalness:.65}),[0,.025,0],lg);
    addMesh(new THREE.CylinderGeometry(.025,.025,1.4,12),material(0x434d52,{metalness:.65}),[0,.73,0],lg);
    const bulb=addMesh(new THREE.SphereGeometry(.095,24,16),material(0xffe1a3,{emissive:0xffb849}),[0,1.44,0],lg);
    const lampLight=new THREE.PointLight(0xffc46b,0,4.8,1.8);lampLight.position.set(0,1.44,0);lampLight.castShadow=true;lg.add(lampLight);
    bind(lamp.entityId,on=>{bulb.material.emissiveIntensity=on?4:0;lampLight.intensity=on?16:0;});

    const ledLights=[-2.6,0,2.6].map(x=>{const l=new THREE.PointLight(0xff2aa6,0,3.3,2);l.position.set(4+x,2.32,.28);scene.add(l);return l;});
    bind("light.rgb_strip_lights",(on,e)=>{const color=entityColor(e),level=Math.max(.15,Math.min(1,(Number(e?.attributes?.brightness)||180)/255));const strip=nodes.get("Entity_LEDStrip");if(strip){ownMaterial(strip);strip.material.color.copy(on?color:new THREE.Color(0x140520));strip.material.emissive.copy(color);strip.material.emissiveIntensity=on?3.2*level:0;}ledLights.forEach(l=>{l.color.copy(color);l.intensity=on?5*level:0;});});

    const screenLight=new THREE.PointLight(0x45c8ff,0,3.2,2);screenLight.position.set(4,1.35,.45);scene.add(screenLight);
    bind("switch.screen",on=>{setGlow("Entity_Screen_Surface",on,0x168ec0,2.2);screenLight.intensity=on?8:0;});
    bind("switch.office_standard",on=>{for(const x of [6.42,7.02])setGlow(`Entity_Monitor_Surface_${x}`,on,0x178dbb,1.8);});
    bind("fan.office_heater",on=>{for(let i=-4;i<=4;i++)setGlow(`Entity_Heater_Fin_${i}`,on,0x8e351f,.3);});
    bind("binary_sensor.study_door_contact",on=>{const door=nodes.get("Entity_StudyDoor_Left");if(door)door.rotation.y=on?Math.PI*.42:0;});
    const outside=new THREE.PointLight(0xffc98a,0,2.3,2);outside.position.set(6.4,1.55,.2);scene.add(outside);
    bind("light.office_light_switch_l3",on=>outside.intensity=on?.65:0);
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

  new GLTFLoader().load("models/study/study.glb",gltf=>{
    gltf.scene.traverse(object=>{nodes.set(object.name,object);if(object.name.includes("Furniture_Sofa_REPLACEABLE")||object.userData?.source==="placeholder"){sofaPlaceholder=object;object.visible=false;}if(object.isMesh){object.castShadow=true;object.receiveShadow=true;}});
    scene.add(gltf.scene);addLiveEffects();replaceSofaPlaceholder().catch(error=>{if(sofaPlaceholder)sofaPlaceholder.visible=true;console.error("Could not load the detailed Study sofa",error);});loaded=true;apply(latestEntities);
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
  const render=()=>{renderer.render(scene,camera);requestAnimationFrame(render);};requestAnimationFrame(render);
  return {update,resize};
}
