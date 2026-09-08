const canvas = document.querySelector('#sim');
const ctx = canvas.getContext('2d');
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

const W = canvas.width;
const H = canvas.height;
const WORLD_W = 3700;
const WORLD_H = 1500;
const POP_SIZE = 70;
const SENSOR_ANGLES = [-1.0, -0.6, -0.3, 0, 0.3, 0.6, 1.0];
const SENSOR_RANGE = 115;
const MAX_STEPS = 7600;
const CAMERA_ZOOM = 2.65;
const TRACK_SCALE = 3.40;
const MEMORY_KEY = 'madring-ai-driver-memories-v1';
const AUTO_MEMORY_GENERATIONS = new Set([1, 5, 10, 25, 50, 100]);

// Vector centreline traced from the supplied MADRING reference.
// Important: the circuit is scaled as geometry, not by widening/narrowing the road.
// This preserves a proper visible OFF-TRACK gap where two different sections pass
// near each other. With this scale the closest non-adjacent centreline sections are
// ~72 world units apart, while the complete rendered road is ~56 units wide.
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
  center: BASE_TRACK_CENTER.map(([x,y]) => [
    140 + (x - 110) * TRACK_SCALE,
    140 + (y - 170) * TRACK_SCALE,
  ]),
  halfWidth: 25,
};

function dist(a,b){ return Math.hypot(a[0]-b[0], a[1]-b[1]); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function fmtFitness(v){ return Math.round(v || 0).toLocaleString(); }
function lerp(a,b,t){ return a+(b-a)*t; }
function lerpAngle(a,b,t){
  let d=(b-a+Math.PI)%(Math.PI*2)-Math.PI;
  if(d < -Math.PI) d += Math.PI*2;
  return a+d*t;
}

const segments=[];
let totalLength=0;
for(let i=0;i<track.center.length;i++){
  const a=track.center[i];
  const b=track.center[(i+1)%track.center.length];
  const len=dist(a,b);
  segments.push({a,b,len,start:totalLength});
  totalLength += len;
}

const bounds=track.center.reduce((b,p)=>({
  minX:Math.min(b.minX,p[0]), maxX:Math.max(b.maxX,p[0]),
  minY:Math.min(b.minY,p[1]), maxY:Math.max(b.maxY,p[1]),
}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});

function nearestTrackPoint(x,y){
  let best=null;
  for(const s of segments){
    const vx=s.b[0]-s.a[0], vy=s.b[1]-s.a[1];
    const wx=x-s.a[0], wy=y-s.a[1];
    const vv=vx*vx+vy*vy;
    const t=clamp((wx*vx+wy*vy)/(vv||1),0,1);
    const px=s.a[0]+vx*t, py=s.a[1]+vy*t;
    const d=Math.hypot(x-px,y-py);
    if(!best || d<best.d){
      best={x:px,y:py,d,progress:(s.start+s.len*t)/totalLength,heading:Math.atan2(vy,vx)};
    }
  }
  return best;
}

// One mask is used by both collision and ray sensors, so visual gaps and
// physical gaps are guaranteed to match.
const maskCanvas=document.createElement('canvas');
maskCanvas.width=WORLD_W;
maskCanvas.height=WORLD_H;
const maskCtx=maskCanvas.getContext('2d',{willReadFrequently:true});
maskCtx.lineCap='round';
maskCtx.lineJoin='round';
maskCtx.strokeStyle='#fff';
maskCtx.lineWidth=track.halfWidth*2;
maskCtx.beginPath();
track.center.forEach((p,i)=>i?maskCtx.lineTo(...p):maskCtx.moveTo(...p));
maskCtx.closePath();
maskCtx.stroke();
const maskData=maskCtx.getImageData(0,0,WORLD_W,WORLD_H).data;
function onTrack(x,y){
  const ix=Math.round(x), iy=Math.round(y);
  if(ix<0 || iy<0 || ix>=WORLD_W || iy>=WORLD_H) return false;
  return maskData[(iy*WORLD_W+ix)*4+3] > 20;
}

class Genome {
  constructor(weights){
    this.weights=weights ?? Array.from({length:16},()=>Math.random()*2-1);
  }
  cloneMutated(rate=.22,scale=.45){
    return new Genome(this.weights.map(w=>Math.random()<rate?w+(Math.random()*2-1)*scale:w));
  }
}

class Car {
  constructor(genome,champion=false){
    this.genome=genome;
    this.champion=champion;
    this.reset();
  }
  reset(){
    const p=track.center[0], q=track.center[1];
    this.x=p[0]; this.y=p[1];
    this.angle=Math.atan2(q[1]-p[1],q[0]-p[0]);
    this.speed=0; this.alive=true; this.steps=0; this.fitness=0;
    this.maxProgress=0; this.lastProgress=0; this.laps=0;
  }
  sensorDistances(){
    return SENSOR_ANGLES.map(a=>{
      const ang=this.angle+a;
      let hit=SENSOR_RANGE;
      for(let d=4;d<=SENSOR_RANGE;d+=3){
        if(!onTrack(this.x+Math.cos(ang)*d,this.y+Math.sin(ang)*d)){
          hit=d; break;
        }
      }
      return hit;
    });
  }
  sense(){ return this.sensorDistances().map(d=>d/SENSOR_RANGE); }
  update(){
    if(!this.alive) return;
    this.steps++;
    const s=this.sense();
    const w=this.genome.weights;
    const steer=Math.tanh(s[0]*w[0]+s[1]*w[1]+s[2]*w[2]+s[4]*w[3]+s[5]*w[4]+s[6]*w[5]+w[6]);
    const throttle=Math.tanh(s[3]*w[7]+(s[2]+s[4])*w[8]+w[9]);
    const brake=Math.tanh((1-s[3])*w[10]+Math.abs(steer)*w[11]+w[12]);
    const targetSpeed=1.45+Math.max(0,throttle)*3.8-Math.max(0,brake)*2.1;
    this.speed += (targetSpeed-this.speed)*.08;
    this.speed=clamp(this.speed,.7,5.25);
    this.angle += steer*.044*(.65+this.speed/5.25);
    this.x += Math.cos(this.angle)*this.speed;
    this.y += Math.sin(this.angle)*this.speed;

    const n=nearestTrackPoint(this.x,this.y);
    const headingAlignment=(Math.cos(this.angle-n.heading)+1)/2;
    const delta=n.progress-this.lastProgress;
    const wrappedDelta=delta<-.5?delta+1:delta>.5?delta-1:delta;
    if(this.lastProgress>.82 && n.progress<.18 && wrappedDelta>0){
      this.laps++;
      this.fitness += 1400;
      this.maxProgress=1;
    }
    this.fitness += Math.max(0,wrappedDelta)*2350 + headingAlignment*.03 + this.speed*.003;
    if(this.laps===0 && n.progress>this.maxProgress && n.progress-this.maxProgress<.2) this.maxProgress=n.progress;
    this.lastProgress=n.progress;
    if(!onTrack(this.x,this.y) || this.steps>MAX_STEPS){
      this.alive=false;
      if(!onTrack(this.x,this.y)) this.fitness -= 4;
    }
  }
  drawFormulaCar(alpha=1){
    const body=this.champion?'#f5f3ee':'#7fc6d8';
    const accent=this.champion?'#ef4f3a':'#d9f4f8';
    ctx.save();
    ctx.globalAlpha=alpha;
    ctx.translate(this.x,this.y);
    ctx.rotate(this.angle);

    // tyres
    ctx.fillStyle='#111315';
    ctx.fillRect(-6.8,-7.8,5.2,3.4);
    ctx.fillRect(-6.8,4.4,5.2,3.4);
    ctx.fillRect(4.2,-7.2,4.8,3.2);
    ctx.fillRect(4.2,4.0,4.8,3.2);

    // rear and front wings
    ctx.fillStyle='#1f2326';
    ctx.fillRect(-10.6,-7.7,2.2,15.4);
    ctx.fillRect(9.0,-7.7,2.0,15.4);
    ctx.fillStyle=accent;
    ctx.fillRect(9.45,-7.2,.7,14.4);

    // main F1 body / sidepods / nose
    ctx.fillStyle=body;
    ctx.strokeStyle='rgba(15,17,18,.92)';
    ctx.lineWidth=.9;
    ctx.beginPath();
    ctx.moveTo(-8.5,-2.9);
    ctx.lineTo(-4.9,-4.8);
    ctx.lineTo(-.8,-4.3);
    ctx.lineTo(2.8,-3.0);
    ctx.lineTo(6.5,-1.6);
    ctx.lineTo(10.8,-.7);
    ctx.lineTo(10.8,.7);
    ctx.lineTo(6.5,1.6);
    ctx.lineTo(2.8,3.0);
    ctx.lineTo(-.8,4.3);
    ctx.lineTo(-4.9,4.8);
    ctx.lineTo(-8.5,2.9);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // cockpit + halo impression
    ctx.fillStyle='#20262a';
    ctx.beginPath();
    ctx.ellipse(.2,0,2.7,1.9,0,0,Math.PI*2);
    ctx.fill();
    ctx.strokeStyle=accent;
    ctx.lineWidth=.8;
    ctx.beginPath();
    ctx.arc(.35,0,2.2,-1.15,1.15);
    ctx.stroke();

    // nose stripe
    ctx.strokeStyle=accent;
    ctx.lineWidth=.85;
    ctx.beginPath();
    ctx.moveTo(2.0,0);
    ctx.lineTo(10.6,0);
    ctx.stroke();
    ctx.restore();
  }
  draw(alpha=.25,showSensors=false){
    if(!this.alive && !this.champion) return;
    this.drawFormulaCar(alpha);
    if(!showSensors) return;

    const distances=this.sensorDistances();
    ctx.save();
    ctx.globalAlpha=.9;
    ctx.lineWidth=.75;
    for(let i=0;i<SENSOR_ANGLES.length;i++){
      const ang=this.angle+SENSOR_ANGLES[i];
      const d=distances[i];
      const ex=this.x+Math.cos(ang)*d;
      const ey=this.y+Math.sin(ang)*d;
      ctx.strokeStyle='rgba(255,255,255,.96)';
      ctx.beginPath();
      ctx.moveTo(this.x,this.y);
      ctx.lineTo(ex,ey);
      ctx.stroke();

      const lx=this.x+Math.cos(ang)*Math.max(14,d-6);
      const ly=this.y+Math.sin(ang)*Math.max(14,d-6);
      ctx.save();
      ctx.translate(lx,ly);
      ctx.rotate(Math.PI/2 + camera.angle);
      ctx.font='700 5.6px system-ui, sans-serif';
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      ctx.lineWidth=1.6;
      ctx.strokeStyle='rgba(34,30,28,.88)';
      ctx.fillStyle='#fff';
      const value=(d/SENSOR_RANGE).toFixed(2);
      ctx.strokeText(value,0,0);
      ctx.fillText(value,0,0);
      ctx.restore();
    }
    ctx.restore();
  }
}

let generation=1, paused=false, simSpeed=1, population=[], bestEver=null;
let memories=loadMemories();
let replay=null;
const camera={x:track.center[0][0],y:track.center[0][1],angle:0,ready:false};

function loadMemories(){
  try{
    const value=JSON.parse(localStorage.getItem(MEMORY_KEY)||'[]');
    return Array.isArray(value)?value.filter(m=>Array.isArray(m.weights)):[];
  }catch{return [];}
}
function persistMemories(){
  try{localStorage.setItem(MEMORY_KEY,JSON.stringify(memories.slice(-30)));}catch{}
}
function shouldAutoSave(gen){ return AUTO_MEMORY_GENERATIONS.has(gen)||(gen>100&&gen%50===0); }
function bestCurrentCar(){ return [...population].sort((a,b)=>b.fitness-a.fitness)[0]||null; }
function storeMemory(car,source='manual',gen=generation){
  if(!car) return;
  if(source==='auto'&&memories.some(m=>m.source==='auto'&&m.generation===gen)) return;
  memories.push({
    id:`${Date.now()}-${Math.random().toString(16).slice(2)}`,
    generation:gen,source,fitness:car.fitness,
    progress:car.laps>0?1:car.maxProgress,laps:car.laps,
    weights:[...car.genome.weights],createdAt:new Date().toISOString(),
  });
  memories=memories.slice(-30);
  persistMemories();
  renderMemories();
  memoryStatus.textContent=`Saved ${source} memory from generation ${gen}.`;
}
function freshPopulation(seedGenome=null){
  population=[];
  for(let i=0;i<POP_SIZE;i++){
    const genome=seedGenome?(i===0?seedGenome:seedGenome.cloneMutated()):new Genome();
    population.push(new Car(genome,i===0&&!!seedGenome));
  }
  camera.ready=false;
}
function evolve(){
  population.sort((a,b)=>b.fitness-a.fitness);
  const winner=population[0];
  if(!bestEver||winner.fitness>bestEver.fitness){
    bestEver={fitness:winner.fitness,progress:winner.maxProgress,laps:winner.laps,genome:new Genome([...winner.genome.weights])};
  }
  if(shouldAutoSave(generation)) storeMemory(winner,'auto',generation);
  const elite=population.slice(0,Math.max(4,Math.floor(POP_SIZE*.12)));
  population=Array.from({length:POP_SIZE},(_,i)=>{
    const parent=elite[i%elite.length];
    return new Car(i===0?new Genome([...parent.genome.weights]):parent.genome.cloneMutated(),i===0);
  });
  generation++;
  camera.ready=false;
}
function startReplay(memory){
  replay={memory,car:new Car(new Genome([...memory.weights]),true)};
  paused=false; camera.ready=false;
  toggleRun.textContent='Pause replay';
  resumeTraining.disabled=false;
  memoryStatus.textContent=`Replaying generation ${memory.generation}. This does not modify current training.`;
  renderMemories();
}
function leaveReplay(){
  replay=null; paused=false; camera.ready=false;
  toggleRun.textContent='Pause';
  resumeTraining.disabled=true;
  memoryStatus.textContent=`Back to live training at generation ${generation}.`;
  renderMemories();
}
function renderMemories(){
  memoryTimeline.innerHTML='';
  if(memories.length===0){
    const empty=document.createElement('p');
    empty.className='memory-empty';
    empty.textContent='No neural memories yet. Train until generation 1 finishes or save one manually.';
    memoryTimeline.appendChild(empty);
    return;
  }
  [...memories].sort((a,b)=>a.generation-b.generation).forEach(memory=>{
    const card=document.createElement('article');
    card.className=`memory-card${replay?.memory.id===memory.id?' active':''}`;
    const gen=document.createElement('div');
    gen.className='memory-gen';
    const strong=document.createElement('strong'); strong.textContent=`Gen ${memory.generation}`;
    const badge=document.createElement('span'); badge.className='badge'; badge.textContent=memory.source.toUpperCase();
    gen.append(strong,badge);
    const dl=document.createElement('dl');
    for(const [label,value] of [
      ['Progress',`${Math.round((memory.progress||0)*100)}%`],
      ['Fitness',fmtFitness(memory.fitness)],
      ['Laps',String(memory.laps||0)],
    ]){
      const row=document.createElement('div');
      const dt=document.createElement('dt'); dt.textContent=label;
      const dd=document.createElement('dd'); dd.textContent=value;
      row.append(dt,dd); dl.appendChild(row);
    }
    const button=document.createElement('button');
    button.type='button'; button.className='secondary';
    button.textContent=replay?.memory.id===memory.id?'Replaying':'Replay this brain';
    button.disabled=replay?.memory.id===memory.id;
    button.addEventListener('click',()=>startReplay(memory));
    card.append(gen,dl,button);
    memoryTimeline.appendChild(card);
  });
}

function traceTrackPath(targetCtx=ctx){
  targetCtx.beginPath();
  track.center.forEach((p,i)=>i?targetCtx.lineTo(...p):targetCtx.moveTo(...p));
  targetCtx.closePath();
}
function drawStartLine(){
  const p=track.center[0],q=track.center[1];
  const tangent=Math.atan2(q[1]-p[1],q[0]-p[0]);
  const nx=Math.cos(tangent+Math.PI/2), ny=Math.sin(tangent+Math.PI/2);
  const cells=8, full=track.halfWidth*2, cell=full/cells;
  for(let i=0;i<cells;i++){
    const offset=-track.halfWidth+cell*(i+.5);
    const cx=p[0]+nx*offset, cy=p[1]+ny*offset;
    ctx.save();
    ctx.translate(cx,cy); ctx.rotate(tangent);
    ctx.fillStyle=i%2===0?'#fff':'#1d1d1d';
    ctx.fillRect(-2.8,-cell/2,5.6,cell);
    ctx.restore();
  }
}
function drawTrackWorld(){
  ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.strokeStyle='#f7f5ef';
  ctx.lineWidth=track.halfWidth*2+5.5;
  traceTrackPath(); ctx.stroke();
  ctx.strokeStyle='#a87547';
  ctx.lineWidth=track.halfWidth*2;
  traceTrackPath(); ctx.stroke();
  ctx.strokeStyle='rgba(105,69,44,.24)';
  ctx.lineWidth=1;
  traceTrackPath(); ctx.stroke();
  drawStartLine();
}
function updateCamera(focus){
  if(!focus) return;
  const ahead=48;
  const tx=focus.x+Math.cos(focus.angle)*ahead;
  const ty=focus.y+Math.sin(focus.angle)*ahead;
  if(!camera.ready){
    camera.x=tx; camera.y=ty; camera.angle=focus.angle; camera.ready=true;
  }else{
    camera.x=lerp(camera.x,tx,.14);
    camera.y=lerp(camera.y,ty,.14);
    camera.angle=lerpAngle(camera.angle,focus.angle,.11);
  }
}
function beginWorldCamera(){
  ctx.save();
  ctx.translate(W*.5,H*.64);
  ctx.scale(CAMERA_ZOOM,CAMERA_ZOOM);
  ctx.rotate(-Math.PI/2-camera.angle);
  ctx.translate(-camera.x,-camera.y);
}
function endWorldCamera(){ctx.restore();}
function drawMinimap(focus){
  const x=18,y=18,w=205,h=112,pad=13;
  ctx.save();
  ctx.fillStyle='rgba(20,20,20,.80)';
  ctx.strokeStyle='rgba(255,255,255,.20)';
  ctx.lineWidth=1.5;
  ctx.beginPath();
  ctx.roundRect(x,y,w,h,12); ctx.fill(); ctx.stroke();
  const bw=bounds.maxX-bounds.minX,bh=bounds.maxY-bounds.minY;
  const scale=Math.min((w-pad*2)/bw,(h-pad*2-14)/bh);
  const ox=x+(w-bw*scale)/2-bounds.minX*scale;
  const oy=y+20+(h-24-bh*scale)/2-bounds.minY*scale;
  ctx.strokeStyle='#f0eee8';
  ctx.lineWidth=3;
  ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.beginPath();
  track.center.forEach((p,i)=>{
    const px=ox+p[0]*scale,py=oy+p[1]*scale;
    i?ctx.lineTo(px,py):ctx.moveTo(px,py);
  });
  ctx.closePath(); ctx.stroke();
  if(focus){
    ctx.fillStyle='#ff694f';
    ctx.beginPath();
    ctx.arc(ox+focus.x*scale,oy+focus.y*scale,4.2,0,Math.PI*2);
    ctx.fill();
  }
  ctx.fillStyle='rgba(255,255,255,.78)';
  ctx.font='600 10px system-ui, sans-serif';
  ctx.fillText('MADRING',x+12,y+15);
  ctx.restore();
}
function drawCanvasHud(){
  ctx.save();
  ctx.textAlign='center';
  ctx.fillStyle='rgba(255,255,255,.95)';
  ctx.strokeStyle='rgba(20,20,20,.72)';
  ctx.lineWidth=5;
  ctx.font='800 30px system-ui, sans-serif';
  ctx.strokeText('AI LEARNS MADRING',W/2,54);
  ctx.fillText('AI LEARNS MADRING',W/2,54);
  ctx.textAlign='right';
  ctx.font='700 15px system-ui, sans-serif';
  ctx.lineWidth=3;
  const label=replay?`REPLAY · GEN ${replay.memory.generation}`:`GEN ${generation} · ${simSpeed}x`;
  ctx.strokeText(label,W-18,30);
  ctx.fillText(label,W-18,30);
  ctx.restore();
}
function renderScene(focus,cars,sensorCar){
  ctx.fillStyle='#b8a097';
  ctx.fillRect(0,0,W,H);
  if(focus) updateCamera(focus);
  beginWorldCamera();
  drawTrackWorld();
  for(const car of cars) car.draw(car===sensorCar?1:(car.champion?.94:.14),false);
  if(sensorCar) sensorCar.draw(1,true);
  endWorldCamera();
  drawMinimap(focus);
  drawCanvasHud();
}
function updateReplay(){
  if(!replay||paused) return;
  for(let k=0;k<simSpeed;k++){
    replay.car.update();
    if(!replay.car.alive){replay.car.reset();camera.ready=false;}
  }
}
function frame(){
  if(replay){
    updateReplay();
    renderScene(replay.car,[replay.car],replay.car);
    generationEl.textContent=`${replay.memory.generation} replay`;
    aliveEl.textContent=replay.car.alive?'1/1':'0/1';
    bestProgressEl.textContent=`${Math.round((replay.car.laps>0?1:replay.car.maxProgress)*100)}%`;
    bestFitnessEl.textContent=fmtFitness(replay.car.fitness);
    bestLapsEl.textContent=replay.car.laps;
    requestAnimationFrame(frame);
    return;
  }
  if(!paused){
    for(let k=0;k<simSpeed;k++){
      for(const car of population) car.update();
      if(population.every(c=>!c.alive)) evolve();
    }
  }
  const aliveCars=population.filter(c=>c.alive);
  const leader=[...aliveCars].sort((a,b)=>b.fitness-a.fitness)[0]||population[0];
  renderScene(leader,population,leader?.alive?leader:null);
  const best=bestCurrentCar();
  generationEl.textContent=generation;
  aliveEl.textContent=`${aliveCars.length}/${POP_SIZE}`;
  bestProgressEl.textContent=`${Math.round(((best?.laps??0)>0?1:(best?.maxProgress??0))*100)}%`;
  bestFitnessEl.textContent=fmtFitness(bestEver?.fitness??best?.fitness??0);
  bestLapsEl.textContent=Math.max(bestEver?.laps??0,best?.laps??0);
  requestAnimationFrame(frame);
}

toggleRun.addEventListener('click',()=>{
  paused=!paused;
  toggleRun.textContent=paused?(replay?'Resume replay':'Resume'):(replay?'Pause replay':'Pause');
});
resetRun.addEventListener('click',()=>{
  replay=null; generation=1; bestEver=null; paused=false;
  freshPopulation(); resumeTraining.disabled=true; toggleRun.textContent='Pause';
  memoryStatus.textContent='Training reset. Saved neural memories were kept so you can still replay them.';
  renderMemories();
});
saveMemory.addEventListener('click',()=>{
  if(replay){
    memoryStatus.textContent='You are replaying an old memory. Return to current training before saving a new one.';
    return;
  }
  const best=bestCurrentCar();
  if(best) storeMemory(best,'manual',generation);
});
resumeTraining.addEventListener('click',leaveReplay);
clearMemories.addEventListener('click',()=>{
  memories=[]; persistMemories();
  if(replay) leaveReplay();
  renderMemories();
  memoryStatus.textContent='Saved neural memories cleared. Current training was not reset.';
});
speedSelect.addEventListener('change',()=>{simSpeed=Number(speedSelect.value)||1;});

freshPopulation();
renderMemories();
frame();