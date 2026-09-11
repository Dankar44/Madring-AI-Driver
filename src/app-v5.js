import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const canvas=document.querySelector('#sim'),ctx=canvas.getContext('2d');
const canvasWrap=document.querySelector('#canvasWrap');
const minimapCanvas=document.querySelector('#minimap'),minimapCtx=minimapCanvas.getContext('2d');
const sceneCounter=document.querySelector('#sceneCounter');
const generationEl=document.querySelector('#generation'),aliveEl=document.querySelector('#alive');
const bestProgressEl=document.querySelector('#bestProgress'),bestFitnessEl=document.querySelector('#bestFitness'),bestLapsEl=document.querySelector('#bestLaps'),bestLapEl=document.querySelector('#bestLap');
const lapReadout=document.querySelector('#lapReadout');
const toggleRun=document.querySelector('#toggleRun'),resetRun=document.querySelector('#resetRun'),saveMemory=document.querySelector('#saveMemory');
const resumeTraining=document.querySelector('#resumeTraining'),clearMemories=document.querySelector('#clearMemories');
const memoryTimeline=document.querySelector('#memoryTimeline'),memoryStatus=document.querySelector('#memoryStatus');
const brainCanvas=document.querySelector('#brainCanvas'),fitnessCanvas=document.querySelector('#fitnessChart');
const speedSelect=document.querySelector('#speedSelect'),viewSelect=document.querySelector('#viewSelect'),ghostSlider=document.querySelector('#ghostAlpha'),raceBtn=document.querySelector('#raceBtn'),raceStandings=document.querySelector('#raceStandings'),sensorSelect=document.querySelector('#sensorSelect'),brainCopy=document.querySelector('#brainCopy');

let W=canvas.width,H=canvas.height;

// Showcase runs must be repeatable: same ?seed= gives the same generations, the same crashes
// and the same lap times, so a recording can be retaken. ?cars= sets the population size.
const params=new URLSearchParams(location.search);
const SEED=(Number(params.get('seed'))||1337)>>>0;
let rngState=SEED;
function rng(){rngState=rngState+0x6D2B79F5|0;let t=Math.imul(rngState^rngState>>>15,1|rngState);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}
const POP_SIZE=Math.max(4,Math.min(240,Number(params.get('cars'))||100));
const SIM_HZ=60;
const RECORDING=params.get('rec')==='1';
// Global pace: every speed setting runs this fraction of its nominal steps per frame (1x = 0.6 steps/frame).
const SPEED_SCALE=.6;
const SPEEDS=[.25,.5,1,5,20,50];const START_SPEED=SPEEDS.includes(Number(params.get('speed')))?Number(params.get('speed')):1;
let ghostAlpha=Math.max(0,Math.min(1,(Number(params.get('ghost'))||35)/100)); // opacity of the non-leader cars in the follow view
// Sensor rigs. Each car carries its own rig, so a 3-sensor memory can replay while a 7-sensor
// population keeps training. `think` is the whole brain: CFG7 is the original 13-weight formula, untouched.
const CFG7={n:7,angles:[-1.0,-0.6,-0.3,0,.3,.6,1.0],weights:16,used:13,center:3,loop:11,
  edges:[[0,0,0],[1,0,1],[2,0,2],[4,0,3],[5,0,4],[6,0,5],[7,0,6],[3,1,7],[2,1,8],[4,1,8],[7,1,9],[3,2,10,true],[7,2,12]],
  think(s,w){
    const steer=Math.tanh(s[0]*w[0]+s[1]*w[1]+s[2]*w[2]+s[4]*w[3]+s[5]*w[4]+s[6]*w[5]+w[6]);
    const throttle=Math.tanh(s[3]*w[7]+(s[2]+s[4])*w[8]+w[9]);
    const brake=Math.tanh((1-s[3])*w[10]+Math.abs(steer)*w[11]+w[12]);
    return {steer,throttle,brake};
  }};
const CFG3={n:3,angles:[-0.6,0,.6],weights:9,used:9,center:1,loop:7,
  edges:[[0,0,0],[2,0,1],[3,0,2],[1,1,3],[0,1,4],[2,1,4],[3,1,5],[1,2,6,true],[3,2,8]],
  think(s,w){
    const steer=Math.tanh(s[0]*w[0]+s[2]*w[1]+w[2]);
    const throttle=Math.tanh(s[1]*w[3]+(s[0]+s[2])*w[4]+w[5]);
    const brake=Math.tanh((1-s[1])*w[6]+Math.abs(steer)*w[7]+w[8]);
    return {steer,throttle,brake};
  }};
const SENSOR_CONFIGS={7:CFG7,3:CFG3};
let sensorMode=Number(params.get('sensors'))===3?3:7;
const activeCfg=()=>SENSOR_CONFIGS[sensorMode];
const SENSOR_RANGE=115;
const MAX_STEPS=9200;
// Real proportions: MADRING is 5,414 m long and 12 m wide (ratio 451); the original layout was 7,955 units
// by 50 wide (ratio 159). REAL_SCALE stretches the circuit so 1 unit = 0.24 m; the car, track width, speeds
// and sensor range keep their original values, so top speed works out to 272 km/h and a lap to about 1:30.
const REAL_SCALE=2.84;
const TRACK_SCALE=3.40*REAL_SCALE;
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
function fmtLap(v){if(v==null)return '--:--.--';const m=Math.floor(v/60),sec=v-m*60;return `${m}:${sec.toFixed(2).padStart(5,'0')}`;}

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

const segments=[];let totalLength=0;
for(let i=0;i<track.center.length;i++){
  const a=track.center[i],b=track.center[(i+1)%track.center.length],len=dist(a,b);
  segments.push({a,b,len,start:totalLength});totalLength+=len;
}
const bounds=track.center.reduce((b,p)=>({
  minX:Math.min(b.minX,p[0]),maxX:Math.max(b.maxX,p[0]),minY:Math.min(b.minY,p[1]),maxY:Math.max(b.maxY,p[1])
}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});

// Cars move at most ~5px per step and segments are ~4px apart, so the nearest segment is
// always within a few slots of the previous one. Scan a window around that hint and fall
// back to a full scan whenever the best hit lands on the window edge, so results stay exact.
const SEG_WINDOW=25;
function scanSegments(x,y,from,to){
  let best=null,bestK=-1;const n=segments.length;
  for(let k=from;k<to;k++){
    const i=(k%n+n)%n,s=segments[i];
    const vx=s.b[0]-s.a[0],vy=s.b[1]-s.a[1],wx=x-s.a[0],wy=y-s.a[1],vv=vx*vx+vy*vy;
    const t=clamp((wx*vx+wy*vy)/(vv||1),0,1),px=s.a[0]+vx*t,py=s.a[1]+vy*t,d=Math.hypot(x-px,y-py);
    if(!best||d<best.d){best={x:px,y:py,d,progress:(s.start+s.len*t)/totalLength,heading:Math.atan2(vy,vx),index:i};bestK=k;}
  }
  return {best,bestK};
}
function nearestTrackPoint(x,y,hint=null){
  if(hint===null)return scanSegments(x,y,0,segments.length).best;
  const from=hint-SEG_WINDOW,to=hint+SEG_WINDOW+1,{best,bestK}=scanSegments(x,y,from,to);
  return (bestK===from||bestK===to-1)?scanSegments(x,y,0,segments.length).best:best;
}

// Collision mask at 2 units per pixel (about 0.5 m), sized from the track bounds.
const MASK_RES=2,WORLD_W=Math.ceil(bounds.maxX+200),WORLD_H=Math.ceil(bounds.maxY+200),MASK_W=Math.ceil(WORLD_W/MASK_RES),MASK_H=Math.ceil(WORLD_H/MASK_RES);
const maskCanvas=document.createElement('canvas');
maskCanvas.width=MASK_W;maskCanvas.height=MASK_H;
const maskCtx=maskCanvas.getContext('2d',{willReadFrequently:true});
maskCtx.scale(1/MASK_RES,1/MASK_RES);maskCtx.lineCap='round';maskCtx.lineJoin='round';maskCtx.strokeStyle='#fff';maskCtx.lineWidth=track.halfWidth*2;
maskCtx.beginPath();track.center.forEach((p,i)=>i?maskCtx.lineTo(...p):maskCtx.moveTo(...p));maskCtx.closePath();maskCtx.stroke();
const maskData=maskCtx.getImageData(0,0,MASK_W,MASK_H).data;
function onTrack(x,y){
  const ix=Math.round(x/MASK_RES),iy=Math.round(y/MASK_RES);
  if(ix<0||iy<0||ix>=MASK_W||iy>=MASK_H)return false;
  return maskData[(iy*MASK_W+ix)*4+3]>20;
}

class Genome{
  constructor(weights,length=16){this.weights=weights??Array.from({length},()=>rng()*2-1);}
  cloneMutated(rate=.22,scale=.45){return new Genome(this.weights.map(w=>rng()<rate?w+(rng()*2-1)*scale:w));}
}

class Car{
  constructor(genome,champion=false,cfg=activeCfg()){this.genome=genome;this.champion=champion;this.cfg=cfg;this.reset();}
  reset(){
    const p=track.center[0],q=track.center[1];
    this.x=p[0];this.y=p[1];this.angle=Math.atan2(q[1]-p[1],q[0]-p[0]);
    this.px=this.x;this.py=this.y;this.va=this.angle;this.pva=this.angle;
    this.speed=0;this.alive=true;this.steps=0;this.fitness=0;this.maxProgress=0;this.lastProgress=0;this.laps=0;
    this.segHint=null;this.lapStartStep=0;this.lastLapTime=null;this.bestLapTime=null;this.out=null;
  }
  sensorDistances(){return this.sensorDistancesAt(this.x,this.y,this.angle);}
  sensorDistancesAt(x,y,angle){
    return this.cfg.angles.map(a=>{const ang=angle+a;let hit=SENSOR_RANGE;
      for(let d=4;d<=SENSOR_RANGE;d+=3){if(!onTrack(x+Math.cos(ang)*d,y+Math.sin(ang)*d)){hit=d;break;}}
      return hit;
    });
  }
  sense(){return this.sensorDistances().map(d=>d/SENSOR_RANGE);}
  update(){
    if(!this.alive)return;this.steps++;this.px=this.x;this.py=this.y;this.pva=this.va;
    const s=this.sense(),w=this.genome.weights;
    const {steer,throttle,brake}=this.cfg.think(s,w);
    this.out={s,steer,throttle,brake};
    const targetSpeed=1.45+Math.max(0,throttle)*3.8-Math.max(0,brake)*2.1;
    this.speed+=(targetSpeed-this.speed)*.08;this.speed=clamp(this.speed,.7,5.25);
    this.angle+=steer*.044*(.65+this.speed/5.25);
    this.x+=Math.cos(this.angle)*this.speed;this.y+=Math.sin(this.angle)*this.speed;
    this.va=lerpAngle(this.va,this.angle,.2); // display heading only: damps the per-step steering jitter, physics untouched
    const n=nearestTrackPoint(this.x,this.y,this.segHint),headingAlignment=(Math.cos(this.angle-n.heading)+1)/2;this.segHint=n.index;
    const delta=n.progress-this.lastProgress,wrappedDelta=delta<-.5?delta+1:delta>.5?delta-1:delta;
    if(this.lastProgress>.82&&n.progress<.18&&wrappedDelta>0){
      this.laps++;this.fitness+=1400;this.maxProgress=1;
      const lap=(this.steps-this.lapStartStep)/SIM_HZ;this.lapStartStep=this.steps;
      this.lastLapTime=lap;if(this.bestLapTime===null||lap<this.bestLapTime)this.bestLapTime=lap;
    }
    this.fitness+=Math.max(0,wrappedDelta)*2350+headingAlignment*.03+this.speed*.003;
    if(this.laps===0&&n.progress>this.maxProgress&&n.progress-this.maxProgress<.2)this.maxProgress=n.progress;
    this.lastProgress=n.progress;
    if(!onTrack(this.x,this.y)||this.steps>MAX_STEPS){this.alive=false;if(!onTrack(this.x,this.y))this.fitness-=4;}
  }
}

let generation=1,paused=false,simSpeed=START_SPEED,population=[],bestEver=null,replay=null,currentView='top',history=[];
let memories=loadMemories();
const follow2D={x:track.center[0][0],y:track.center[0][1],angle:0,ready:false};

function loadMemories(){try{const v=JSON.parse(localStorage.getItem(MEMORY_KEY)||'[]');return Array.isArray(v)?v.filter(m=>Array.isArray(m.weights)):[];}catch{return [];}}
function persistMemories(){try{localStorage.setItem(MEMORY_KEY,JSON.stringify(memories.slice(-30)));}catch{}}
function bestCurrentCar(){return [...population].sort((a,b)=>b.fitness-a.fitness)[0]||null;}
function shouldAutoSave(gen){return AUTO_MEMORY_GENERATIONS.has(gen)||(gen>100&&gen%50===0);}
function storeMemory(car,source='manual',gen=generation){
  if(!car)return;if(source==='auto'&&memories.some(m=>m.source==='auto'&&m.generation===gen))return;
  memories.push({id:`${Date.now()}-${Math.random().toString(16).slice(2)}`,generation:gen,source,sensors:car.cfg.n,fitness:car.fitness,progress:car.laps>0?1:car.maxProgress,laps:car.laps,bestLapTime:car.bestLapTime??null,weights:[...car.genome.weights],createdAt:new Date().toISOString()});
  memories=memories.slice(-30);persistMemories();renderMemories();memoryStatus.textContent=`Memoria ${source==='auto'?'automática':'manual'} guardada de la generación ${gen}.`;
}
function freshPopulation(seedGenome=null){
  population=[];
  for(let i=0;i<POP_SIZE;i++){
    const genome=seedGenome?(i===0?seedGenome:seedGenome.cloneMutated()):new Genome(null,activeCfg().weights);
    population.push(new Car(genome,i===0&&!!seedGenome));
  }
  follow2D.ready=false;
}
function evolve(){
  population.sort((a,b)=>b.fitness-a.fitness);const winner=population[0];
  if(!bestEver||winner.fitness>bestEver.fitness)bestEver={fitness:winner.fitness,progress:winner.maxProgress,laps:winner.laps,bestLapTime:winner.bestLapTime,genome:new Genome([...winner.genome.weights])};
  if(shouldAutoSave(generation))storeMemory(winner,'auto',generation);
  history.push({gen:generation,best:winner.fitness,avg:population.reduce((a,c)=>a+c.fitness,0)/population.length});
  showGenBanner(generation);
  const elite=population.slice(0,Math.max(4,Math.floor(POP_SIZE*.12)));
  population=Array.from({length:POP_SIZE},(_,i)=>{const parent=elite[i%elite.length];return new Car(i===0?new Genome([...parent.genome.weights]):parent.genome.cloneMutated(),i===0,parent.cfg);});
  generation++;follow2D.ready=false;
}
function startReplay(memory){race=null;updateRaceUI();replay={memory,car:new Car(new Genome([...memory.weights]),true,SENSOR_CONFIGS[memory.sensors]||CFG7)};paused=false;follow2D.ready=false;toggleRun.textContent='Pausar repetición';resumeTraining.disabled=false;memoryStatus.textContent=`Reproduciendo la generación ${memory.generation}.`;renderMemories();}
function leaveReplay(){replay=null;race=null;updateRaceUI();paused=false;follow2D.ready=false;toggleRun.textContent='Pausa';resumeTraining.disabled=true;memoryStatus.textContent=`De vuelta al entrenamiento en directo, generación ${generation}.`;renderMemories();}
function renderMemories(){
  memoryTimeline.innerHTML='';
  if(!memories.length){const p=document.createElement('p');p.className='memory-empty';p.textContent='Aún no hay memorias neuronales.';memoryTimeline.appendChild(p);return;}
  [...memories].sort((a,b)=>a.generation-b.generation).forEach(memory=>{
    const card=document.createElement('article');card.className=`memory-card${replay?.memory.id===memory.id?' active':''}`;
    const gen=document.createElement('div');gen.className='memory-gen';const strong=document.createElement('strong');strong.textContent=`Gen ${memory.generation}`;
    const badge=document.createElement('span');badge.className='badge';badge.textContent=`${memory.source.toUpperCase()} · ${memory.sensors||7}S`;gen.append(strong,badge);
    const dl=document.createElement('dl');
    for(const [label,value] of [['Progreso',`${Math.round((memory.progress||0)*100)}%`],['Fitness',fmtFitness(memory.fitness)],['Vueltas',String(memory.laps||0)],['Mejor vuelta',fmtLap(memory.bestLapTime)]]){
      const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);dl.appendChild(row);
    }
    const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=replay?.memory.id===memory.id?'Reproduciendo':'Reproducir';button.disabled=replay?.memory.id===memory.id;button.addEventListener('click',()=>startReplay(memory));
    const pickIdx=selected.indexOf(memory.id),pick=document.createElement('button');pick.type='button';pick.className='secondary pick'+(pickIdx>=0?' on':'');pick.textContent=pickIdx>=0?'En carrera ✓':'Elegir';pick.disabled=!!race;pick.addEventListener('click',()=>togglePick(memory.id));
    if(pickIdx>=0){card.classList.add('picked');card.style.borderColor=RACE_COLORS[pickIdx%RACE_COLORS.length];pick.style.borderColor=card.style.borderColor;pick.style.color=card.style.borderColor;}
    const row=document.createElement('div');row.className='card-actions';row.append(button,pick);
    card.append(gen,dl,row);memoryTimeline.appendChild(card);
  });
}

// ---------- Madrid street scenery ----------
// The circuit threads a modern Madrid district: a grid of manzanas with ochre and terracotta
// roofs, wide avenues with glorietas, parks, two fair pavilions, and a fan zone hugging every
// corner — grandstands full of people on the outside of each turn, standing crowds at the fences.
// Generated once from its own seeded PRNG so it never touches the training RNG.
const cityRng=(()=>{let st=20260911;return()=>{st=st+0x6D2B79F5|0;let t=Math.imul(st^st>>>15,1|st);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};})();
const pick=arr=>arr[Math.floor(cityRng()*arr.length)];
function localTurn(i,span=10){
  const n=track.center.length,a=track.center[(i-span+n)%n],b=track.center[i],c=track.center[(i+span)%n];
  return wrapAngle(Math.atan2(c[1]-b[1],c[0]-b[0])-Math.atan2(b[1]-a[1],b[0]-a[0]));
}
function frameAt(index,side=1,offset=0){
  const n=track.center.length,i=((Math.round(index)%n)+n)%n,p=track.center[i],a=track.center[(i-6+n)%n],b=track.center[(i+6)%n];
  const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1,tx=dx/len,ty=dy/len;
  return {x:p[0]+(-ty)*offset*side,y:p[1]+tx*offset*side,heading:Math.atan2(ty,tx),tx,ty};
}
function trackDistance(x,y){let d=Infinity;for(let i=0;i<track.center.length;i++){const p=track.center[i],q=Math.hypot(x-p[0],y-p[1]);if(q<d)d=q;}return d;}
function pathOf(points){const p=new Path2D();points.forEach((q,i)=>i?p.lineTo(q[0],q[1]):p.moveTo(q[0],q[1]));p.closePath();return p;}

const ROOFS=['#c9a27a','#b8846a','#a9705e','#d8c6a6','#bfb09a','#c4b39b','#9e8f82','#d2b28e','#b09378'];
const CROWD=['#e8e4dc','#c94840','#2f5d9a','#e6c74a','#1f2a33','#7a4b3a','#f0b8a0','#3e7d5a','#d9d9d9'];
const CITY={x0:bounds.minX-1000,y0:bounds.minY-850,x1:bounds.maxX+1000,y1:bounds.maxY+850},BLOCK=425,STREET=74,AVENUE=153;
function gridAxis(from,to){const cells=[];let x=from,k=0;while(x<to){cells.push({a:x,b:x+BLOCK,kind:'block'});x+=BLOCK;const w=(++k%4===0)?AVENUE:STREET;cells.push({a:x,b:x+w,kind:w===AVENUE?'avenue':'street'});x+=w;}return cells;}
const colsX=gridAxis(CITY.x0,CITY.x1),rowsY=gridAxis(CITY.y0,CITY.y1);
const blocks=[],buildings=[],pavilions=[],glorietas=[],trees=[],stands=[],crowd=[];
for(const cx of colsX)if(cx.kind==='block')for(const cy of rowsY)if(cy.kind==='block'){
  const w=cx.b-cx.a,h=cy.b-cy.a,dist=trackDistance(cx.a+w/2,cy.a+h/2),r=cityRng();
  blocks.push({x:cx.a,y:cy.a,w,h,dist,kind:dist<270?'fan':r<.11?'park':'urban'});
}
// Two fair pavilions (IFEMA-style halls) on the urban blocks nearest two spots off the circuit.
for(const [idx,side] of [[40,-1],[600,1]]){
  const f=frameAt(idx,side,480);let best=null;
  for(const b of blocks)if(b.kind==='urban'){const d=Math.hypot(b.x+b.w/2-f.x,b.y+b.h/2-f.y);if(!best||d<best.d)best={b,d};}
  if(best){best.b.kind='pavilion';pavilions.push(best.b);}
}
function lotBuildings(b){
  const split=cityRng(),k=.4+cityRng()*.2,m=.4+cityRng()*.2,lots=[];
  if(split<.3)lots.push([b.x,b.y,b.w,b.h]);
  else if(split<.65)lots.push([b.x,b.y,b.w*k,b.h],[b.x+b.w*k,b.y,b.w*(1-k),b.h]);
  else lots.push([b.x,b.y,b.w*k,b.h*m],[b.x+b.w*k,b.y,b.w*(1-k),b.h*m],[b.x,b.y+b.h*m,b.w*k,b.h*(1-m)],[b.x+b.w*k,b.y+b.h*m,b.w*(1-k),b.h*(1-m)]);
  for(const [lx,ly,lw,lh] of lots){
    const inset=17+cityRng()*14,w=lw-inset*2,d=lh-inset*2,x=lx+lw/2,y=ly+lh/2,hgt=45+cityRng()*130;
    if(trackDistance(x,y)<Math.hypot(w,d)/2+120)continue; // keep clear of the circuit and its fan zone
    buildings.push({x,y,w,d,h:hgt,color:pick(ROOFS),court:w>165&&d>165&&cityRng()<.6,stair:cityRng()<.7});
  }
}
for(const b of blocks){
  if(b.kind==='urban')lotBuildings(b);
  if(b.kind==='park')for(let i=0;i<14;i++){const x=b.x+30+cityRng()*(b.w-60),y=b.y+30+cityRng()*(b.h-60);if(trackDistance(x,y)>110)trees.push({x,y,r:8+cityRng()*4});}
}
for(const cx of colsX)if(cx.kind==='avenue')for(const cy of rowsY)if(cy.kind==='avenue'){const x=(cx.a+cx.b)/2,y=(cy.a+cy.b)/2;if(trackDistance(x,y)>260)glorietas.push({x,y});}
// Street trees line both pavements of every avenue.
for(const cx of colsX)if(cx.kind==='avenue')for(let y=CITY.y0+50;y<CITY.y1;y+=105)for(const x of [cx.a-13,cx.b+13])if(trackDistance(x,y)>115)trees.push({x,y,r:7});
for(const cy of rowsY)if(cy.kind==='avenue')for(let x=CITY.x0+50;x<CITY.x1;x+=105)for(const y of [cy.a-13,cy.b+13])if(trackDistance(x,y)>115)trees.push({x,y,r:7});

// Fan zone: kerbs on the apex side, grandstands and crowds on the outside of every corner.
const corners=[];{let last=-1000;for(let i=0;i<track.center.length;i+=6){const t=localTurn(i,20);if(Math.abs(t)<.085||i-last<40)continue;last=i;corners.push({i,turn:t,side:t>0?-1:1});}}
function addStand(index,side,offset,len){
  const f=frameAt(index,side,offset),people=[];
  if(trackDistance(f.x,f.y)<offset-6)return; // another section of the circuit runs through here
  for(let r=0;r<3;r++)for(let u=-len/2+4;u<len/2-4;u+=3.4)if(cityRng()<.74)people.push({u:u+(cityRng()-.5)*1.2,v:6+r*6.5,c:pick(CROWD)});
  stands.push({x:f.x,y:f.y,heading:f.heading,dir:side,len,people});
}
for(const c of corners){
  const big=Math.abs(c.turn)>.28;
  for(const k of (big?[-2,-1,0,1,2]:[-1,0,1]))addStand(c.i+k*5,c.side,44,112);
  if(big)for(const k of [-1,0,1])addStand(c.i+k*5,c.side,96,112);
  for(let k=0;k<130;k++){const f=frameAt(c.i-12+cityRng()*24,c.side,33+cityRng()*8);if(trackDistance(f.x,f.y)>=31)crowd.push({x:f.x,y:f.y,c:pick(CROWD)});}
}
for(const k of [-3,-2,-1,1,2,3])for(const side of [1,-1])addStand(k*5,side,44,112); // main straight, both sides
for(let k=0;k<160;k++){const f=frameAt(-40+cityRng()*80,cityRng()<.5?1:-1,33+cityRng()*8);if(trackDistance(f.x,f.y)>=31)crowd.push({x:f.x,y:f.y,c:pick(CROWD)});}

const SCENERY={
  centerPath:pathOf(track.center),paintL:pathOf(boundary(1,-1.1)),paintR:pathOf(boundary(-1,-1.1)),
  fenceL:pathOf(boundary(1,6)),fenceR:pathOf(boundary(-1,6)),
  kerbs:(()=>{
    const out=[],n=track.center.length,lineL=boundary(1,1.4),lineR=boundary(-1,1.4);let last=-1000;
    for(let i=0;i<n;i+=10){
      const turn=localTurn(i,20);if(Math.abs(turn)<.10||i-last<48)continue;last=i;
      const line=turn>0?lineL:lineR;
      for(let s=i-14,k=0;s<i+14;s+=1,k++)out.push({pts:[line[((s)%n+n)%n],line[((s+1)%n+n)%n]],red:k%2===0});
    }
    return out;
  })()
};
function rotRect(x,y,angle,w,d,fill,stroke=null){
  ctx.save();ctx.translate(x,y);if(angle)ctx.rotate(angle);ctx.fillStyle=fill;ctx.fillRect(-w/2,-d/2,w,d);
  if(stroke){ctx.lineWidth=.8;ctx.strokeStyle=stroke;ctx.strokeRect(-w/2,-d/2,w,d);}ctx.restore();
}
function drawShadow(x,y,w,d,h){ctx.save();ctx.globalAlpha=.17;rotRect(x+h*.11,y+h*.09,0,w,d,'#1a2418');ctx.restore();}
function drawCity(cull){
  ctx.fillStyle='#6d7378';ctx.fillRect(CITY.x0,CITY.y0,CITY.x1-CITY.x0,CITY.y1-CITY.y0);
  for(const b of blocks){if(cull&&!cull(b.x+b.w/2,b.y+b.h/2,Math.hypot(b.w,b.h)/2+10))continue;ctx.fillStyle=b.kind==='park'?'#7d9470':b.kind==='fan'?'#aeaba0':'#b9b6ad';ctx.fillRect(b.x,b.y,b.w,b.h);}
  ctx.strokeStyle='rgba(255,255,255,.42)';ctx.lineWidth=1.6;ctx.setLineDash([26,30]);ctx.beginPath();
  for(const c of colsX)if(c.kind==='avenue'){const x=(c.a+c.b)/2;ctx.moveTo(x,CITY.y0);ctx.lineTo(x,CITY.y1);}
  for(const r of rowsY)if(r.kind==='avenue'){const y=(r.a+r.b)/2;ctx.moveTo(CITY.x0,y);ctx.lineTo(CITY.x1,y);}
  ctx.stroke();ctx.setLineDash([]);
  for(const g of glorietas){if(cull&&!cull(g.x,g.y,AVENUE+10))continue;ctx.fillStyle='#6d7378';ctx.beginPath();ctx.arc(g.x,g.y,AVENUE*.95,0,Math.PI*2);ctx.fill();ctx.fillStyle='#7d9470';ctx.beginPath();ctx.arc(g.x,g.y,AVENUE*.42,0,Math.PI*2);ctx.fill();ctx.lineWidth=1.2;ctx.strokeStyle='#b9b6ad';ctx.stroke();}
  for(const p of pavilions){
    if(cull&&!cull(p.x+p.w/2,p.y+p.h/2,Math.hypot(p.w,p.h)/2+30))continue;const x=p.x+p.w/2,y=p.y+p.h/2;
    drawShadow(x,y,p.w-12,p.h-12,30);rotRect(x,y,0,p.w-12,p.h-12,'#d8d5cc','#9aa0a3');
    for(let k=0;k<6;k++)rotRect(p.x+12+k*(p.w-24)/6+(p.w-24)/12,y,0,7,p.h-30,'#c3c6c1');
  }
  for(const b of buildings){
    if(cull&&!cull(b.x,b.y,Math.hypot(b.w,b.d)/2+b.h*.15+10))continue;
    drawShadow(b.x,b.y,b.w,b.d,b.h);rotRect(b.x,b.y,0,b.w,b.d,b.color,'#7a6e63');
    if(b.court)rotRect(b.x,b.y,0,b.w*.42,b.d*.42,'rgba(0,0,0,.12)');
    if(b.stair)rotRect(b.x+b.w*.3,b.y-b.d*.3,0,14,14,'rgba(255,255,255,.28)');
  }
}
function drawTrackside(cull,detail){
  ctx.lineCap='butt';ctx.strokeStyle='#3b4044';ctx.lineWidth=2;ctx.stroke(SCENERY.fenceL);ctx.stroke(SCENERY.fenceR);
  for(const g of stands){
    if(cull&&!cull(g.x,g.y,g.len/2+60))continue;
    ctx.save();ctx.translate(g.x,g.y);ctx.rotate(g.heading);if(g.dir<0)ctx.scale(1,-1);
    ctx.fillStyle='rgba(26,36,24,.18)';ctx.fillRect(-g.len/2+6,7,g.len,38);
    ctx.fillStyle='#b9b8b1';ctx.fillRect(-g.len/2,2,g.len,39);
    for(let r=0;r<5;r++){ctx.fillStyle=r%2?'#2c4750':'#3c6b78';ctx.fillRect(-g.len/2+2,3.5+r*6.5,g.len-4,3);}
    if(detail)for(const p of g.people){ctx.fillStyle=p.c;ctx.beginPath();ctx.arc(p.u,p.v,1.6,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='#e0e2df';ctx.fillRect(-g.len/2-4,23,g.len+8,19);ctx.lineWidth=1;ctx.strokeStyle='#8f9592';ctx.strokeRect(-g.len/2-4,23,g.len+8,19);
    ctx.restore();
  }
  if(detail)for(const p of crowd){if(cull&&!cull(p.x,p.y,2))continue;ctx.fillStyle=p.c;ctx.beginPath();ctx.arc(p.x,p.y,1.6,0,Math.PI*2);ctx.fill();}
  for(const t of trees){
    if(cull&&!cull(t.x,t.y,t.r+4))continue;
    ctx.fillStyle='rgba(26,36,24,.18)';ctx.beginPath();ctx.arc(t.x+1.1,t.y+.9,t.r,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#4d714d';ctx.beginPath();ctx.arc(t.x,t.y,t.r,0,Math.PI*2);ctx.fill();ctx.lineWidth=.5;ctx.strokeStyle='#3b5a3b';ctx.stroke();
  }
}

// ---------- race: selected saved brains start together from the line ----------
// Pick two or more memories on their cards, press "Correr carrera": one car per brain, own colour and
// label, all released at once. Each car runs until it completes a lap, crashes or times out; standings
// rank lap finishers by time, then everyone else by distance covered.
const RACE_COLORS=['#1cc0d2','#ff694f','#e6c74a','#c97cf0','#3ec672','#f2f4f5'];
let selected=[],race=null,lastRaceStandings=null;
function togglePick(id){const i=selected.indexOf(id);if(i>=0)selected.splice(i,1);else selected.push(id);selected=selected.filter(x=>memories.some(m=>m.id===x));renderMemories();updateRaceUI();memoryStatus.textContent=selected.length?`${selected.length} cerebro${selected.length>1?'s':''} elegido${selected.length>1?'s':''} para la carrera.`:'';}
function entryProgress(e){return e.car.laps>0?1:e.car.maxProgress;}
function rankedEntries(){return [...race.entries].sort((x,y)=>{const lx=x.result?.type==='lap',ly=y.result?.type==='lap';if(lx&&ly)return x.result.steps-y.result.steps;if(lx!==ly)return lx?-1:1;return entryProgress(y)-entryProgress(x);});}
function raceStart(){
  const picked=selected.map(id=>memories.find(m=>m.id===id)).filter(Boolean).sort((a,b)=>a.generation-b.generation);
  if(picked.length<2){memoryStatus.textContent='Elige al menos dos cerebros en las tarjetas («Elegir»).';return;}
  replay=null;
  race={entries:picked.map((m,i)=>{const car=new Car(new Genome([...m.weights]),true,SENSOR_CONFIGS[m.sensors]||CFG7);car.raceColor=RACE_COLORS[i%RACE_COLORS.length];car.raceLabel=`Gen ${m.generation}`;return {memory:m,car,color:car.raceColor,label:car.raceLabel,result:null};}),steps:0,done:false};
  paused=false;follow2D.ready=false;toggleRun.textContent='Pausar carrera';resumeTraining.disabled=false;
  memoryStatus.textContent=`Carrera: ${race.entries.map(e=>e.label).join(' vs ')}. Salen a la vez desde la meta.`;updateRaceUI();renderMemories();
}
function raceEnd(){lastRaceStandings=race?rankedEntries().map(e=>({label:e.label,color:e.color,result:e.result,progress:entryProgress(e)})):lastRaceStandings;leaveReplay();memoryStatus.textContent='Carrera terminada. De vuelta al entrenamiento en directo.';}
function raceStep(steps){
  for(let k=0;k<steps&&!race.done;k++){
    race.steps++;
    for(const e of race.entries){
      const c=e.car;if(!c.alive)continue; // lap finishers keep driving; only crashed or timed-out cars stop
      c.update();
      if(!e.result){if(c.laps>=1)e.result={type:'lap',time:c.lastLapTime,steps:race.steps};else if(!c.alive)e.result={type:c.steps>MAX_STEPS?'timeout':'crash',steps:race.steps};}
    }
    if(race.entries.every(e=>e.result)){race.done=true;paused=true;toggleRun.textContent='Carrera terminada';}
  }
}
function raceStatus(e){const pct=`${Math.round(entryProgress(e)*100)} %`;if(!e.result)return pct;if(e.result.type==='lap')return `VUELTA ${fmtLap(e.result.time)}`;return e.result.type==='crash'?`✕ al ${pct}`:`${pct} · sin vuelta`;}
function updateRaceUI(){
  if(!raceBtn||!raceStandings)return;
  raceBtn.textContent=race?'Terminar carrera':`Correr carrera${selected.length?` (${selected.length})`:''}`;raceBtn.disabled=!race&&selected.length<2;
  raceStandings.innerHTML='';
  const rows=race?rankedEntries().map((e,i)=>({pos:i+1,label:e.label,color:e.color,text:raceStatus(e),cls:e.result?(e.result.type==='lap'?'done':'out'):'running'}))
    :lastRaceStandings?lastRaceStandings.map((r,i)=>({pos:i+1,label:r.label,color:r.color,text:r.result?.type==='lap'?`VUELTA ${fmtLap(r.result.time)}`:r.result?.type==='crash'?`✕ al ${Math.round(r.progress*100)} %`:`${Math.round(r.progress*100)} % · sin vuelta`,cls:'done'}))
    :selected.map((id,i)=>{const m=memories.find(x=>x.id===id);return m?{pos:i+1,label:`Gen ${m.generation}`,color:RACE_COLORS[i%RACE_COLORS.length],text:'en parrilla',cls:'todo'}:null;}).filter(Boolean);
  for(const r of rows){const li=document.createElement('li');li.className=r.cls;const dot=document.createElement('span');dot.className='dot';dot.style.background=r.color;const l=document.createElement('span');l.className='lbl';l.textContent=`${r.pos}. ${r.label}`;const t=document.createElement('span');t.textContent=r.text;li.append(dot,l,t);raceStandings.appendChild(li);}
  if(typeof layoutPanels==='function')layoutPanels();
}
if(raceBtn)raceBtn.addEventListener('click',()=>race?raceEnd():raceStart());
function drawRaceLabel(p,e,i=0){ // labels stack by entry so they stay legible while the cars overlap at the start
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(follow2D.angle);ctx.font='800 6px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
  const t=e.result?.type==='lap'?`${e.label} ✓`:e.result?`${e.label} ✕`:e.label;ctx.lineWidth=1.8;ctx.strokeStyle='#1a1d20';ctx.fillStyle=e.color;ctx.strokeText(t,0,-15-i*7.5);ctx.fillText(t,0,-15-i*7.5);ctx.restore();
}

// ---------- generation banner ----------
// When a generation ends the map dims for a moment and names the generation just completed,
// so the cut from one generation to the next is unmistakable. Purely visual: nothing pauses.
let genBanner=null;
function showGenBanner(gen){genBanner={gen,start:performance.now(),dur:1500};}
function drawGenBanner(){
  if(!genBanner)return;const t=performance.now()-genBanner.start;if(t>genBanner.dur){genBanner=null;return;}
  const a=Math.max(0,Math.min(1,t/150,(genBanner.dur-t)/350));
  ctx.save();ctx.globalAlpha=a*.62;ctx.fillStyle='#070a0f';ctx.fillRect(0,0,W,H);
  ctx.globalAlpha=a;ctx.textAlign='center';ctx.textBaseline='middle';ctx.shadowColor='rgba(0,0,0,.55)';ctx.shadowBlur=14;
  ctx.fillStyle='#fff';ctx.font=`900 ${Math.round(W*.075)}px Inter, system-ui, sans-serif`;ctx.fillText(`GENERACIÓN ${genBanner.gen}`,W/2,H/2-W*.022);
  ctx.fillStyle='#8fd3dc';ctx.font=`700 ${Math.round(W*.027)}px Inter, system-ui, sans-serif`;if('letterSpacing' in ctx)ctx.letterSpacing='.28em';ctx.fillText('COMPLETADA',W/2,H/2+W*.036);
  ctx.restore();
}

// ---------- live brain panel ----------
// Draws the genome exactly as Car.update() reads it: 7 sensors + bias -> steering / throttle / brake,
// 13 weights. Green = positive, red = negative, stroke width = |weight|, node fill = live activation.
const BRAIN_W=360,BRAIN_H=300,OUT_LABELS=['Dirección','Acelerador','Freno'];
const POS='#1f8d47',NEG='#e0463c',BEST_C='#14a3b3',AVG_C='#cf7f22';
// Panel canvases are capped by the room left in their panel, so the memory strip below never gets clipped.
function fitPanelCanvas(cv,logicalW,logicalH){
  const panel=cv.closest('.panel');if(!panel)return;
  const cs=getComputedStyle(panel),padY=parseFloat(cs.paddingTop)+parseFloat(cs.paddingBottom),padX=parseFloat(cs.paddingLeft)+parseFloat(cs.paddingRight);
  const others=[...panel.children].filter(el=>el!==cv&&!el.classList.contains('help-pop')).reduce((a,el)=>a+el.getBoundingClientRect().height,0);
  const availH=panel.clientHeight-padY-others-14,availW=panel.clientWidth-padX;
  cv.style.width=`${Math.max(150,Math.min(availW,360,availH*logicalW/logicalH))}px`;
}
function layoutPanels(){if(brainCanvas)fitPanelCanvas(brainCanvas,BRAIN_W,BRAIN_H);if(fitnessCanvas)fitPanelCanvas(fitnessCanvas,CHART_W,CHART_H);}
function fitCanvas(cv,logicalW,logicalH){
  const dpr=Math.min(window.devicePixelRatio||1,2),cssW=cv.clientWidth||logicalW,cssH=cssW*logicalH/logicalW;
  if(cv.width!==Math.round(cssW*dpr)||cv.height!==Math.round(cssH*dpr)){cv.width=Math.round(cssW*dpr);cv.height=Math.round(cssH*dpr);}
  const c=cv.getContext('2d');c.setTransform(cv.width/logicalW,0,0,cv.height/logicalH,0,0);return c;
}
let brainValFrame=0,brainVals=null;
function drawBrain(focus){
  if(!brainCanvas)return;const c=fitCanvas(brainCanvas,BRAIN_W,BRAIN_H);c.clearRect(0,0,BRAIN_W,BRAIN_H);
  const cfg=focus?.cfg??activeCfg(),w=focus?.genome.weights??[],out=focus?.out,maxW=Math.max(.5,...w.slice(0,cfg.used).map(Math.abs)),nIn=cfg.n+1,now=performance.now();
  const inX=92,outX=228,inY=i=>26+i*(236/(nIn-1)),outY=[74,150,226];
  const inVal=i=>i===cfg.n?1:(out?.s[i]??0),outVals=[out?.steer??0,out?.throttle??0,out?.brake??0];
  if(++brainValFrame%10===1||!brainVals||brainVals.n!==nIn)brainVals={n:nIn,inp:Array.from({length:nIn},(_,i)=>inVal(i)),out:outVals.slice()};
  // An edge is drawn twice: a dim fixed stroke for the weight itself, and a bright stroke plus running dots
  // for the signal flowing through it right now (weight × input). Dormant connections stay dim.
  const drawEdge=(x1,y1,x2,y2,wi,sig,inv,curve=null)=>{
    const v=w[wi]??0,k=Math.abs(v)/maxW,col=v>=0?POS:NEG,a=Math.min(1,Math.abs(sig));
    const path=()=>{c.beginPath();c.moveTo(x1,y1);if(curve)c.bezierCurveTo(curve[0],curve[1],curve[2],curve[3],x2,y2);else c.lineTo(x2,y2);c.stroke();};
    c.setLineDash(v>=0?[]:[5,4]);c.lineWidth=.6+3.4*k;c.strokeStyle=col;c.globalAlpha=.16+.2*k;path();
    if(a>.04){
      c.strokeStyle=v>=0?'#6fe39a':'#ff7b6f';c.globalAlpha=.2+.8*a;path();
      c.setLineDash([]);const n=1+Math.round(a*2),speed=.25+1.6*a;
      for(let d=0;d<n;d++){
        const t=((now/1000)*speed+d/n+wi*.137)%1,u=1-t;let px,py;
        if(curve){px=u*u*u*x1+3*u*u*t*curve[0]+3*u*t*t*curve[2]+t*t*t*x2;py=u*u*u*y1+3*u*u*t*curve[1]+3*u*t*t*curve[3]+t*t*t*y2;}
        else{px=x1+(x2-x1)*t;py=y1+(y2-y1)*t;}
        c.globalAlpha=.55+.45*a;c.fillStyle='#fff';c.beginPath();c.arc(px,py,1.7,0,Math.PI*2);c.fill();
      }
    }
    if(inv){const dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy),bx=x2-dx/L*14,by=y2-dy/L*14;c.setLineDash([]);c.globalAlpha=1;c.beginPath();c.arc(bx,by,3.2,0,Math.PI*2);c.fillStyle='#0b111a';c.fill();c.lineWidth=1.4;c.strokeStyle=col;c.stroke();}
  };
  for(const [i,o,wi,inv] of cfg.edges)drawEdge(inX+7,inY(i),outX-9,outY[o],wi,(w[wi]??0)*(inv?1-inVal(i):inVal(i))/maxW,inv);
  drawEdge(outX-9,outY[0],outX-9,outY[2],cfg.loop,(w[cfg.loop]??0)*Math.abs(outVals[0])/maxW,false,[outX-40,outY[0]+10,outX-40,outY[2]-10]);
  c.globalAlpha=1;c.setLineDash([]);c.textBaseline='middle';
  for(let i=0;i<nIn;i++){
    const v=inVal(i),y=inY(i);
    if(v>.6){c.globalAlpha=.35*(v-.6)/.4;c.fillStyle='#fff';c.beginPath();c.arc(inX,y,11,0,Math.PI*2);c.fill();c.globalAlpha=1;}
    c.beginPath();c.arc(inX,y,7,0,Math.PI*2);c.fillStyle=`rgba(255,255,255,${(.1+.9*v).toFixed(3)})`;c.fill();c.lineWidth=1.2;c.strokeStyle='#8aa0b8';c.stroke();
    c.textAlign='right';c.fillStyle='#8fa2b6';c.font='600 9.5px Inter, system-ui, sans-serif';c.fillText(i===cfg.n?'sesgo':`S${i+1} ${Math.round(cfg.angles[i]*180/Math.PI)}°`,inX-41,y);
    c.fillStyle='#e6edf5';c.font='700 9.5px Inter, system-ui, sans-serif';c.fillText(i===cfg.n?'1.00':brainVals.inp[i].toFixed(2),inX-12,y);
  }
  for(let o=0;o<3;o++){
    const v=outVals[o],y=outY[o],shown=brainVals.out[o],gx=outX+16,gw=BRAIN_W-gx-10,gy=y-1,gh=8;
    c.beginPath();c.arc(outX,y,9,0,Math.PI*2);c.fillStyle=v>=0?POS:NEG;c.globalAlpha=.15+.85*Math.min(1,Math.abs(v));c.fill();c.globalAlpha=1;c.lineWidth=1.4;c.strokeStyle='#c7d3e0';c.stroke();
    c.textAlign='left';c.fillStyle='#e6edf5';c.font='700 11px Inter, system-ui, sans-serif';c.fillText(OUT_LABELS[o],gx,y-14);
    c.textAlign='right';c.fillStyle='#c7d3e0';c.font='700 9px Inter, system-ui, sans-serif';c.fillText(`${shown>=0?'+':'−'}${Math.abs(shown).toFixed(2)}`,gx+gw,y-14);
    c.fillStyle='#1c2634';c.beginPath();c.roundRect(gx,gy,gw,gh,4);c.fill();
    c.font='600 8px Inter, system-ui, sans-serif';
    if(o===0){const mid=gx+gw/2,len=Math.abs(v)*gw/2;c.fillStyle=v>=0?POS:NEG;c.beginPath();c.roundRect(v>=0?mid:mid-len,gy,Math.max(1,len),gh,3);c.fill();c.fillStyle='#8aa0b8';c.fillRect(mid-.5,gy-2,1,gh+4);
      c.fillStyle='#6f8398';c.textAlign='left';c.fillText('izquierda',gx,y+15);c.textAlign='right';c.fillText('derecha',gx+gw,y+15);}
    else{const len=Math.max(0,v)*gw;c.fillStyle=o===1?POS:NEG;c.beginPath();c.roundRect(gx,gy,Math.max(1,len),gh,3);c.fill();
      c.fillStyle='#6f8398';c.textAlign='left';c.fillText(o===1?'nada':'suelto',gx,y+15);c.textAlign='right';c.fillText('a fondo',gx+gw,y+15);}
  }
  c.fillStyle='#6f8398';c.font='600 8.5px Inter, system-ui, sans-serif';c.textAlign='center';c.fillText('los puntos que corren son la señal que pasa ahora por cada conexión',BRAIN_W/2,BRAIN_H-7);
}

// ---------- fitness chart ----------
const CHART_W=340,CHART_H=200,PAD={l:48,r:14,t:14,b:26};let chartHover=null;
const fmtCompact=v=>Math.abs(v)>=1000?`${(v/1000).toFixed(1)}k`:String(Math.round(v));
function drawFitness(){
  if(!fitnessCanvas)return;const c=fitCanvas(fitnessCanvas,CHART_W,CHART_H);c.clearRect(0,0,CHART_W,CHART_H);
  c.font='600 10px Inter, system-ui, sans-serif';c.textBaseline='middle';
  if(history.length<2){c.fillStyle='#6f8398';c.textAlign='center';c.fillText(history.length?'Una generación más para trazar la línea.':'Se rellena tras la primera generación.',CHART_W/2,CHART_H/2);return;}
  const n=history.length,pw=CHART_W-PAD.l-PAD.r,ph=CHART_H-PAD.t-PAD.b;
  const yMax=Math.max(...history.map(h=>h.best))*1.05||1,yMin=Math.min(0,...history.map(h=>h.avg));
  const X=i=>PAD.l+pw*i/(n-1),Y=v=>PAD.t+ph*(1-(v-yMin)/(yMax-yMin));
  c.strokeStyle='#1c2634';c.lineWidth=1;c.fillStyle='#6f8398';c.textAlign='right';
  for(let g=0;g<=3;g++){const v=yMin+(yMax-yMin)*g/3,y=Y(v);c.beginPath();c.moveTo(PAD.l,y);c.lineTo(CHART_W-PAD.r,y);c.stroke();c.fillText(fmtCompact(v),PAD.l-6,y);}
  c.textAlign='left';c.fillText(`gen ${history[0].gen}`,PAD.l,CHART_H-9);c.textAlign='right';c.fillText(`gen ${history[n-1].gen}`,CHART_W-PAD.r,CHART_H-9);
  const line=(key,color)=>{c.strokeStyle=color;c.lineWidth=2;c.lineJoin='round';c.beginPath();history.forEach((h,i)=>i?c.lineTo(X(i),Y(h[key])):c.moveTo(X(i),Y(h[key])));c.stroke();};
  line('avg',AVG_C);line('best',BEST_C);
  const last=history[n-1],yb=Y(last.best),ya=Y(last.avg),sep=Math.abs(yb-ya)<12;
  c.textAlign='right';c.fillStyle='#c7d3e0';c.fillText('mejor',CHART_W-PAD.r,yb-8);c.fillStyle='#9fb0c3';c.fillText('media',CHART_W-PAD.r,sep?ya+10:ya-8);
  if(chartHover!=null){
    const i=Math.max(0,Math.min(n-1,Math.round((chartHover-PAD.l)/pw*(n-1)))),h=history[i],x=X(i);
    c.strokeStyle='#273547';c.lineWidth=1;c.beginPath();c.moveTo(x,PAD.t);c.lineTo(x,PAD.t+ph);c.stroke();
    for(const [key,color] of [['avg',AVG_C],['best',BEST_C]]){c.beginPath();c.arc(x,Y(h[key]),4,0,Math.PI*2);c.fillStyle=color;c.fill();c.lineWidth=2;c.strokeStyle='#0b111a';c.stroke();}
    const label=`Gen ${h.gen} · mejor ${fmtFitness(h.best)} · media ${fmtFitness(h.avg)}`;c.font='600 10px Inter, system-ui, sans-serif';const tw=c.measureText(label).width+14,tx=Math.max(PAD.l,Math.min(CHART_W-PAD.r-tw,x-tw/2));
    c.fillStyle='#152033';c.beginPath();c.roundRect(tx,PAD.t-2,tw,18,5);c.fill();c.fillStyle='#eef2f7';c.textAlign='left';c.fillText(label,tx+7,PAD.t+7);
  }
}
if(fitnessCanvas){
  fitnessCanvas.addEventListener('mousemove',e=>{const r=fitnessCanvas.getBoundingClientRect();chartHover=(e.clientX-r.left)*CHART_W/r.width;});
  fitnessCanvas.addEventListener('mouseleave',()=>{chartHover=null;});
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
let VIEW_R=Math.hypot(W,H)/2/CAMERA_ZOOM_2D;
function drawTrack2D(cull=null,detail=false){
  drawCity(cull);
  ctx.lineCap='round';ctx.lineJoin='round';
  ctx.strokeStyle='#e9e6dd';ctx.lineWidth=track.halfWidth*2+6;ctx.stroke(SCENERY.centerPath);
  ctx.strokeStyle='#494e52';ctx.lineWidth=track.halfWidth*2;ctx.stroke(SCENERY.centerPath);
  ctx.strokeStyle='rgba(24,26,28,.12)';ctx.lineWidth=1.8;ctx.stroke(SCENERY.centerPath);
  ctx.strokeStyle='#f6f4ed';ctx.lineWidth=.7;ctx.stroke(SCENERY.paintL);ctx.stroke(SCENERY.paintR);
  ctx.lineCap='butt';ctx.lineWidth=3.2;
  for(const k of SCENERY.kerbs){ctx.strokeStyle=k.red?'#c5453e':'#f3f1ea';ctx.beginPath();k.pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.stroke();}
  drawStartLine2D();drawTrackside(cull,detail);
}
function drawFormulaCar2D(car,alpha=1,color=null){
  ctx.save();ctx.globalAlpha=alpha;ctx.translate(car.x,car.y);ctx.rotate(car.angle);
  ctx.fillStyle='#101214';ctx.fillRect(-7,-7.6,5.1,3.2);ctx.fillRect(-7,4.4,5.1,3.2);ctx.fillRect(5,-7.1,4.7,3);ctx.fillRect(5,4.1,4.7,3);
  ctx.fillStyle='#15181a';ctx.fillRect(-10.7,-7.7,2,15.4);ctx.fillRect(10.2,-7.8,1.8,15.6);
  ctx.fillStyle=color||'#1cc0d2';
  ctx.beginPath();ctx.moveTo(-8.5,-2.8);ctx.lineTo(-5.2,-4.5);ctx.lineTo(-.5,-4.3);ctx.lineTo(4,-2.8);ctx.lineTo(9,-1.25);ctx.lineTo(13,-.55);ctx.lineTo(13,.55);ctx.lineTo(9,1.25);ctx.lineTo(4,2.8);ctx.lineTo(-.5,4.3);ctx.lineTo(-5.2,4.5);ctx.lineTo(-8.5,2.8);ctx.closePath();ctx.fill();
  ctx.fillStyle='#20262a';ctx.beginPath();ctx.ellipse(.3,0,2.7,1.9,0,0,Math.PI*2);ctx.fill();ctx.restore();
}
// Sensor readouts refresh ~6 times a second so they can be read; the rays themselves move every frame.
// Ray lengths are sampled every 3 units, so the true value jumps; the drawn length is eased per frame.
let sensorLabelFrame=0,sensorLabels=[],rayView=[];
function drawSensors2D(car,pose){
  const ds=car.sensorDistancesAt(pose.x,pose.y,pose.angle);
  if(++sensorLabelFrame%10===1||sensorLabels.length!==ds.length)sensorLabels=ds.map(d=>(d/SENSOR_RANGE).toFixed(2));
  if(rayView.length!==ds.length)rayView=ds.slice();else for(let i=0;i<ds.length;i++)rayView[i]=lerp(rayView[i],ds[i],.3);
  ctx.save();ctx.lineWidth=.75;
  for(let i=0;i<car.cfg.angles.length;i++){
    const a=pose.angle+car.cfg.angles[i],d=rayView[i],ex=pose.x+Math.cos(a)*d,ey=pose.y+Math.sin(a)*d;
    ctx.strokeStyle='rgba(255,255,255,.92)';ctx.beginPath();ctx.moveTo(pose.x,pose.y);ctx.lineTo(ex,ey);ctx.stroke();
    if(!car.alive)continue; // a crashed car's readings are all zero: skip the pile of labels
    const lr=Math.max(19+(i%2)*8,d-6),lx=pose.x+Math.cos(a)*lr,ly=pose.y+Math.sin(a)*lr; // short neighbouring rays alternate radius so labels don't collide
    ctx.save();ctx.translate(lx,ly);ctx.rotate(follow2D.angle);ctx.font='700 5.4px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=1.6;ctx.strokeStyle='#2b2622';ctx.fillStyle='#fff';ctx.strokeText(sensorLabels[i],0,0);ctx.fillText(sensorLabels[i],0,0);ctx.restore();
  }
  ctx.restore();
}
// Follow-camera easing scales with sim speed: 1x keeps the original 14 % per frame, 20x and 50x snap so the car never outruns the camera.
function camEase(base){return Math.min(1,Math.max(base,simSpeed*SPEED_SCALE*.085));}
function update2DCamera(focus){
  if(!focus)return;const ahead=48,tx=focus.x+Math.cos(focus.angle)*ahead,ty=focus.y+Math.sin(focus.angle)*ahead,k=camEase(.14),ka=camEase(.11);
  if(!follow2D.ready){follow2D.x=tx;follow2D.y=ty;follow2D.angle=focus.angle;follow2D.ready=true;}
  else{follow2D.x=lerp(follow2D.x,tx,k);follow2D.y=lerp(follow2D.y,ty,k);follow2D.angle=lerpAngle(follow2D.angle,focus.angle,ka);}
}
function renderTop(focus,cars){
  ctx.fillStyle='#6d7378';ctx.fillRect(0,0,W,H);const pose=focus?viewPose(focus):null;update2DCamera(pose);
  const cull=(x,y,r)=>Math.hypot(x-follow2D.x,y-follow2D.y)<VIEW_R+r;
  ctx.save();ctx.translate(W*.42,H*.5);ctx.scale(CAMERA_ZOOM_2D,CAMERA_ZOOM_2D);ctx.rotate(-follow2D.angle);ctx.translate(-follow2D.x,-follow2D.y);drawTrack2D(cull,true);
  if(race){race.entries.forEach((e,i)=>{const p=viewPose(e.car);drawFormulaCar2D(p,e.result&&e.result.type!=='lap'?.45:1,e.color);drawRaceLabel(p,e,i);});}
  else{for(const car of cars)if(car.alive&&car!==focus)drawFormulaCar2D(viewPose(car),ghostAlpha);if(pose){drawFormulaCar2D(pose,1);drawSensors2D(focus,pose);}}
  ctx.restore();
}

// ---------- swarm: whole circuit in frame, every car visible ----------
// Cars are drawn at a fixed screen size instead of world scale so the field stays legible
// on a phone; the track keeps its true proportions.
const SWARM_PAD=30;
function computeSwarmFit(){
  const bw=bounds.maxX-bounds.minX,bh=bounds.maxY-bounds.minY,scale=Math.min((W-SWARM_PAD*2)/bw,(H-SWARM_PAD*2)/bh);
  return {scale,ox:(W-bw*scale)/2-bounds.minX*scale,oy:(H-bh*scale)/2-bounds.minY*scale};
}
let swarmFit=computeSwarmFit();
function drawSwarmCar(car,color,lead=false){
  const x=swarmFit.ox+car.x*swarmFit.scale,y=swarmFit.oy+car.y*swarmFit.scale,k=lead?1.35:1;
  ctx.save();ctx.translate(x,y);ctx.rotate(car.angle);ctx.fillStyle=color;
  ctx.beginPath();ctx.moveTo(6*k,0);ctx.lineTo(-4*k,3*k);ctx.lineTo(-4*k,-3*k);ctx.closePath();ctx.fill();
  if(lead){ctx.lineWidth=1.4;ctx.strokeStyle='#fff';ctx.stroke();}
  ctx.restore();
}
function renderSwarm(focus,cars){
  ctx.fillStyle='#6d7378';ctx.fillRect(0,0,W,H);
  ctx.save();ctx.translate(swarmFit.ox,swarmFit.oy);ctx.scale(swarmFit.scale,swarmFit.scale);drawTrack2D();ctx.restore();
  if(race){for(const e of race.entries)drawSwarmCar(viewPose(e.car),e.color,true);}
  else{for(const car of cars)if(car.alive&&car!==focus)drawSwarmCar(viewPose(car),'#1cc0d2');if(focus)drawSwarmCar(viewPose(focus),'#ff694f',true);}
}

// ---------- flat HUD ----------
function drawMinimap(focus){
  const c=minimapCtx,w=minimapCanvas.width,h=minimapCanvas.height,pad=10;c.clearRect(0,0,w,h);c.fillStyle='rgba(20,20,20,.82)';c.beginPath();c.roundRect(0,0,w,h,12);c.fill();
  const bw=bounds.maxX-bounds.minX,bh=bounds.maxY-bounds.minY,scale=Math.min((w-pad*2)/bw,(h-pad*2-14)/bh),ox=(w-bw*scale)/2-bounds.minX*scale,oy=15+(h-18-bh*scale)/2-bounds.minY*scale;
  c.strokeStyle='#f0eee8';c.lineWidth=3;c.lineJoin='round';c.lineCap='round';c.beginPath();track.center.forEach((p,i)=>{const x=ox+p[0]*scale,y=oy+p[1]*scale;i?c.lineTo(x,y):c.moveTo(x,y);});c.closePath();c.stroke();
  {const p=track.center[0],q=track.center[1],t=Math.atan2(q[1]-p[1],q[0]-p[0]),nx=Math.cos(t+Math.PI/2),ny=Math.sin(t+Math.PI/2),cx=ox+p[0]*scale,cy=oy+p[1]*scale,half=6.5,cell=half*2/4;
    c.save();c.translate(cx,cy);c.rotate(t);for(let i=0;i<4;i++){c.fillStyle=i%2?'#111':'#fff';c.fillRect(-2,-half+i*cell,4,cell);}c.restore();}
  if(race){for(const e of race.entries){const p=e.car;c.globalAlpha=e.result&&e.result.type!=='lap'?.45:1;c.fillStyle=e.color;c.beginPath();c.arc(ox+p.x*scale,oy+p.y*scale,4.5,0,Math.PI*2);c.fill();c.lineWidth=1.2;c.strokeStyle='#1a1d20';c.stroke();}c.globalAlpha=1;}
  else if(focus){c.fillStyle='#ff694f';c.beginPath();c.arc(ox+focus.x*scale,oy+focus.y*scale,4,0,Math.PI*2);c.fill();}
  c.fillStyle='rgba(255,255,255,.8)';c.font='700 10px system-ui';c.fillText('MADRING',10,12);
}
function setView(mode){
  currentView=mode==='swarm'?'swarm':'top';viewSelect.value=currentView;
  try{localStorage.setItem(VIEW_KEY,currentView);}catch{}
}
// Fractional speeds (0.25x, 0.5x) accumulate until a whole step is due, so slow motion stays smooth.
let speedAcc=0;
let renderAlpha=0;
function stepsThisFrame(){speedAcc+=simSpeed*SPEED_SCALE;const n=Math.floor(speedAcc);speedAcc-=n;renderAlpha=speedAcc;return n;}
// Fixed-step simulation, interpolated rendering: the drawn pose sits between the previous and the
// current step by the pending fraction, so motion is uniform at any speed (0.25x included).
function viewPose(car){return {x:lerp(car.px,car.x,renderAlpha),y:lerp(car.py,car.y,renderAlpha),angle:lerpAngle(car.pva,car.va,renderAlpha),champion:car.champion};}
function stepSimulation(){
  const steps=paused?0:stepsThisFrame();
  if(race){raceStep(steps);const lead=rankedEntries()[0].car;return {focus:lead,cars:race.entries.map(e=>e.car)};}
  if(replay){for(let k=0;k<steps;k++){replay.car.update();if(!replay.car.alive){replay.car.reset();follow2D.ready=false;}}return {focus:replay.car,cars:[replay.car]};}
  for(let k=0;k<steps;k++){for(const car of population)car.update();if(population.every(c=>!c.alive))evolve();}
  const aliveCars=population.filter(c=>c.alive),leader=[...aliveCars].sort((a,b)=>b.fitness-a.fitness)[0]||population[0];return {focus:leader,cars:population};
}
function updateStats(){
  if(race){
    const lead=rankedEntries()[0],running=race.entries.filter(e=>e.car.alive).length,c=lead.car;
    generationEl.textContent='Carrera';aliveEl.textContent=`${running}/${race.entries.length}`;bestProgressEl.textContent=`${Math.round(entryProgress(lead)*100)}%`;bestFitnessEl.textContent=fmtFitness(c.fitness);bestLapsEl.textContent=c.laps;bestLapEl.textContent=fmtLap(c.bestLapTime);
    sceneCounter.textContent=`CARRERA · ${race.entries.map(e=>e.label.toUpperCase()).join(' vs ')}`;lapReadout.textContent=`TIEMPO ${fmtLap(race.steps/SIM_HZ)} · LÍDER ${lead.label.toUpperCase()}`;return;
  }
  if(replay){
    const c=replay.car;generationEl.textContent=`${replay.memory.generation} (rep.)`;aliveEl.textContent=c.alive?'1/1':'0/1';bestProgressEl.textContent=`${Math.round((c.laps>0?1:c.maxProgress)*100)}%`;bestFitnessEl.textContent=fmtFitness(c.fitness);bestLapsEl.textContent=c.laps;bestLapEl.textContent=fmtLap(c.bestLapTime);
    sceneCounter.textContent=`REPETICIÓN · GEN ${replay.memory.generation} · ${c.cfg.n} SENSORES · VUELTAS ${c.laps}`;lapReadout.textContent=`VUELTA ${fmtLap((c.steps-c.lapStartStep)/SIM_HZ)} · MEJOR ${fmtLap(c.bestLapTime)}`;return;
  }
  const alive=population.filter(c=>c.alive).length,best=bestCurrentCar(),laps=Math.max(bestEver?.laps??0,best?.laps??0);
  const bestLap=[bestEver?.bestLapTime,best?.bestLapTime].filter(v=>v!=null).sort((a,b)=>a-b)[0]??null;
  generationEl.textContent=generation;aliveEl.textContent=`${alive}/${POP_SIZE}`;bestProgressEl.textContent=`${Math.round(((best?.laps??0)>0?1:(best?.maxProgress??0))*100)}%`;bestFitnessEl.textContent=fmtFitness(bestEver?.fitness??best?.fitness??0);bestLapsEl.textContent=laps;bestLapEl.textContent=fmtLap(bestLap);
  sceneCounter.textContent=`GEN ${generation} · ${simSpeed}x · ${activeCfg().n} SENSORES · VUELTAS ${laps}`;lapReadout.textContent=`MEJOR VUELTA ${fmtLap(bestLap)}`;
}
function frame(){
  const {focus,cars}=stepSimulation();if(race&&(window.__rf=(window.__rf||0)+1)%6===0)updateRaceUI();
  (currentView==='swarm'?renderSwarm:renderTop)(focus,cars);drawGenBanner();
  drawMinimap(focus);drawBrain(focus);drawFitness();updateStats();requestAnimationFrame(frame);
}

toggleRun.addEventListener('click',()=>{paused=!paused;toggleRun.textContent=paused?(replay?'Reanudar repetición':race?'Reanudar carrera':'Reanudar'):(replay?'Pausar repetición':race?'Pausar carrera':'Pausa');});
function updateBrainCopy(){const cfg=activeCfg();if(brainCopy)brainCopy.textContent=`El genoma del coche líder en tiempo real: ${cfg.n} sensores + sesgo que alimentan dirección, acelerador y freno mediante ${cfg.used} pesos.`;}
// A reset leaves the new population parked on the grid; the user starts it with Reanudar.
function resetTraining(message){replay=null;race=null;lastRaceStandings=null;updateRaceUI();generation=1;bestEver=null;history=[];paused=true;speedAcc=0;freshPopulation();resumeTraining.disabled=true;toggleRun.textContent='Reanudar';memoryStatus.textContent=message;renderMemories();updateBrainCopy();}
resetRun.addEventListener('click',()=>resetTraining('Entrenamiento reiniciado y en pausa: pulsa Reanudar para arrancar. Las memorias se conservan.'));
if(sensorSelect)sensorSelect.addEventListener('change',()=>{sensorMode=Number(sensorSelect.value)===3?3:7;resetTraining(`Reiniciado con ${sensorMode} sensores y en pausa: pulsa Reanudar para arrancar. Las memorias se conservan.`);});
saveMemory.addEventListener('click',()=>{if(replay){memoryStatus.textContent='Vuelve al entrenamiento en directo antes de guardar una memoria nueva.';return;}const b=bestCurrentCar();if(b)storeMemory(b,'manual',generation);});
resumeTraining.addEventListener('click',leaveReplay);
clearMemories.addEventListener('click',()=>{memories=[];persistMemories();if(replay)leaveReplay();renderMemories();memoryStatus.textContent='Memorias neuronales borradas.';});
speedSelect.addEventListener('change',()=>{simSpeed=Number(speedSelect.value)||1;});
if(ghostSlider){ghostSlider.value=String(Math.round(ghostAlpha*100));ghostSlider.addEventListener('input',()=>{ghostAlpha=Number(ghostSlider.value)/100;});}
viewSelect.addEventListener('change',()=>setView(viewSelect.value));

freshPopulation();renderMemories();speedSelect.value=String(simSpeed);if(sensorSelect)sensorSelect.value=String(sensorMode);updateBrainCopy();
if(RECORDING)document.body.classList.add('recording');
// The sim canvas fills its half of the dashboard. Keep the internal height at 920 (the original
// camera framing) and derive the width from the on-screen aspect so nothing is stretched.
function resizeSim(){
  const cssW=canvasWrap.clientWidth,cssH=canvasWrap.clientHeight;if(!cssW||!cssH)return;
  const h=760,w=Math.max(400,Math.round(h*cssW/cssH));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;W=w;H=h;swarmFit=computeSwarmFit();VIEW_R=Math.hypot(W,H)/2/CAMERA_ZOOM_2D;}
}
new ResizeObserver(resizeSim).observe(canvasWrap);resizeSim();
const sidePanels=document.querySelector('.side-panels');if(sidePanels)new ResizeObserver(layoutPanels).observe(sidePanels);layoutPanels();
// ⤢ expand: the map fills the screen (Fullscreen API when allowed, fixed overlay otherwise) and the
// live controls people need while watching — Pausa, Velocidad, Otros coches — move into a bar on the map.
// The same elements are reparented and returned, so there is one control per setting.
const expandBtn=document.querySelector('#expandMap'),mapControls=document.querySelector('#mapControls');
const movable=[toggleRun,speedSelect.closest('label'),ghostSlider?.closest('label')].filter(Boolean);
const homes=movable.map(el=>({el,parent:el.parentNode,next:el.nextSibling}));
let mapExpanded=false;
function setMapExpanded(on){
  mapExpanded=on;document.body.classList.toggle('map-expanded',on);
  if(on)for(const el of movable)mapControls.appendChild(el);else for(const h of homes)h.parent.insertBefore(h.el,h.next);
  if(expandBtn){expandBtn.textContent=on?'⤡':'⤢';expandBtn.title=expandBtn.ariaLabel=on?'Salir de pantalla completa':'Pantalla completa';}
  resizeSim();
}
if(expandBtn&&mapControls){
  expandBtn.addEventListener('click',()=>{
    if(!mapExpanded){setMapExpanded(true);if(canvasWrap.requestFullscreen)canvasWrap.requestFullscreen().catch(()=>{});}
    else{if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});setMapExpanded(false);}
  });
  document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&mapExpanded)setMapExpanded(false);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&mapExpanded&&!document.fullscreenElement)setMapExpanded(false);});
}
// «?» help toggles: one open at a time, click outside closes.
const helpBtns=[...document.querySelectorAll('.help-btn')];
function closeHelp(){for(const b of helpBtns){b.setAttribute('aria-expanded','false');const p=document.getElementById(b.dataset.help);if(p)p.hidden=true;}}
for(const b of helpBtns)b.addEventListener('click',e=>{e.stopPropagation();const p=document.getElementById(b.dataset.help);const open=p&&p.hidden;closeHelp();if(p&&open){p.hidden=false;b.setAttribute('aria-expanded','true');}});
document.addEventListener('click',e=>{if(!e.target.closest('.help-pop'))closeHelp();});
const VIEWS=new Set(['top','swarm']);let initial='top';
try{const saved=localStorage.getItem(VIEW_KEY);if(VIEWS.has(saved))initial=saved;}catch{}
if(VIEWS.has(params.get('view')))initial=params.get('view');
setView(initial);frame();
