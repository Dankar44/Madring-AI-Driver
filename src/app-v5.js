import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const canvas=document.querySelector('#sim'),ctx=canvas.getContext('2d');
const threeCanvas=document.querySelector('#threeSim');
const canvasWrap=document.querySelector('#canvasWrap');
const minimapCanvas=document.querySelector('#minimap'),minimapCtx=minimapCanvas.getContext('2d');
const sensorOverlay=document.querySelector('#sensorOverlay'),sensorCtx=sensorOverlay.getContext('2d');
const sceneCounter=document.querySelector('#sceneCounter');
const generationEl=document.querySelector('#generation'),aliveEl=document.querySelector('#alive');
const bestProgressEl=document.querySelector('#bestProgress'),bestFitnessEl=document.querySelector('#bestFitness'),bestLapsEl=document.querySelector('#bestLaps');
const toggleRun=document.querySelector('#toggleRun'),resetRun=document.querySelector('#resetRun'),saveMemory=document.querySelector('#saveMemory');
const resumeTraining=document.querySelector('#resumeTraining'),clearMemories=document.querySelector('#clearMemories');
const memoryTimeline=document.querySelector('#memoryTimeline'),memoryStatus=document.querySelector('#memoryStatus');
const speedSelect=document.querySelector('#speedSelect'),viewSelect=document.querySelector('#viewSelect'),viewStatus=document.querySelector('#viewStatus');

const W=canvas.width,H=canvas.height;
const POP_SIZE=70;
const SENSOR_ANGLES=[-1.0,-0.6,-0.3,0,.3,.6,1.0];
const SENSOR_RANGE=115;
const MAX_STEPS=9200;
const TRACK_SCALE=3.40;
const TRACK_HALF_WIDTH=25;
const CAMERA_ZOOM_2D=2.65;
const VIEW_KEY='madring-ai-driver-view-v5';
const MEMORY_KEY='madring-ai-driver-memories-v1';
const AUTO_MEMORY_GENERATIONS=new Set([1,5,10,25,50,100]);

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

function dist(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1]);}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function lerp(a,b,t){return a+(b-a)*t;}
function lerpAngle(a,b,t){let d=(b-a+Math.PI)%(Math.PI*2)-Math.PI;if(d<-Math.PI)d+=Math.PI*2;return a+d*t;}
function wrapAngle(v){while(v>Math.PI)v-=Math.PI*2;while(v<-Math.PI)v+=Math.PI*2;return v;}
function fmtFitness(v){return Math.round(v||0).toLocaleString();}

// A dense centripetal spline is the single geometry source for render, collisions,
// sensors, minimap and progress. No separate jagged render path.
const roughCenter=BASE_TRACK_CENTER.map(([x,y])=>[140+(x-110)*TRACK_SCALE,140+(y-170)*TRACK_SCALE]);
const smoothCurve=new THREE.CatmullRomCurve3(roughCenter.map(([x,y])=>new THREE.Vector3(x,0,y)),true,'centripetal');
smoothCurve.arcLengthDivisions=4000;
const SMOOTH_SAMPLES=900;
const smoothPts=smoothCurve.getSpacedPoints(SMOOTH_SAMPLES).slice(0,-1);
const track={center:smoothPts.map(p=>[p.x,p.z]),halfWidth:TRACK_HALF_WIDTH};

function boundary(side,extra=0){
  const out=[],off=track.halfWidth+extra,n=track.center.length;
  for(let i=0;i<n;i++){
    const prev=track.center[(i-4+n)%n],next=track.center[(i+4)%n],p=track.center[i];
    const dx=next[0]-prev[0],dy=next[1]-prev[1],len=Math.hypot(dx,dy)||1;
    out.push([p[0]+(-dy/len)*off*side,p[1]+(dx/len)*off*side]);
  }
  return out;
}
const leftEdge=boundary(1),rightEdge=boundary(-1);
const shoulderLeft=boundary(1,3.0),shoulderRight=boundary(-1,3.0);
const leftBarrier=boundary(1,10),rightBarrier=boundary(-1,10);

const segments=[];let totalLength=0;
for(let i=0;i<track.center.length;i++){
  const a=track.center[i],b=track.center[(i+1)%track.center.length],len=dist(a,b);
  segments.push({a,b,len,start:totalLength});totalLength+=len;
}
const bounds=track.center.reduce((b,p)=>({
  minX:Math.min(b.minX,p[0]),maxX:Math.max(b.maxX,p[0]),minY:Math.min(b.minY,p[1]),maxY:Math.max(b.maxY,p[1])
}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});

function nearestTrackPoint(x,y){
  let best=null;
  for(const s of segments){
    const vx=s.b[0]-s.a[0],vy=s.b[1]-s.a[1],wx=x-s.a[0],wy=y-s.a[1],vv=vx*vx+vy*vy;
    const t=clamp((wx*vx+wy*vy)/(vv||1),0,1),px=s.a[0]+vx*t,py=s.a[1]+vy*t,d=Math.hypot(x-px,y-py);
    if(!best||d<best.d)best={x:px,y:py,d,progress:(s.start+s.len*t)/totalLength,heading:Math.atan2(vy,vx)};
  }
  return best;
}

const WORLD_W=3700,WORLD_H=1500;
const maskCanvas=document.createElement('canvas');
maskCanvas.width=WORLD_W;maskCanvas.height=WORLD_H;
const maskCtx=maskCanvas.getContext('2d',{willReadFrequently:true});
maskCtx.lineCap='round';maskCtx.lineJoin='round';maskCtx.strokeStyle='#fff';maskCtx.lineWidth=track.halfWidth*2;
maskCtx.beginPath();track.center.forEach((p,i)=>i?maskCtx.lineTo(...p):maskCtx.moveTo(...p));maskCtx.closePath();maskCtx.stroke();
const maskData=maskCtx.getImageData(0,0,WORLD_W,WORLD_H).data;
function onTrack(x,y){
  const ix=Math.round(x),iy=Math.round(y);
  if(ix<0||iy<0||ix>=WORLD_W||iy>=WORLD_H)return false;
  return maskData[(iy*WORLD_W+ix)*4+3]>20;
}

class Genome{
  constructor(weights){this.weights=weights??Array.from({length:16},()=>Math.random()*2-1);}
  cloneMutated(rate=.22,scale=.45){return new Genome(this.weights.map(w=>Math.random()<rate?w+(Math.random()*2-1)*scale:w));}
}

class Car{
  constructor(genome,champion=false){this.genome=genome;this.champion=champion;this.reset();}
  reset(){
    const p=track.center[0],q=track.center[1];
    this.x=p[0];this.y=p[1];this.angle=Math.atan2(q[1]-p[1],q[0]-p[0]);
    this.speed=0;this.alive=true;this.steps=0;this.fitness=0;this.maxProgress=0;this.lastProgress=0;this.laps=0;
  }
  sensorDistances(){
    return SENSOR_ANGLES.map(a=>{const ang=this.angle+a;let hit=SENSOR_RANGE;
      for(let d=4;d<=SENSOR_RANGE;d+=3){if(!onTrack(this.x+Math.cos(ang)*d,this.y+Math.sin(ang)*d)){hit=d;break;}}
      return hit;
    });
  }
  sense(){return this.sensorDistances().map(d=>d/SENSOR_RANGE);}
  update(){
    if(!this.alive)return;this.steps++;
    const s=this.sense(),w=this.genome.weights;
    const steer=Math.tanh(s[0]*w[0]+s[1]*w[1]+s[2]*w[2]+s[4]*w[3]+s[5]*w[4]+s[6]*w[5]+w[6]);
    const throttle=Math.tanh(s[3]*w[7]+(s[2]+s[4])*w[8]+w[9]);
    const brake=Math.tanh((1-s[3])*w[10]+Math.abs(steer)*w[11]+w[12]);
    const targetSpeed=1.45+Math.max(0,throttle)*3.8-Math.max(0,brake)*2.1;
    this.speed+=(targetSpeed-this.speed)*.08;this.speed=clamp(this.speed,.7,5.25);
    this.angle+=steer*.044*(.65+this.speed/5.25);
    this.x+=Math.cos(this.angle)*this.speed;this.y+=Math.sin(this.angle)*this.speed;
    const n=nearestTrackPoint(this.x,this.y),headingAlignment=(Math.cos(this.angle-n.heading)+1)/2;
    const delta=n.progress-this.lastProgress,wrappedDelta=delta<-.5?delta+1:delta>.5?delta-1:delta;
    if(this.lastProgress>.82&&n.progress<.18&&wrappedDelta>0){this.laps++;this.fitness+=1400;this.maxProgress=1;}
    this.fitness+=Math.max(0,wrappedDelta)*2350+headingAlignment*.03+this.speed*.003;
    if(this.laps===0&&n.progress>this.maxProgress&&n.progress-this.maxProgress<.2)this.maxProgress=n.progress;
    this.lastProgress=n.progress;
    if(!onTrack(this.x,this.y)||this.steps>MAX_STEPS){this.alive=false;if(!onTrack(this.x,this.y))this.fitness-=4;}
  }
}

let generation=1,paused=false,simSpeed=1,population=[],bestEver=null,replay=null,currentView='top';
let memories=loadMemories();
const follow2D={x:track.center[0][0],y:track.center[0][1],angle:0,ready:false};
const follow3D=new THREE.Vector3(track.center[0][0],0,track.center[0][1]);
let follow3DReady=false;

function loadMemories(){try{const v=JSON.parse(localStorage.getItem(MEMORY_KEY)||'[]');return Array.isArray(v)?v.filter(m=>Array.isArray(m.weights)):[];}catch{return [];}}
function persistMemories(){try{localStorage.setItem(MEMORY_KEY,JSON.stringify(memories.slice(-30)));}catch{}}
function bestCurrentCar(){return [...population].sort((a,b)=>b.fitness-a.fitness)[0]||null;}
function shouldAutoSave(gen){return AUTO_MEMORY_GENERATIONS.has(gen)||(gen>100&&gen%50===0);}
function storeMemory(car,source='manual',gen=generation){
  if(!car)return;if(source==='auto'&&memories.some(m=>m.source==='auto'&&m.generation===gen))return;
  memories.push({id:`${Date.now()}-${Math.random().toString(16).slice(2)}`,generation:gen,source,fitness:car.fitness,progress:car.laps>0?1:car.maxProgress,laps:car.laps,weights:[...car.genome.weights],createdAt:new Date().toISOString()});
  memories=memories.slice(-30);persistMemories();renderMemories();memoryStatus.textContent=`Saved ${source} memory from generation ${gen}.`;
}
function freshPopulation(seedGenome=null){
  population=[];
  for(let i=0;i<POP_SIZE;i++){
    const genome=seedGenome?(i===0?seedGenome:seedGenome.cloneMutated()):new Genome();
    population.push(new Car(genome,i===0&&!!seedGenome));
  }
  follow2D.ready=false;follow3DReady=false;
}
function evolve(){
  population.sort((a,b)=>b.fitness-a.fitness);const winner=population[0];
  if(!bestEver||winner.fitness>bestEver.fitness)bestEver={fitness:winner.fitness,progress:winner.maxProgress,laps:winner.laps,genome:new Genome([...winner.genome.weights])};
  if(shouldAutoSave(generation))storeMemory(winner,'auto',generation);
  const elite=population.slice(0,Math.max(4,Math.floor(POP_SIZE*.12)));
  population=Array.from({length:POP_SIZE},(_,i)=>{const parent=elite[i%elite.length];return new Car(i===0?new Genome([...parent.genome.weights]):parent.genome.cloneMutated(),i===0);});
  generation++;follow2D.ready=false;follow3DReady=false;
}
function startReplay(memory){replay={memory,car:new Car(new Genome([...memory.weights]),true)};paused=false;follow2D.ready=false;follow3DReady=false;toggleRun.textContent='Pause replay';resumeTraining.disabled=false;memoryStatus.textContent=`Replaying generation ${memory.generation}.`;renderMemories();}
function leaveReplay(){replay=null;paused=false;follow2D.ready=false;follow3DReady=false;toggleRun.textContent='Pause';resumeTraining.disabled=true;memoryStatus.textContent=`Back to live training at generation ${generation}.`;renderMemories();}
function renderMemories(){
  memoryTimeline.innerHTML='';
  if(!memories.length){const p=document.createElement('p');p.className='memory-empty';p.textContent='No neural memories yet.';memoryTimeline.appendChild(p);return;}
  [...memories].sort((a,b)=>a.generation-b.generation).forEach(memory=>{
    const card=document.createElement('article');card.className=`memory-card${replay?.memory.id===memory.id?' active':''}`;
    const gen=document.createElement('div');gen.className='memory-gen';const strong=document.createElement('strong');strong.textContent=`Gen ${memory.generation}`;
    const badge=document.createElement('span');badge.className='badge';badge.textContent=memory.source.toUpperCase();gen.append(strong,badge);
    const dl=document.createElement('dl');
    for(const [label,value] of [['Progress',`${Math.round((memory.progress||0)*100)}%`],['Fitness',fmtFitness(memory.fitness)],['Laps',String(memory.laps||0)]]){
      const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);dl.appendChild(row);
    }
    const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=replay?.memory.id===memory.id?'Replaying':'Replay this brain';button.disabled=replay?.memory.id===memory.id;button.addEventListener('click',()=>startReplay(memory));
    card.append(gen,dl,button);memoryTimeline.appendChild(card);
  });
}

// ---------- 2D top-down ----------
function trace2D(){ctx.beginPath();track.center.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();}
function drawStartLine2D(){
  const p=track.center[0],q=track.center[1],t=Math.atan2(q[1]-p[1],q[0]-p[0]);
  const nx=Math.cos(t+Math.PI/2),ny=Math.sin(t+Math.PI/2),cells=8,cell=(track.halfWidth*2)/cells;
  for(let i=0;i<cells;i++){
    const off=-track.halfWidth+cell*(i+.5),cx=p[0]+nx*off,cy=p[1]+ny*off;
    ctx.save();ctx.translate(cx,cy);ctx.rotate(t);ctx.fillStyle=i%2?'#1d1d1d':'#fff';ctx.fillRect(-2.8,-cell/2,5.6,cell);ctx.restore();
  }
}
function drawTrack2D(){
  ctx.lineCap='round';ctx.lineJoin='round';
  ctx.strokeStyle='#f4f1ea';ctx.lineWidth=track.halfWidth*2+6;trace2D();ctx.stroke();
  ctx.strokeStyle='#8f6848';ctx.lineWidth=track.halfWidth*2;trace2D();ctx.stroke();
  ctx.strokeStyle='rgba(80,56,41,.20)';ctx.lineWidth=1;trace2D();ctx.stroke();drawStartLine2D();
}
function drawFormulaCar2D(car,alpha=1){
  ctx.save();ctx.globalAlpha=alpha;ctx.translate(car.x,car.y);ctx.rotate(car.angle);
  ctx.fillStyle='#101214';ctx.fillRect(-7,-7.6,5.1,3.2);ctx.fillRect(-7,4.4,5.1,3.2);ctx.fillRect(5,-7.1,4.7,3);ctx.fillRect(5,4.1,4.7,3);
  ctx.fillStyle='#15181a';ctx.fillRect(-10.7,-7.7,2,15.4);ctx.fillRect(10.2,-7.8,1.8,15.6);
  ctx.fillStyle=car.champion?'#f2f4f5':'#1cc0d2';
  ctx.beginPath();ctx.moveTo(-8.5,-2.8);ctx.lineTo(-5.2,-4.5);ctx.lineTo(-.5,-4.3);ctx.lineTo(4,-2.8);ctx.lineTo(9,-1.25);ctx.lineTo(13,-.55);ctx.lineTo(13,.55);ctx.lineTo(9,1.25);ctx.lineTo(4,2.8);ctx.lineTo(-.5,4.3);ctx.lineTo(-5.2,4.5);ctx.lineTo(-8.5,2.8);ctx.closePath();ctx.fill();
  ctx.fillStyle='#20262a';ctx.beginPath();ctx.ellipse(.3,0,2.7,1.9,0,0,Math.PI*2);ctx.fill();ctx.restore();
}
function drawSensors2D(car){
  const ds=car.sensorDistances();ctx.save();ctx.lineWidth=.75;
  for(let i=0;i<SENSOR_ANGLES.length;i++){
    const a=car.angle+SENSOR_ANGLES[i],d=ds[i],ex=car.x+Math.cos(a)*d,ey=car.y+Math.sin(a)*d;
    ctx.strokeStyle='rgba(255,255,255,.92)';ctx.beginPath();ctx.moveTo(car.x,car.y);ctx.lineTo(ex,ey);ctx.stroke();
    const lx=car.x+Math.cos(a)*Math.max(14,d-6),ly=car.y+Math.sin(a)*Math.max(14,d-6);
    ctx.save();ctx.translate(lx,ly);ctx.rotate(Math.PI/2+follow2D.angle);ctx.font='700 5.6px system-ui';ctx.textAlign='center';ctx.lineWidth=1.5;ctx.strokeStyle='#2b2622';ctx.fillStyle='#fff';const v=(d/SENSOR_RANGE).toFixed(2);ctx.strokeText(v,0,0);ctx.fillText(v,0,0);ctx.restore();
  }
  ctx.restore();
}
function update2DCamera(focus){
  if(!focus)return;const ahead=48,tx=focus.x+Math.cos(focus.angle)*ahead,ty=focus.y+Math.sin(focus.angle)*ahead;
  if(!follow2D.ready){follow2D.x=tx;follow2D.y=ty;follow2D.angle=focus.angle;follow2D.ready=true;}
  else{follow2D.x=lerp(follow2D.x,tx,.14);follow2D.y=lerp(follow2D.y,ty,.14);follow2D.angle=lerpAngle(follow2D.angle,focus.angle,.11);}
}
function renderTop(focus,cars){
  ctx.fillStyle='#b7a39a';ctx.fillRect(0,0,W,H);update2DCamera(focus);
  ctx.save();ctx.translate(W*.5,H*.64);ctx.scale(CAMERA_ZOOM_2D,CAMERA_ZOOM_2D);ctx.rotate(-Math.PI/2-follow2D.angle);ctx.translate(-follow2D.x,-follow2D.y);drawTrack2D();
  for(const car of cars)if(car.alive&&car!==focus)drawFormulaCar2D(car,.10);
  if(focus){drawFormulaCar2D(focus,1);drawSensors2D(focus);}ctx.restore();
}

// ---------- polished 3D ----------
const renderer=new THREE.WebGLRenderer({canvas:threeCanvas,antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.setSize(W,H,false);renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=false;
const scene=new THREE.Scene();scene.background=new THREE.Color(0xb7a39a);
const aspect=W/H,ORTHO_HEIGHT=198;
const camera3D=new THREE.OrthographicCamera(-ORTHO_HEIGHT*aspect/2,ORTHO_HEIGHT*aspect/2,ORTHO_HEIGHT/2,-ORTHO_HEIGHT/2,.1,5000);
scene.add(new THREE.HemisphereLight(0xf4f7f8,0x7c665d,1.65));
const sun=new THREE.DirectionalLight(0xffffff,1.45);sun.position.set(-220,340,-180);scene.add(sun);

const mat=(color,roughness=.85,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness,flatShading:true});
const terrain=new THREE.Mesh(new THREE.PlaneGeometry(5000,3000),mat(0xb7a39a,1));terrain.rotation.x=-Math.PI/2;terrain.position.y=-.10;scene.add(terrain);

function ribbonGeometry(left,right,y=0){
  const pos=[],idx=[],n=Math.min(left.length,right.length);
  for(let i=0;i<n;i++)pos.push(left[i][0],y,left[i][1],right[i][0],y,right[i][1]);
  for(let i=0;i<n;i++){const j=(i+1)%n,a=i*2,b=a+1,c=j*2,d=c+1;idx.push(a,c,b,b,c,d);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;
}
const shoulderMesh=new THREE.Mesh(ribbonGeometry(shoulderLeft,shoulderRight,.02),mat(0xf2f0e9,.96));
const roadMesh=new THREE.Mesh(ribbonGeometry(leftEdge,rightEdge,.08),mat(0x8d6849,.93));
scene.add(shoulderMesh,roadMesh);

function curveFromPoints(points,y){return new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(p[0],y,p[1])),true,'centripetal');}
const railLowMat=mat(0x8f999c,.52,.45),railTopMat=mat(0xcfd7d9,.42,.55),postMat=mat(0xaeb8ba,.48,.45);
function addSmoothBarrier(points){
  const low=curveFromPoints(points,1.15),high=curveFromPoints(points,2.95);
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(low,760,.55,8,true),railLowMat));
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(high,760,.36,8,true),railTopMat));
  for(let i=0;i<points.length;i+=26){const p=points[i],post=new THREE.Mesh(new THREE.BoxGeometry(.55,3.0,.55),postMat);post.position.set(p[0],1.5,p[1]);scene.add(post);}
}
addSmoothBarrier(leftBarrier);addSmoothBarrier(rightBarrier);

// Real curb treatment: short alternating red/white blocks only on meaningful corners.
// The previous version placed giant boxes around the entire circuit; those were the ugly red strips.
const curbRed=mat(0xc94840,.86),curbWhite=mat(0xf2f0e9,.90);
function localTurn(i,span=10){
  const n=track.center.length,a=track.center[(i-span+n)%n],b=track.center[i],c=track.center[(i+span)%n];
  const h1=Math.atan2(b[1]-a[1],b[0]-a[0]),h2=Math.atan2(c[1]-b[1],c[0]-b[0]);
  return wrapAngle(h2-h1);
}
function addCornerCurbs(){
  const n=track.center.length;let stripe=0;
  for(let i=0;i<n;i+=6){
    const turn=localTurn(i,12);if(Math.abs(turn)<.055)continue;
    const side=turn>0?1:-1,edge=side>0?leftEdge:rightEdge;
    const j=(i+5)%n,a=edge[i],b=edge[j],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<1)continue;
    const ang=Math.atan2(dz,dx),nx=-dz/len,nz=dx/len;
    const block=new THREE.Mesh(new THREE.BoxGeometry(len,.16,2.7),(stripe++%2)?curbWhite:curbRed);
    block.position.set((a[0]+b[0])/2+nx*side*.65,.18,(a[1]+b[1])/2+nz*side*.65);block.rotation.y=-ang;scene.add(block);
  }
}
addCornerCurbs();

function addStartLine3D(){
  const p=track.center[0],q=track.center[3],heading=Math.atan2(q[1]-p[1],q[0]-p[0]);
  const nx=-Math.sin(heading),nz=Math.cos(heading),cells=10,cell=(track.halfWidth*2)/cells;
  for(let row=0;row<2;row++)for(let i=0;i<cells;i++){
    const off=-track.halfWidth+cell*(i+.5),forward=(row-.5)*2.2;
    const x=p[0]+nx*off+Math.cos(heading)*forward,z=p[1]+nz*off+Math.sin(heading)*forward;
    const tile=new THREE.Mesh(new THREE.BoxGeometry(2.25,.08,cell),mat((i+row)%2?0x17191a:0xf5f5f3,.9));tile.position.set(x,.17,z);tile.rotation.y=-heading;scene.add(tile);
  }
}
addStartLine3D();

function extrudedPlanShape(points,height,material){
  const s=new THREE.Shape();s.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)s.lineTo(points[i][0],points[i][1]);s.closePath();
  const g=new THREE.ExtrudeGeometry(s,{depth:height,bevelEnabled:true,bevelSize:.22,bevelThickness:.15,bevelSegments:2,curveSegments:2});
  g.rotateX(Math.PI/2);g.translate(0,height,0);return new THREE.Mesh(g,material);
}
function cylinderBetween(a,b,r,material){
  const mid=new THREE.Vector3().addVectors(a,b).multiplyScalar(.5),len=a.distanceTo(b);
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,len,8),material);mesh.position.copy(mid);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3().subVectors(b,a).normalize());return mesh;
}
function makeF1(color=0x19bdd0){
  const g=new THREE.Group();
  const body=mat(color,.62,.08),carbon=mat(0x0c1012,.42,.18),dark=mat(0x242a2c,.58,.12),accent=mat(0xeaf7f9,.62,.05);
  const tyre=mat(0x08090a,.98,.02),rim=mat(0x606a6d,.40,.62),helmet=mat(0xf5d45d,.48,.12);

  const floor=new THREE.Mesh(new THREE.BoxGeometry(21,.28,8.0),carbon);floor.position.set(-.2,.48,0);g.add(floor);
  const chassis=extrudedPlanShape([[-8.6,-2.5],[-6.0,-3.7],[-1.2,-4.4],[2.0,-4.1],[5.6,-2.55],[10.2,-1.25],[13.2,-.72],[13.2,.72],[10.2,1.25],[5.6,2.55],[2.0,4.1],[-1.2,4.4],[-6.0,3.7],[-8.6,2.5]],1.35,body);chassis.position.y=.48;g.add(chassis);
  const nose=extrudedPlanShape([[4.7,-1.05],[13.0,-.68],[17.4,-.38],[18.4,-.25],[18.4,.25],[17.4,.38],[13.0,.68],[4.7,1.05]],.74,body);nose.position.y=1.0;g.add(nose);
  const engineCover=extrudedPlanShape([[-7.0,-1.2],[-3.0,-1.75],[1.2,-1.3],[4.1,-.55],[4.1,.55],[1.2,1.3],[-3.0,1.75],[-7.0,1.2]],1.0,accent);engineCover.position.y=1.62;g.add(engineCover);
  const sideL=extrudedPlanShape([[-4.8,-3.15],[.8,-3.75],[4.5,-2.75],[2.2,-2.05],[-4.9,-2.2]],.86,body);sideL.position.y=.68;g.add(sideL);
  const sideR=sideL.clone();sideR.scale.z=-1;g.add(sideR);

  const cockpit=new THREE.Mesh(new THREE.SphereGeometry(2.0,14,8,0,Math.PI*2,0,Math.PI*.60),dark);cockpit.scale.set(1.35,.80,.88);cockpit.position.set(-.3,1.96,0);g.add(cockpit);
  const driverHelmet=new THREE.Mesh(new THREE.SphereGeometry(.82,12,8),helmet);driverHelmet.scale.y=.82;driverHelmet.position.set(-.15,2.56,0);g.add(driverHelmet);
  const halo=new THREE.Mesh(new THREE.TorusGeometry(2.0,.15,6,18,Math.PI*1.2),carbon);halo.rotation.set(Math.PI/2,0,Math.PI*.40);halo.position.set(.25,2.68,0);g.add(halo);
  const haloStem=new THREE.Mesh(new THREE.BoxGeometry(3.2,.24,.24),carbon);haloStem.position.set(2.0,2.64,0);g.add(haloStem);

  const frontWing=new THREE.Mesh(new THREE.BoxGeometry(1.0,.28,16.0),carbon);frontWing.position.set(18.1,.72,0);g.add(frontWing);
  const frontFlap=new THREE.Mesh(new THREE.BoxGeometry(2.5,.18,13.8),accent);frontFlap.position.set(17.25,.96,0);g.add(frontFlap);
  for(const z of [-7.8,7.8]){const ep=new THREE.Mesh(new THREE.BoxGeometry(2.6,1.35,.28),carbon);ep.position.set(17.5,1.05,z);g.add(ep);}
  const rearWing=new THREE.Mesh(new THREE.BoxGeometry(1.45,2.15,13.7),carbon);rearWing.position.set(-9.2,2.0,0);g.add(rearWing);
  const rearTop=new THREE.Mesh(new THREE.BoxGeometry(3.0,.28,13.8),accent);rearTop.position.set(-8.7,3.05,0);g.add(rearTop);

  const wheelGeo=new THREE.CylinderGeometry(2.1,2.1,2.7,16);
  for(const [x,z] of [[-5.4,-6.0],[-5.4,6.0],[10.1,-5.75],[10.1,5.75]]){
    const wheel=new THREE.Mesh(wheelGeo,tyre);wheel.rotation.x=Math.PI/2;wheel.position.set(x,1.5,z);g.add(wheel);
    const r=new THREE.Mesh(new THREE.CylinderGeometry(.86,.86,2.76,14),rim);r.rotation.x=Math.PI/2;r.position.set(x,1.5,z);g.add(r);
    const inner=z>0?3.75:-3.75;
    g.add(cylinderBetween(new THREE.Vector3(x-.8,1.20,inner),new THREE.Vector3(x,1.50,z),.11,carbon));
    g.add(cylinderBetween(new THREE.Vector3(x+1.0,1.58,inner),new THREE.Vector3(x,1.50,z),.10,carbon));
  }
  const rearLight=new THREE.Mesh(new THREE.BoxGeometry(.35,.45,1.0),mat(0xff2d2d,.55,.05));rearLight.position.set(-9.2,1.4,0);g.add(rearLight);
  const spine=new THREE.Mesh(new THREE.BoxGeometry(10,.16,.36),accent);spine.position.set(7.8,1.95,0);g.add(spine);
  g.scale.setScalar(.82);
  return g;
}

const leaderCar3D=makeF1();scene.add(leaderCar3D);
const sensorGroup=new THREE.Group();scene.add(sensorGroup);
const sensorLines=[];
for(let i=0;i<SENSOR_ANGLES.length;i++){
  const geom=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(1,0,0)]);
  const line=new THREE.Line(geom,new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.82,depthTest:true}));sensorGroup.add(line);sensorLines.push(line);
}

function update3DObjects(focus){
  if(!focus)return null;
  leaderCar3D.visible=true;leaderCar3D.position.set(focus.x,.18,focus.y);leaderCar3D.rotation.y=-focus.angle;
  const ds=focus.sensorDistances();
  for(let i=0;i<SENSOR_ANGLES.length;i++){
    const a=focus.angle+SENSOR_ANGLES[i],d=ds[i];
    const arr=new Float32Array([focus.x,.28,focus.y,focus.x+Math.cos(a)*d,.28,focus.y+Math.sin(a)*d]);
    sensorLines[i].geometry.setAttribute('position',new THREE.BufferAttribute(arr,3));sensorLines[i].geometry.attributes.position.needsUpdate=true;sensorLines[i].geometry.computeBoundingSphere();
  }
  return ds;
}
function update3DCamera(focus){
  if(!focus)return;
  const ahead=32,target=new THREE.Vector3(focus.x+Math.cos(focus.angle)*ahead,0,focus.y+Math.sin(focus.angle)*ahead);
  if(!follow3DReady){follow3D.copy(target);follow3DReady=true;}else follow3D.lerp(target,.14);
  const az=Math.PI/4,horizontal=235,elevation=Math.PI/6,height=horizontal*Math.tan(elevation);
  camera3D.position.set(follow3D.x+Math.cos(az)*horizontal,height,follow3D.z+Math.sin(az)*horizontal);
  camera3D.up.set(0,1,0);camera3D.lookAt(follow3D);camera3D.updateProjectionMatrix();
}
function renderSensorLabels(focus,ds){
  sensorCtx.clearRect(0,0,sensorOverlay.width,sensorOverlay.height);if(currentView!=='iso'||!focus||!ds)return;
  sensorCtx.font='700 12px system-ui';sensorCtx.textAlign='center';sensorCtx.textBaseline='middle';
  for(let i=0;i<SENSOR_ANGLES.length;i++){
    const a=focus.angle+SENSOR_ANGLES[i],d=ds[i];
    const p=new THREE.Vector3(focus.x+Math.cos(a)*Math.max(18,d-7),.42,focus.y+Math.sin(a)*Math.max(18,d-7));p.project(camera3D);
    const x=(p.x*.5+.5)*sensorOverlay.width,y=(-p.y*.5+.5)*sensorOverlay.height,v=(d/SENSOR_RANGE).toFixed(2);
    sensorCtx.lineWidth=3;sensorCtx.strokeStyle='rgba(34,30,28,.88)';sensorCtx.fillStyle='#fff';sensorCtx.strokeText(v,x,y);sensorCtx.fillText(v,x,y);
  }
}
function renderIso(focus){const ds=update3DObjects(focus);update3DCamera(focus);renderer.render(scene,camera3D);renderSensorLabels(focus,ds);}

// ---------- flat HUD ----------
function drawMinimap(focus){
  const c=minimapCtx,w=minimapCanvas.width,h=minimapCanvas.height,pad=10;c.clearRect(0,0,w,h);c.fillStyle='rgba(20,20,20,.82)';c.beginPath();c.roundRect(0,0,w,h,12);c.fill();
  const bw=bounds.maxX-bounds.minX,bh=bounds.maxY-bounds.minY,scale=Math.min((w-pad*2)/bw,(h-pad*2-14)/bh),ox=(w-bw*scale)/2-bounds.minX*scale,oy=15+(h-18-bh*scale)/2-bounds.minY*scale;
  c.strokeStyle='#f0eee8';c.lineWidth=3;c.lineJoin='round';c.lineCap='round';c.beginPath();track.center.forEach((p,i)=>{const x=ox+p[0]*scale,y=oy+p[1]*scale;i?c.lineTo(x,y):c.moveTo(x,y);});c.closePath();c.stroke();
  if(focus){c.fillStyle='#ff694f';c.beginPath();c.arc(ox+focus.x*scale,oy+focus.y*scale,4,0,Math.PI*2);c.fill();}
  c.fillStyle='rgba(255,255,255,.8)';c.font='700 10px system-ui';c.fillText('MADRING',10,12);
}
function setView(mode){
  currentView=mode==='iso'?'iso':'top';canvasWrap.classList.toggle('isometric-view',currentView==='iso');canvasWrap.classList.toggle('top-view',currentView==='top');
  viewSelect.value=currentView;viewStatus.textContent=currentView==='iso'?'3D isometric · clean corner curbs · single focus car':'Top-down view';sensorOverlay.style.display=currentView==='iso'?'block':'none';
  follow3DReady=false;try{localStorage.setItem(VIEW_KEY,currentView);}catch{}
}
function stepSimulation(){
  if(replay){if(!paused){for(let k=0;k<simSpeed;k++){replay.car.update();if(!replay.car.alive){replay.car.reset();follow2D.ready=false;follow3DReady=false;}}}return {focus:replay.car,cars:[replay.car]};}
  if(!paused){for(let k=0;k<simSpeed;k++){for(const car of population)car.update();if(population.every(c=>!c.alive))evolve();}}
  const aliveCars=population.filter(c=>c.alive),leader=[...aliveCars].sort((a,b)=>b.fitness-a.fitness)[0]||population[0];return {focus:leader,cars:population};
}
function updateStats(){
  if(replay){generationEl.textContent=`${replay.memory.generation} replay`;aliveEl.textContent=replay.car.alive?'1/1':'0/1';bestProgressEl.textContent=`${Math.round((replay.car.laps>0?1:replay.car.maxProgress)*100)}%`;bestFitnessEl.textContent=fmtFitness(replay.car.fitness);bestLapsEl.textContent=replay.car.laps;sceneCounter.textContent=`REPLAY · GEN ${replay.memory.generation} · LAPS ${replay.car.laps}`;return;}
  const alive=population.filter(c=>c.alive).length,best=bestCurrentCar();generationEl.textContent=generation;aliveEl.textContent=`${alive}/${POP_SIZE}`;bestProgressEl.textContent=`${Math.round(((best?.laps??0)>0?1:(best?.maxProgress??0))*100)}%`;bestFitnessEl.textContent=fmtFitness(bestEver?.fitness??best?.fitness??0);bestLapsEl.textContent=Math.max(bestEver?.laps??0,best?.laps??0);sceneCounter.textContent=`GEN ${generation} · ${simSpeed}x · LAPS ${Math.max(bestEver?.laps??0,best?.laps??0)}`;
}
function frame(){
  const {focus,cars}=stepSimulation();
  if(currentView==='top'){renderTop(focus,cars);sensorCtx.clearRect(0,0,sensorOverlay.width,sensorOverlay.height);}else renderIso(focus);
  drawMinimap(focus);updateStats();requestAnimationFrame(frame);
}
function resizeOverlay(){sensorOverlay.width=threeCanvas.width;sensorOverlay.height=threeCanvas.height;}resizeOverlay();

toggleRun.addEventListener('click',()=>{paused=!paused;toggleRun.textContent=paused?(replay?'Resume replay':'Resume'):(replay?'Pause replay':'Pause');});
resetRun.addEventListener('click',()=>{replay=null;generation=1;bestEver=null;paused=false;freshPopulation();resumeTraining.disabled=true;toggleRun.textContent='Pause';memoryStatus.textContent='Training reset. Saved memories kept.';renderMemories();});
saveMemory.addEventListener('click',()=>{if(replay){memoryStatus.textContent='Return to live training before saving a new memory.';return;}const b=bestCurrentCar();if(b)storeMemory(b,'manual',generation);});
resumeTraining.addEventListener('click',leaveReplay);
clearMemories.addEventListener('click',()=>{memories=[];persistMemories();if(replay)leaveReplay();renderMemories();memoryStatus.textContent='Saved neural memories cleared.';});
speedSelect.addEventListener('change',()=>{simSpeed=Number(speedSelect.value)||1;});
viewSelect.addEventListener('change',()=>setView(viewSelect.value));

freshPopulation();renderMemories();
let initial='top';try{const saved=localStorage.getItem(VIEW_KEY);if(saved==='iso'||saved==='top')initial=saved;}catch{}
setView(initial);frame();
