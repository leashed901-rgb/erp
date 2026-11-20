/* ================= Group by any column + Board layout for Stock Updates ================= */
S.updLayout = 'table'; S.boardKind = 'Sales Order';
const _pTable = pTable, _drawTable = drawTable;
pTable = key => {
  _pTable(key);
  const cb = document.querySelector('.toolbar [data-cmd="g-cols"]'); if(!cb) return;
  const st = gs(key); const gc = st.group && colsOf(key).find(c=>c.k===st.group);
  cb.insertAdjacentHTML('afterend', `<button class="btn sm ghost ${gc?'on-soft':''}" data-cmd="g-group" data-t="${key}">${ic('segment')}${gc?'Grouped by '+esc(gc.t):'Group'}</button>${key==='updates'?`<div class="seg" style="margin-left:4px"><button class="${S.updLayout==='table'?'on':''}" data-cmd="upd-layout" data-l="table">${ic('table_rows')}Table</button><button class="${S.updLayout==='board'?'on':''}" data-cmd="upd-layout" data-l="board">${ic('view_kanban')}Board</button></div>`:''}`);
};
drawTable = () => {
  const key = curTable(); if(!key || !$('#tbl')) return;
  if(key==='updates' && S.updLayout==='board'){ drawChips(key); $('#bulk').classList.remove('show'); $('#tbl').innerHTML = boardHTML(); const n = $('#rowCount'); if(n) n.textContent = `${gRows('updates').filter(r=>r.u.kind===S.boardKind).length} documents`; return; }
  _drawTable();
  const st = gs(key); if(!st.group) return;
  const col = colsOf(key).find(c=>c.k===st.group); if(!col || !col.get) return;
  const tb = $('#tbl tbody'); if(!tb) return;
  const rows = gRows(key); const byId = Object.fromEntries(rows.map(r=>[r.id, r]));
  const trs = [...tb.querySelectorAll('tr[data-grow]')];
  const gv = r => { let v = col.get(r); if(v==null || v==='') return '(empty)'; if(col.type==='date') return fmtD(v); return String(v); };
  const groups = new Map(); trs.forEach(tr=>{ const r = byId[tr.dataset.grow]; const g = r ? gv(r) : '(empty)'; if(!groups.has(g)) groups.set(g, []); groups.get(g).push(tr); });
  const vis = colsOf(key).filter(c=>!st.hidden.has(c.k)); const ncell = trs[0] ? trs[0].children.length : vis.length+1;
  const keys = [...groups.keys()].sort((a,b)=>{ if(col.type==='num'||col.type==='money'){ return (+a)-(+b); } return a.localeCompare(b); });
  const frag = document.createDocumentFragment();
  keys.forEach(g=>{ const list = groups.get(g); const rs = list.map(tr=>byId[tr.dataset.grow]).filter(Boolean);
    const h = document.createElement('tr'); h.className = 'grp-row';
    let cells = `<td class="w-cb"></td>`;
    vis.forEach((c,i)=>{ let inner = ''; if(i===0) inner = `<span class="grp-l">${ic('expand_more')}${esc(c.k===col.k ? g : col.t+': '+g)}</span><span class="grp-n">${list.length}</span>`; else if(c.agg==='sum'){ const s = rs.reduce((a,r)=>a+(+c.get(r)||0),0); inner = c.type==='money'?money(s,0):num(s, c.unit?1:0)+(c.unit||''); } cells += `<td class="${i===0?'sticky1':''} ${['num','money'].includes(c.type)?'r num':''}">${inner}</td>`; });
    for(let i = vis.length+1; i<ncell; i++) cells += '<td></td>';
    h.innerHTML = cells; frag.appendChild(h); list.forEach(tr=>frag.appendChild(tr)); });
  tb.innerHTML = ''; tb.appendChild(frag);
};
function boardHTML(){
  const kinds = Object.keys(FLOW); const k = S.boardKind;
  const docsK = gRows('updates').map(r=>r.u).filter(u=>u.kind===k);
  let cols = [...FLOW[k]]; if(k==='Sales Order') cols.splice(1, 0, 'Backordered');
  const extra = [...new Set(docsK.map(u=>u.status).filter(s=>!cols.includes(s)))]; cols = cols.concat(extra);
  return `<div class="board-kinds">${kinds.map(x=>`<button class="chip-btn ${x===k?'on':''}" data-cmd="board-kind" data-k="${x}">${ic(TX_ICON[x])}${x}<span class="n">${STOCK_UPDATES.filter(u=>u.kind===x && !['Converted','Declined','Cancelled','Invoiced','Received','Completed','Posted','Credited'].includes(u.status)).length}</span></button>`).join('')}<button class="btn xs" data-cmd="new-doc" data-k="${k}" style="margin-left:auto">${ic('add')}New ${k.toLowerCase()}</button></div>
  <div class="board">${cols.map(s=>{ const list = docsK.filter(u=>u.status===s); return `<div class="bcol" data-bcol="${esc(s)}"><div class="bcol-h">${pill(s, STATUS_C[s]||'gray')}<span class="muted num">${list.length}</span></div><div class="bcol-b">${list.map(u=>{ const nx = actsFor(u).find(a=>!a.ghost); return `<div class="bcard" draggable="true" data-bcard="${u.id}"><button class="bcard-t" data-cmd="open-doc" data-id="${u.id}"><span class="mono">${u.no}</span><span class="muted">${fmtD(u.date)}</span></button><div class="bcard-p">${esc(u.party || prod(u.lines[0]?.pid||u.pid)?.name || '')}</div><div class="bcard-s">${u.lines.slice(0,2).map(l=>`${l.qty}× ${esc(prod(l.pid).sku)}`).join(' · ')}${u.lines.length>2?` +${u.lines.length-2}`:''}</div><div class="bcard-f"><span class="num">${u.lines.length && u.kind!=='Stock Take' ? money(docTotal(u),0) : ''}</span>${nx?`<button class="btn xs" data-cmd="doc-act" data-id="${u.id}" data-a="${nx.a}">${ic(nx.i)}${nx.t}</button>`:''}</div></div>`; }).join('') || '<div class="bempty">Drop here</div>'}</div></div>`; }).join('')}</div>`;
}
const KB = { id:null };
document.addEventListener('dragstart', e=>{ const c = e.target.closest && e.target.closest('[data-bcard]'); if(!c) return; KB.id = c.dataset.bcard; c.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try{ e.dataTransfer.setData('text/plain', KB.id); }catch(_){} });
document.addEventListener('dragover', e=>{ if(!KB.id) return; const col = e.target.closest && e.target.closest('[data-bcol]'); $$('.bcol.over').forEach(x=>x!==col && x.classList.remove('over')); if(col){ e.preventDefault(); col.classList.add('over'); } });
document.addEventListener('drop', e=>{ if(!KB.id) return; const col = e.target.closest && e.target.closest('[data-bcol]'); const id = KB.id; KB.id = null; $$('.bcol.over,.bcard.dragging').forEach(x=>x.classList.remove('over','dragging')); if(!col) return; e.preventDefault(); boardMove(docById(id), col.dataset.bcol); });
document.addEventListener('dragend', ()=>{ KB.id = null; $$('.bcol.over,.bcard.dragging').forEach(x=>x.classList.remove('over','dragging')); });
function boardMove(u, to){
  if(!u || u.status===to) return;
  const a = actsFor(u).find(x=>x.to===to) || (to==='Received' && actsFor(u).find(x=>x.a==='receive')) || (to==='Picked' && actsFor(u).find(x=>x.a==='pickall'));
  if(a) return runAct(u, a.a);
  const f = FLOW[u.kind], i = f.indexOf(u.status), j = f.indexOf(to);
  if(j>i+1){ const nx = actsFor(u).find(x=>!x.ghost); return toast(`${u.no} can't skip to ${to} — next step is “${nx?nx.t:'—'}”`); }
  toast(`${u.no} can't move back to ${to}`);
}
Object.assign(CMD, {
  'upd-layout': el => { S.updLayout = el.dataset.l; render(); },
  'board-kind': el => { S.boardKind = el.dataset.k; drawTable(); },
  'g-group': el => { const key = el.dataset.t, st = gs(key); const cs = colsOf(key).filter(c=>c.get && c.type!=='action');
    openMenu(el, `<div class="mh2">Group rows by</div><button class="mi" data-cmd="g-group-set" data-t="${key}" data-k="">${ic(st.group?'radio_button_unchecked':'radio_button_checked')}None</button>${cs.map(c=>`<button class="mi" data-cmd="g-group-set" data-t="${key}" data-k="${c.k}">${ic(st.group===c.k?'radio_button_checked':'radio_button_unchecked')}${esc(c.t)}</button>`).join('')}`);
    const m = $('#menu'); m.style.maxHeight = '60vh'; m.style.overflowY = 'auto'; },
  'g-group-set': el => { closeMenu(); gs(el.dataset.t).group = el.dataset.k || null; render(); }
});
/* bulk actions defined per table run through T.bulkRun */
const _gBulk = CMD['g-bulk'];
CMD['g-bulk'] = (el, e) => { const k = el.dataset.t, a = el.dataset.a, T = TABLES[k]; if(T.bulkRun && T.bulkRun[a]){ const st = gs(k); const rows = T.rows().filter(r=>st.sel.has(r.id)); const ps = [...new Set(rows.map(r=>r.p).filter(Boolean))]; T.bulkRun[a](ps, rows); st.sel.clear(); render(); return; } return _gBulk(el, e); };
