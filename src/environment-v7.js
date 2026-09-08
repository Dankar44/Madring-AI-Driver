import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

// Deterministic presentation patch. This module is awaited BEFORE app-v5.js is
// imported, so the renderer hook is installed before the simulator creates its
// first WebGL frame.

const BASE_TRACK_CENTER=[
[382.1,427.9],[360.6,427.9],[339.9,428.8],[322.8,433.8],[312.7,445.5],[308.0,462.5],[301.8,479.4],[289.4,491.5],[271.5,497.4],[250.9,499.1],[229.6,499.4],[208.1,499.4],[186.7,499.4],[165.3,499.4],[144.1,498.6],[125.3,494.5],[113.1,484.2],[110.0,468.2],[113.4,449.7],[119.3,430.9],[125.7,412.1],[132.3,393.4],[139.2,374.8],[146.1,356.2],[152.9,337.6],[159.5,318.9],[165.0,300.4],[167.1,283.0],[166.0,267.2],[167.3,252.2],[176.0,238.4],[191.2,227.5],[209.5,220.1],[228.7,214.7],[248.2,210.2],[268.0,206.2],[287.7,201.8],[307.2,197.2],[326.8,192.9],[346.6,188.9],[366.4,185.0],[386.4,181.3],[406.4,178.0],[426.7,175.3],[447.3,173.3],[468.0,171.6],[488.5,170.3],[508.8,170.0],[528.9,171.4],[548.8,174.7],[568.3,179.4],[587.4,184.9],[606.9,189.6],[626.9,192.4],[647.2,193.1],[667.4,191.9],[687.5,189.3],[707.9,186.7],[728.7,185.0],[749.4,183.9],[769.1,183.6],[787.8,185.5],[806.6,188.5],[826.0,189.2],[845.9,188.3],[866.0,188.2],[886.4,189.6],[906.7,192.2],[926.1,197.0],[944.5,204.5],[962.6,212.5],[981.6,217.8],[1001.8,219.1],[1022.4,218.4],[1042.9,218.9],[1062.6,222.7],[1079.5,231.2],[1090.0,244.1],[1089.7,258.0],[1078.3,268.2],[1060.0,272.7],[1039.7,272.7],[1019.7,269.5],[1000.8,263.4],[982.6,255.5],[964.7,246.9],[946.8,238.5],[928.8,230.2],[910.9,221.7],[892.8,214.2],[874.6,210.0],[856.6,211.3],[839.0,217.9],[821.3,226.3],[802.7,232.9],[783.3,235.8],[762.9,235.8],[742.0,235.4],[721.2,236.4],[701.5,240.3],[684.1,248.4],[670.3,261.1],[660.9,277.6],[655.2,295.6],[648.6,311.6],[636.2,322.9],[618.6,329.9],[599.1,334.7],[579.7,339.4],[561.8,346.7],[548.3,358.9],[540.0,375.8],[533.0,393.9],[522.4,409.0],[506.9,419.4],[488.1,425.2],[467.7,427.4],[446.4,427.9],[425.0,427.9],[403.5,427.9]
];

const TRACK_SCALE=3.40, HALF_WIDTH=25;
const rough=BASE_TRACK_CENTER.map(([x,y])=>new THREE.Vector3(140+(x-110)*TRACK_SCALE,0,140+(y-170)*TRACK_SCALE));
const spline=new THREE.CatmullRomCurve3(rough,true,'centripetal');
spline.arcLengthDivisions=4200;
const center=spline.getSpacedPoints(900).slice(0,-1).map(p=>[p.x,p.z]);

const std=(color,roughness=.9,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness,flatShading:true});
const basic=color=>new THREE.MeshBasicMaterial({color});

function boundary(side,extra=0){
  const out=[],off=HALF_WIDTH+extra,n=center.length;
  for(let i=0;i<n;i++){
    const a=center[(i-4+n)%n],b=center[(i+4)%n],p=center[i];
    const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz)||1;
    out.push([p[0]+(-dz/len)*off*side,p[1]+(dx/len)*off*side]);
  }
  return out;
}
function frameAt(index,side=1,offset=0){
  const n=center.length,i=((index%n)+n)%n,p=center[i],a=center[(i-6+n)%n],b=center[(i+6)%n];
  const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz)||1,tx=dx/len,tz=dz/len,nx=-tz,nz=tx;
  return {x:p[0]+nx*offset*side,z:p[1]+nz*offset*side,heading:Math.atan2(tz,tx),tx,tz,nx,nz};
}
function curve(points,y){return new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(p[0],y,p[1])),true,'centripetal');}
function localTurn(i,span=18){
  const n=center.length,a=center[(i-span+n)%n],b=center[i],c=center[(i+span)%n];
  const h1=Math.atan2(b[1]-a[1],b[0]-a[0]),h2=Math.atan2(c[1]-b[1],c[0]-b[0]);
  let d=h2-h1;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;return d;
}
function ribbonSegment(edge,outer,start,end,y=.17){
  const pos=[],idx=[],n=edge.length;
  for(let i=start;i<=end;i++){const k=((i%n)+n)%n;pos.push(edge[k][0],y,edge[k][1],outer[k][0],y,outer[k][1]);}
  const rows=end-start+1;
  for(let r=0;r<rows-1;r++){const a=r*2,b=a+1,c=a+2,d=a+3;idx.push(a,c,b,b,c,d);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;
}

function makeGrandstand(length=62,rows=7){
  const g=new THREE.Group(),concrete=std(0xb9b8b1,.98),dark=std(0x263a42,.9),seat=std(0x5fa5aa,.82),roof=std(0xe0e2df,.55,.12),steel=std(0x566267,.58,.34);
  for(let r=0;r<rows;r++){
    const step=new THREE.Mesh(new THREE.BoxGeometry(length,1.05,4.2),concrete);step.position.set(0,.52+r*.86,-r*3.05);g.add(step);
    for(let x=-length/2+2;x<length/2-2;x+=3.25){const s=new THREE.Mesh(new THREE.BoxGeometry(1.8,.48,1.55),(Math.floor(x/3)+r)%4===0?seat:dark);s.position.set(x,1.12+r*.86,-r*3.05-.7);g.add(s);}
  }
  const topY=rows*.86+6.2;
  const roofSlab=new THREE.Mesh(new THREE.BoxGeometry(length+6,.45,14),roof);roofSlab.position.set(0,topY,-rows*2.1);g.add(roofSlab);
  for(const x of [-length*.42,0,length*.42]){const p=new THREE.Mesh(new THREE.BoxGeometry(.7,topY,.7),steel);p.position.set(x,topY/2,-rows*2.1);g.add(p);}
  return g;
}
function addGrandstand(scene,index,side,offset,scale=1){const f=frameAt(index,side,offset),g=makeGrandstand(62*scale);g.position.set(f.x,.05,f.z);g.rotation.y=-f.heading;scene.add(g);}

function makeBuilding(w,d,h,color){
  const g=new THREE.Group(),body=std(color,.93),glass=std(0x6f929e,.32,.42),roof=std(0x71787a,.62,.22);
  const mass=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),body);mass.position.y=h/2;g.add(mass);
  const cap=new THREE.Mesh(new THREE.BoxGeometry(w+1,.6,d+1),roof);cap.position.y=h+.3;g.add(cap);
  const floors=Math.max(3,Math.floor(h/7));
  for(let r=0;r<floors;r++)for(let x=-w/2+3;x<w/2-2;x+=5.5){const win=new THREE.Mesh(new THREE.BoxGeometry(2.6,2.1,.12),glass);win.position.set(x,4+r*6,-d/2-.07);g.add(win);}
  return g;
}
function addBuilding(scene,index,side,offset,w,d,h,color,shift=0){const f=frameAt(index,side,offset),g=makeBuilding(w,d,h,color);g.position.set(f.x+f.tx*shift,0,f.z+f.tz*shift);g.rotation.y=-f.heading;scene.add(g);}
function makeTree(){const g=new THREE.Group();const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.55,.7,4.8,6),std(0x725239,1));trunk.position.y=2.4;g.add(trunk);const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(3.5,0),std(0x4d714d,1));crown.position.y=7.2;crown.scale.y=1.25;g.add(crown);return g;}

function upgrade(scene){
  scene.background=new THREE.Color(0xb7c2ab);
  scene.fog=new THREE.Fog(0xb7c2ab,850,1750);

  // Re-style base meshes from app-v5 and explicitly suppress its old box kerbs.
  scene.traverse(o=>{
    if(!o.isMesh||!o.material)return;
    const mats=Array.isArray(o.material)?o.material:[o.material];
    for(const m of mats){
      if(!m.color)continue;
      const hex=m.color.getHex();
      if(hex===0xb7a39a)m.color.setHex(0x8fa17f);
      if(hex===0x8d6849){m.color.setHex(0x494e52);m.roughness=.96;m.flatShading=false;m.needsUpdate=true;}
      if(hex===0xf2f0e9&&o.geometry?.type==='BoxGeometry'&&o.geometry?.parameters?.height<=.25)o.visible=false;
      if(hex===0xc94840&&o.geometry?.type==='BoxGeometry'&&o.geometry?.parameters?.height<=.25)o.visible=false;
    }
  });

  // Add a fresh ground plane above the old beige plane so the change is impossible to miss.
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(5000,3000),std(0x8fa17f,1));ground.rotation.x=-Math.PI/2;ground.position.y=-.075;scene.add(ground);

  // Large land-use zones around the venue.
  for(const [x,z,w,d,c,r] of [[700,330,620,300,0x7d9470,.10],[1300,650,560,260,0xa7a28c,-.08],[2050,480,720,290,0x809873,.08],[2750,720,620,290,0xaaa38b,-.11],[1180,1040,820,230,0x829675,.04],[2250,1010,700,240,0x959d7e,-.06]]){
    const p=new THREE.Mesh(new THREE.PlaneGeometry(w,d),std(c,1));p.rotation.x=-Math.PI/2;p.rotation.z=r;p.position.set(x,-.05,z);scene.add(p);
  }

  // Darken road visually with a wide center tube + subtle rubber line, while keeping physics untouched.
  const left=boundary(1),right=boundary(-1),paintL=boundary(1,-1.1),paintR=boundary(-1,-1.1);
  const white=basic(0xf6f4ed);
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve(paintL,.145),800,.34,6,true),white));
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve(paintR,.145),800,.34,6,true),white));
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve(center,.14),800,.9,5,true),new THREE.MeshBasicMaterial({color:0x181a1c,transparent:true,opacity:.12,depthWrite:false})));

  // Curved, short apex kerbs only. No long red strips.
  const outerL=boundary(1,2.8),outerR=boundary(-1,2.8),red=std(0xc5453e,.92),kerbWhite=std(0xf3f1ea,.96);
  let last=-1000;
  for(let i=0;i<center.length;i+=10){
    const turn=localTurn(i,20);if(Math.abs(turn)<.10||i-last<48)continue;last=i;
    const isLeft=turn>0,edge=isLeft?left:right,outer=isLeft?outerL:outerR;
    for(let s=i-14,k=0;s<i+14;s+=5,k++)scene.add(new THREE.Mesh(ribbonSegment(edge,outer,s,s+5,.18),k%2?kerbWhite:red));
  }

  // Grandsstands intentionally close enough to appear in the follow camera.
  addGrandstand(scene,80,1,62,1.02);addGrandstand(scene,290,-1,64,.92);addGrandstand(scene,560,1,66,1.0);addGrandstand(scene,780,-1,64,.92);

  // Apartment / office clusters near the circuit.
  const buildings=[
    [120,1,78,28,24,38,0xc4b5a7,-34],[145,1,88,34,28,54,0xb4a79c,5],[168,1,80,24,22,32,0xd0c4b8,40],
    [365,-1,84,30,26,48,0xb0aaa4,-38],[390,-1,92,38,30,64,0xc6b8aa,4],[415,-1,82,26,24,36,0xa9a6a1,42],
    [640,1,86,34,28,58,0xc0b0a2,-38],[666,1,94,26,24,34,0xd0c3b7,0],[692,1,82,38,30,70,0xaaa7a2,42]
  ];
  buildings.forEach(b=>addBuilding(scene,...b));

  // Paddock/service slabs.
  for(const [idx,side,off,w,d] of [[270,-1,74,116,56],[535,1,76,104,52],[760,-1,74,100,50]]){const f=frameAt(idx,side,off),p=new THREE.Mesh(new THREE.PlaneGeometry(w,d),std(0x7d8583,1));p.rotation.x=-Math.PI/2;p.rotation.z=-f.heading;p.position.set(f.x,.01,f.z);scene.add(p);}

  // Trees between spectator/urban clusters.
  for(let i=0;i<42;i++){const idx=(25+i*21)%center.length,side=i%2?1:-1,off=55+(i%4)*8,f=frameAt(idx,side,off),t=makeTree();t.position.set(f.x,0,f.z);t.scale.setScalar(.75+(i%3)*.12);scene.add(t);}

  // Tone down sensor rays so scenery remains readable.
  scene.traverse(o=>{if(o.isLine&&o.material?.isLineBasicMaterial){o.material.transparent=true;o.material.opacity=.42;o.material.needsUpdate=true;}});
}

const original=THREE.WebGLRenderer.prototype.render;
const upgraded=new WeakSet();
THREE.WebGLRenderer.prototype.render=function(scene,camera){
  if(this.domElement?.id==='threeSim'&&!upgraded.has(scene)){
    upgraded.add(scene);
    upgrade(scene);
  }
  return original.call(this,scene,camera);
};
