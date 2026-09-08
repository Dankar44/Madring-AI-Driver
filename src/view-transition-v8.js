// Smooth visual transition between the top-down canvas and the 3D isometric canvas.
// The simulation view still switches immediately internally, but both render surfaces
// remain layered long enough to crossfade/zoom so the user sees one continuous camera move.

const wrap=document.querySelector('#canvasWrap');
const topCanvas=document.querySelector('#sim');
const isoCanvas=document.querySelector('#threeSim');
const sensorOverlay=document.querySelector('#sensorOverlay');
const viewSelect=document.querySelector('#viewSelect');
const viewStatus=document.querySelector('#viewStatus');

if(wrap&&topCanvas&&isoCanvas&&sensorOverlay&&viewSelect){
  const DURATION=1050;
  const style=document.createElement('style');
  style.textContent=`
    .smooth-view-ready #sim,
    .smooth-view-ready #threeSim {
      visibility: visible !important;
      opacity: 0;
      transform: scale(1);
      transform-origin: 50% 64%;
      transition:
        opacity ${DURATION}ms cubic-bezier(.22,.61,.36,1),
        transform ${DURATION}ms cubic-bezier(.22,.61,.36,1),
        filter ${DURATION}ms cubic-bezier(.22,.61,.36,1);
      will-change: opacity, transform, filter;
    }

    .smooth-view-ready.top-view #sim { opacity: 1; z-index: 2; }
    .smooth-view-ready.top-view #threeSim { opacity: 0; z-index: 1; }
    .smooth-view-ready.isometric-view #sim { opacity: 0; z-index: 1; }
    .smooth-view-ready.isometric-view #threeSim { opacity: 1; z-index: 2; }

    .smooth-view-ready.view-transitioning.to-iso #sim {
      opacity: 0;
      transform: scale(1.055);
      filter: saturate(.92) brightness(.96);
    }
    .smooth-view-ready.view-transitioning.to-iso #threeSim {
      opacity: 1;
      transform: scale(1);
      filter: saturate(1) brightness(1);
      animation: madringIsoArrive ${DURATION}ms cubic-bezier(.22,.61,.36,1) both;
    }

    .smooth-view-ready.view-transitioning.to-top #threeSim {
      opacity: 0;
      transform: scale(.955);
      filter: saturate(.92) brightness(.96);
    }
    .smooth-view-ready.view-transitioning.to-top #sim {
      opacity: 1;
      transform: scale(1);
      filter: saturate(1) brightness(1);
      animation: madringTopArrive ${DURATION}ms cubic-bezier(.22,.61,.36,1) both;
    }

    .smooth-view-ready #sensorOverlay {
      display: block !important;
      transition: opacity 620ms ease;
      will-change: opacity;
    }
    .smooth-view-ready.top-view #sensorOverlay { opacity: 0; }
    .smooth-view-ready.isometric-view #sensorOverlay { opacity: 1; }

    .smooth-view-ready .scene-hud {
      transform: none !important;
      transition: none !important;
    }

    @keyframes madringIsoArrive {
      0%   { transform: scale(.955); filter: saturate(.9) brightness(.94); }
      58%  { transform: scale(1.012); }
      100% { transform: scale(1); filter: saturate(1) brightness(1); }
    }
    @keyframes madringTopArrive {
      0%   { transform: scale(1.045); filter: saturate(.9) brightness(.94); }
      100% { transform: scale(1); filter: saturate(1) brightness(1); }
    }

    @media (prefers-reduced-motion: reduce) {
      .smooth-view-ready #sim,
      .smooth-view-ready #threeSim,
      .smooth-view-ready #sensorOverlay {
        transition-duration: 180ms !important;
        animation-duration: 180ms !important;
      }
    }
  `;
  document.head.appendChild(style);

  // Establish the current state without animating page load.
  const initial=viewSelect.value==='iso'?'iso':'top';
  topCanvas.style.opacity=initial==='top'?'1':'0';
  isoCanvas.style.opacity=initial==='iso'?'1':'0';
  sensorOverlay.style.display='block';
  sensorOverlay.style.opacity=initial==='iso'?'1':'0';

  requestAnimationFrame(()=>{
    wrap.classList.add('smooth-view-ready');
    topCanvas.style.removeProperty('opacity');
    isoCanvas.style.removeProperty('opacity');
    sensorOverlay.style.removeProperty('opacity');
  });

  let timer=null;
  let lastMode=initial;

  function beginTransition(target){
    if(target===lastMode)return;
    lastMode=target;
    clearTimeout(timer);

    // app-v5 toggles display inline; keep the overlay alive so it can fade instead of pop.
    sensorOverlay.style.display='block';

    wrap.classList.remove('to-iso','to-top','view-transitioning');
    // Force style flush so repeated quick switches still restart the animation cleanly.
    void wrap.offsetWidth;
    wrap.classList.add('view-transitioning',target==='iso'?'to-iso':'to-top');

    if(viewStatus)viewStatus.textContent=target==='iso'?'Moving camera into 3D…':'Moving camera overhead…';

    timer=setTimeout(()=>{
      wrap.classList.remove('view-transitioning','to-iso','to-top');
      sensorOverlay.style.display='block';
      if(viewStatus)viewStatus.textContent=target==='iso'
        ?'3D isometric · smooth camera transition · urban scenery'
        :'Top-down view · smooth camera transition';
    },DURATION+80);
  }

  // Registered after app-v5, so its actual view state is already updated when this runs.
  viewSelect.addEventListener('change',()=>beginTransition(viewSelect.value==='iso'?'iso':'top'));
}
