import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

// Presentation-only upgrade layered onto app-v5. It patches the shared Three.js
// renderer before app-v5 starts rendering, so AI/physics stay untouched.

const BASE_TRACK_CENTER=[
[382.1,427.9],[360.6,427.9],[339.9,428.8],[322.8,433.8],[312.7,445.5],[308.0,462.5],
[301.8,479.4],[289.4,491.5],[271.5,497.4],[250.9,499.1],[229.6,499.4],[208.1,499.4],
[186.7,499.4],[165.3,499.4],[144.1,498.6],[125.3,494.5],[113.1,484.2],[110.0,468.2],
[113.4,449.7],[119.3,430.9],[125.7,412.1],[132.3,393.4],[139.2,374.8],[146.1,356.2],
[152.9,337.6],[159.5,318.9],[165.0,300.4],[167.1,283.0],[166.0,267.2],[167.3,252.2],
[176.0,238.4],[191.2,227.5],[209.5,220.1],[228.7,214.7],[248.2,210.2],[268.0,206.2],
[287.7,201.8],[307.2,197.2],[326.8,192.9],[346.6,188.9],[366.4,185.0],[386.4,181.3],
[406.4,178.0],[426.7,175.3],[447.3,173.3],[468.0,171.6],[488.5,170.3],[508.8,170.0],
[528.9,171.4],[548.8,174.7],[568.3,179.4],[587.4,184.9],[606.9,189.6],[626.9,192.4],
[647.2,193.1],[667.4,191.9],[687.5,189.3],[707.9,186.7],[728.7,185.0],[749.4,183.9],
[769.1,183.6],[787.8,185.5],[806.6,188.5],[826.0,189.2],[845.9,188.3],[866.0,188.2],
[886.4,189.6],[906.7,192.2],[926.1,197.0],[944.5,204.5],[962.6,212.5],[981.6,217.8],
[1001.8,219.1],[1022.4,218.4],[1042.9,218.9],[1062.6,222.7],[1079.5,231.2],[1090.0,244.1],
[1089.7,258.0],[1078.3,268.2],[1060.0,272.7],[1039.7,272.7],[1019.7,269.5],[1000.8,263.4],
[982.6,255.5],[964.7,246.9],[946.8,238.5],[928.8,230.2],[910.9,221.7],[892.8,214.2],
[874.6,210.0],[856.6,211.3],[839.0,217.9],[821.3,226.3],[802.7,232.9],[783.3,235.8],
[762.9,235.8],[742.0,235.4],[721.2,236.4],[701.5,240.3],[684.1,248.4],[670.3,261.1],
[660.9,277.6],[655.2,295.6],[648.6,311.6],[636.2,322.9],[618.6,329.9],[599.1,334.7],
[579.7,339.4],[561.8,346.7],[548.3,358.9],[540.0,375.8],[533.0,393.9],[522.4,409.0],
[506.9,419.4],[488.1,425.2],[467.7,427.4],[446.4,427.9],[425.0,427.9],[403.5,427.9]
];

const TRACK_SCALE=3.40,HALF_WIDTH=25;
const rough=BASE_TRACK_CENTER.map(([x,y])=>new THREE.Vector3(140+(x-110)*TRACK_SCALE,0,140+(y-170)*TRACK_SCALE));
const spline=new THREE.CatmullRomCurve3(rough,true,'centripetal');
spline.arcLengthDivisions=4200;
const center=spline.getSpacedPoints(900).slice(0,-1).map(p=>[p.x,p.z]);

const material=(color,roughness=.9,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness,flatShading:true});
const basic=color=>new THREE.MeshBasicMaterial({color});

function boundary(side,extra=0){
  const out=[],off=HALF_WIDTH+extra,n=center.length;
  for(let i=0;i<n;i++){
    const prev=center[(i-4+n)%n],next=center[(i+4)%n],p=center[i];
    const dx=next[0]-prev[0],dz=next[1]-prev[1],len=Math.hypot(dx,dz)||1;
    out.push([p[0]+(-dz/len)*off*side,p[1]+(dx/len)*off*side]);
  }
  return out;
}
function frameAt(index,offset=0,side=1){
  const n=center.length,i=((index%n)+n)%n,p=center[i],prev=center[(i-5+n)%n],next=center[(i+5)%n];
  const dx=next[0]-prev[0],dz=next[1]-prev[1],len=Math.hypot(dx,dz)||1,tx=dx/len,tz=dz/len,nx=-tz,nz=tx;
  return{x:p[0]+nx*offset*side,z:p[1]+nz*offset*side,heading:Math.atan2(tz,tx),tx,tz,nx,nz};
}
function curve(points,y){return new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(p[0],y,p[1])),true,'centripetal');}
function ribbonSegment(edge,outer,start,end,y=.16){
  const pos=[],idx=[],n=edge.length;
  for(let i=start;i<=end;i++){
    const k=((i%n)+n)%n;pos.push(edge[k][0],y,edge[k][1],outer[k][0],y,outer[k][1]);
  }
  const rows=end-start+1;
  for(let r=0;r<rows-1;r++){const a=r*2,b=a+1,c=a+2,d=a+3;idx.push(a,c,b,b,c,d);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;
}
function localTurn(i,span=18){
  const n=center.length,a=center[(i-span+n)%n],b=center[i],c=center[(i+span)%n];
  const h1=Math.atan2(b[1]-a[1],b[0]-a[0]),h2=Math.atan2(c[1]-b[1],c[0]-b[0]);
  let d=h2-h1;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;return d;
}

function makeGrandstand(length=56,rows=7){
  const g=new THREE.Group();
  const concrete=material(0xb9b8b2,.98),seatA=material(0x243942,.85),seatB=material(0x5fa2a7,.82),roof=material(0xd7dcdb,.55,.25),steel=material(0x556064,.6,.3);
  for(let r=0;r<rows;r++){
    const step=new THREE.Mesh(new THREE.BoxGeometry(length,1,4.1),concrete);step.position.set(0,.5+r*.82,-r*3.0);g.add(step);
    for(let x=-length/2+2;x<length/2-2;x+=3.2){const seat=new THREE.Mesh(new THREE.BoxGeometry(1.9,.42,1.5),(Math.round(x)+r)%3===0?seatB:seatA);seat.position.set(x,1.05+r*.82,-r*3.0-.65);g.add(seat);}
  }
  const roofSlab=new THREE.Mesh(new THREE.BoxGeometry(length+5,.45,13),roof);roofSlab.position.set(0,rows*.82+6,-rows*2.0);g.add(roofSlab);
  for(const x of [-length*.42,0,length*.42]){const post=new THREE.Mesh(new THREE.BoxGeometry(.65,rows*.82+6,.65),steel);post.position.set(x,(rows*.82+6)/2,-rows*2.0);g.add(post);}
  return g;
}
function placeGrandstand(scene,index,side,offset,scale=1){const f=frameAt(index,offset,side),g=makeGrandstand(56*scale,7);g.position.set(f.x,.06,f.z);g.rotation.y=-f.heading;scene.add(g);}

function makeBuilding(w,d,h,color){
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material(color,.9));body.position.y=h/2;g.add(body);
  const roof=new THREE.Mesh(new THREE.BoxGeometry(w+1,.55,d+1),material(0x73797a,.65,.2));roof.position.y=h+.28;g.add(roof);
  const glass=material(0x6f929e,.32,.35);
  const rows=Math.max(2,Math.floor(h/7));
  for(let r=0;r<rows;r++)for(let x=-w/2+3;x<w/2-2;x+=5.5){const win=new THREE.Mesh(new THREE.BoxGeometry(2.8,.08,2.0),glass);win.rotation.x=Math.PI/2;win.position.set(x,4+r*6,-d/2-.045);g.add(win);}
  return g;
}
function placeBuilding(scene,index,side,offset,w,d,h,color,shift=0){const f=frameAt(index,offset,side),g=makeBuilding(w,d,h,color);g.position.set(f.x+f.tx*shift,0,f.z+f.tz*shift);g.rotation.y=-f.heading+Math.PI/2;scene.add(g);}

function makeTree(){const g=new THREE.Group();const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.5,.68,4.6,6),material(0x72533b,1));trunk.position.y=2.3;g.add(trunk);const crown=new THREE.Mesh(new THREE.ConeGeometry(3.8,7.6,7),material(0x4e704f,1));crown.position.y=7.3;g.add(crown);return g;}

function addEnvironment(scene){
  scene.background=new THREE.Color(0xaeb79f);
  scene.fog=new THREE.Fog(0xaeb79f,780,1650);

  // Restyle existing world and remove the old chunky curb boxes.
  scene.traverse(obj=>{
    if(!obj.isMesh||!obj.material)return;
    const mats=Array.isArray(obj.material)?obj.material:[obj.material];
    for(const m of mats){
      if(!m.color)continue;
      const hex=m.color.getHex();
      if(hex===0xb7a39a)m.color.setHex(0x9ca789);
      if(hex===0x8d6849){m.color.setHex(0x4c5053);m.roughness=.94;m.flatShading=false;m.needsUpdate=true;}
    }
    const p=obj.geometry?.parameters;
    const hex=obj.material?.color?.getHex?.();
    if(obj.geometry?.type==='BoxGeometry'&&p&&p.height<=.25&&p.depth<=4.2&&(hex===0xc94840||hex===0xf2f0e9))obj.visible=false;
  });

  // Soft low-poly land-use patches.
  const patchSpecs=[
    [720,320,560,270,0x879575,.13],[1320,590,520,230,0xaaa58d,-.08],[2080,470,660,250,0x8f9d7c,.1],
    [2740,700,520,250,0xb1a68e,-.15],[1130,980,760,210,0x899778,.04],[2280,930,620,220,0x9aa181,-.08]
  ];
  for(const [x,z,w,d,c,r] of patchSpecs){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),material(c,1));m.rotation.x=-Math.PI/2;m.rotation.z=r;m.position.set(x,-.095,z);scene.add(m);}

  // Dark asphalt and crisp painted edge lines layered over app-v5's road.
  const left=boundary(1),right=boundary(-1),lineL=boundary(1,-1.2),lineR=boundary(-1,-1.2);
  const edgePaint=basic(0xf6f4ed);
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve(lineL,.135),760,.38,6,true),edgePaint));
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve(lineR,.135),760,.38,6,true),edgePaint));
  const rubber=new THREE.MeshBasicMaterial({color:0x25282a,transparent:true,opacity:.13,depthWrite:false});
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve(center,.125),760,.82,5,true),rubber));

  // Cleaner apex-only curbs: curved ribbons rather than long red boxes.
  const outerL=boundary(1,3.0),outerR=boundary(-1,3.0),red=material(0xc4413a,.9),white=material(0xf2f0e9,.94);
  let last=-1000;
  for(let i=0;i<center.length;i+=10){
    const turn=localTurn(i,20);if(Math.abs(turn)<.095||i-last<42)continue;last=i;
    const isLeft=turn>0,edge=isLeft?left:right,outer=isLeft?outerL:outerR;
    for(let s=i-16,t=0;s<i+16;s+=6,t++)scene.add(new THREE.Mesh(ribbonSegment(edge,outer,s,s+6,.155),t%2?white:red));
  }

  // Grandstands around visible spectator zones.
  placeGrandstand(scene,88,1,82,1.0);placeGrandstand(scene,318,-1,90,.92);placeGrandstand(scene,685,1,94,1.07);placeGrandstand(scene,895,-1,88,.9);

  // Urban blocks / apartments, intentionally clustered instead of scattered everywhere.
  const buildings=[
    [170,1,134,28,24,42,0xc4b5a7,-35],[188,1,150,34,28,58,0xb7a79c,4],[210,1,142,22,24,34,0xd0c5ba,42],
    [495,-1,148,32,30,62,0xb0aaa4,-44],[520,-1,132,24,22,38,0xc9baac,0],[545,-1,158,38,32,74,0xa8a49f,48],
    [812,1,144,30,28,50,0xc2b1a2,-42],[838,1,160,26,24,36,0xd1c3b8,0],[864,1,142,36,30,66,0xaaa8a3,46]
  ];
  buildings.forEach(spec=>placeBuilding(scene,...spec));

  // Simple paved paddock/service areas.
  for(const [idx,side,off,w,d] of [[305,-1,112,118,58],[672,1,120,104,54],[882,-1,110,96,48]]){
    const f=frameAt(idx,off,side),m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),material(0x858a87,1));m.rotation.x=-Math.PI/2;m.rotation.z=-f.heading;m.position.set(f.x,.005,f.z);scene.add(m);
  }

  // Trees break up the empty ground without creating visual noise.
  for(let i=0;i<30;i++){
    const idx=(35+i*31)%center.length,side=i%2?1:-1,off=68+(i%4)*11,f=frameAt(idx,off,side),t=makeTree();
    t.position.set(f.x,0,f.z);t.scale.setScalar(.78+(i%3)*.12);scene.add(t);
  }

  // Tone down lidar lines slightly; center ray stays the clearest one.
  const lines=[];scene.traverse(o=>{if(o.isLine&&o.material?.isLineBasicMaterial)lines.push(o);});
  lines.forEach((l,i)=>{l.material.transparent=true;l.material.opacity=i===Math.floor(lines.length/2)?.72:.42;l.material.depthTest=true;l.material.needsUpdate=true;});
}

const originalRender=THREE.WebGLRenderer.prototype.render;
const upgraded=new WeakSet();
THREE.WebGLRenderer.prototype.render=function(scene,camera){
  if(this.domElement?.id==='threeSim'&&!upgraded.has(scene)){
    upgraded.add(scene);
    addEnvironment(scene);
  }
  return originalRender.call(this,scene,camera);
};
