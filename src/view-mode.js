import './main-v2.js?v=3';

const viewSelect = document.querySelector('#viewSelect');
const canvasWrap = document.querySelector('#canvasWrap');
const viewStatus = document.querySelector('#viewStatus');

const VIEW_KEY = 'madring-ai-driver-view-v1';

function setView(mode){
  const next = mode === 'iso' ? 'iso' : 'top';
  canvasWrap.classList.toggle('isometric-view', next === 'iso');
  canvasWrap.classList.toggle('top-view', next === 'top');
  canvasWrap.dataset.view = next;
  viewSelect.value = next;
  viewStatus.textContent = next === 'iso' ? 'Isometric view' : 'Top-down view';
  try { localStorage.setItem(VIEW_KEY, next); } catch {}
}

let initial = 'top';
try {
  const saved = localStorage.getItem(VIEW_KEY);
  if(saved === 'iso' || saved === 'top') initial = saved;
} catch {}

setView(initial);
viewSelect.addEventListener('change', () => setView(viewSelect.value));
