'use strict';
(() => {
  const types=new Set(['all','EX','RS','FU','RW','VW','BW','AQ']);
  let state={mode:'all',sensorType:'all'};
  const listeners=new Set();
  function matches(kind,roleCode){
    if(kind==='sensor')return state.mode!=='hotspots'&&(state.sensorType==='all'||state.sensorType===roleCode);
    if(kind==='hotspot')return state.mode!=='sensors';
    return state.mode==='all';
  }
  function syncControls(){
    document.querySelectorAll('[data-point-view]').forEach(button=>{
      const active=button.dataset.pointView===state.mode;
      button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
    });
    document.querySelectorAll('[data-sensor-type]').forEach(select=>{select.value=state.sensorType;});
  }
  function set(mode,sensorType='all'){
    if(!['all','sensors','hotspots'].includes(mode)||!types.has(sensorType))return;
    if(mode!=='sensors')sensorType='all';
    state={mode,sensorType};syncControls();
    listeners.forEach(callback=>callback({...state}));
  }
  function bindControls(){
    document.querySelectorAll('[data-point-view]').forEach(button=>button.addEventListener('click',()=>set(button.dataset.pointView)));
    document.querySelectorAll('[data-sensor-type]').forEach(select=>select.addEventListener('change',()=>set('sensors',select.value)));
    syncControls();
  }
  window.ForestWatchPointFilters={get:()=>({...state}),matches,set,subscribe:callback=>{listeners.add(callback);return ()=>listeners.delete(callback);},bindControls};
  bindControls();
})();
