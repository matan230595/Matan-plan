(function(){
  // Config & constants
  const DEFAULTS = { rowHeight:40, hoursStart:6, hoursEnd:22, gridQuantum:0.25, snapThresholdMinutes:0, enableHourlyField:true };
  const STORAGE_KEY = 'panda_planner_v1';
  const DAYS_NAMES = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];

  // State
  const PState = {
    rowHeight: DEFAULTS.rowHeight,
    hoursStart: DEFAULTS.hoursStart,
    hoursEnd: DEFAULTS.hoursEnd,
    gridQuantum: DEFAULTS.gridQuantum,
    snapThresholdMinutes: DEFAULTS.snapThresholdMinutes,
    enableHourlyField: DEFAULTS.enableHourlyField,
    placedBlocks: [],
    templates: [],
    history: [],
    historyIndex: -1,
    currentDate: startOfWeek(new Date())
  };

  // Elements
  const gridRoot = document.getElementById('grid-root');

  // Utilities
  function uid(prefix='b'){ return prefix+'-'+Math.random().toString(36).slice(2,9); }
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  function minutesToDecimal(min){ return min/60; }
  function snapToGrid(decimalHour){ const q=PState.gridQuantum; return Math.round(decimalHour/q)*q; }
  function decimalToTimeString(d){ const hh=Math.floor(d); const mm=Math.round((d-hh)*60); return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`; }
  function startOfWeek(date){ const d=new Date(date); const day=d.getDay(); const diff=(day===0?0:day); d.setDate(d.getDate()-diff); d.setHours(0,0,0,0); return d; }
  function endOfWeek(date){ const s=startOfWeek(date); const e=new Date(s); e.setDate(e.getDate()+6); e.setHours(23,59,59,999); return e; }
  function formatDateISO(d){ return new Date(new Date(d).getTime()-new Date(d).getTimezoneOffset()*60000).toISOString().slice(0,10); }
  function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
  function addWeeks(d,n){ return addDays(d, n*7); }
  function startOfMonth(date){ const d=new Date(date.getFullYear(),date.getMonth(),1); d.setHours(0,0,0,0); return d; }

  // Persistence
  function persistAll(){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        settings:{
          rowHeight:PState.rowHeight,hoursStart:PState.hoursStart,hoursEnd:PState.hoursEnd,gridQuantum:PState.gridQuantum,
          snapThresholdMinutes:PState.snapThresholdMinutes,enableHourlyField:PState.enableHourlyField,currentDate:PState.currentDate.toISOString()
        },
        placedBlocks:PState.placedBlocks,
        templates:PState.templates,
        ts:Date.now()
      }));
    }catch(e){ console.warn('persist error',e); }
  }
  function loadAll(){
    try{
      const raw=localStorage.getItem(STORAGE_KEY); if(!raw) return;
      const obj=JSON.parse(raw); if(!obj) return;
      const s=obj.settings||{};
      Object.assign(PState,{
        rowHeight: typeof s.rowHeight==='number'?s.rowHeight:PState.rowHeight,
        hoursStart: typeof s.hoursStart==='number'?s.hoursStart:PState.hoursStart,
        hoursEnd: typeof s.hoursEnd==='number'?s.hoursEnd:PState.hoursEnd,
        gridQuantum: typeof s.gridQuantum==='number'?s.gridQuantum:PState.gridQuantum,
        snapThresholdMinutes: typeof s.snapThresholdMinutes==='number'?s.snapThresholdMinutes:PState.snapThresholdMinutes,
        enableHourlyField: typeof s.enableHourlyField==='boolean'?s.enableHourlyField:PState.enableHourlyField,
        currentDate: s.currentDate?new Date(s.currentDate):PState.currentDate
      });
      if(Array.isArray(obj.placedBlocks)) PState.placedBlocks=obj.placedBlocks;
      if(Array.isArray(obj.templates)) PState.templates=obj.templates;
    }catch(e){ console.warn('load error',e); }
  }

  // History
  function pushHistorySnapshot(){
    const snap = JSON.stringify(PState.placedBlocks);
    if(PState.historyIndex < PState.history.length-1) PState.history = PState.history.slice(0, PState.historyIndex+1);
    PState.history.push(snap);
    if(PState.history.length>200) PState.history.shift();
    PState.historyIndex = PState.history.length-1;
    updateUndoRedoButtons();
  }
  function undo(){ if(PState.historyIndex<=0) return; PState.historyIndex--; PState.placedBlocks = JSON.parse(PState.history[PState.historyIndex]); persistAll(); renderActiveView(); updateUndoRedoButtons(); }
  function redo(){ if(PState.historyIndex>=PState.history.length-1) return; PState.historyIndex++; PState.placedBlocks = JSON.parse(PState.history[PState.historyIndex]); persistAll(); renderActiveView(); updateUndoRedoButtons(); }
  function updateUndoRedoButtons(){
    const u=document.getElementById('undoBtn'), r=document.getElementById('redoBtn');
    if(u) u.disabled = PState.historyIndex<=0;
    if(r) r.disabled = PState.historyIndex>=PState.history.length-1;
  }

  // Labels
  function updateRangeLabel(){
    const s=startOfWeek(PState.currentDate), e=endOfWeek(PState.currentDate);
    const options = { day:'2-digit', month:'2-digit', year:'numeric' };
    const rl=document.getElementById('currentRange');
    if(rl) rl.textContent = `שבוע: ${s.toLocaleDateString('he-IL',options)} – ${e.toLocaleDateString('he-IL',options)}`;
    const dayTitle=document.getElementById('dayTitle');
    if(dayTitle) dayTitle.textContent = `תצוגה יומית — ${PState.currentDate.toLocaleDateString('he-IL', options)}`;
    const monthTitle=document.getElementById('monthTitle');
    const m=startOfMonth(PState.currentDate);
    if(monthTitle) monthTitle.textContent = `תצוגה חודשית — ${m.toLocaleDateString('he-IL',{month:'long',year:'numeric'})}`;
  }

  // Positioning
  function timeToY(decimalHour){ const headerHeight=40; const offset=decimalHour - PState.hoursStart; return headerHeight + offset * PState.rowHeight; }
  function durationToPx(duration){ return Math.max(Math.round(duration * PState.rowHeight), 6); }
  function dayToLeftPx(day){
    const rows = gridRoot.querySelector('.grid-rows');
    const totalWidth = gridRoot.clientWidth || (rows?rows.clientWidth:900);
    const hoursCol = 70;
    const dayWidth = (totalWidth - hoursCol) / 7;
    const leftPx = hoursCol + day * dayWidth;
    return {left:leftPx, width:dayWidth};
  }

  // Build weekly grid
  function buildWeekGrid(){
    if(!gridRoot){ console.error('grid-root not found'); return; }
    gridRoot.innerHTML='';
    const header=document.createElement('div'); header.className='grid-header';
    const hoursCol=document.createElement('div'); hoursCol.className='cell'; hoursCol.innerText='';
    header.appendChild(hoursCol);
    const s=startOfWeek(PState.currentDate);
    for(let d=0; d<7; d++){
      const date=addDays(s,d);
      const c=document.createElement('div'); c.className='cell';
      c.innerText = `${DAYS_NAMES[d]} ${date.toLocaleDateString('he-IL',{day:'2-digit',month:'2-digit'})}`;
      header.appendChild(c);
    }
    gridRoot.appendChild(header);

    const rowsContainer=document.createElement('div'); rowsContainer.className='grid-rows'; rowsContainer.style.gridTemplateColumns='70px repeat(7,1fr)';
    for(let h=PState.hoursStart; h<PState.hoursEnd; h++){
      const hourCell=document.createElement('div'); hourCell.className='col-hours'; hourCell.style.height=PState.rowHeight+'px'; hourCell.innerText=`${String(h).padStart(2,'0')}:00`;
      rowsContainer.appendChild(hourCell);
      for(let d=0; d<7; d++){
        const date=addDays(s,d);
        const col=document.createElement('div');
        const inner=document.createElement('div'); inner.className='grid-cell'; inner.dataset.dayIndex=String(d); inner.dataset.dateISO=formatDateISO(date); inner.dataset.hour=String(h); inner.style.height=PState.rowHeight+'px';
        col.appendChild(inner); rowsContainer.appendChild(col);
      }
    }
    const abs=document.createElement('div'); abs.id='absolute-layer'; abs.style.top='0'; abs.style.left='0'; abs.style.right='0'; abs.style.pointerEvents='none'; abs.style.position='absolute';
    gridRoot.appendChild(rowsContainer); gridRoot.appendChild(abs);
  }

  // Render weekly blocks
  function renderWeekBlocks(){
    const abs=document.getElementById('absolute-layer'); if(!abs) return; abs.innerHTML='';
    const totalHours=PState.hoursEnd - PState.hoursStart; const headerHeight=40;
    abs.style.height = headerHeight + totalHours * PState.rowHeight + 'px';
    abs.style.pointerEvents='none';
    PState.placedBlocks.forEach(b=>{
      const idx = (new Date(b.date).getDay()) - (startOfWeek(PState.currentDate).getDay());
      const targetDate = new Date(b.date);
      const sWeek = startOfWeek(PState.currentDate);
      const diffDays = Math.floor((targetDate - sWeek)/86400000);
      if(diffDays<0 || diffDays>6) return;

      const el=document.createElement('div'); el.className='panda-placed-block'; el.draggable=true; el.dataset.id=b.id; el.style.pointerEvents='auto';
      const earning=(b.income && b.rate)?(b.rate*b.duration):0;
      const rightHtml=`<div style="font-size:12px;opacity:0.9">${decimalToTimeString(b.startHour)} - ${decimalToTimeString(b.startHour+b.duration)}</div>`;
      const moneyHtml = earning ? `<div style="font-size:12px;opacity:0.95">${earning.toFixed(2)}₪</div>` : '';
      el.innerHTML = `<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${b.name}</div>${moneyHtml}${rightHtml}`;

      const top=timeToY(b.startHour); const h=durationToPx(b.duration);
      el.style.top = top + 'px'; el.style.height=(h-6)+'px';

      const pos=dayToLeftPx(diffDays);
      const leftPct=(pos.left/(gridRoot.clientWidth||pos.left+pos.width))*100;
      const widthPct=(pos.width/(gridRoot.clientWidth||pos.left+pos.width))*100;
      el.style.left=`calc(${leftPct}% + 8px)`; el.style.width=`calc(${widthPct}% - 16px)`;

      attachPlacedBlockHandlers(el);
      abs.appendChild(el);
    });
    updateWeeklySummary();
  }

  // Collision
  function hasCollision(candidate, ignoreId){
    if(candidate.startHour < PState.hoursStart || candidate.startHour + candidate.duration > PState.hoursEnd) return true;
    for(const b of PState.placedBlocks){
      if(ignoreId && b.id===ignoreId) continue;
      if(formatDateISO(b.date) !== formatDateISO(candidate.date)) continue;
      const a1=b.startHour, a2=b.startHour+b.duration, c1=candidate.startHour, c2=candidate.startHour+candidate.duration;
      if(Math.min(a2,c2) > Math.max(a1,c1)) return true;
    }
    return false;
  }
  function applySnapToNeighbors(candidate, ignoreId){
    const thresholdMin=PState.snapThresholdMinutes;
    if(!thresholdMin || thresholdMin<=0) return candidate;
    const thresholdHours=minutesToDecimal(thresholdMin);
    for(const b of PState.placedBlocks){
      if(ignoreId && b.id===ignoreId) continue;
      if(formatDateISO(b.date) !== formatDateISO(candidate.date)) continue;
      const aboveEnd=b.startHour+b.duration;
      const delta=Math.abs(candidate.startHour - aboveEnd);
      if(delta<=thresholdHours){ const snapped=Object.assign({},candidate,{startHour:aboveEnd}); if(!hasCollision(snapped,ignoreId)) return snapped; }
      const candidateEnd=candidate.startHour+candidate.duration;
      const delta2=Math.abs(candidateEnd - b.startHour);
      if(delta2<=thresholdHours){ const newStart=b.startHour - candidate.duration; const snapped=Object.assign({},candidate,{startHour:newStart}); if(!hasCollision(snapped,ignoreId)) return snapped; }
    }
    return candidate;
  }

  // DnD preview
  let dragContext=null, previewEl=null;
  function createPreview(){ if(previewEl) return; previewEl=document.createElement('div'); previewEl.className='panda-preview'; previewEl.style.pointerEvents='none'; document.getElementById('view-container').appendChild(previewEl); }
  function removePreview(){ if(previewEl){ previewEl.remove(); previewEl=null; } }
  function showPreview(candidate){
    createPreview();
    const y=timeToY(candidate.startHour);
    previewEl.style.top=y+'px';
    previewEl.style.height=(durationToPx(candidate.duration)-6)+'px';
    const pos=dayToLeftPx(candidate.dayIndex); const leftPct=(pos.left/(gridRoot.clientWidth||pos.left+pos.width))*100; const widthPct=(pos.width/(gridRoot.clientWidth||pos.left+pos.width))*100;
    previewEl.style.left=`calc(${leftPct}% + 8px)`; previewEl.style.width=`calc(${widthPct}% - 16px)`;
  }

  function attachGridHandlers(){
    const cells = gridRoot.querySelectorAll('.grid-cell');
    cells.forEach(c=>{ const clone=c.cloneNode(true); c.parentNode.replaceChild(clone,c); });
    const newCells=gridRoot.querySelectorAll('.grid-cell');
    newCells.forEach(cell=>{
      cell.addEventListener('dragover', onGridDragOver);
      cell.addEventListener('dragleave', onGridDragLeave);
      cell.addEventListener('drop', onGridDrop);
      cell.addEventListener('click', onGridClick);
    });
  }
  function onGridDragOver(ev){
    ev.preventDefault();
    const cell=ev.currentTarget; cell.classList.add('drop-target');
    const rect=cell.getBoundingClientRect(); const relY=ev.clientY - rect.top;
    const baseHour=parseInt(cell.dataset.hour,10);
    const decimal = baseHour + (relY / rect.height);
    let snapped=snapToGrid(decimal);
    let duration=1, name='אירוע', type='general';
    if(dragContext && dragContext.type==='tpl'){ duration=dragContext.template.duration; name=dragContext.template.name; type=dragContext.template.type||'general'; }
    const candidate={ dayIndex:parseInt(cell.dataset.dayIndex,10), date:new Date(cell.dataset.dateISO), startHour:snapped, duration, type };
    const snappedCandidate=applySnapToNeighbors(candidate, dragContext && dragContext.blockId ? dragContext.blockId : null);
    showPreview(snappedCandidate);
  }
  function onGridDragLeave(ev){ ev.preventDefault(); ev.currentTarget.classList.remove('drop-target'); removePreview(); }
  function onGridDrop(ev){
    ev.preventDefault();
    const cell=ev.currentTarget; cell.classList.remove('drop-target');
    const rect=cell.getBoundingClientRect(); const relY=ev.clientY - rect.top;
    const baseHour=parseInt(cell.dataset.hour,10);
    const decimal = baseHour + (relY / rect.height);
    let snapped=snapToGrid(decimal);
    let duration=1, name='אירוע', type='general';
    if(dragContext && dragContext.type==='tpl'){ duration=dragContext.template.duration; name=dragContext.template.name; type=dragContext.template.type||'general'; }
    let candidate={ date:new Date(cell.dataset.dateISO), startHour:snapped, duration, type };
    candidate=applySnapToNeighbors(candidate, dragContext && dragContext.blockId ? dragContext.blockId : null);
    if(hasCollision(candidate)){ alert('התנגשות או מחוץ לשעות.'); removePreview(); dragContext=null; return; }
    if(dragContext && dragContext.type==='placed'){ updateBlock(dragContext.blockId, { date:candidate.date.toISOString(), startHour:candidate.startHour }); }
    else { addBlock({ id:uid(), name, date:candidate.date.toISOString(), startHour:candidate.startHour, duration:candidate.duration, type, income:false, rate:0, notes:'' }); }
    removePreview(); dragContext=null;
  }
  function onGridClick(ev){
    const cell=ev.currentTarget;
    const rect=cell.getBoundingClientRect(); const relY=ev.clientY - rect.top;
    const baseHour=parseInt(cell.dataset.hour,10);
    const decimal = baseHour + (relY / rect.height);
    const snapped=snapToGrid(decimal);
    const candidate={ date:new Date(cell.dataset.dateISO), startHour:snapped, duration:1 };
    if(hasCollision(candidate)){ alert('התנגשות או מחוץ לשעות.'); return; }
    addBlock({ id:uid(), name:'אירוע חדש', date:candidate.date.toISOString(), startHour:snapped, duration:1, income:false, rate:0, notes:'', type:'general' });
  }

  function attachPlacedBlockHandlers(el){
    el.addEventListener('dragstart',(ev)=>{ dragContext={type:'placed', blockId:el.dataset.id}; try{ ev.dataTransfer.setData('text/plain', el.dataset.id); }catch(e){} createPreview(); });
    el.addEventListener('dragend', ()=>{ removePreview(); dragContext=null; });
    el.addEventListener('dblclick', ()=>{ openEdit(el.dataset.id); });
  }

  // CRUD
  function addBlock(b){ PState.placedBlocks.push(b); pushHistorySnapshot(); persistAll(); renderActiveView(); }
  function updateBlock(id, vals){ const i=PState.placedBlocks.findIndex(x=>x.id===id); if(i===-1) return; PState.placedBlocks[i] = Object.assign({}, PState.placedBlocks[i], vals); pushHistorySnapshot(); persistAll(); renderActiveView(); }
  function removeBlock(id){ const i=PState.placedBlocks.findIndex(x=>x.id===id); if(i===-1) return; PState.placedBlocks.splice(i,1); pushHistorySnapshot(); persistAll(); renderActiveView(); }

  // Summary
  function updateWeeklySummary(){
    const s=startOfWeek(PState.currentDate);
    const cardsRoot=document.getElementById('summaryCards'); if(cardsRoot) cardsRoot.innerHTML='';
    let totalHours=0, totalIncome=0;
    for(let i=0;i<7;i++){
      const day=addDays(s,i);
      let hours=0, income=0;
      PState.placedBlocks.filter(b=>formatDateISO(b.date)===formatDateISO(day)).forEach(b=>{
        hours += Number(b.duration||0);
        if(b.income && b.rate) income += (b.rate*b.duration);
      });
      totalHours += hours; totalIncome += income;
      if(cardsRoot){
        const card=document.createElement('div'); card.className='summary-card';
        card.innerHTML = `<div style="font-weight:800">${DAYS_NAMES[i]} ${day.toLocaleDateString('he-IL',{day:'2-digit',month:'2-digit'})}</div><div>שעות: <strong>${hours.toFixed(2)}</strong></div><div>הכנסה: <strong>${income.toFixed(2)} ₪</strong></div>`;
        cardsRoot.appendChild(card);
      }
    }
    const avgRate = (totalIncome>0 && totalHours>0) ? (totalIncome/totalHours) : 0;
    const th=document.getElementById('total-hours'), ti=document.getElementById('total-income'), ar=document.getElementById('avg-rate');
    if(th) th.innerText=totalHours.toFixed(2);
    if(ti) ti.innerText=totalIncome.toFixed(2)+' ₪';
    if(ar) ar.innerText=avgRate.toFixed(2)+' ₪/שעה';
  }

  // Tabs
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('.tab');
    if(!btn) return;
    e.preventDefault();
    document.querySelectorAll('.tab').forEach(x=> x.classList.remove('active'));
    btn.classList.add('active');
    setActiveView(btn.dataset.view || 'week');
  });

  // Views
  function setActiveView(v){
    const w=document.getElementById('week-view');
    const d=document.getElementById('day-view');
    const m=document.getElementById('month-view');
    if(w) w.classList.toggle('hidden', v!=='week');
    if(d) d.classList.toggle('hidden', v!=='day');
    if(m) m.classList.toggle('hidden', v!=='month');
    renderActiveView();
  }
  function renderActiveView(){
    updateRangeLabel();
    const activeTab = document.querySelector('.tab.active');
    const active = activeTab ? activeTab.dataset.view : 'week';
    if(active==='week'){ buildWeekGrid(); attachGridHandlers(); renderWeekBlocks(); }
    else if(active==='day'){ renderDayView(); }
    else { renderMonthView(); }
  }

  // Day view
  function renderDayView(){
    const dayHours=document.getElementById('dayHours'); if(dayHours){ dayHours.innerHTML='';
      for(let h=PState.hoursStart; h<PState.hoursEnd; h++){
        const el=document.createElement('div'); el.className='day-hour'; el.style.height=PState.rowHeight+'px'; el.textContent=`${String(h).padStart(2,'0')}:00`; dayHours.appendChild(el);
      }
    }
    const canvas=document.getElementById('dayCanvas'); if(!canvas) return;
    canvas.innerHTML='';
    const totalHeight = (PState.hoursEnd - PState.hoursStart) * PState.rowHeight;
    canvas.style.minHeight = totalHeight+'px';
    const today=PState.currentDate;
    PState.placedBlocks.filter(b=>formatDateISO(b.date)===formatDateISO(today)).forEach(b=>{
      const el=document.createElement('div'); el.className='panda-placed-block'; el.draggable=true; el.dataset.id=b.id; el.style.pointerEvents='auto';
      const earning=(b.income && b.rate)?(b.rate*b.duration):0;
      const rightHtml = `<div style="font-size:12px;opacity:0.9">${decimalToTimeString(b.startHour)} - ${decimalToTimeString(b.startHour + b.duration)}</div>`;
      const moneyHtml = earning ? `<div style="font-size:12px;opacity:0.95">${earning.toFixed(2)}₪</div>` : '';
      el.innerHTML = `<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${b.name}</div>${moneyHtml}${rightHtml}`;
      const top = (b.startHour - PState.hoursStart) * PState.rowHeight;
      const h = durationToPx(b.duration);
      el.style.top = top + 'px'; el.style.height = (h - 6) + 'px'; el.style.left='8px'; el.style.right='8px'; el.style.width='calc(100% - 16px)'; el.style.position='absolute';
      attachPlacedBlockHandlers(el);
      canvas.appendChild(el);
    });
  }

  // Month view
  function renderMonthView(){
    const grid=document.getElementById('monthGrid'); if(!grid) return; grid.innerHTML='';
    const m=startOfMonth(PState.currentDate);
    const startWeekSunday=startOfWeek(m);
    for(let i=0;i<42;i++){
      const date=addDays(startWeekSunday,i);
      const cell=document.createElement('div'); cell.className='month-day';
      const inMonth=(date.getMonth()===PState.currentDate.getMonth());
      cell.style.opacity=inMonth?'1':'0.55';
      const dateEl=document.createElement('div'); dateEl.className='date';
      dateEl.textContent=`${DAYS_NAMES[date.getDay()]} ${date.toLocaleDateString('he-IL',{day:'2-digit',month:'2-digit'})}`;
      cell.appendChild(dateEl);
      PState.placedBlocks.filter(b=>formatDateISO(b.date)===formatDateISO(date)).slice(0,4).forEach(b=>{
        const ev=document.createElement('div'); ev.className='month-event'; const earn=(b.income && b.rate)?(b.rate*b.duration):0;
        ev.textContent = `${decimalToTimeString(b.startHour)} ${b.name}${earn?` • ${earn.toFixed(0)}₪`:''}`;
        cell.appendChild(ev);
      });
      grid.appendChild(cell);
    }
  }

  // Navigation
  document.getElementById('prevRange')?.addEventListener('click', ()=>{
    const active=document.querySelector('.tab.active')?.dataset.view || 'week';
    if(active==='week'){ PState.currentDate = addWeeks(PState.currentDate,-1); }
    else if(active==='day'){ PState.currentDate = addDays(PState.currentDate,-1); }
    else { const d=new Date(PState.currentDate); d.setMonth(d.getMonth()-1); PState.currentDate=d; }
    persistAll(); renderActiveView();
  });
  document.getElementById('nextRange')?.addEventListener('click', ()=>{
    const active=document.querySelector('.tab.active')?.dataset.view || 'week';
    if(active==='week'){ PState.currentDate = addWeeks(PState.currentDate,+1); }
    else if(active==='day'){ PState.currentDate = addDays(PState.currentDate,+1); }
    else { const d=new Date(PState.currentDate); d.setMonth(d.getMonth()+1); PState.currentDate=d; }
    persistAll(); renderActiveView();
  });
  document.getElementById('goToday')?.addEventListener('click', ()=>{ PState.currentDate=new Date(); persistAll(); renderActiveView(); });
  document.getElementById('goThisWeek')?.addEventListener('click', ()=>{ PState.currentDate=startOfWeek(new Date()); persistAll(); renderActiveView(); });

  // Sidebar toggle
  const sidebar=document.getElementById('sidebar');
  document.getElementById('menuToggle')?.addEventListener('click', ()=> sidebar?.classList.add('open'));
  document.getElementById('sidebarClose')?.addEventListener('click', ()=> sidebar?.classList.remove('open'));

  // Dark mode
  document.getElementById('darkModeToggle')?.addEventListener('click', ()=>{ document.body.classList.toggle('dark'); });

  // Zoom quick
  const zoomRange=document.getElementById('zoomRange'), zoomLabel=document.getElementById('zoomLabel'), zoomReset=document.getElementById('zoomReset');
  function applyRowHeight(){ document.documentElement.style.setProperty('--row-height', PState.rowHeight+'px'); }
  if(zoomRange && zoomLabel){
    zoomRange.value=PState.rowHeight; zoomLabel.textContent=PState.rowHeight;
    zoomRange.addEventListener('input',(e)=>{ const v=parseInt(e.target.value,10); PState.rowHeight=v; applyRowHeight(); persistAll(); renderActiveView(); zoomLabel.textContent=v; });
  }
  zoomReset?.addEventListener('click',()=>{ PState.rowHeight=DEFAULTS.rowHeight; applyRowHeight(); persistAll(); renderActiveView(); zoomLabel && (zoomLabel.textContent=PState.rowHeight); });

  // Templates & chips
  function renderTemplates(){
    const tplRoot=document.getElementById('templatesList'); if(!tplRoot) return; tplRoot.innerHTML='';
    const defaults = [
      {name:'פגישה 30 דק', duration:0.5, type:'business'},
      {name:'מפגש 1 ש', duration:1, type:'business'},
      {name:'למידה 2 ש', duration:2, type:'study'}
    ];
    const combined=[...defaults, ...PState.templates];
    combined.forEach(t=>{
      const el=document.createElement('div'); el.className='tpl'; el.draggable=true; el.dataset.duration=String(t.duration); el.dataset.name=t.name; el.dataset.type=t.type||'general'; el.innerText=t.name;
      el.addEventListener('dragstart',(ev)=>{ dragContext={type:'tpl', template:{name:t.name,duration:t.duration,type:t.type||'general'}}; try{ ev.dataTransfer.setData('text/plain', JSON.stringify(dragContext.template)); }catch(e){} createPreview(); });
      el.addEventListener('dragend', ()=>{ removePreview(); dragContext=null; });
      tplRoot.appendChild(el);
    });

    document.querySelectorAll('.chip').forEach(ch=>{
      ch.addEventListener('click', ()=>{
        const map={ work:{name:'שעות עבודה',duration:8,type:'business',income:true,rate:50}, sleep:{name:'שעות שינה',duration:8,type:'personal'}, family:{name:'זמן משפחה',duration:2,type:'personal'}, free:{name:'זמן פנאי',duration:1.5,type:'personal'}, study:{name:'למידה',duration:2,type:'study'} };
        const meta = map[ch.dataset.type] || {name:'אירוע',duration:1,type:'general'};
        const dateISO = formatDateISO(PState.currentDate);
        const start = PState.hoursStart + 1;
        const candidate = { date:new Date(dateISO), startHour:start, duration:meta.duration };
        if(hasCollision(candidate)){ alert('התנגשות ביום הנוכחי.'); return; }
        addBlock({ id:uid(), name:meta.name, date:new Date(dateISO).toISOString(), startHour:start, duration:meta.duration, type:meta.type, income: !!meta.income, rate: meta.rate || 0, notes:'' });
      });
    });
  }

  // Create modal
  const createBackdrop=document.getElementById('create-backdrop'), createModal=document.getElementById('create-modal'), openCreateBtn=document.getElementById('openCreateBtn'), fab=document.getElementById('fab');
  const durBtns = Array.from(document.querySelectorAll('#durBtns .dur-btn'));
  const cb = { name:document.getElementById('cb-name'), type:document.getElementById('cb-type'), date:document.getElementById('cb-date'), start:document.getElementById('cb-start'), income:document.getElementById('cb-income'), rate:document.getElementById('cb-rate'), notes:document.getElementById('cb-notes'), preview:document.getElementById('cb-earning-preview') };
  let selectedDuration = 1;
  function openCreate(){ if(!createBackdrop||!createModal) return; cb.name.value=''; cb.type.value='business'; cb.date.value=formatDateISO(PState.currentDate); cb.start.value=String(PState.hoursStart); cb.income.checked=false; cb.rate.value=''; cb.notes.value=''; cb.preview.innerText=''; selectedDuration=1; updateDurBtns(); createBackdrop.style.display='block'; createModal.style.display='block'; const rateRow=document.getElementById('cb-rate-row'); rateRow && (rateRow.style.display = PState.enableHourlyField ? 'block' : 'none'); }
  function closeCreate(){ if(!createBackdrop||!createModal) return; createBackdrop.style.display='none'; createModal.style.display='none'; }
  openCreateBtn?.addEventListener('click', openCreate);
  fab?.addEventListener('click', openCreate);
  createBackdrop?.addEventListener('click', closeCreate);
  durBtns.forEach(btn=> btn.addEventListener('click', ()=>{ selectedDuration=parseFloat(btn.dataset.duration); updateDurBtns(); updateCreateEarningPreview(); }));
  function updateDurBtns(){ durBtns.forEach(b=>b.classList.toggle('active', parseFloat(b.dataset.duration)===selectedDuration)); }
  function updateCreateEarningPreview(){ if(cb.income.checked && cb.rate.value){ const earning=(parseFloat(cb.rate.value)*selectedDuration).toFixed(2); cb.preview.innerText=`הכנסה משוערת: ${earning} ₪`; } else cb.preview.innerText=''; }
  cb.income?.addEventListener('change', ()=>{ const rateRow=document.getElementById('cb-rate-row'); rateRow && (rateRow.style.display = (PState.enableHourlyField && cb.income.checked) ? 'block' : 'none'); updateCreateEarningPreview(); });
  cb.rate?.addEventListener('input', updateCreateEarningPreview);
  document.getElementById('createBlockBtn')?.addEventListener('click', ()=>{
    const name=cb.name.value||'אירוע חדש';
    const date=cb.date.value ? new Date(cb.date.value) : PState.currentDate;
    const start=snapToGrid(parseFloat(cb.start.value)||PState.hoursStart);
    const duration=selectedDuration;
    const income=cb.income.checked;
    const rate=income ? (parseFloat(cb.rate.value)||0) : 0;
    const notes=cb.notes.value||'';
    const type=cb.type.value||'general';
    const candidate={ date, startHour:start, duration };
    if(hasCollision(candidate)){ alert('התנגשות או מחוץ לשעות.'); return; }
    addBlock({ id:uid(), name, date:date.toISOString(), startHour:start, duration, income, rate, notes, type });
    closeCreate();
  });

  // Edit modal
  const editBackdrop=document.getElementById('edit-backdrop'), editModal=document.getElementById('edit-modal');
  const ei = { name:document.getElementById('edit-name'), date:document.getElementById('edit-date'), start:document.getElementById('edit-start'), duration:document.getElementById('edit-duration'), income:document.getElementById('edit-income'), rate:document.getElementById('edit-rate'), type:document.getElementById('edit-type'), notes:document.getElementById('edit-notes') };
  let editingId=null;
  function openEdit(id){
    const b=PState.placedBlocks.find(x=>x.id===id); if(!b) return;
    editingId=id; if(!editBackdrop||!editModal) return; editBackdrop.style.display='block'; editModal.style.display='block';
    ei.name.value=b.name||''; ei.date.value=formatDateISO(new Date(b.date)); ei.start.value=String(b.startHour); ei.duration.value=String(b.duration); ei.income.checked=!!b.income; ei.rate.value=b.rate||''; ei.type.value=b.type||'general'; ei.notes.value=b.notes||'';
    const erow=document.getElementById('edit-rate-row'); erow && (erow.style.display = (PState.enableHourlyField && ei.income.checked) ? 'block' : 'none');
  }
  function closeEdit(){ editingId=null; if(!editBackdrop||!editModal) return; editBackdrop.style.display='none'; editModal.style.display='none'; }
  editBackdrop?.addEventListener('click', closeEdit);
  document.getElementById('edit-cancel')?.addEventListener('click', closeEdit);
  document.getElementById('edit-delete')?.addEventListener('click', ()=>{ if(!editingId) return; if(!confirm('למחוק את הבלוק?')) return; removeBlock(editingId); closeEdit(); });
  ei.income?.addEventListener('change', ()=>{ const erow=document.getElementById('edit-rate-row'); erow && (erow.style.display = (PState.enableHourlyField && ei.income.checked) ? 'block' : 'none'); });
  document.getElementById('edit-save')?.addEventListener('click', ()=>{
    if(!editingId) return;
    const date = ei.date.value ? new Date(ei.date.value) : PState.currentDate;
    const newVals = { name: ei.name.value||'אירוע', date: date.toISOString(), startHour: snapToGrid(parseFloat(ei.start.value)||PState.hoursStart), duration: Math.max(PState.gridQuantum, parseFloat(ei.duration.value)||PState.gridQuantum), income: !!ei.income.checked, rate: parseFloat(ei.rate.value)||0, type: ei.type.value||'general', notes: ei.notes.value||'' };
    if(newVals.startHour < PState.hoursStart || newVals.startHour + newVals.duration > PState.hoursEnd){ alert('שעת התחלה/משך מחוץ לגבולות.'); return; }
    if(hasCollision({ date, startHour:newVals.startHour, duration:newVals.duration }, editingId)){ alert('התנגשות עם בלוק קיים.'); return; }
    updateBlock(editingId, newVals); closeEdit();
  });

  // Export / Import
  function esc(t){ return `"${String(t).replace(/"/g,'""')}"`; }
  function triggerDownload(url, name){ const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
  function sanitizeICS(t){ return String(t).replace(/\n/g,'\\n').replace(/,/g,'\\,'); }

  document.getElementById('exportJsonBtn')?.addEventListener('click', ()=>{
    const payload={meta:{exportedAt:new Date().toISOString()}, blocks:PState.placedBlocks};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    triggerDownload(URL.createObjectURL(blob),'panda_planner.json');
  });

  document.getElementById('exportCsvBtn')?.addEventListener('click', ()=>{
    const header=['id','name','date','startHour','duration','start','end','income','rate','notes','type'];
    const rows=PState.placedBlocks.map(b=>{
      const s=decimalToTimeString(b.startHour); const e=decimalToTimeString(b.startHour+b.duration);
      return [b.id,esc(b.name),formatDateISO(new Date(b.date)),b.startHour,b.duration,s,e,b.income?1:0,b.rate||0,esc(b.notes||''),b.type||''].join(',');
    });
    const csv=[header.join(','),...rows].join('\n');
    const blob=new Blob([csv],{type:'text/csv'});
    triggerDownload(URL.createObjectURL(blob),'panda_planner.csv');
  });

  document.getElementById('exportIcsBtn')?.addEventListener('click', ()=>{
    function formatDateICS(d){ const YYYY=d.getUTCFullYear(); const MM=String(d.getUTCMonth()+1).padStart(2,'0'); const DD=String(d.getUTCDate()).padStart(2,'0'); const hh=String(d.getUTCHours()).padStart(2,'0'); const mm=String(d.getUTCMinutes()).padStart(2,'0'); const ss=String(d.getUTCSeconds()).padStart(2,'0'); return `${YYYY}${MM}${DD}T${hh}${mm}${ss}Z`; }
    let ics='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//PandaPlanner//EN\r\n'; const now=new Date();
    PState.placedBlocks.forEach(b=>{
      const date=new Date(b.date);
      const startH=Math.floor(b.startHour); const startM=Math.round((b.startHour-startH)*60);
      const endDecimal=b.startHour+b.duration; const endH=Math.floor(endDecimal); const endM=Math.round((endDecimal-endH)*60);
      const startDT=new Date(date.getFullYear(),date.getMonth(),date.getDate(),startH,startM);
      const endDT=new Date(date.getFullYear(),date.getMonth(),date.getDate(),endH,endM);
      ics+='BEGIN:VEVENT\r\n';
      ics+=`UID:${b.id}@panda\r\n`;
      ics+=`DTSTAMP:${formatDateICS(now)}\r\n`;
      ics+=`DTSTART:${formatDateICS(startDT)}\r\n`;
      ics+=`DTEND:${formatDateICS(endDT)}\r\n`;
      ics+=`SUMMARY:${sanitizeICS(b.name)}\r\n`;
      ics+=`DESCRIPTION:${sanitizeICS(b.notes||'')}\r\n`;
      ics+='END:VEVENT\r\n';
    });
    ics+='END:VCALENDAR';
    const blob=new Blob([ics],{type:'text/calendar'});
    triggerDownload(URL.createObjectURL(blob),'panda_planner.ics');
  });

  // Import JSON
  const importFileInput = document.getElementById('importFileInput');
  document.getElementById('importJsonBtn')?.addEventListener('click', ()=> importFileInput?.click());
  importFileInput?.addEventListener('change', (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (ev)=>{
      try {
        const obj = JSON.parse(ev.target.result);
        if(Array.isArray(obj.blocks)) {
          PState.placedBlocks = obj.blocks;
          pushHistorySnapshot(); persistAll(); renderActiveView();
          alert('JSON נטען בהצלחה');
        } else {
          alert('מבנה JSON לא תקין: מצופה "blocks"');
        }
      } catch(err) { alert('שגיאה בקריאת JSON'); }
    };
    reader.readAsText(file);
    e.target.value='';
  });

  // Keyboard undo/redo
  document.getElementById('undoBtn')?.addEventListener('click', undo);
  document.getElementById('redoBtn')?.addEventListener('click', redo);
  document.addEventListener('keydown',(e)=>{ if(e.ctrlKey && e.key.toLowerCase()==='z'){ e.preventDefault(); undo(); } if(e.ctrlKey && e.key.toLowerCase()==='y'){ e.preventDefault(); redo(); } });

  // Init
  function integrate(){
    loadAll();
    document.documentElement.style.setProperty('--row-height', PState.rowHeight+'px');
    renderTemplates();
    setActiveView('week'); // ensure grid builds
    if(!PState.history.length) pushHistorySnapshot();
  }
  integrate();
})();
