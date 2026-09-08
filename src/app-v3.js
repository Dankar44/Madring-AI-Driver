import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const canvas = document.querySelector('#sim');
const ctx = canvas.getContext('2d');
const threeCanvas = document.querySelector('#threeSim');
const canvasWrap = document.querySelector('#canvasWrap');
const minimapCanvas = document.querySelector('#minimap');
const minimapCtx = minimapCanvas.getContext('2d');
const sensorOverlay = document.querySelector('#sensorOverlay');
const sensorCtx = sensorOverlay.getContext('2d');
const sceneTitle = document.querySelector('#sceneTitle');
const sceneCounter = document.querySelector('#sceneCounter');
const generationEl = document.querySelector('#generation');
const aliveEl = document.querySelector('#alive');
const bestProgressEl = document.querySelector('#bestProgress');
const bestFitnessEl = document.querySelector('#bestFitness');
const bestLapsEl = document.querySelector('#bestLaps');
const toggleRun = document.querySelector('#toggleRun');
const resetRun = document.querySelector('#resetRun');
const saveMemory = document.querySelector('#saveMemory');
const resumeTraining = document.querySelector('#resumeTraining');
const clearMemories = document.querySelector('#clearMemories');
const memoryTimeline = document.querySelector('#memoryTimeline');
const memoryStatus = document.querySelector('#memoryStatus');
const speedSelect = document.querySelector('#speedSelect');
const viewSelect = document.querySelector('#viewSelect');
const viewStatus = document.querySelector('#viewStatus');

const W = canvas.width;
const H = canvas.height;
const POP_SIZE = 70;
const SENSOR_ANGLES = [-1.0, -0.6, -0.3, 0, 0.3, 0.6, 1.0];
const SENSOR_RANGE = 115;
const MAX_STEPS = 7600;
const TRACK_SCALE = 3.40;
const TRACK_HALF_WIDTH = 25;
const CAMERA_ZOOM_2D = 2.65;
const VIEW_KEY = 'madring-ai-driver-view-v3';
const MEMORY_KEY = 'madring-ai-driver-memories-v1';
const AUTO_MEMORY_GENERATIONS = new Set([1, 5, 10, 25, 50, 100]);

const BASE_TRACK_CENTER = [
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

const track = {
  center: BASE_TRACK_CENTER.map(([x,y]) => [140 + (x - 110) * TRACK_SCALE, 140 + (y - 170) * TRACK_SCALE]),
  halfWidth: TRACK_HALF_WIDTH,
};

function dist(a,b){ return Math.hypot(a[0]-b[0], a[1]-b[1]); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function lerp(a,b,t){ return a+(b-a)*t; }
function lerpAngle(a,b,t){ let d=(b-a+Math.PI)%(Math.PI*2)-Math.PI; if(d<-Math.PI)d+=Math.PI*2; return a+d*t; }
function fmtFitness(v){ return Math.round(v||0).toLocaleString(); }

const segments=[];
let totalLength=0;
for(let i=0;i<track.center.length;i++){
  const a=track.center[i], b=track.center[(i+1)%track.center.length];
  const len=dist(a,b);
  segments.push({a,b,len,start:totalLength});
  totalLength+=len;
}

const bounds=track.center.reduce((b,p)=>({
  minX:Math.min(b.minX,p[0]),maxX:Math.max(b.maxX,p[0]),
  minY:Math.min(b.minY,p[1]),maxY:Math.max(b.maxY,p[1]),
}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});

function nearestTrackPoint(x,y){
  let best=null;
  for(const s of segments){
    const vx=s.b[0]-s.a[0],vy=s.b[1]-s.a[1];
    const wx=x-s.a[0],wy=y-s.a[1];
    const vv=vx*vx+vy*vy;
    const t=clamp((wx*vx+wy*vy)/(vv||1),0,1);
    const px=s.a[0]+vx*t,py=s.a[1]+vy*t;
    const d=Math.hypot(x-px,y-py);
    if(!best||d<best.d) best={x:px,y:py,d,progress:(s.start+s.len*t)/totalLength,heading:Math.atan2(vy,vx)};
  }
  return best;
}

function boundary(side, extra=0){
  const result=[];
  const offset=track.halfWidth+extra;
  for(let i=0;i<track.center.length;i++){
    const prev=track.center[(i-1+track.center.length)%track.center.length];
    const next=track.center[(i+1)%track.center.length];
    const p=track.center[i];
    const dx=next[0]-prev[0],dy=next[1]-prev[1];
    const len=Math.hypot(dx,dy)||1;
    const nx=-dy/len,ny=dx/len;
    result.push([p[0]+nx*offset*side,p[1]+ny*offset*side]);
  }
  return result;
}
const leftEdge=boundary(1,0),rightEdge=boundary(-1,0);
const leftBarrier=boundary(1,10),rightBarrier=boundary(-1,10);

// Physical collision/sensor mask stays purely 2D.
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
    return SENSOR_ANGLES.map(a=>{
      const ang=this.angle+a;let hit=SENSOR_RANGE;
      for(let d=4;d<=SENSOR_RANGE;d+=3){
        if(!onTrack(this.x+Math.cos(ang)*d,this.y+Math.sin(ang)*d)){hit=d;break;}
      }
      return hit;
    });
  }
  sense(){return this.sensorDistances().map(d=>d/SENSOR_RANGE);}
  update(){
    if(!this.alive)return;
    this.steps++;
    const s=this.sense(),w=this.genome.weights;
    const steer=Math.tanh(s[0]*w[0]+s[1]*w[1]+s[2]*w[2]+s[4]*w[3]+s[5]*w[4]+s[6]*w[5]+w[6]);
    const throttle=Math.tanh(s[3]*w[7]+(s[2]+s[4])*w[8]+w[9]);
    const brake=Math.tanh((1-s[3])*w[10]+Math.abs(steer)*w[11]+w[12]);
    const targetSpeed=1.45+Math.max(0,throttle)*3.8-Math.max(0,brake)*2.1;
    this.speed+=(targetSpeed-this.speed)*.08;
    this.speed=clamp(this.speed,.7,5.25);
    this.angle+=steer*.044*(.65+this.speed/5.25);
    this.x+=Math.cos(this.angle)*this.speed;
    this.y+=Math.sin(this.angle)*this.speed;
    const n=nearestTrackPoint(this.x,this.y);
    const headingAlignment=(Math.cos(this.angle-n.heading)+1)/2;
    const delta=n.progress-this.lastProgress;
    const wrappedDelta=delta<-.5?delta+1:delta>.5?delta-1:delta;
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

function loadMemories(){try{const v=JSON.parse(localStorage.getItem(MEMORY_KEY)||'[]');return Array.isArray(v)?v.filter(m=>Array.isArray(m.weights)):[];}catch{return [];}}
function persistMemories(){try{localStorage.setItem(MEMORY_KEY,JSON.stringify(memories.slice(-30)));}catch{}}
function bestCurrentCar(){return [...population].sort((a,b)=>b.fitness-a.fitness)[0]||null;}
function shouldAutoSave(gen){return AUTO_MEMORY_GENERATIONS.has(gen)||(gen>100&&gen%50===0);}
function storeMemory(car,source='manual',gen=generation){
  if(!car)return;
  if(source==='auto'&&memories.some(m=>m.source==='auto'&&m.generation===gen))return;
  memories.push({id:`${Date.now()}-${Math.random().toString(16).slice(2)}`,generation:gen,source,fitness:car.fitness,progress:car.laps>0?1:car.maxProgress,laps:car.laps,weights:[...car.genome.weights],createdAt:new Date().toISOString()});
  memories=memories.slice(-30);persistMemories();renderMemories();memoryStatus.textContent=`Saved ${source} memory from generation ${gen}.`;
}
function freshPopulation(seedGenome=null){
  population=[];
  for(let i=0;i<POP_SIZE;i++){const genome=seedGenome?(i===0?seedGenome:seedGenome.cloneMutated()):new Genome();population.push(new Car(genome,i===0&&!!seedGenome));}
  follow2D.ready=false;
}
function evolve(){
  population.sort((a,b)=>b.fitness-a.fitness);
  const winner=population[0];
  if(!bestEver||winner.fitness>bestEver.fitness)bestEver={fitness:winner.fitness,progress:winner.maxProgress,laps:winner.laps,genome:new Genome([...winner.genome.weights])};
  if(shouldAutoSave(generation))storeMemory(winner,'auto',generation);
  const elite=population.slice(0,Math.max(4,Math.floor(POP_SIZE*.12)));
  population=Array.from({length:POP_SIZE},(_,i)=>{const parent=elite[i%elite.length];return new Car(i===0?new Genome([...parent.genome.weights]):parent.genome.cloneMutated(),i===0);});
  generation++;follow2D.ready=false;
}
function startReplay(memory){replay={memory,car:new Car(new Genome([...memory.weights]),true)};paused=false;follow2D.ready=false;toggleRun.textContent='Pause replay';resumeTraining.disabled=false;memoryStatus.textContent=`Replaying generation ${memory.generation}.`;renderMemories();}
function leaveReplay(){replay=null;paused=false;follow2D.ready=false;toggleRun.textContent='Pause';resumeTraining.disabled=true;memoryStatus.textContent=`Back to live training at generation ${generation}.`;renderMemories();}
function renderMemories(){
  memoryTimeline.innerHTML='';
  if(!memories.length){const p=document.createElement('p');p.className='memory-empty';p.textContent='No neural memories yet.';memoryTimeline.appendChild(p);return;}
  [...memories].sort((a,b)=>a.generation-b.generation).forEach(memory=>{
    const card=document.createElement('article');card.className=`memory-card${replay?.memory.id===memory.id?' active':''}`;
    const gen=document.createElement('div');gen.className='memory-gen';const strong=document.createElement('strong');strong.textContent=`Gen ${memory.generation}`;const badge=document.createElement('span');badge.className='badge';badge.textContent=memory.source.toUpperCase();gen.append(strong,badge);
    const dl=document.createElement('dl');for(const [label,value] of [['Progress',`${Math.round((memory.progress||0)*100)}%`],['Fitness',fmtFitness(memory.fitness)],['Laps',String(memory.laps||0)]]){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);dl.appendChild(row);}
    const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=replay?.memory.id===memory.id?'Replaying':'Replay this brain';button.disabled=replay?.memory.id===memory.id;button.addEventListener('click',()=>startReplay(memory));card.append(gen,dl,button);memoryTimeline.appendChild(card);
  });
}

// ---------- 2D top-down renderer ----------
function trace2D(){ctx.beginPath();track.center.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();}
function drawStartLine2D(){
  const p=track.center[0],q=track.center[1],tangent=Math.atan2(q[1]-p[1],q[0]-p[0]);
  const nx=Math.cos(tangent+Math.PI/2),ny=Math.sin(tangent+Math.PI/2);const cells=8,cell=(track.halfWidth*2)/cells;
  for(let i=0;i<cells;i++){const off=-track.halfWidth+cell*(i+.5),cx=p[0]+nx*off,cy=p[1]+ny*off;ctx.save();ctx.translate(cx,cy);ctx.rotate(tangent);ctx.fillStyle=i%2?'#1d1d1d':'#fff';ctx.fillRect(-2.8,-cell/2,5.6,cell);ctx.restore();}
}
function drawTrack2D(){ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#f7f5ef';ctx.lineWidth=track.halfWidth*2+5.5;trace2D();ctx.stroke();ctx.strokeStyle='#a87547';ctx.lineWidth=track.halfWidth*2;trace2D();ctx.stroke();ctx.strokeStyle='rgba(105,69,44,.24)';ctx.lineWidth=1;trace2D();ctx.stroke();drawStartLine2D();}
function drawFormulaCar2D(car,alpha=1){
  ctx.save();ctx.globalAlpha=alpha;ctx.translate(car.x,car.y);ctx.rotate(car.angle);
  ctx.fillStyle='#111315';ctx.fillRect(-6.8,-7.8,5.2,3.4);ctx.fillRect(-6.8,4.4,5.2,3.4);ctx.fillRect(4.2,-7.2,4.8,3.2);ctx.fillRect(4.2,4.0,4.8,3.2);
  ctx.fillStyle='#1f2326';ctx.fillRect(-10.6,-7.7,2.2,15.4);ctx.fillRect(9,-7.7,2,15.4);
  ctx.fillStyle=car.champion?'#f5f3ee':'#7fc6d8';ctx.strokeStyle='#151719';ctx.lineWidth=.9;ctx.beginPath();ctx.moveTo(-8.5,-2.9);ctx.lineTo(-4.9,-4.8);ctx.lineTo(-.8,-4.3);ctx.lineTo(2.8,-3);ctx.lineTo(6.5,-1.6);ctx.lineTo(10.8,-.7);ctx.lineTo(10.8,.7);ctx.lineTo(6.5,1.6);ctx.lineTo(2.8,3);ctx.lineTo(-.8,4.3);ctx.lineTo(-4.9,4.8);ctx.lineTo(-8.5,2.9);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle='#20262a';ctx.beginPath();ctx.ellipse(.2,0,2.7,1.9,0,0,Math.PI*2);ctx.fill();ctx.restore();
}
function drawSensors2D(car){const distances=car.sensorDistances();ctx.save();ctx.lineWidth=.75;for(let i=0;i<SENSOR_ANGLES.length;i++){const ang=car.angle+SENSOR_ANGLES[i],d=distances[i],ex=car.x+Math.cos(ang)*d,ey=car.y+Math.sin(ang)*d;ctx.strokeStyle='rgba(255,255,255,.96)';ctx.beginPath();ctx.moveTo(car.x,car.y);ctx.lineTo(ex,ey);ctx.stroke();const lx=car.x+Math.cos(ang)*Math.max(14,d-6),ly=car.y+Math.sin(ang)*Math.max(14,d-6);ctx.save();ctx.translate(lx,ly);ctx.rotate(Math.PI/2+follow2D.angle);ctx.font='700 5.6px system-ui';ctx.textAlign='center';ctx.lineWidth=1.5;ctx.strokeStyle='#2b2622';ctx.fillStyle='#fff';const v=(d/SENSOR_RANGE).toFixed(2);ctx.strokeText(v,0,0);ctx.fillText(v,0,0);ctx.restore();}ctx.restore();}
function update2DCamera(focus){if(!focus)return;const ahead=48,tx=focus.x+Math.cos(focus.angle)*ahead,ty=focus.y+Math.sin(focus.angle)*ahead;if(!follow2D.ready){follow2D.x=tx;follow2D.y=ty;follow2D.angle=focus.angle;follow2D.ready=true;}else{follow2D.x=lerp(follow2D.x,tx,.14);follow2D.y=lerp(follow2D.y,ty,.14);follow2D.angle=lerpAngle(follow2D.angle,focus.angle,.11);}}
function renderTop(focus,cars){ctx.fillStyle='#b8a097';ctx.fillRect(0,0,W,H);update2DCamera(focus);ctx.save();ctx.translate(W*.5,H*.64);ctx.scale(CAMERA_ZOOM_2D,CAMERA_ZOOM_2D);ctx.rotate(-Math.PI/2-follow2D.angle);ctx.translate(-follow2D.x,-follow2D.y);drawTrack2D();for(const car of cars)if(car.alive)drawFormulaCar2D(car,car===focus?1:.12);if(focus){drawFormulaCar2D(focus,1);drawSensors2D(focus);}ctx.restore();}

// ---------- True 3D orthographic renderer ----------
const renderer=new THREE.WebGLRenderer({canvas:threeCanvas,antialias:true,alpha:false});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.setSize(W,H,false);
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.shadowMap.enabled=false;

const scene=new THREE.Scene();
scene.background=new THREE.Color(0xb8a097);
const aspect=W/H;
const ORTHO_HEIGHT=260;
const camera3D=new THREE.OrthographicCamera(-ORTHO_HEIGHT*aspect/2,ORTHO_HEIGHT*aspect/2,ORTHO_HEIGHT/2,-ORTHO_HEIGHT/2,0.1,5000);
const ambient=new THREE.AmbientLight(0xffffff,1.55);scene.add(ambient);
const sun=new THREE.DirectionalLight(0xffffff,1.15);sun.position.set(-200,320,-180);scene.add(sun);

const terrainMat=new THREE.MeshLambertMaterial({color:0xb8a097,flatShading:true});
const terrain=new THREE.Mesh(new THREE.PlaneGeometry(5000,3000),terrainMat);terrain.rotation.x=-Math.PI/2;terrain.position.y=-.08;scene.add(terrain);

function ribbonGeometry(left,right,y=0){
  const positions=[];const indices=[];const n=Math.min(left.length,right.length);
  for(let i=0;i<n;i++){positions.push(left[i][0],y,left[i][1],right[i][0],y,right[i][1]);}
  for(let i=0;i<n;i++){const j=(i+1)%n,a=i*2,b=a+1,c=j*2,d=c+1;indices.push(a,c,b,b,c,d);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
function scaledBoundary(side,extra){return boundary(side,extra);}
const whiteLeft=scaledBoundary(1,3.0),whiteRight=scaledBoundary(-1,3.0);
const shoulderMesh=new THREE.Mesh(ribbonGeometry(whiteLeft,whiteRight,.02),new THREE.MeshLambertMaterial({color:0xf4f2ec,flatShading:true}));scene.add(shoulderMesh);
const roadMesh=new THREE.Mesh(ribbonGeometry(leftEdge,rightEdge,.06),new THREE.MeshLambertMaterial({color:0xa87547,flatShading:true}));scene.add(roadMesh);

// Flat curb blocks and safety barriers are real 3D meshes.
const barrierGroup=new THREE.Group();scene.add(barrierGroup);
const railMat=new THREE.MeshLambertMaterial({color:0x9ea5a6,flatShading:true});
const railTopMat=new THREE.MeshLambertMaterial({color:0xdde2e3,flatShading:true});
const redMat=new THREE.MeshLambertMaterial({color:0xce443b,flatShading:true});
const whiteMat=new THREE.MeshLambertMaterial({color:0xf0eee8,flatShading:true});
function addBarrierSegments(points,phase=0){
  for(let i=0;i<points.length;i+=2){
    const a=points[i],b=points[(i+2)%points.length];
    const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(!len)continue;
    const cx=(a[0]+b[0])/2,cz=(a[1]+b[1])/2,ang=Math.atan2(dz,dx);
    const base=new THREE.Mesh(new THREE.BoxGeometry(len,2.2,2.2),railMat);base.position.set(cx,1.1,cz);base.rotation.y=-ang;barrierGroup.add(base);
    const rail=new THREE.Mesh(new THREE.BoxGeometry(len,1.1,1.0),railTopMat);rail.position.set(cx,3.0,cz);rail.rotation.y=-ang;barrierGroup.add(rail);
    if(((i/2)+phase)%5===0){
      const panel=new THREE.Mesh(new THREE.BoxGeometry(Math.min(16,len*.65),2.1,2.6),(((i/2)+phase)%10===0)?redMat:whiteMat);panel.position.set(cx,1.4,cz);panel.rotation.y=-ang;barrierGroup.add(panel);
    }
  }
}
addBarrierSegments(leftBarrier,0);addBarrierSegments(rightBarrier,2);

function makeF1(materialColor=0x7fc6d8){
  const g=new THREE.Group();
  const bodyMat=new THREE.MeshLambertMaterial({color:materialColor,flatShading:true});
  const dark=new THREE.MeshLambertMaterial({color:0x16191b,flatShading:true});
  const cockpit=new THREE.MeshLambertMaterial({color:0x252b2e,flatShading:true});
  const body=new THREE.Mesh(new THREE.BoxGeometry(15,1.7,5.2),bodyMat);body.position.y=1.4;g.add(body);
  const nose=new THREE.Mesh(new THREE.BoxGeometry(9,1.1,1.8),bodyMat);nose.position.set(11.2,1.35,0);g.add(nose);
  const frontWing=new THREE.Mesh(new THREE.BoxGeometry(1.4,.55,14),dark);frontWing.position.set(15.3,.95,0);g.add(frontWing);
  const rearWing=new THREE.Mesh(new THREE.BoxGeometry(1.4,2.0,13),dark);rearWing.position.set(-8.2,2.2,0);g.add(rearWing);
  const podL=new THREE.Mesh(new THREE.BoxGeometry(6,1.2,2.8),bodyMat);podL.position.set(-1.5,1.1,-4);g.add(podL);
  const podR=podL.clone();podR.position.z=4;g.add(podR);
  const halo=new THREE.Mesh(new THREE.BoxGeometry(2.8,1.2,3.0),cockpit);halo.position.set(1.2,2.35,0);g.add(halo);
  for(const [x,z] of [[-4.8,-6],[-4.8,6],[9,-5.7],[9,5.7]]){const wheel=new THREE.Mesh(new THREE.BoxGeometry(4.2,2.4,2.4),dark);wheel.position.set(x,1.15,z);g.add(wheel);}
  return g;
}
const leaderCar3D=makeF1();scene.add(leaderCar3D);
const ghostCars=Array.from({length:12},()=>{const g=makeF1(0x6aa7b5);g.scale.setScalar(.92);g.visible=false;scene.add(g);return g;});

const sensorGroup=new THREE.Group();scene.add(sensorGroup);
const sensorLines=[];
for(let i=0;i<SENSOR_ANGLES.length;i++){const geom=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(1,0,0)]);const line=new THREE.Line(geom,new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.95}));sensorGroup.add(line);sensorLines.push(line);}

function update3DObjects(focus,cars){
  if(!focus)return;
  leaderCar3D.visible=true;leaderCar3D.position.set(focus.x,.12,focus.y);leaderCar3D.rotation.y=-focus.angle;
  const sensorDistances=focus.sensorDistances();
  for(let i=0;i<SENSOR_ANGLES.length;i++){
    const ang=focus.angle+SENSOR_ANGLES[i],d=sensorDistances[i];
    const arr=new Float32Array([focus.x,1.0,focus.y,focus.x+Math.cos(ang)*d,.09,focus.y+Math.sin(ang)*d]);
    sensorLines[i].geometry.setAttribute('position',new THREE.BufferAttribute(arr,3));sensorLines[i].geometry.attributes.position.needsUpdate=true;
  }
  const others=cars.filter(c=>c.alive&&c!==focus).slice(0,ghostCars.length);
  ghostCars.forEach((g,i)=>{const c=others[i];g.visible=!!c;if(c){g.position.set(c.x,.1,c.y);g.rotation.y=-c.angle;}});
  return sensorDistances;
}

function update3DCamera(focus){
  if(!focus)return;
  const target=new THREE.Vector3(focus.x,0,focus.y);
  const az=Math.PI/4;
  const horizontal=260;
  const elevation=Math.PI/6; // 30 degrees above horizontal
  const height=horizontal*Math.tan(elevation);
  camera3D.position.set(target.x+Math.cos(az)*horizontal,height,target.z+Math.sin(az)*horizontal);
  camera3D.up.set(0,1,0);
  camera3D.lookAt(target);
  camera3D.updateProjectionMatrix();
}

function renderSensorLabels(focus,distances){
  sensorCtx.clearRect(0,0,sensorOverlay.width,sensorOverlay.height);
  if(currentView!=='iso'||!focus||!distances)return;
  sensorCtx.font='700 12px system-ui';sensorCtx.textAlign='center';sensorCtx.textBaseline='middle';
  for(let i=0;i<SENSOR_ANGLES.length;i++){
    const ang=focus.angle+SENSOR_ANGLES[i],d=distances[i];
    const p=new THREE.Vector3(focus.x+Math.cos(ang)*Math.max(18,d-7),1.2,focus.y+Math.sin(ang)*Math.max(18,d-7));p.project(camera3D);
    const x=(p.x*.5+.5)*sensorOverlay.width,y=(-p.y*.5+.5)*sensorOverlay.height;
    const v=(d/SENSOR_RANGE).toFixed(2);sensorCtx.lineWidth=3; sensorCtx.strokeStyle='rgba(40,35,31,.9)';sensorCtx.fillStyle='#fff';sensorCtx.strokeText(v,x,y);sensorCtx.fillText(v,x,y);
  }
}

function renderIso(focus,cars){const distances=update3DObjects(focus,cars);update3DCamera(focus);renderer.render(scene,camera3D);renderSensorLabels(focus,distances);}

// ---------- Flat 2D HUD, never projected ----------
function drawMinimap(focus){
  const c=minimapCtx,w=minimapCanvas.width,h=minimapCanvas.height,pad=10;c.clearRect(0,0,w,h);c.fillStyle='rgba(20,20,20,.82)';c.beginPath();c.roundRect(0,0,w,h,12);c.fill();
  const bw=bounds.maxX-bounds.minX,bh=bounds.maxY-bounds.minY;const scale=Math.min((w-pad*2)/bw,(h-pad*2-14)/bh);const ox=(w-bw*scale)/2-bounds.minX*scale,oy=15+(h-18-bh*scale)/2-bounds.minY*scale;
  c.strokeStyle='#f0eee8';c.lineWidth=3;c.lineJoin='round';c.lineCap='round';c.beginPath();track.center.forEach((p,i)=>{const x=ox+p[0]*scale,y=oy+p[1]*scale;i?c.lineTo(x,y):c.moveTo(x,y);});c.closePath();c.stroke();
  if(focus){c.fillStyle='#ff694f';c.beginPath();c.arc(ox+focus.x*scale,oy+focus.y*scale,4,0,Math.PI*2);c.fill();}
  c.fillStyle='rgba(255,255,255,.8)';c.font='700 10px system-ui';c.fillText('MADRING',10,12);
}

function setView(mode){
  currentView=mode==='iso'?'iso':'top';
  canvasWrap.classList.toggle('isometric-view',currentView==='iso');canvasWrap.classList.toggle('top-view',currentView==='top');
  viewSelect.value=currentView;viewStatus.textContent=currentView==='iso'?'True 3D orthographic · 45° / 30°':'Top-down view';
  sensorOverlay.style.display=currentView==='iso'?'block':'none';
  try{localStorage.setItem(VIEW_KEY,currentView);}catch{}
}

function stepSimulation(){
  if(replay){if(!paused){for(let k=0;k<simSpeed;k++){replay.car.update();if(!replay.car.alive){replay.car.reset();follow2D.ready=false;}}}return {focus:replay.car,cars:[replay.car]};}
  if(!paused){for(let k=0;k<simSpeed;k++){for(const car of population)car.update();if(population.every(c=>!c.alive))evolve();}}
  const aliveCars=population.filter(c=>c.alive);const leader=[...aliveCars].sort((a,b)=>b.fitness-a.fitness)[0]||population[0];return {focus:leader,cars:population};
}

function updateStats(focus){
  if(replay){generationEl.textContent=`${replay.memory.generation} replay`;aliveEl.textContent=replay.car.alive?'1/1':'0/1';bestProgressEl.textContent=`${Math.round((replay.car.laps>0?1:replay.car.maxProgress)*100)}%`;bestFitnessEl.textContent=fmtFitness(replay.car.fitness);bestLapsEl.textContent=replay.car.laps;sceneCounter.textContent=`REPLAY · GEN ${replay.memory.generation} · LAPS ${replay.car.laps}`;return;}
  const alive=population.filter(c=>c.alive).length,best=bestCurrentCar();generationEl.textContent=generation;aliveEl.textContent=`${alive}/${POP_SIZE}`;bestProgressEl.textContent=`${Math.round(((best?.laps??0)>0?1:(best?.maxProgress??0))*100)}%`;bestFitnessEl.textContent=fmtFitness(bestEver?.fitness??best?.fitness??0);bestLapsEl.textContent=Math.max(bestEver?.laps??0,best?.laps??0);sceneCounter.textContent=`GEN ${generation} · ${simSpeed}x · LAPS ${Math.max(bestEver?.laps??0,best?.laps??0)}`;
}

function frame(){
  const {focus,cars}=stepSimulation();
  if(currentView==='top'){renderTop(focus,cars);sensorCtx.clearRect(0,0,sensorOverlay.width,sensorOverlay.height);}else renderIso(focus,cars);
  drawMinimap(focus);updateStats(focus);requestAnimationFrame(frame);
}

function resizeOverlay(){sensorOverlay.width=threeCanvas.width;sensorOverlay.height=threeCanvas.height;}
resizeOverlay();

toggleRun.addEventListener('click',()=>{paused=!paused;toggleRun.textContent=paused?(replay?'Resume replay':'Resume'):(replay?'Pause replay':'Pause');});
resetRun.addEventListener('click',()=>{replay=null;generation=1;bestEver=null;paused=false;freshPopulation();resumeTraining.disabled=true;toggleRun.textContent='Pause';memoryStatus.textContent='Training reset. Saved neural memories were kept.';renderMemories();});
saveMemory.addEventListener('click',()=>{if(replay){memoryStatus.textContent='Return to current training before saving a new memory.';return;}const best=bestCurrentCar();if(best)storeMemory(best,'manual',generation);});
resumeTraining.addEventListener('click',leaveReplay);
clearMemories.addEventListener('click',()=>{memories=[];persistMemories();if(replay)leaveReplay();renderMemories();memoryStatus.textContent='Saved neural memories cleared.';});
speedSelect.addEventListener('change',()=>{simSpeed=Number(speedSelect.value)||1;});
viewSelect.addEventListener('change',()=>setView(viewSelect.value));

let initial='top';try{const saved=localStorage.getItem(VIEW_KEY);if(saved==='iso'||saved==='top')initial=saved;}catch{}
sceneTitle.textContent='AI LEARNS MADRING';
freshPopulation();renderMemories();setView(initial);frame();
