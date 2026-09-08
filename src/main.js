const canvas = document.querySelector('#sim');
const ctx = canvas.getContext('2d');
const generationEl = document.querySelector('#generation');
const aliveEl = document.querySelector('#alive');
const bestProgressEl = document.querySelector('#bestProgress');
const bestFitnessEl = document.querySelector('#bestFitness');
const toggleRun = document.querySelector('#toggleRun');
const resetRun = document.querySelector('#resetRun');
const speedSelect = document.querySelector('#speedSelect');

const W = canvas.width;
const H = canvas.height;
const POP_SIZE = 70;
const SENSOR_ANGLES = [-1.0, -0.6, -0.3, 0, 0.3, 0.6, 1.0];
const SENSOR_RANGE = 115;
const CAR_LENGTH = 14;
const MAX_STEPS = 1600;

// MADRING centerline traced from the reference image supplied for this project.
// This is intentionally stored as clean simulator geometry instead of using the
// raster image directly, so collision, sensors and progress work on the track.
const track = {
  center: [
    [103.2,481.6],
    [164.0,305.6],
    [151.2,276.8],
    [173.6,251.2],
    [404.0,200.0],
    [493.6,200.0],
    [576.8,222.4],
    [688.8,209.6],
    [727.2,219.2],
    [813.6,216.0],
    [845.6,222.4],
    [880.8,244.8],
    [967.2,244.8],
    [996.0,267.2],
    [986.4,289.6],
    [941.6,296.0],
    [800.8,232.0],
    [778.4,232.0],
    [727.2,260.8],
    [637.6,257.6],
    [608.8,276.8],
    [592.8,337.6],
    [506.4,356.8],
    [493.6,369.6],
    [487.2,411.2],
    [464.8,427.2],
    [295.2,430.4],
    [285.6,436.8],
    [282.4,484.8],
    [266.4,494.4],
    [119.2,494.4]
  ],
  halfWidth: 31,
};

function lerp(a,b,t){ return a+(b-a)*t; }
function dist(a,b){ return Math.hypot(a[0]-b[0], a[1]-b[1]); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }

const segments = [];
let totalLength = 0;
for(let i=0;i<track.center.length;i++){
  const a = track.center[i];
  const b = track.center[(i+1)%track.center.length];
  const len = dist(a,b);
  segments.push({a,b,len,start:totalLength});
  totalLength += len;
}

function nearestTrackPoint(x,y){
  let best = null;
  for(const s of segments){
    const vx = s.b[0]-s.a[0], vy = s.b[1]-s.a[1];
    const wx = x-s.a[0], wy = y-s.a[1];
    const vv = vx*vx+vy*vy;
    const t = clamp((wx*vx+wy*vy)/(vv||1),0,1);
    const px = s.a[0]+vx*t, py = s.a[1]+vy*t;
    const d = Math.hypot(x-px,y-py);
    if(!best || d<best.d){
      best = {x:px,y:py,d,progress:(s.start+s.len*t)/totalLength,heading:Math.atan2(vy,vx)};
    }
  }
  return best;
}

function onTrack(x,y){ return nearestTrackPoint(x,y).d <= track.halfWidth; }

class Genome {
  constructor(weights){
    this.weights = weights ?? Array.from({length:16},()=>Math.random()*2-1);
  }
  cloneMutated(rate=.22, scale=.45){
    return new Genome(this.weights.map(w => Math.random()<rate ? w+(Math.random()*2-1)*scale : w));
  }
}

class Car {
  constructor(genome, champion=false){
    this.genome=genome; this.champion=champion; this.reset();
  }
  reset(){
    const p=track.center[0], q=track.center[1];
    this.x=p[0]; this.y=p[1]; this.angle=Math.atan2(q[1]-p[1],q[0]-p[0]);
    this.speed=0; this.alive=true; this.steps=0; this.fitness=0; this.maxProgress=0; this.lastProgress=0;
  }
  sense(){
    return SENSOR_ANGLES.map(a=>{
      const ang=this.angle+a;
      let hit=SENSOR_RANGE;
      for(let d=6;d<=SENSOR_RANGE;d+=5){
        const sx=this.x+Math.cos(ang)*d, sy=this.y+Math.sin(ang)*d;
        if(!onTrack(sx,sy)){ hit=d; break; }
      }
      return hit/SENSOR_RANGE;
    });
  }
  update(){
    if(!this.alive) return;
    this.steps++;
    const s=this.sense();
    const w=this.genome.weights;
    const steer=Math.tanh(s[0]*w[0]+s[1]*w[1]+s[2]*w[2]+s[4]*w[3]+s[5]*w[4]+s[6]*w[5]+w[6]);
    const throttle=Math.tanh(s[3]*w[7]+(s[2]+s[4])*w[8]+w[9]);
    const brake=Math.tanh((1-s[3])*w[10]+Math.abs(steer)*w[11]+w[12]);
    const targetSpeed = 1.5 + Math.max(0,throttle)*3.7 - Math.max(0,brake)*2.2;
    this.speed += (targetSpeed-this.speed)*0.08;
    this.speed = clamp(this.speed,0.7,5.2);
    this.angle += steer*0.045*(0.65+this.speed/5.2);
    this.x += Math.cos(this.angle)*this.speed;
    this.y += Math.sin(this.angle)*this.speed;

    const n=nearestTrackPoint(this.x,this.y);
    const headingAlignment=(Math.cos(this.angle-n.heading)+1)/2;
    const delta=n.progress-this.lastProgress;
    const wrappedDelta = delta < -0.5 ? delta+1 : delta > 0.5 ? delta-1 : delta;
    this.fitness += Math.max(0,wrappedDelta)*2200 + headingAlignment*0.03 + this.speed*0.003;
    if(n.progress>this.maxProgress && n.progress-this.maxProgress<0.2) this.maxProgress=n.progress;
    this.lastProgress=n.progress;

    if(!onTrack(this.x,this.y) || this.steps>MAX_STEPS){
      this.alive=false;
      if(!onTrack(this.x,this.y)) this.fitness -= 3;
    }
  }
  draw(alpha=.25, showSensors=false){
    if(!this.alive && !this.champion) return;
    ctx.save();
    ctx.globalAlpha=alpha;
    ctx.translate(this.x,this.y); ctx.rotate(this.angle);
    ctx.fillStyle=this.champion?'#f3f7fb':'#66d9ff';
    ctx.fillRect(-CAR_LENGTH/2,-5,CAR_LENGTH,10);
    ctx.restore();
    if(showSensors){
      ctx.save(); ctx.globalAlpha=.5; ctx.strokeStyle='#d7eef8'; ctx.lineWidth=1;
      for(const a of SENSOR_ANGLES){
        const ang=this.angle+a; let d=SENSOR_RANGE;
        for(let t=6;t<=SENSOR_RANGE;t+=5){
          if(!onTrack(this.x+Math.cos(ang)*t,this.y+Math.sin(ang)*t)){ d=t; break; }
        }
        ctx.beginPath(); ctx.moveTo(this.x,this.y); ctx.lineTo(this.x+Math.cos(ang)*d,this.y+Math.sin(ang)*d); ctx.stroke();
      }
      ctx.restore();
    }
  }
}

let generation=1, paused=false, simSpeed=1, population=[], bestEver=null;

function freshPopulation(seedGenome=null){
  population=[];
  for(let i=0;i<POP_SIZE;i++){
    const genome = seedGenome ? (i===0 ? seedGenome : seedGenome.cloneMutated()) : new Genome();
    population.push(new Car(genome,i===0 && !!seedGenome));
  }
}

function evolve(){
  population.sort((a,b)=>b.fitness-a.fitness);
  const winner=population[0];
  if(!bestEver || winner.fitness>bestEver.fitness){
    bestEver={fitness:winner.fitness,progress:winner.maxProgress,genome:new Genome([...winner.genome.weights])};
  }
  const elite = population.slice(0,Math.max(4,Math.floor(POP_SIZE*0.12)));
  const next=[];
  for(let i=0;i<POP_SIZE;i++){
    const parent=elite[i%elite.length];
    next.push(new Car(i===0 ? new Genome([...parent.genome.weights]) : parent.genome.cloneMutated(), i===0));
  }
  population=next; generation++;
}

function traceTrackPath(){
  ctx.beginPath();
  track.center.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));
  ctx.closePath();
}

function drawTrack(){
  ctx.fillStyle='#08131d'; ctx.fillRect(0,0,W,H);
  ctx.lineCap='round'; ctx.lineJoin='round';

  // Outer safety/runoff edge.
  ctx.strokeStyle='#172838'; ctx.lineWidth=track.halfWidth*2+18;
  traceTrackPath(); ctx.stroke();

  // Asphalt.
  ctx.strokeStyle='#4f5357'; ctx.lineWidth=track.halfWidth*2;
  traceTrackPath(); ctx.stroke();

  // White track edges.
  ctx.strokeStyle='#f4f4f1'; ctx.lineWidth=track.halfWidth*2+4;
  traceTrackPath(); ctx.stroke();
  ctx.strokeStyle='#4f5357'; ctx.lineWidth=track.halfWidth*2-4;
  traceTrackPath(); ctx.stroke();

  // Subtle center guide for development/debugging.
  ctx.strokeStyle='rgba(255,255,255,.10)'; ctx.lineWidth=1;
  traceTrackPath(); ctx.stroke();

  const p=track.center[0], q=track.center[1];
  const ang=Math.atan2(q[1]-p[1],q[0]-p[0])+Math.PI/2;
  ctx.strokeStyle='#fff'; ctx.lineWidth=5; ctx.setLineDash([5,5]);
  ctx.beginPath();
  ctx.moveTo(p[0]+Math.cos(ang)*track.halfWidth,p[1]+Math.sin(ang)*track.halfWidth);
  ctx.lineTo(p[0]-Math.cos(ang)*track.halfWidth,p[1]-Math.sin(ang)*track.halfWidth);
  ctx.stroke(); ctx.setLineDash([]);
}

function frame(){
  if(!paused){
    for(let k=0;k<simSpeed;k++){
      for(const car of population) car.update();
      if(population.every(c=>!c.alive)) evolve();
    }
  }
  drawTrack();
  const aliveCars=population.filter(c=>c.alive);
  for(const car of population) car.draw(car.champion?.95:.16,false);
  const leader=[...aliveCars].sort((a,b)=>b.fitness-a.fitness)[0];
  if(leader) leader.draw(1,true);

  const best=[...population].sort((a,b)=>b.fitness-a.fitness)[0];
  generationEl.textContent=generation;
  aliveEl.textContent=`${aliveCars.length}/${POP_SIZE}`;
  bestProgressEl.textContent=`${Math.round((best?.maxProgress??0)*100)}%`;
  bestFitnessEl.textContent=Math.round(bestEver?.fitness ?? best?.fitness ?? 0);
  requestAnimationFrame(frame);
}

toggleRun.addEventListener('click',()=>{ paused=!paused; toggleRun.textContent=paused?'Resume':'Pause'; });
resetRun.addEventListener('click',()=>{ generation=1; bestEver=null; freshPopulation(); });
speedSelect.addEventListener('change',()=>{ simSpeed=Number(speedSelect.value)||1; });

freshPopulation();
frame();
