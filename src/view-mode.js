const canvas = document.querySelector('#sim');
const canvasWrap = document.querySelector('#canvasWrap');
const viewSelect = document.querySelector('#viewSelect');
const viewStatus = document.querySelector('#viewStatus');

const VIEW_KEY = 'madring-ai-driver-view-v2';
const TRACK_SCALE = 3.40;
const TRACK_HALF_WIDTH = 25;
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
const TRACK_CENTER = BASE_TRACK_CENTER.map(([x,y]) => [
  140 + (x - 110) * TRACK_SCALE,
  140 + (y - 170) * TRACK_SCALE,
]);

// Extra layers are only presentation. Physics and AI remain exactly the same.
const depthCanvas = document.createElement('canvas');
depthCanvas.width = canvas.width;
depthCanvas.height = canvas.height;
depthCanvas.className = 'sim-layer sim-depth-layer';
depthCanvas.setAttribute('aria-hidden', 'true');

const fxCanvas = document.createElement('canvas');
fxCanvas.width = canvas.width;
fxCanvas.height = canvas.height;
fxCanvas.className = 'sim-layer sim-fx-layer';
fxCanvas.setAttribute('aria-hidden', 'true');

canvas.classList.add('sim-main-layer');
canvasWrap.insertBefore(depthCanvas, canvas);
canvasWrap.appendChild(fxCanvas);

const depthCtx = depthCanvas.getContext('2d');
const fxCtx = fxCanvas.getContext('2d');
let currentView = 'top';
let latestWorldMatrix = null;

// Capture the exact world->screen transform used by the simulator when it draws
// the white outer road edge. This keeps our 3D walls and barriers locked to the
// moving follow-camera without changing any training code.
const nativeStroke = CanvasRenderingContext2D.prototype.stroke;
CanvasRenderingContext2D.prototype.stroke = function(...args){
  if(this.canvas === canvas && this.lineWidth > 54 && this.lineWidth < 58){
    latestWorldMatrix = this.getTransform();
  }
  return nativeStroke.apply(this, args);
};

await import('./main-v2.js?v=6');

function setView(mode){
  currentView = mode === 'iso' ? 'iso' : 'top';
  canvasWrap.classList.toggle('isometric-view', currentView === 'iso');
  canvasWrap.classList.toggle('top-view', currentView === 'top');
  canvasWrap.dataset.view = currentView;
  viewSelect.value = currentView;
  viewStatus.textContent = currentView === 'iso'
    ? 'Raised isometric view · safety barriers'
    : 'Top-down view';
  try { localStorage.setItem(VIEW_KEY, currentView); } catch {}
}

function worldToScreen(x,y){
  if(!latestWorldMatrix) return null;
  const p = new DOMPoint(x,y).matrixTransform(latestWorldMatrix);
  return [p.x,p.y];
}

function boundary(side, extra=0){
  const result=[];
  const offset=TRACK_HALF_WIDTH+extra;
  for(let i=0;i<TRACK_CENTER.length;i++){
    const prev=TRACK_CENTER[(i-1+TRACK_CENTER.length)%TRACK_CENTER.length];
    const next=TRACK_CENTER[(i+1)%TRACK_CENTER.length];
    const p=TRACK_CENTER[i];
    const dx=next[0]-prev[0], dy=next[1]-prev[1];
    const len=Math.hypot(dx,dy)||1;
    const nx=-dy/len, ny=dx/len;
    result.push([p[0]+nx*offset*side,p[1]+ny*offset*side]);
  }
  return result;
}

const leftEdge=boundary(1,1);
const rightEdge=boundary(-1,1);
const leftBarrier=boundary(1,10);
const rightBarrier=boundary(-1,10);

function screenPath(points, yOffset=0){
  const out=[];
  for(const p of points){
    const q=worldToScreen(p[0],p[1]);
    if(q) out.push([q[0],q[1]+yOffset]);
  }
  return out;
}

function strokePath(points, color, width, yOffset=0){
  const pts=screenPath(points,yOffset);
  if(!pts.length) return;
  fxCtx.beginPath();
  pts.forEach((p,i)=>i?fxCtx.lineTo(p[0],p[1]):fxCtx.moveTo(p[0],p[1]));
  fxCtx.closePath();
  fxCtx.lineJoin='round';
  fxCtx.lineCap='round';
  fxCtx.strokeStyle=color;
  fxCtx.lineWidth=width;
  fxCtx.stroke();
}

function drawDeckRelief(){
  // Dark vertical face under the asphalt edge, then a bright top lip.
  for(let d=10;d>=2;d-=2){
    const alpha=.055 + (10-d)*.012;
    strokePath(leftEdge,`rgba(40,31,27,${alpha})`,5,d);
    strokePath(rightEdge,`rgba(40,31,27,${alpha})`,5,d);
  }
  strokePath(leftEdge,'rgba(255,255,255,.92)',2.3,-1);
  strokePath(rightEdge,'rgba(255,255,255,.92)',2.3,-1);
  strokePath(leftEdge,'rgba(67,54,47,.72)',3.4,7);
  strokePath(rightEdge,'rgba(67,54,47,.72)',3.4,7);
}

function drawBarrier(points){
  const base=screenPath(points,3);
  const top=screenPath(points,-7);
  if(!base.length||!top.length) return;

  // concrete / barrier base
  fxCtx.beginPath();
  base.forEach((p,i)=>i?fxCtx.lineTo(p[0],p[1]):fxCtx.moveTo(p[0],p[1]));
  fxCtx.closePath();
  fxCtx.strokeStyle='rgba(70,75,77,.95)';
  fxCtx.lineWidth=5.5;
  fxCtx.stroke();

  // metal top rail
  fxCtx.beginPath();
  top.forEach((p,i)=>i?fxCtx.lineTo(p[0],p[1]):fxCtx.moveTo(p[0],p[1]));
  fxCtx.closePath();
  fxCtx.strokeStyle='rgba(218,225,226,.98)';
  fxCtx.lineWidth=2.2;
  fxCtx.stroke();
  fxCtx.strokeStyle='rgba(88,96,99,.95)';
  fxCtx.lineWidth=.75;
  fxCtx.stroke();

  // upright posts make the rail visibly three-dimensional.
  for(let i=0;i<base.length;i+=3){
    const b=base[i], t=top[i];
    if(!b||!t) continue;
    fxCtx.beginPath();
    fxCtx.moveTo(b[0],b[1]);
    fxCtx.lineTo(t[0],t[1]);
    fxCtx.strokeStyle='rgba(186,194,196,.96)';
    fxCtx.lineWidth=1.4;
    fxCtx.stroke();
    fxCtx.fillStyle='rgba(235,239,240,.95)';
    fxCtx.fillRect(t[0]-1.3,t[1]-1.3,2.6,2.6);
  }
}

function drawSafetyPanels(points, phase=0){
  const pts=screenPath(points,-8);
  for(let i=phase;i<pts.length;i+=8){
    const p=pts[i];
    const n=pts[(i+1)%pts.length];
    if(!p||!n) continue;
    const ang=Math.atan2(n[1]-p[1],n[0]-p[0]);
    fxCtx.save();
    fxCtx.translate(p[0],p[1]);
    fxCtx.rotate(ang);
    fxCtx.fillStyle='#d83d35';
    fxCtx.fillRect(-7,-2.2,7,4.4);
    fxCtx.fillStyle='#f4f2ec';
    fxCtx.fillRect(0,-2.2,7,4.4);
    fxCtx.restore();
  }
}

function renderPresentation(){
  if(currentView !== 'iso'){
    depthCtx.clearRect(0,0,depthCanvas.width,depthCanvas.height);
    fxCtx.clearRect(0,0,fxCanvas.width,fxCanvas.height);
    requestAnimationFrame(renderPresentation);
    return;
  }

  // A darker displaced copy creates thickness and a contact shadow while the
  // real simulator canvas stays on top, so the F1 car and sensors remain live.
  depthCtx.clearRect(0,0,depthCanvas.width,depthCanvas.height);
  depthCtx.save();
  depthCtx.globalAlpha=.72;
  depthCtx.drawImage(canvas,0,0);
  depthCtx.restore();

  fxCtx.clearRect(0,0,fxCanvas.width,fxCanvas.height);
  if(latestWorldMatrix){
    drawDeckRelief();
    drawBarrier(leftBarrier);
    drawBarrier(rightBarrier);
    drawSafetyPanels(leftBarrier,1);
    drawSafetyPanels(rightBarrier,5);
  }
  requestAnimationFrame(renderPresentation);
}

let initial='top';
try{
  const saved=localStorage.getItem(VIEW_KEY);
  if(saved==='iso'||saved==='top') initial=saved;
}catch{}
setView(initial);
viewSelect.addEventListener('change',()=>setView(viewSelect.value));
requestAnimationFrame(renderPresentation);
