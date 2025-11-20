(function(){
  'use strict';

  // Config
  const DEFAULTS = { rowHeight:40, hoursStart:6, hoursEnd:22, gridQuantum:0.25 };
  const STORAGE_KEY = 'panda_planner_v2';
  const DAYS_NAMES = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];

  // State
  const PState = {
    rowHeight: DEFAULTS.rowHeight,
    hoursStart: DEFAULTS.hoursStart,
    hoursEnd: DEFAULTS.hoursEnd,
    gridQuantum: DEFAULTS.gridQuantum,
    placedBlocks: [],
    templates: [],
    history: [],
    historyIndex: -1,
    currentDate: startOfWeek(new Date())
  };

  // Elements
  const gridRoot = document.getElementById('grid-root');

  // Utilities
  function uid(p='b'){ return p + '-' + Math.random().toString(36).slice(2,9); }
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  function snapToGrid(h){ const q=PState.gridQuantum; return Math.round(h/q)*q; }
  function decimalToTimeString(d){ const hh=Math.floor(d); const mm=Math.round((d-hh)*60); return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`; }
  function startOfWeek(date){ const d=new Date(date); const day=d.getDay(); const diff=(day===0?0:day); d.setDate(d.getDate()-diff); d.setHours(0,0,0,0); return d; }
  function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
  function addWeeks(d,n){ return addDays(d,n*7); }
  function formatDateISO(d){ const dt=new Date(d); dt.setHours(0,0,0,0); return dt.toISOString().slice(0,10); }

  // Persistence
  function persistAll(){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings:{rowHeight:PState.rowHeight,currentDate:PState.currentDate.toISOString()}, placedBlocks:PState.placedBlocks, templates:PState.templates })); }catch(e){ console.warn(e); } }
  function loadAll(){ try{ const raw=localStorage.getItem(STORAGE_KEY); if(!raw) return; const obj=JSON.parse(raw); if(obj.settings){ if(typeof obj.settings.rowHeight==='number') PState.rowHeight=obj.settings.rowHeight; if(obj.settings.currentDate) PState.currentDate=new Date(obj.settings.currentDate); } if(Array.isArray(obj.placedBlocks)) PState.placedBlocks=obj.placedBlocks; if(Array.isArray(obj.templates)) PState.templates=obj.templates; }catch(e){ console.warn(e); } }

  // History
  function pushHistory(){ const snap=JSON.stringify(PState.placedBlocks); if(PState.historyIndex < PState.history.length-1) PState.history = PState.history.slice(0, PState.historyIndex+1); PState.history.push(snap); if(PState.history.length>200) PState.history.shift(); PState.historyIndex = PState.history.length-1; updateUndoRedoButtons(); }
  function undo(){ if(PState.historyIndex<=0) return; PState.historyIndex--; PState.placedBlocks = JSON.parse(PState.history[PState.historyIndex]); persistAll(); renderActiveView(); updateUndoRedoButtons(); }
  function redo(){ if(PState.historyIndex>=PState.history.length-1) return; PState.historyIndex++; PState.placedBlocks = JSON.parse(PState.history[PState.historyIndex]); persistAll(); renderActiveView(); updateUndoRedoButtons(); }
  function updateUndoRedoButtons(){ const u=document.getElementById('undoBtn'), r=document.getElementById('redoBtn'); if(u) u.disabled = PState.historyIndex<=0; if(r) r.disabled = PState.historyIndex>=PState.history.length-1; }

  // Build grid
  function buildWeekGrid(){
    if(!gridRoot){ console.error('grid-root missing'); return; }
    gridRoot.innerHTML = '';
    const header = document.createElement('div'); header.className='grid-header';
    const hoursCol = document.createElement('div'); hoursCol.className='cell'; hoursCol.innerText='';
    header.appendChild(hoursCol);
    const s = startOfWeek(PState.currentDate);
    for(let d=0; d<7; d++){
      const date = addDays(s,d);
      const c = document.createElement('div'); c.className='cell'; c.innerText = `${DAYS_NAMES[d]} ${date.toLocaleDateString('he-IL',{day:'2-digit',month:'2-digit'})}`; header.appendChild(c);
    }
    gridRoot.appendChild(header);

    const rowsContainer = document.createElement('div'); rowsContainer.className='grid-rows'; rowsContainer.style.gridTemplateColumns='70px repeat(7,1fr)';
    for(let h=PState.hoursStart; h<PState.hoursEnd; h++){
      const hourCell = document.createElement('div'); hourCell.className='col-hours'; hourCell.style.height = PState.rowHeight+'px'; hourCell.innerText = `${String(h).padStart(2,'0')}:00`; rowsContainer.appendChild(hourCell);
      for(let d=0; d<7; d++){
        const date = addDays(s,d);
        const col = document.createElement('div');
        const inner = document.createElement('div'); inner.className='grid-cell'; inner.dataset.dayIndex = String(d); inner.dataset.dateISO = formatDateISO(date); inner.dataset.hour = String(h); inner.style.height = PState.rowHeight+'px';
        col.appendChild(inner); rowsContainer.appendChild(col);
      }
    }
    const abs = document.createElement('div'); abs.id='absolute-layer'; abs.style.position='absolute'; abs.style.top='0'; abs.style.left='0'; abs.style.right='0'; abs.style.pointerEvents='none';
    gridRoot.appendChild(rowsContainer); gridRoot.appendChild(abs);
  }

  // Render blocks
  function renderWeekBlocks(){
    const abs = document.getElementById('absolute-layer'); if(!abs) return; abs.innerHTML='';
    const headerHeight = 40; const totalHours = PState.hoursEnd - PState.hoursStart;
    abs.style.height = (headerHeight + totalHours * PState.rowHeight) + 'px';
    PState.placedBlocks.forEach(b=>{
      const date = new Date(b.date); const sWeek = startOfWeek(PState.currentDate);
      const diff = Math.round((date - sWeek)/86400000);
      if(diff < 0 || diff > 6) return;
      const el = document.createElement('div'); el.className='panda-placed-block'; el.draggable=true; el.dataset.id = b.id;
      const earn = (b.income && b.rate) ? (b.rate * b.duration) : 0;
      const rightHtml = `<div style="font-size:12px;opacity:0.9">${decimalToTimeString(b.startHour)} - ${decimalToTimeString(b.startHour + b.duration)}</div>`;
      const moneyHtml = earn ? `<div style="font-size:12px;opacity:0.95">${earn.toFixed(2)}₪</div>` : '';
      el.innerHTML = `<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${b.name}</div>${moneyHtml}${rightHtml}`;
      const top = headerHeight + (b.startHour - PState.hoursStart) * PState.rowHeight;
      const h = Math.max(6, Math.round(b.duration * PState.rowHeight));
      el.style.top = top + 'px'; el.style.height = (h - 6) + 'px';
      const pos = dayToLeftPx(diff);
      const leftPct = (pos.left / (gridRoot.clientWidth || (pos.left + pos.width))) * 100;
      const widthPct = (pos.width / (gridRoot.clientWidth || (pos.left + pos.width))) * 100;
      el.style.left = `calc(${leftPct}% + 8px)`; el.style.width = `calc(${widthPct}% - 16px)`;
      attachPlacedBlockHandlers(el);
      abs.appendChild(el);
    });
    updateWeeklySummary();
  }

  function dayToLeftPx(day){
    const rows = gridRoot.querySelector('.grid-rows');
    const totalWidth = gridRoot.clientWidth || (rows?rows.clientWidth:900);
    const hoursCol = 70;
    const dayWidth = (totalWidth - hoursCol) / 7;
    const leftPx = hoursCol + day * dayWidth;
    return { left: leftPx, width: dayWidth };
  }

  // Collision
  function hasCollision(candidate, ignoreId){
    if(candidate.startHour < PState.hoursStart || candidate.startHour + candidate.duration > PState.hoursEnd) return true;
    for(const b of PState.placedBlocks){
      if(ignoreId && b.id === ignoreId) continue;
      if(formatDateISO(b.date) !== formatDateISO(candidate.date)) continue;
      const a1 = b.startHour, a2 = b.startHour + b.duration, c1 = candidate.startHour, c2 = candidate.startHour + candidate.duration;
      if(Math.min(a2,c2) > Math.max(a1,c1)) return true;
    }
    return false;
  }

  // DnD & click
  let dragContext = null, previewEl = null;
  function createPreview(){ if(previewEl) return; previewEl = document.createElement('div'); previewEl.className = 'panda-preview'; previewEl.style.pointerEvents='none'; document.getElementById('view-container').appendChild(previewEl); }
  function removePreview(){ if(previewEl){ previewEl.remove(); previewEl = null; } }
  function showPreview(candidate){
    createPreview();
    const y = 40 + (candidate.startHour - PState.hoursStart) * PState.rowHeight;
    previewEl.style.top = y + 'px';
    previewEl.style.height = Math.max(6, Math.round(candidate.duration * PState.rowHeight)) + 'px';
    const pos = dayToLeftPx(candidate.dayIndex); const leftPct = (pos.left/(gridRoot.clientWidth||pos.left+pos.width))*100; const widthPct=(pos.width/(gridRoot.clientWidth||pos.left+pos.width))*100;
    previewEl.style.left = `calc(${leftPct}% + 8px)`; previewEl.style.width = `calc(${widthPct}% - 16px)`;
  }

  function attachGridHandlers(){
    const cells = gridRoot.querySelectorAll('.grid-cell');
    cells.forEach(c=>{ const clone=c.cloneNode(true); c.parentNode.replaceChild(clone,c); });
    const newCells = gridRoot.querySelectorAll('.grid-cell');
    newCells.forEach(cell=>{
      cell.addEventListener('dragover', onGridDragOver);
      cell.addEventListener('dragleave', onGridDragLeave);
      cell.addEventListener('drop', onGridDrop);
      cell.addEventListener('click', onGridClick);
    });
  }
  function onGridDragOver(ev){
    ev.preventDefault();
    const cell = ev.currentTarget; cell.classList.add('drop-target');
    const rect = cell.getBoundingClientRect(); const relY = ev.clientY - rect.top;
    const baseHour = parseInt(cell.dataset.hour,10);
    const decimal = baseHour + (relY / rect.height);
    let snapped = snapToGrid(decimal);
    let duration = 1, name = 'אירוע';
    if(dragContext && dragContext.template){ duration = dragContext.template.duration; name = dragContext.template.name; }
    const candidate = { dayIndex: parseInt(cell.dataset.dayIndex,10), date: new Date(cell.dataset.dateISO), startHour: snapped, duration };
    showPreview(candidate);
  }
  function onGridDragLeave(ev){ ev.currentTarget.classList.remove('drop-target'); removePreview(); }
  function onGridDrop(ev){
    ev.preventDefault();
    const cell = ev.currentTarget; cell.classList.remove('drop-target');
    const rect = cell.getBoundingClientRect(); const relY = ev.clientY - rect.top;
    const baseHour = parseInt(cell.dataset.hour,10);
    const decimal = baseHour + (relY / rect.height);
    const snapped = snapToGrid(decimal);
    let duration = 1, name = 'אירוע';
    if(dragContext && dragContext.template){ duration = dragContext.template.duration; name = dragContext.template.name; }
    const candidate = { date: new Date(cell.dataset.dateISO), startHour: snapped, duration };
    if(hasCollision(candidate)){ alert('התנגשות או מחוץ לשעות.'); removePreview(); dragContext=null; return; }
    addBlock({ id: uid(), name, date: candidate.date.toISOString(), startHour: candidate.startHour, duration: candidate.duration, income:false, rate:0, notes:'' });
    removePreview(); dragContext=null;
  }
  function onGridClick(ev){
    const cell = ev.currentTarget;
    const rect = cell.getBoundingClientRect(); const relY = ev.clientY - rect.top;
    const baseHour = parseInt(cell.dataset.hour,10);
    const decimal = baseHour + (relY / rect.height);
    const snapped = snapToGrid(decimal);
    const candidate = { date: new Date(cell.dataset.dateISO), startHour: snapped, duration:1 };
    if(hasCollision(candidate)){ alert('התנגשות או מחוץ לשעות.'); return; }
    addBlock({ id: uid(), name: 'אירוע חדש', date: candidate.date.toISOString(), startHour: snapped, duration:1, income:false, rate:0, notes:'' });
  }

  function attachPlacedBlockHandlers(el){
    el.addEventListener('dragstart', (ev)=>{ dragContext = { type:'placed', blockId: el.dataset.id }; try{ ev.dataTransfer.setData('text/plain', el.dataset.id); }catch(e){} createPreview(); });
    el.addEventListener('dragend', ()=>{ removePreview(); dragContext = null; });
    el.addEventListener('dblclick', ()=>{ openEdit(el.dataset.id); });
  }

  // CRUD
  function addBlock(b){ PState.placedBlocks.push(b); pushHistory(); persistAll(); renderActiveView(); }
  function updateBlock(id, vals){ const i = PState.placedBlocks.findIndex(x=>x.id===id); if(i===-1) return; PState.placedBlocks[i] = Object.assign({}, PState.placedBlocks[i], vals); pushHistory(); persistAll(); renderActiveView(); }
  function removeBlock(id){ const i = PState.placedBlocks.findIndex(x=>x.id===id); if(i===-1) return; PState.placedBlocks.splice(i,1); pushHistory(); persistAll(); renderActiveView(); }

  // Summary
  function updateWeeklySummary(){
    const s = startOfWeek(PState.currentDate);
    const cardsRoot = document.getElementById('summaryCards'); if(cardsRoot) cardsRoot.innerHTML='';
    let totalHours=0, totalIncome=0;
    for(let i=0;i<7;i++){
      const day = addDays(s,i);
      let hours=0, income=0;
      PState.placedBlocks.filter(b=>formatDateISO(b.date) === formatDateISO(day)).forEach(b=>{ hours += Number(b.duration||0); if(b.income && b.rate) income += (b.rate*b.duration); });
      totalHours += hours; totalIncome += income;
      if(cardsRoot){
        const card = document.createElement('div'); card.className='summary-card';
        card.innerHTML = `<div style="font-weight:800">${DAYS_NAMES[i]} ${day.toLocaleDateString('he-IL',{day:'2-digit',month:'2-digit'})}</div><div>שעות: <strong>${hours.toFixed(2)}</strong></div><div>הכנסה: <strong>${income.toFixed(2)} ₪</strong></div>`;
        cardsRoot.appendChild(card);
      }
    }
    const avgRate = (totalIncome>0 && totalHours>0) ? (totalIncome/totalHours) : 0;
    const th = document.getElementById('total-hours'), ti = document.getElementById('total-income'), ar = document.getElementById('avg-rate');
    if(th) th.innerText = totalHours.toFixed(2);
    if(ti) ti.innerText = totalIncome.toFixed(2) + ' ₪';
    if(ar) ar.innerText = avgRate.toFixed(2) + ' ₪/שעה';
  }

  // Tabs & Views
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('.tab');
    if(!btn) return;
    e.preventDefault();
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    setActiveView(btn.dataset.view || 'week');
  });

  function setActiveView(v){
    document.getElementById('week-view').classList.toggle('hidden', v!=='week');
    document.getElementById('day-view').classList.toggle('hidden', v!=='day');
    document.getElementById('month-view').classList.toggle('hidden', v!=='month');
    renderActiveView();
  }

  function renderActiveView(){
    updateRangeLabel();
    const active = document.querySelector('.tab.active')?.dataset.view || 'week';
    if(active === 'week'){ buildWeekGrid(); attachGridHandlers(); renderWeekBlocks(); }
    else if(active === 'day'){ renderDayView(); }
    else { renderMonthView(); }
  }

  // Day view
  function renderDayView(){
    const dayHours = document.getElementById('dayHours'); if(dayHours){ dayHours.innerHTML=''; for(let h=PState.hoursStart; h<PState.hoursEnd; h++){ const el=document.createElement('div'); el.className='day-hour'; el.style.height = PState.rowHeight+'px'; el.textContent = `${String(h).padStart(2,'0')}:00`; dayHours.appendChild(el); } }
    const canvas = document.getElementById('dayCanvas'); if(!canvas) return;
    canvas.innerHTML = ''; const totalHeight = (PState.hoursEnd - PState.hoursStart) * PState.rowHeight; canvas.style.minHeight = totalHeight+'px';
    const today = PState.currentDate;
    PState.placedBlocks.filter(b=>formatDateISO(b.date) === formatDateISO(today)).forEach(b=>{
      const el = document.createElement('div'); el.className='panda-placed-block'; el.draggable=true; el.dataset.id=b.id;
      const earn = (b.income && b.rate) ? (b.rate * b.duration) : 0;
      const rightHtml = `<div style="font-size:12px;opacity:0.9">${decimalToTimeString(b.startHour)} - ${decimalToTimeString(b.startHour + b.duration)}</div>`;
      const moneyHtml = earn ? `<div style="font-size:12px;opacity:0.95">${earn.toFixed(2)}₪</div>` : '';
      el.innerHTML = `<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${b.name}</div>${moneyHtml}${rightHtml}`;
      const top = (b.startHour - PState.hoursStart) * PState.rowHeight;
      const h = Math.max(6, Math.round(b.duration * PState.rowHeight));
      el.style.position='absolute'; el.style.top = top+'px'; el.style.height = (h-6)+'px'; el.style.left='8px'; el.style.width='calc(100% - 16px)';
      attachPlacedBlockHandlers(el);
      canvas.appendChild(el);
    });
  }

  // Month view
  function renderMonthView(){
    const grid = document.getElementById('monthGrid'); if(!grid) return; grid.innerHTML='';
    const m = startOfWeek(new Date(PState.currentDate.getFullYear(), PState.currentDate.getMonth(), 1));
    for(let i=0;i<42;i++){
      const date = addDays(m,i);
      const cell = document.createElement('div'); cell.className='month-day';
      const inMonth = date.getMonth() === PState.currentDate.getMonth();
      cell.style.opacity = inMonth ? '1' : '0.55';
      const dateEl = document.createElement('div'); dateEl.className='date'; dateEl.textContent = `${DAYS_NAMES[date.getDay()]} ${date.toLocaleDateString('he-IL',{day:'2-digit',month:'2-digit'})}`;
      cell.appendChild(dateEl);
      PState.placedBlocks.filter(b=>formatDateISO(b.date) === formatDateISO(date)).slice(0,4).forEach(b=>{
        const ev = document.createElement('div'); ev.className='month-event'; const earn = (b.income && b.rate)?(b.rate*b.duration):0;
        ev.textContent = `${decimalToTimeString(b.startHour)} ${b.name}${earn?` • ${earn.toFixed(0)}₪`:''}`;
        cell.appendChild(ev);
      });
      grid.appendChild(cell);
    }
  }

  // Navigation buttons
  document.getElementById('prevRange')?.addEventListener('click', ()=>{
    const active = document.querySelector('.tab.active')?.dataset.view || 'week';
    if(active==='week') PState.currentDate = addWeeks(PState.currentDate, -1);
    else if(active==='day') PState.currentDate = addDays(PState.currentDate, -1);
    else { const d = new Date(PState.currentDate); d.setMonth(d.getMonth()-1); PState.currentDate = d; }
    persistAll(); renderActiveView();
  });
  document.getElementById('nextRange')?.addEventListener('click', ()=>{
    const active = document.querySelector('.tab.active')?.dataset.view || 'week';
    if(active==='week') PState.currentDate = addWeeks(PState.currentDate, +1);
    else if(active==='day') PState.currentDate = addDays(PState.currentDate, +1);
    else { const d = new Date(PState.currentDate); d.setMonth(d.getMonth()+1); PState.currentDate = d; }
    persistAll(); renderActiveView();
  });
  document.getElementById('goToday')?.addEventListener('click', ()=>{ PState.currentDate = new Date(); persistAll(); renderActiveView(); });

  // Sidebar & dark mode
  document.getElementById('menuToggle')?.addEventListener('click', ()=>{ document.getElementById('sidebar')?.classList.add('open'); document.getElementById('sidebar')?.setAttribute('aria-hidden','false'); });
  document.getElementById('sidebarClose')?.addEventListener('click', ()=>{ document.getElementById('sidebar')?.classList.remove('open'); document.getElementById('sidebar')?.setAttribute('aria-hidden','true'); });
  document.getElementById('darkModeToggle')?.addEventListener('click', ()=>{ document.body.classList.toggle('dark'); });

  // Create modal behavior
  const createBackdrop = document.getElementById('create-backdrop'), createModal = document.getElementById('create-modal');
  document.getElementById('openCreateBtn')?.addEventListener('click', openCreate);
  document.getElementById('fab')?.addEventListener('click', openCreate);
  document.getElementById('createCancelBtn')?.addEventListener('click', closeCreate);
  createBackdrop?.addEventListener('click', closeCreate);

  function openCreate(){
    document.getElementById('cb-name').value = '';
    document.getElementById('cb-duration').value = '1';
    document.getElementById('cb-date').value = formatDateISO(PState.currentDate);
    document.getElementById('cb-start').value = String(PState.hoursStart);
    if(createBackdrop && createModal){ createBackdrop.style.display='block'; createModal.style.display='block'; }
  }
  function closeCreate(){ if(createBackdrop && createModal){ createBackdrop.style.display='none'; createModal.style.display='none'; } }

  document.getElementById('createBlockBtn')?.addEventListener('click', ()=>{
    const name = document.getElementById('cb-name').value || 'אירוע';
    const duration = Math.max(0.25, parseFloat(document.getElementById('cb-duration').value) || 1);
    const dateVal = document.getElementById('cb-date').value; const date = dateVal ? new Date(dateVal) : new Date();
    const start = snapToGrid(parseFloat(document.getElementById('cb-start').value) || PState.hoursStart);
    const candidate = { date, startHour: start, duration };
    if(hasCollision(candidate)){ alert('התנגשות או מחוץ לשעות.'); return; }
    addBlock({ id: uid(), name, date: date.toISOString(), startHour: start, duration, income:false, rate:0, notes:'' });
    closeCreate();
  });

  // Edit modal
  const editBackdrop = document.getElementById('edit-backdrop'), editModal = document.getElementById('edit-modal');
  let editingId = null;
  function openEdit(id){
    const b = PState.placedBlocks.find(x=>x.id===id); if(!b) return;
    editingId = id;
    document.getElementById('edit-name').value = b.name || '';
    document.getElementById('edit-date').value = formatDateISO(b.date);
    document.getElementById('edit-start').value = String(b.startHour);
    document.getElementById('edit-duration').value = String(b.duration);
    if(editBackdrop && editModal){ editBackdrop.style.display='block'; editModal.style.display='block'; }
  }
  function closeEdit(){ editingId = null; if(editBackdrop && editModal){ editBackdrop.style.display='none'; editModal.style.display='none'; } }
  document.getElementById('edit-cancel')?.addEventListener('click', closeEdit);
  document.getElementById('edit-save')?.addEventListener('click', ()=>{
    if(!editingId) return;
    const dateVal = document.getElementById('edit-date').value; const date = dateVal ? new Date(dateVal) : new Date();
    const newVals = { name: document.getElementById('edit-name').value || 'אירוע', date: date.toISOString(), startHour: snapToGrid(parseFloat(document.getElementById('edit-start').value)||PState.hoursStart), duration: Math.max(0.25, parseFloat(document.getElementById('edit-duration').value)||1) };
    if(hasCollision({ date: new Date(newVals.date), startHour: newVals.startHour, duration: newVals.duration }, editingId)){ alert('התנגשות עם בלוק קיים.'); return; }
    updateBlock(editingId, newVals); closeEdit();
  });
  document.getElementById('edit-delete')?.addEventListener('click', ()=>{
    if(!editingId) return; if(!confirm('למחוק את הבלוק?')) return; removeBlock(editingId); closeEdit();
  });

  // Export JSON
  document.getElementById('exportJsonBtn')?.addEventListener('click', ()=>{
    const payload = { exportedAt: new Date().toISOString(), blocks: PState.placedBlocks };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'panda_planner.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });

  // Import JSON
  const importFileInput = document.getElementById('importFileInput');
  document.getElementById('importJsonBtn')?.addEventListener('click', ()=> importFileInput?.click());
  importFileInput?.addEventListener('change', (e)=>{
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader(); reader.onload = (ev)=>{
      try{ const obj = JSON.parse(ev.target.result); if(Array.isArray(obj.blocks)){ PState.placedBlocks = obj.blocks; pushHistory(); persistAll(); renderActiveView(); alert('JSON נטען בהצלחה'); } else alert('מבנה JSON לא תקין: מצופה "blocks"'); }catch(err){ alert('שגיאה בקריאת JSON'); }
    }; reader.readAsText(file); e.target.value='';
  });

  // Undo/Redo keyboard
  document.getElementById('undoBtn')?.addEventListener('click', undo);
  document.getElementById('redoBtn')?.addEventListener('click', redo);
  document.addEventListener('keydown', (e)=>{ if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z'){ e.preventDefault(); undo(); } if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='y'){ e.preventDefault(); redo(); } });

  // Helpers
  function pushHistory(){ pushHistorySnapshot(); }
  function pushHistorySnapshot(){ const snap = JSON.stringify(PState.placedBlocks); if(PState.historyIndex < PState.history.length-1) PState.history = PState.history.slice(0, PState.historyIndex+1); PState.history.push(snap); if(PState.history.length>200) PState.history.shift(); PState.historyIndex = PState.history.length-1; updateUndoRedoButtons(); }

  // Labels
  function updateRangeLabel(){
    const s = startOfWeek(PState.currentDate), e = addDays(s,6);
    const options = { day:'2-digit', month:'2-digit', year:'numeric' };
    const rl = document.getElementById('currentRange'); if(rl) rl.textContent = `שבוע: ${s.toLocaleDateString('he-IL',options)} – ${e.toLocaleDateString('he-IL',options)}`;
    const dayTitle = document.getElementById('dayTitle'); if(dayTitle) dayTitle.textContent = `תצוגה יומית — ${PState.currentDate.toLocaleDateString('he-IL',options)}`;
    const monthTitle = document.getElementById('monthTitle'); const m = new Date(PState.currentDate.getFullYear(), PState.currentDate.getMonth(), 1);
    if(monthTitle) monthTitle.textContent = `תצוגה חודשית — ${m.toLocaleDateString('he-IL',{month:'long',year:'numeric'})}`;
  }

  // Init
  function integrate(){
    loadAll();
    document.documentElement.style.setProperty('--row-height', PState.rowHeight+'px');
    renderTemplates();
    setActiveView('week');
    if(!PState.history.length) pushHistorySnapshot();
  }

  function renderTemplates(){
    const tplRoot = document.getElementById('templatesList'); if(!tplRoot) return; tplRoot.innerHTML='';
    const defaults = [{name:'פגישה 30 דק',duration:0.5},{name:'מפגש 1 ש',duration:1}];
    const combined = [...defaults, ...PState.templates];
    combined.forEach(t=>{
      const el = document.createElement('div'); el.className='tpl'; el.draggable=true; el.innerText = t.name;
      el.addEventListener('dragstart',(ev)=>{ dragContext = { type:'tpl', template:t }; try{ ev.dataTransfer.setData('text/plain', JSON.stringify(t)); }catch(e){} createPreview(); });
      el.addEventListener('dragend', ()=>{ removePreview(); dragContext=null; });
      tplRoot.appendChild(el);
    });
  }

  // Small helpers used earlier but defined here
  function formatDateISO_local(d){ const dt=new Date(d); dt.setHours(0,0,0,0); return dt.toISOString().slice(0,10); }
  function formatDateISO(d){ return formatDateISO_local(d); }

  // Bootstrap
  integrate();

})();
