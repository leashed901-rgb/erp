/* Etnologic — Catalog & Warehouse. One data model, many lenses. Views become actions on the same table. */
(() => {
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money = (n, d=2) => n == null || isNaN(n) ? '—' : '$' + Number(n).toLocaleString('en-US',{minimumFractionDigits:d, maximumFractionDigits:d});
const num = (n, d=0) => n == null || isNaN(n) ? '—' : Number(n).toLocaleString('en-US',{maximumFractionDigits:d, minimumFractionDigits:d});
const fmtD = d => { if(!d) return '—'; const x = new Date(d+'T12:00:00'); return x.toLocaleDateString('en-US',{month:'short',day:'numeric', year: x.getFullYear()!==2026?'numeric':undefined}); };
const daysAgo = d => d ? Math.round((TODAY - new Date(d+'T12:00:00'))/864e5) : null;
const iso = dt => dt.toISOString().slice(0,10);
const todayISO = iso(TODAY);
const ic = (n, cls='') => `<span class="ms ${cls}">${n}</span>`;
const mfr = id => MANUFACTURERS.find(m => m.id === id) || {name:'—', email:'', lead:7};
const ARCHIVED = [];
const prod = id => PRODUCTS.find(p => p.id === id) || ARCHIVED.find(p => p.id === id);
const FT_COLORS = { 'POD':'#8b5cf6', 'Dropship':'#0ea5e9', 'Wholesale':'#a1a1aa', 'In-House':'#22c55e' };
const FT_LABEL = { 'POD':'POD', 'Dropship':'Dropship', 'Wholesale':'Wholesale', 'In-House':'In House manufactured' };
const FT_SHORT = { 'POD':'POD', 'Dropship':'Dropship', 'Wholesale':'Wholesale', 'In-House':'In House' };
const FT_ICON = { 'POD':'print', 'Dropship':'local_shipping', 'Wholesale':'pallet', 'In-House':'precision_manufacturing' };
const FT_CLS = { 'POD':'t-pod', 'Dropship':'t-drop', 'Wholesale':'t-whl', 'In-House':'t-inh' };

/* ============ STATE ============ */
const S = {
  route:'home', view:'stock', mode:'pro', layout:'table',
  f:{ area:new Set(), mfr:new Set(), loc:new Set(), labels:new Set(), ftype:new Set(), channel:new Set(), wh:null, name:'', sku:'', kpi:null, shelf:null, priceMin:null, priceMax:null, qtyMax:null },
  aiChips:null, sort:{k:null, dir:1}, sel:new Set(), wh:'CDC', shelf:null, catTab:'listings', shipTab:'all', updSel:new Set(),
  counts:{}, chat:[], railOpen:false, dense:false, undo:null, poSeq:424, shpSeq:7782, rptSeq:32, ugc:[
    {id:'u1', pid:'p01', who:'Jane Doe', text:'Loved the quality. Fits perfectly and the black has not faded after 10 washes.', when:'2 hours ago', photo:true},
    {id:'u2', pid:'p11', who:'Marcus K.', text:'Smells amazing, burned evenly. Will buy the cedar next.', when:'5 hours ago', photo:false}
  ]
};

/* ============ DERIVED ============ */
const isStocked = p => (p.ftype === 'Wholesale' || p.ftype === 'In-House') && !(p.bom && p.bom.type==='Bundle');
const onHand = p => isStocked(p) ? p.locs.reduce((a,l)=>a+l.q,0) : null;
const qtyAt = (p, s) => (p.locs.find(l=>l.s===s)||{q:0}).q;
const aisleOf = s => s.split('-')[0];
const whOfAisle = a => WAREHOUSES.find(w => w.aisles.includes(a));
const stockValue = p => isStocked(p) ? onHand(p) * p.cost : 0;
const retailValue = p => isStocked(p) ? onHand(p) * p.price : 0;
const stockVol = p => isStocked(p) ? onHand(p) * p.vol : 0;
function stockStatus(p){
  if(p.ftype==='POD') return {k:'od', t:'On demand', c:'ai'};
  if(p.ftype==='Dropship') return p.supplierQty < p.min ? {k:'low', t:'Supplier low', c:'amber'} : {k:'ok', t:'Supplier stock', c:'blue'};
  const q = onHand(p);
  if(q === 0) return {k:'out', t:'Out of stock', c:'red'};
  if(q < p.min) return {k:'low', t:'Low stock', c:'amber'};
  return {k:'ok', t:'In stock', c:'green'};
}
const reorderNeeded = p => isStocked(p) && onHand(p) < p.min;
const countOverdue = p => isStocked(p) && (!p.lastCount || daysAgo(p.lastCount) > 30);
const daysCover = p => isStocked(p) ? (p.vel ? onHand(p)/p.vel : Infinity) : null;
const suggestQty = p => { const m = mfr(p.mfr); return Math.max(p.rq, Math.ceil(p.vel*(m.lead+21)) - onHand(p)); };
const suggestMin = p => Math.ceil(p.vel * (mfr(p.mfr).lead + 5));
const forecast30 = p => Math.round(p.vel*30*(p.labels.includes('Seasonal')?1.35:1));
function abc(p){ const r = [...PRODUCTS].filter(isStocked).sort((a,b)=>b.vel*b.price - a.vel*a.price); const i = r.indexOf(p); if(i<0) return '—'; return i < r.length*0.2 ? 'A' : i < r.length*0.5 ? 'B' : 'C'; }
const lastTx = p => STOCK_UPDATES.find(u => u.pid === p.id);

function allShelves(){
  const out = [];
  WAREHOUSES.forEach(w => w.aisles.forEach(a => { for(let i=1;i<=w.shelvesPerAisle;i++){ const id = `${a}-${String(i).padStart(2,'0')}`; out.push(shelfInfo(id, w, a)); } }));
  return out;
}
function shelfInfo(id, w, a){
  w = w || whOfAisle(aisleOf(id)); a = a || aisleOf(id);
  const items = PRODUCTS.map(p => ({p, q:qtyAt(p,id)})).filter(x=>x.q>0);
  const used = items.reduce((s,x)=>s + x.q*x.p.vol, 0);
  const cap = w.cap[a]; const pct = cap ? used/cap : 0;
  const units = items.reduce((s,x)=>s+x.q,0);
  const status = items.length===0 ? 'empty' : pct > .92 ? 'full' : pct > .75 ? 'near' : 'ok';
  return { id, w, a, cap, used, avail:Math.max(0,cap-used), pct, items, units, status, min:w.minLevel[a], below: items.length && units < w.minLevel[a], note:SHELF_NOTES[id]||'' };
}
const SH_STATUS = { empty:['Empty','gray'], ok:['Available','green'], near:['Near capacity','amber'], full:['At capacity','red'] };

/* ============ FILTERING ============ */
function matches(p, skip){
  const f = S.f;
  if(S._only && !S._only.has(p.id)) return false;
  if(S._drafts && p.status!=='Draft') return false;
  if(skip!=='area' && f.area.size && !f.area.has(p.area)) return false;
  if(skip!=='mfr' && f.mfr.size && !f.mfr.has(p.mfr)) return false;
  if(skip!=='ftype' && f.ftype.size && !f.ftype.has(p.ftype)) return false;
  if(skip!=='labels' && f.labels.size && !p.labels.some(l=>f.labels.has(l))) return false;
  if(skip!=='channel' && f.channel.size && !p.channels.some(c=>f.channel.has(c))) return false;
  if(skip!=='loc' && f.loc.size && !p.locs.some(l=>l.q>0 && f.loc.has(aisleOf(l.s)))) return false;
  if(f.shelf && !p.locs.some(l=>l.s===f.shelf && l.q>0)) return false;
  if(f.wh){ const w = WAREHOUSES.find(x=>x.id===f.wh); if(!p.locs.some(l=>l.q>0 && w.aisles.includes(aisleOf(l.s)))) return false; }
  if(f.name && !p.name.toLowerCase().includes(f.name.toLowerCase())) return false;
  if(f.sku && !p.sku.toLowerCase().startsWith(f.sku.toLowerCase())) return false;
  if(f.priceMin!=null && p.price < f.priceMin) return false;
  if(f.priceMax!=null && p.price > f.priceMax) return false;
  if(f.qtyMax!=null && !(isStocked(p) && onHand(p) < f.qtyMax)) return false;
  if(skip!=='kpi' && f.kpi){
    const k = f.kpi;
    if(k==='instock' && !(isStocked(p) && onHand(p)>0)) return false;
    if(k==='low' && !['low','out'].includes(stockStatus(p).k)) return false;
    if(k==='out' && stockStatus(p).k!=='out') return false;
    if(k==='reorder' && !reorderNeeded(p)) return false;
    if(k==='overdue' && !countOverdue(p)) return false;
    if(k==='open-po' && !p.po) return false;
    if(k==='stocked' && !isStocked(p)) return false;
  }
  return true;
}
const filtered = () => PRODUCTS.filter(p => matches(p));
const activeFilterCount = () => { const f=S.f; return f.area.size+f.mfr.size+f.loc.size+f.labels.size+f.ftype.size+f.channel.size+(f.wh?1:0)+(f.name?1:0)+(f.sku?1:0)+(f.kpi?1:0)+(f.shelf?1:0)+(f.priceMin!=null?1:0)+(f.priceMax!=null?1:0)+(f.qtyMax!=null?1:0); };
function clearFilters(){ const f=S.f; ['area','mfr','loc','labels','ftype','channel'].forEach(k=>f[k].clear()); f.name=''; f.sku=''; f.wh=null; f.kpi=null; f.shelf=null; f.priceMin=null; f.priceMax=null; f.qtyMax=null; S.aiChips=null; S._only=null; S._drafts=false; }

/* ============ UI PRIMITIVES ============ */
function toast(msg, undo){
  const t = document.createElement('div'); t.className='toast';
  t.innerHTML = `${ic('check_circle')}<span>${esc(msg)}</span>${undo?'<button>Undo</button>':''}`;
  if(undo) t.querySelector('button').onclick = () => { undo(); t.remove(); toast('Undone'); render(); };
  $('#toasts').appendChild(t); setTimeout(()=>t.remove(), undo?5200:2600);
}
function thumb(p, cls=''){ return `<div class="thumb ${cls}">${ic(p.area==='Packaging'?'package_2':'image')}<img src="img/${p.img}.png" alt="" loading="lazy" onerror="this.remove()"></div>`; }
function pill(t, c='gray', dot=true){ return `<span class="pill ${c}">${dot?'<i class="dot"></i>':''}${esc(t)}</span>`; }
function ftype(p){ return typeBadge(p.ftype); }
function typeBadge(t, long){ return `<span class="tbadge ${FT_CLS[t]}" title="Product type: ${FT_LABEL[t]}">${ic(FT_ICON[t])}${long?FT_LABEL[t]:FT_SHORT[t]}</span>`; }
function srcLine(p){ const m = mfr(p.mfr); return `<span class="src" title="Where it comes from">${ic('factory')}${esc(m.name)}</span>`; }
function labelTags(p){ return p.labels.map(l=>`<span class="lbl" title="Label">${esc(l)}</span>`).join(''); }
function ident(p){ return `<div class="ident"><div class="prod-name">${esc(p.name)}</div><div class="ident-meta">${typeBadge(p.ftype)}${srcLine(p)}</div>${p.labels.length?`<div class="ident-lbls">${labelTags(p)}</div>`:''}</div>`; }
function chanCell(p){ return `<div class="chans">${p.channels.map(c=>`<button class="chan on" data-cmd="unlist" data-id="${p.id}" data-c="${esc(c)}" title="Listed on ${esc(c)} — click to remove">${esc(c)}</button>`).join('')}<button class="chan add" data-cmd="chan-menu" data-id="${p.id}" aria-label="Add distribution channel">${ic('add')}</button></div>`; }
function lvl(p){
  if(!isStocked(p)) return p.ftype==='Dropship' ? `<span class="muted num">${num(p.supplierQty)} at supplier</span>` : '<span class="faint">—</span>';
  const q = onHand(p), max = Math.max(p.min*2.5, q, 1), st = stockStatus(p);
  const c = st.k==='out'||st.k==='low' ? (st.k==='out'?'red':'amber') : 'green';
  return `<div class="lvl"><div class="bar ${c}"><i style="width:${Math.min(100,q/max*100)}%"></i></div><span class="num muted" style="font-size:12px">min ${p.min}</span></div>`;
}
function spark(vals, w=64, h=22, color='#a1a1aa'){
  const mx = Math.max(...vals), mn = Math.min(...vals); const r = mx-mn||1;
  const pts = vals.map((v,i)=>`${(i/(vals.length-1))*w},${h-2-((v-mn)/r)*(h-4)}`).join(' ');
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline fill="none" stroke="${color}" stroke-width="1.4" points="${pts}" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
function openMenu(anchor, html){
  const m = $('#menu'); m.innerHTML = html; m.classList.add('open');
  const r = anchor.getBoundingClientRect(); const mw = 240;
  let left = Math.min(r.right - mw, window.innerWidth - mw - 8); left = Math.max(8,left);
  let top = r.bottom + 6; m.style.left = left+'px'; m.style.top = top+'px';
  requestAnimationFrame(()=>{ const mr = m.getBoundingClientRect(); if(mr.bottom > window.innerHeight-8) m.style.top = Math.max(8, r.top - mr.height - 6)+'px'; });
}
const closeMenu = () => $('#menu').classList.remove('open');
function openDrawer(html, onMount){ const d=$('#drawer'); d.innerHTML=html; d.classList.add('open'); $('#scrim').classList.add('open'); onMount && onMount(d); }
function closeDrawer(){ $('#drawer').classList.remove('open'); $('#scrim').classList.remove('open'); }
function openModal(html, wide, onMount){ const m=$('#modal'); m.className='modal'+(wide?' wide':''); m.innerHTML=html; $('#modalWrap').classList.add('open'); onMount && onMount(m); }
function closeModal(){ if($('#modalWrap').contains(document.activeElement)) document.activeElement.blur(); $('#modalWrap').classList.remove('open'); clearInterval(window._scanT); }
function download(name, text, type='text/plain'){
  try{ const b = new Blob([text],{type}); const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=name; document.body.appendChild(a); a.click(); a.remove(); toast(`Exported ${name}`); }
  catch(e){ toast('Export ready — download blocked by browser'); }
}
function toCSV(rows){ return rows.map(r=>r.map(v=>{ v = String(v??''); return /[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v; }).join(',')).join('\n'); }

/* ============ NAV ============ */
const NAV = [
  { g:'Workspace', items:[ {r:'home', i:'home', t:'Home'} ] },
  { g:'Tables', items:[
    {r:'workbench', v:'stock', i:'inventory_2', t:'Inventory Management', count:()=>PRODUCTS.filter(reorderNeeded).length, warn:true},
    {r:'workbench', v:'catalog', i:'category', t:'Product Catalog', count:()=>PRODUCTS.length},
    {r:'updates', i:'swap_vert', t:'Stock Updates', count:()=>STOCK_UPDATES.length},
    {r:'warehouse', i:'shelves', t:'Warehouse Management', count:()=>allShelves().length}
  ]}
];
function navActive(it){
  if(it.r==='updates' && S.route==='reports') return true;
  if(it.r==='warehouse' && S.route==='shipping') return true;
  if(it.r!==S.route) return false;
  if(it.r==='workbench') return (it.v==='catalog') === (S.view==='catalog');
  if(it.r==='catalog') return it.tab===S.catTab || (it.tab==='bundles' && S.catTab==='collections');
  return true;
}
function renderNav(){
  $('#nav').innerHTML = NAV.flatMap(g=>g.items).map(it=>`<button class="tn ${navActive(it)?'on':''}" data-cmd="go" data-r="${it.r}" ${it.v?`data-v="${it.v}"`:''} ${it.tab?`data-tab="${it.tab}"`:''}>${esc(it.t)}</button>`).join('');
}
function crumbs(parts){ $('#crumbs').innerHTML = parts.map((p,i)=> i===parts.length-1 ? `<b>${esc(p)}</b>` : `<span>${esc(p)}</span><span class="sep">/</span>`).join(''); }

/* ============ ROUTER ============ */
function go(r, opts={}){ S.route = r; if(opts.v){ const v = opts.v; S.view = (v==='catalog') ? 'catalog' : 'stock'; if(v==='reorder' && !S.f.kpi) S.f.kpi='reorder'; if(v==='counts') setTimeout(()=>{ const i=$('[data-count]'); if(i){ i.scrollIntoView({block:'nearest',inline:'center'}); i.focus(); } },80); } if(opts.tab) S.catTab = opts.tab; S.sel.clear(); closeDrawer(); closeMenu(); render(); $('#page').scrollTop = 0; }
function render(){
  renderNav();
  $('#page').classList.remove('page-grid');
  const pg = { home:pHome, workbench:pWorkbench, updates:pUpdates, warehouse:pWarehouse, shipping:pShipping, reports:pReports }[S.route] || pHome;
  pg();
  if($('#copilot').classList.contains('open')) renderCopilot();
}

/* ============ HOME ============ */
function kpiData(){
  const st = PRODUCTS.filter(isStocked);
  return {
    inStock: st.filter(p=>onHand(p)>0).length,
    units: st.reduce((a,p)=>a+onHand(p),0),
    value: st.reduce((a,p)=>a+stockValue(p),0),
    retail: st.reduce((a,p)=>a+retailValue(p),0),
    vol: st.reduce((a,p)=>a+stockVol(p),0),
    reorder: PRODUCTS.filter(reorderNeeded).length,
    low: PRODUCTS.filter(p=>['low','out'].includes(stockStatus(p).k)).length,
    overdue: PRODUCTS.filter(countOverdue).length,
    openPO: PRODUCTS.filter(p=>p.po).length
  };
}
function pHome(){
  crumbs(['Home']);
  const k = kpiData(); const ins = insights();
  const simple = S.mode==='simple';
  const tasks = [
    {i:'shopping_bag', t:'Sales order', d:'Price, allocate, pick and ship', cmd:'new-doc', k:'Sales Order'},
    {i:'request_quote', t:'Sales quote', d:'Customer pricing applied', cmd:'new-doc', k:'Sales Quote'},
    {i:'shopping_cart', t:'Purchase order', d:'Receive, recost, return', cmd:'new-doc', k:'Purchase Order'},
    {i:'precision_manufacturing', t:'Assemble', d:'Build from a Bill of Materials', cmd:'new-doc', k:'Assembly'},
    {i:'auto_awesome', t:'Plan with Stitch', d:'Buy and make what is short', cmd:'stitch-plan'},
    {i:'pan_tool_alt', t:'Pick list', d:'Open picks across shelves', cmd:'pick-all-q'},
    {i:'inventory', t:'Stock take', d:'Count aisles, post variance', cmd:'new-doc', k:'Stock Take'},
    {i:'drive_file_move', t:'Transfer', d:'Shelf, building or 3PL', cmd:'new-doc', k:'Transfer'}
  ];
  const act = STOCK_UPDATES.slice(0,6);
  $('#page').innerHTML = `<div class="page-inner">
    <div class="section" style="max-width:820px">
      <h1 class="hello">Good morning</h1>
      <p class="muted" style="margin:0 0 16px">Thursday, Nov 19 · ${ins.length} things need you today. Ask in plain language, or pick a task.</p>
      <form class="ask" data-form="ask">${ic('auto_awesome')}<input name="q" placeholder="Try “low stock candles in aisle C” or “receive 24 CND-SOY-CED”" autocomplete="off"/><button class="btn primary sm" type="submit">Ask</button></form>
      <div class="suggests">${['Reorder needed','Low stock POD and dropship','What is my stock value?','Count aisle A','Shelves near capacity','Ship exceptions'].map(s=>`<button class="sugg" data-cmd="ask" data-q="${esc(s)}">${esc(s)}</button>`).join('')}</div>
    </div>

    <div class="section"><div class="sec-head"><h2 class="sh">${simple?'What do you want to do?':'Quick tasks'}</h2></div>
      <div class="tasks">${tasks.slice(0, simple?8:8).map(t=>`<button class="task" data-cmd="${t.cmd}" ${t.r?`data-r="${t.r}"`:''} ${t.v?`data-v="${t.v}"`:''} ${t.a?`data-a="${t.a}"`:''} ${t.k?`data-k="${t.k}"`:''}><div class="ti">${ic(t.i)}</div><div class="tt">${t.t}</div><div class="td">${t.d}</div></button>`).join('')}</div>
    </div>

    <div class="kpis">
      ${kpiCard('instock','inventory_2','Products in stock', num(k.inStock), `${num(k.units)} units on hand`, [18,19,19,20,19,21,k.inStock])}
      ${kpiCard('stocked','payments','Stock value', money(k.value,0), `${money(k.retail,0)} at retail`, [9.1,9.4,9.0,9.8,10.2,10.0,k.value/1000])}
      ${kpiCard('stocked','deployed_code','Stock volume', num(k.vol,1)+' ft³', 'Across 3 locations', [60,62,64,61,66,70,k.vol])}
      ${kpiCard('reorder','shopping_cart','Reorder needed', num(k.reorder), `${k.openPO} open purchase orders`, null)}
      ${kpiCard('overdue','fact_check','Counts overdue', num(k.overdue), 'Not checked in 30+ days', null)}
    </div>

    <div class="grid g-main">
      <div class="card"><div class="card-head"><div><h2 class="sh" style="display:flex;gap:8px;align-items:center">${ic('auto_awesome','ai-ic')}Needs attention</h2></div><button class="btn sm" data-cmd="toggle-copilot">Open Stitch</button></div>
        <div class="list">${ins.map(x=>`<div class="li"><div class="li-ic ${x.c}">${ic(x.i)}</div><div class="li-main"><div class="li-t">${x.t}</div><div class="li-s">${x.d}</div></div><div class="li-r">${x.acts.slice(0, simple?1:2).map((a,j)=>`<button class="btn sm ${j===0?'':'ghost'}" data-cmd="insight" data-id="${x.id}" data-n="${j}">${a.t}</button>`).join('')}</div></div>`).join('')}</div>
      </div>
      <div class="grid" style="gap:16px;align-content:start">
        <div class="card"><div class="card-head"><h2 class="sh">Warehouse capacity</h2><button class="btn sm ghost" data-cmd="go" data-r="warehouse">Open</button></div>
          <div class="card-pad" style="display:flex;flex-direction:column;gap:14px">${WAREHOUSES.map(w=>{ const sh=allShelves().filter(s=>s.w===w); const used=sh.reduce((a,s)=>a+s.used,0), cap=sh.reduce((a,s)=>a+s.cap,0); const pct=used/cap; return `<button style="text-align:left" data-cmd="open-wh" data-id="${w.id}"><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px"><span><b style="font-weight:500">${w.name}</b> <span class="muted">${w.kind==='3PL'?'· 3PL':''}</span></span><span class="num muted">${Math.round(pct*100)}%</span></div><div class="bar ${pct>.8?'amber':'green'}"><i style="width:${pct*100}%"></i></div></button>`; }).join('')}</div>
        </div>
        <div class="card"><div class="card-head"><h2 class="sh">Recent stock updates</h2><button class="btn sm ghost" data-cmd="go" data-r="updates">All</button></div>
          <div class="list">${act.map(u=>{ const p=prod(u.pid); return `<button class="li" style="text-align:left;width:100%" data-cmd="open-update" data-id="${u.id}"><div class="li-ic">${ic(TX_ICON[u.type])}</div><div class="li-main"><div class="li-t" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.type} · ${esc(p.name)}</div><div class="li-s">${u.qty>0?'+':''}${u.qty} · ${u.loc} · ${esc(u.owner)}</div></div><span class="faint" style="font-size:11.5px">${fmtD(u.date)}</span></button>`; }).join('')}</div>
        </div>
      </div>
    </div>
  </div>`;
}
function kpiCard(k, i, l, v, s, sp){
  return `<button class="kpi ${S.route==='workbench'&&S.f.kpi===k?'on':''}" data-cmd="kpi" data-k="${k}"><div class="kpi-l">${ic(i)}${l}</div><div class="kpi-v">${v}</div><div class="kpi-s">${s}</div>${sp?spark(sp):''}</button>`;
}
const TX_ICON = { Receive:'move_to_inbox', Ship:'outbox', Return:'assignment_return', Adjust:'tune', Count:'fact_check', Transfer:'drive_file_move', Produce:'precision_manufacturing' };

/* ============ INSIGHTS (Stitch) ============ */
function insights(){
  const out = [];
  const ro = PRODUCTS.filter(p=>reorderNeeded(p) && !p.po);
  if(ro.length){ const cost = ro.reduce((a,p)=>a+suggestQty(p)*p.cost,0);
    out.push({id:'reorder', c:'amber', i:'shopping_cart', t:`${ro.length} items below reorder level with no open PO`, d:`${ro.map(p=>p.sku).slice(0,3).join(', ')}${ro.length>3?'…':''} · est. ${money(cost,0)} to restock to 3 weeks of cover`, conf:94,
      acts:[{t:'Draft POs', fn:()=>draftPOs(ro)}, {t:'Review', fn:()=>{ clearFilters(); S.f.kpi='reorder'; go('workbench',{v:'reorder'}); }}]}); }
  const risk = PRODUCTS.filter(p=>isStocked(p) && p.po && daysCover(p) < daysUntil(p.po.eta));
  risk.forEach(p=> out.push({id:'risk-'+p.id, c:'red', i:'trending_down', t:`${p.name} may stock out before ${p.po.id} arrives`, d:`${num(daysCover(p),1)} days of cover at ${p.vel}/day · PO lands ${fmtD(p.po.eta)}. Expedite or cap channel quantity.`, conf:81,
    acts:[{t:'Email supplier', fn:()=>emailModal(p,'expedite')}, {t:'Open', fn:()=>openProduct(p.id,'stock')}]}));
  const ds = PRODUCTS.filter(p=>p.ftype==='Dropship' && p.supplierQty < p.min);
  ds.forEach(p=> out.push({id:'ds-'+p.id, c:'amber', i:'conveyor_belt', t:`${mfr(p.mfr).name} has only ${p.supplierQty} of ${p.name}`, d:'Dropship supplier stock is below your threshold. Pause listings to avoid overselling.', conf:88,
    acts:[{t:'Remove from channels', fn:()=>{ const prev=[...p.channels]; p.channels=[]; toast(`Paused ${p.sku} on ${prev.length} channels`, ()=>{p.channels=prev;}); render(); }}, {t:'Email supplier', fn:()=>emailModal(p,'stock')}]}));
  const cap = PRODUCTS.find(p=>p.id==='p08');
  if(cap && STOCK_UPDATES.some(u=>u.pid==='p08'&&u.type==='Count'&&u.qty<0)) out.push({id:'variance', c:'red', i:'troubleshoot', t:'Count variance on Dad Cap (A-03): −3 units', d:'Second negative variance in 30 days on a front-pick shelf. Likely mis-picks with CAP-DAD-OLV. Recount and review pick path.', conf:72,
    acts:[{t:'Schedule recount', fn:()=>{ clearFilters(); S.f.sku='CAP-DAD'; go('workbench',{v:'counts'}); toast('Recount added to counts view'); }}, {t:'Ledger', fn:()=>{ go('updates'); }}]});
  const slow = PRODUCTS.find(p=>p.id==='p22'); if(slow && qtyAt(slow,'D-05')>0) out.push({id:'slot', c:'ai', i:'swap_horiz', t:`Free D-05: move ${qtyAt(slow,'D-05')} slow Linen Journals to Tupelo overflow`, d:`${num(daysCover(slow))} days of cover at 0.05/day. Frees ${num(qtyAt(slow,'D-05')*slow.vol,1)} ft³ near packing for fast movers like House Blend Coffee.`, conf:77,
    acts:[{t:'Move to E-04', fn:()=>doMove(slow,'D-05','E-04',qtyAt(slow,'D-05'),'Stitch slotting suggestion')}, {t:'Mark clearance', fn:()=>{ if(!slow.labels.includes('Clearance')) slow.labels.push('Clearance'); slow.price=14; toast('Repriced to $14.00 and labeled Clearance'); render(); }}]});
  const ex = SHIPMENTS.filter(s=>s.status==='Exception');
  ex.forEach(s=> out.push({id:'ship-'+s.id, c:'red', i:'report', t:`${s.id} exception: ${s.note}`, d:`${s.ref} · ${s.party}. Stitch matched a corrected ZIP from the order’s billing address.`, conf:86,
    acts:[{t:'Fix address', fn:()=>{ s.status='In transit'; s.note=''; toast(`${s.id} address corrected and re-released`); render(); }}, {t:'Open', fn:()=>openShipment(s.id)}]}));
  const overdue = PRODUCTS.filter(countOverdue);
  if(overdue.length) out.push({id:'counts', c:'blue', i:'fact_check', t:`${overdue.length} SKUs not counted in 30+ days`, d:'Generate a cycle count sheet grouped by shelf to keep the pick path short.', conf:90,
    acts:[{t:'Start count', fn:()=>{ clearFilters(); S.f.kpi='overdue'; go('workbench',{v:'counts'}); }}]});
  return out;
}
const daysUntil = d => d ? Math.max(0, Math.round((new Date(d+'T12:00:00') - TODAY)/864e5)) : 99;
function draftPOs(list){
  const by = {}; list.forEach(p=>{ (by[p.mfr] = by[p.mfr]||[]).push(p); });
  const made = [];
  Object.entries(by).forEach(([m, ps]) => { const id = 'PO-2026-0'+(++S.poSeq); ps.forEach(p=>{ p.po = {id, status:'Draft', qty:suggestQty(p), eta:null}; }); made.push(id); });
  toast(`Drafted ${made.length} PO${made.length>1?'s':''}: ${made.join(', ')}`, ()=>{ list.forEach(p=>p.po=null); });
  render();
}

/* ============ TABLE ENGINE — each heading is a table, each child is a column ============ */
const GS = {};
const LS_GRID = 'etn-wms-grid-v1';
const GRID_STORE = {};
function loadGrid(){ return GRID_STORE; }
function saveGrid(){ const o = {}; Object.entries(GS).forEach(([k,s])=>{ o[k] = { hidden:[...s.hidden], order:s.order, widths:s.widths, names:s.names, custom:s.custom }; }); Object.assign(GRID_STORE, JSON.parse(JSON.stringify(o))); }
function gs(k){ if(GS[k]) return GS[k]; const v = loadGrid()[k] || {}; return (GS[k] = { sort:{k:null,dir:1}, sel:new Set(), hidden:new Set(v.hidden||[]), cf:[], q:'', order:v.order||null, widths:v.widths||{}, names:v.names||{}, custom:v.custom||[] }); }
const CTYPES = [['text','Text','notes'],['num','Number','tag'],['money','Currency','attach_money'],['date','Date','calendar_today'],['select','Single select','arrow_drop_down_circle'],['check','Checkbox','check_box'],['person','Person','person'],['url','Link','link']];
const CT_NAME = Object.fromEntries(CTYPES.map(c=>[c[0],c[1]]));
function ccVal(cc, r){ const v = cc.vals[r.id]; return v===undefined ? null : v; }
function customCell(key, cc, r){
  const v = ccVal(cc, r);
  if(cc.type==='check') return `<input type="checkbox" class="cbx" data-cmd="g-cc-check" data-t="${key}" data-k="${cc.k}" data-id="${esc(r.id)}" ${v?'checked':''} aria-label="${esc(cc.t)}"/>`;
  const shown = v==null || v==='' ? '<span class="faint">—</span>' : cc.type==='money' ? money(+v) : cc.type==='date' ? fmtD(v) : cc.type==='select' ? `<span class="opt-pill">${esc(v)}</span>` : cc.type==='url' ? `<span class="link">${esc(v)}</span>` : esc(v);
  return `<button class="cc-cell" data-cmd="g-cc-edit" data-t="${key}" data-k="${cc.k}" data-id="${esc(r.id)}" title="Edit ${esc(cc.t)}">${shown}</button>`;
}
function customColDef(key, cc){ return { k:cc.k, t:cc.t, type: cc.type==='check'||cc.type==='select'||cc.type==='person'||cc.type==='url' ? 'text' : cc.type, ctype:cc.type, custom:true, agg: ['num','money'].includes(cc.type)?'sum':null, get:r=>{ const v = ccVal(cc,r); return cc.type==='check' ? (v?'Yes':'No') : v; }, r:r=>customCell(key, cc, r) }; }
function colsOf(key){
  const T = TABLES[key], st = gs(key);
  const all = [...T.cols, ...st.custom.map(cc=>customColDef(key, cc))].map(c=> st.names[c.k] ? {...c, t:st.names[c.k], orig:c.t} : c);
  const by = Object.fromEntries(all.map(c=>[c.k,c]));
  const order = (st.order||[]).filter(k=>by[k]);
  all.forEach(c=>{ if(!order.includes(c.k)) order.push(c.k); });
  return order.map(k=>by[k]);
}
function setOrder(key, keys){ gs(key).order = keys; saveGrid(); }
function moveCol(key, k, toK, after){ const ks = colsOf(key).map(c=>c.k).filter(x=>x!==k); let i = ks.indexOf(toK); if(i<0) i = ks.length; else if(after) i++; ks.splice(i,0,k); setOrder(key, ks); }
const LABEL_OPTS = ['POD','Dropship','Wholesale','In-House'];
function labelTag(p){ return `<span class="lbl l-${FT_CLS[p.ftype]}">${FT_LABEL[p.ftype]}</span>`; }
function txCell(p){ const t = lastTx(p); if(!t) return '<span class="faint">—</span>'; return `<button class="link" data-cmd="open-update" data-id="${t.id}" style="white-space:nowrap">${t.type} ${t.qty>0?'+':''}${t.qty}</button><div class="muted" style="font-size:11.5px">${fmtD(t.date)} · ${t.id}</div>`; }
function chanCell(p){ return `<div class="chans">${p.channels.map(c=>`<button class="chan on" data-cmd="unlist" data-id="${p.id}" data-c="${esc(c)}" title="Listed on ${esc(c)} — click to remove">${esc(c)}</button>`).join('')}<button class="chan add" data-cmd="chan-menu" data-id="${p.id}" aria-label="Add distribution channel">${ic('add')}</button></div>`; }
function prodLink(p){ return `<button class="prodlink" data-cmd="open-product" data-id="${p.id}">${thumb(p)}<span><span class="prod-name">${esc(p.name)}</span><span class="prod-sub mono">${esc(p.sku)}</span></span></button>`; }
const PO_C = {Draft:'gray',Sent:'blue',Confirmed:'blue','In transit':'ai',Received:'green'};

/* Inventory management rows: one row per product per inventory warehouse */
function invRows(){
  const f = S.f;
  return PRODUCTS.filter(p=>matches(p)).flatMap(p=>{
    if(!isStocked(p)) return [{ id:p.id+'@sup', p, w:null, ls:[], q:null }];
    const ws = WAREHOUSES.map(w=>({ w, ls:p.locs.filter(l=>l.q>0 && w.aisles.includes(aisleOf(l.s))) })).filter(x=>x.ls.length);
    if(!ws.length) return [{ id:p.id+'@none', p, w:null, ls:[], q:0 }];
    return ws.map(x=>({ id:p.id+'@'+x.w.id, p, w:x.w, ls:x.ls, q:x.ls.reduce((a,l)=>a+l.q,0) }));
  }).filter(r=> (!f.wh || (r.w && r.w.id===f.wh)) && (!f.loc.size || r.ls.some(l=>f.loc.has(aisleOf(l.s)))));
}
function rowVar(r){ const c = S.counts[r.id]; if(c==null) return null; return c - (r.q||0); }
function varHTML(r){ const d = rowVar(r); if(d==null) return ''; return `<span class="num ${d>0?'var-pos':d<0?'var-neg':'muted'}" style="font-size:11.5px">${d>0?'+':''}${d} variance</span>`; }
function postCountRow(id){
  const r = invRows().find(x=>x.id===id); if(!r) return 0;
  const c = S.counts[id]; if(c==null) return 0; const p = r.p;
  const delta = c - (r.q||0); const loc = (r.ls.slice().sort((a,b)=>b.q-a.q)[0]||p.locs[0]||{s:'A-01'}).s;
  applyDelta(p, loc, delta); p.locs = p.locs.filter(l=>l.q>0); p.lastCount = todayISO; p.updated = todayISO;
  STOCK_UPDATES.unshift(su({ date:todayISO, type:'Count', pid:p.id, loc, qty:delta, unitCost:p.cost, owner:'Etnologic Inc', comments: delta? `New stock count at ${r.w?r.w.name:loc}: variance ${delta>0?'+':''}${delta}` : 'Count matched system.' }));
  delete S.counts[id]; return delta;
}

const TABLES = {
  inventory:{
    title:'Inventory Management', icon:'inventory_2', noun:'records', product:true,
    sub:'One row per product per inventory warehouse.',
    rows:invRows,
    cols:[
      {k:'instock', t:'# of Products in Stock', type:'num', agg:'sum', get:r=>r.q, r:r=> r.q==null ? `<span class="muted">${r.p.ftype==='POD'?'On demand':num(r.p.supplierQty)+' at supplier'}</span>` : `<span class="num strong">${num(r.q)}</span>`},
      {k:'value', t:'Stock Value', type:'money', agg:'sum', get:r=>r.q==null?null:r.q*r.p.cost, r:r=> r.q==null?'<span class="faint">—</span>':money(r.q*r.p.cost)},
      {k:'vol', t:'Stock Volume', type:'num', agg:'sum', unit:' ft³', get:r=>r.q==null?null:+(r.q*r.p.vol).toFixed(2), r:r=> r.q==null?'<span class="faint">—</span>':num(r.q*r.p.vol,2)+' ft³'},
      {k:'wh', t:'Inventory Warehouse', type:'text', get:r=>r.w?r.w.name:(isStocked(r.p)?'Not slotted':r.p.ftype==='POD'?'Printed on demand':'Ships from supplier'), r:r=> r.w ? `<button class="link" data-cmd="open-wh" data-id="${r.w.id}">${esc(r.w.name)}</button>${r.w.kind==='3PL'?' '+pill('3PL','blue',false):''}<div class="shelf-tags">${r.ls.map(l=>`<button class="tag mono" data-cmd="open-shelf" data-id="${l.s}" title="Shelf ${l.s}">${l.s} · ${l.q}</button>`).join('')}</div>` : `<span class="muted">${isStocked(r.p)?'Not slotted':r.p.ftype==='POD'?'Printed on demand':'Ships from supplier'}</span>`},
      {k:'catalog', t:'Product Catalog', type:'text', get:r=>r.p.name, r:r=>prodLink(r.p)+`<div style="margin-top:4px">${labelTag(r.p)}</div>`},
      {k:'code', t:'Scan or Code', type:'text', get:r=>r.p.sku, r:r=>`<button class="codebtn" data-cmd="scan-code" data-id="${r.p.sku}" title="Scan or enter code">${ic('barcode_scanner')}<span class="mono">${esc(r.p.sku)}</span></button>`},
      {k:'update', t:'Update Stock', type:'action', r:r=> isStocked(r.p) ? `<button class="btn xs" data-cmd="new-stock-update" data-id="${r.p.id}" data-loc="${r.ls[0]?.s||''}">${ic('swap_vert')}Update</button>` : '<span class="faint">—</span>'},
      {k:'count', t:'New Stock Counts', type:'num', get:r=>S.counts[r.id]??null, r:r=> isStocked(r.p) ? `<div class="count-cell"><input class="count-in" type="number" min="0" inputmode="numeric" data-count="${r.id}" value="${S.counts[r.id]??''}" placeholder="${r.q??0}" aria-label="New stock count for ${esc(r.p.sku)} at ${r.w?esc(r.w.name):'—'}"/><button class="btn xs" data-cmd="post-count" data-id="${r.id}" ${S.counts[r.id]==null?'disabled':''}>Post</button></div><div data-var="${r.id}">${varHTML(r)}</div>` : '<span class="faint">—</span>'},
      {k:'mfr', t:'Manufacturer', type:'text', get:r=>mfr(r.p.mfr).name, r:r=>`${esc(mfr(r.p.mfr).name)}<div class="muted" style="font-size:11.5px">${mfr(r.p.mfr).lead}-day lead</div>`},
      {k:'po', t:'Order ID', type:'text', get:r=>r.p.po?.id||'', r:r=> r.p.po ? `<button class="link mono" data-cmd="open-po" data-id="${r.p.id}">${r.p.po.id}</button>` : reorderNeeded(r.p) ? `<button class="btn xs" data-cmd="create-po" data-id="${r.p.id}">${ic('add')}Create PO</button>` : '<span class="faint">—</span>'},
      {k:'qty', t:'Stock Quantity', type:'num', get:r=>onHand(r.p), r:r=> isStocked(r.p) ? `<span class="num">${num(onHand(r.p))}</span><div class="muted" style="font-size:11.5px">all warehouses</div>` : '<span class="faint">—</span>'},
      {k:'min', t:'Reorder Level', type:'num', get:r=>r.p.min, r:r=>num(r.p.min)},
      {k:'need', t:'Reorder Needed', type:'text', get:r=>reorderNeeded(r.p)?'Yes':'No', r:r=> reorderNeeded(r.p) ? `${pill('Yes','amber')}${!r.p.po?`<div class="stitch-hint" title="Stitch: covers lead time + 3 weeks">${ic('auto_awesome')}Order ${num(suggestQty(r.p))}</div>`:''}` : `<span class="muted">${isStocked(r.p)?'No':'—'}</span>`},
      {k:'checked', t:'Stock Check Date', type:'date', get:r=>r.p.lastCount||'', r:r=>`<span class="${countOverdue(r.p)?'var-neg':''}" style="white-space:nowrap">${fmtD(r.p.lastCount)}</span>`},
      {k:'price', t:'Unit Price', type:'money', get:r=>r.p.price, r:r=>money(r.p.price)},
      {k:'ivalue', t:'Inventory Value', type:'money', agg:'sum', get:r=>r.q==null?null:r.q*r.p.price, r:r=> r.q==null?'<span class="faint">—</span>':money(r.q*r.p.price)},
      {k:'pos', t:'Order Status', type:'text', get:r=>r.p.po?.status||'', r:r=> r.p.po ? pill(r.p.po.status, PO_C[r.p.po.status]) : '<span class="faint">—</span>'},
      {k:'updated', t:'Last Updated', type:'date', get:r=>r.p.updated, r:r=>`<span style="white-space:nowrap">${fmtD(r.p.updated)}</span>`},
      {k:'email', t:'Email', type:'text', get:r=>mfr(r.p.mfr).email, r:r=>`<button class="link" style="white-space:nowrap" data-cmd="email" data-id="${r.p.id}">${esc(mfr(r.p.mfr).email)}</button>`}
    ],
    open:r=>openProduct(r.p.id),
    bulk:[['b-update','swap_vert','Update Stock'],['b-post','task_alt','Post counts'],['b-po','shopping_cart','Create POs'],['b-email','mail','Email manufacturers']],
    primary:`<button class="btn primary" data-cmd="new-stock-update">${ic('add')}Update Stock</button>`
  },
  products:{
    title:'Product Catalog', icon:'category', noun:'products', product:true,
    sub:'One row per product.',
    rows:()=>PRODUCTS.filter(p=>matches(p)).map(p=>({id:p.id, p})),
    cols:[
      {k:'name', t:'Product Name', type:'text', get:r=>r.p.name, r:r=>`<button class="link-strong" data-cmd="open-product" data-id="${r.p.id}">${esc(r.p.name)}</button><div style="margin-top:4px">${labelTag(r.p)}</div>`},
      {k:'category', t:'Product Category', type:'text', get:r=>r.p.category, r:r=>esc(r.p.category)},
      {k:'status', t:'Stock Status', type:'text', get:r=>stockStatus(r.p).t, r:r=>{const s=stockStatus(r.p); return pill(s.t,s.c);}},
      {k:'qty', t:'Current Quantity', type:'num', agg:'sum', get:r=>onHand(r.p), r:r=> isStocked(r.p) ? num(onHand(r.p)) : `<span class="muted">${r.p.ftype==='POD'?'On demand':num(r.p.supplierQty)+' at supplier'}</span>`},
      {k:'min', t:'Minimum Level', type:'num', get:r=>r.p.min, r:r=>r.p.min?num(r.p.min):'<span class="faint">—</span>'},
      {k:'img', t:'Image of Product', type:'img', r:r=>`<button class="imgbtn" data-cmd="open-product" data-id="${r.p.id}" aria-label="Open ${esc(r.p.name)}">${thumb(r.p)}</button>`},
      {k:'sku', t:'SKU', type:'text', get:r=>r.p.sku, r:r=>`<span class="mono" style="white-space:nowrap">${esc(r.p.sku)}</span>`},
      {k:'desc', t:'Description', type:'text', get:r=>r.p.desc, r:r=>`<span class="muted clamp2">${esc(r.p.desc)}</span>`},
      {k:'added', t:'First Day Added', type:'date', get:r=>r.p.added, r:r=>`<span style="white-space:nowrap">${fmtD(r.p.added)}</span>`},
      {k:'vol', t:'Product Volume', type:'num', unit:' ft³', get:r=>r.p.vol, r:r=>`${r.p.vol} ft³`},
      {k:'price', t:'Price per Unit', type:'money', get:r=>r.p.price, r:r=>money(r.p.price)},
      {k:'value', t:'Stock Value', type:'money', agg:'sum', get:r=>isStocked(r.p)?stockValue(r.p):null, r:r=>isStocked(r.p)?money(stockValue(r.p)):'<span class="faint">—</span>'},
      {k:'tx', t:'Transaction', type:'text', get:r=>lastTx(r.p)?.date||'', r:r=>txCell(r.p)},
      {k:'channels', t:'Distribution Channel', type:'text', get:r=>r.p.channels.join(', '), r:r=>chanCell(r.p)},
      {k:'levels', t:'Stock Levels', type:'num', get:r=>isStocked(r.p)?onHand(r.p)/Math.max(1,r.p.min):null, r:r=>lvl(r.p)}
    ],
    open:r=>openProduct(r.p.id),
    bulk:[['b-channel','hub','Add distribution channel'],['b-update','swap_vert','Update Stock'],['b-export','download','Export']],
    primary:`<button class="btn primary" data-cmd="new-product">${ic('add')}New Product</button>`
  },
  updates:{
    title:'Stock Updates', icon:'swap_vert', noun:'stock updates',
    sub:'One row per activity. Every number in Inventory Management traces back to a row here.',
    rows:()=>STOCK_UPDATES.map(u=>({id:u.id, u, p:prod(u.pid)})),
    cols:[
      {k:'activity', t:'Activity', type:'text', get:r=>r.u.type, r:r=>`<span class="act">${ic(TX_ICON[r.u.type])}${r.u.type}</span><div class="muted mono" style="font-size:11.5px">${esc(r.p.sku)} · ${r.u.loc}</div>`},
      {k:'auto', t:'Auto Number', type:'num', get:r=>r.u.auto, r:r=>`<span class="muted">${r.u.auto}</span>`},
      {k:'report', t:'Create Action Reports', type:'action', get:r=>repOf(r.u)?.id||'', r:r=>{ const rp = repOf(r.u); return rp ? `<button class="link mono" data-cmd="open-report" data-id="${rp.id}">${rp.id}</button>` : `<button class="btn xs" data-cmd="report-one" data-id="${r.u.id}">${ic('summarize')}Create</button>`; }},
      {k:'owner', t:'Action Owner', type:'text', get:r=>r.u.owner, r:r=>`<span style="white-space:nowrap">${esc(r.u.owner)}</span>`},
      {k:'date', t:'Transaction Date', type:'date', get:r=>r.u.date, r:r=>`<span style="white-space:nowrap">${fmtD(r.u.date)}</span>`},
      {k:'id', t:'Stock Update ID', type:'text', get:r=>r.u.id, r:r=>`<button class="link mono" data-cmd="open-update" data-id="${r.u.id}">${r.u.id}</button>`},
      {k:'new', t:'New Stock', type:'num', agg:'sum', get:r=>['Receive','Produce'].includes(r.u.type)?r.u.qty:null, r:r=>['Receive','Produce'].includes(r.u.type)?'+'+r.u.qty:'<span class="faint">—</span>'},
      {k:'usable', t:'Usable Return', type:'num', agg:'sum', get:r=>r.u.type==='Return'?r.u.usable:null, r:r=>r.u.type==='Return'?r.u.usable:'<span class="faint">—</span>'},
      {k:'unusable', t:'Unusable Return', type:'num', agg:'sum', get:r=>r.u.type==='Return'?r.u.unusable:null, r:r=>r.u.type==='Return'?r.u.unusable:'<span class="faint">—</span>'},
      {k:'qty', t:'Quantity', type:'num', agg:'sum', get:r=>r.u.qty, r:r=>`<span class="${r.u.qty<0?'var-neg':''}">${r.u.qty>0?'+':''}${r.u.qty}</span>`},
      {k:'cost', t:'Unit Cost ($)', type:'money', get:r=>r.u.unitCost, r:r=>money(r.u.unitCost)},
      {k:'serials', t:'Serial Numbers', type:'text', get:r=>r.u.serials, r:r=> r.u.serials ? `<div class="serials">${r.u.serials.split(',').slice(0,3).map(s=>`<span class="tag mono">${esc(s.trim())}</span>`).join('')}${r.u.serials.split(',').length>3?`<span class="tag">+${r.u.serials.split(',').length-3}</span>`:''}</div>` : '<span class="faint">—</span>'},
      {k:'comments', t:'Comments', type:'text', get:r=>r.u.comments, r:r=>`<span class="muted clamp2">${esc(r.u.comments)}</span>`}
    ],
    open:r=>openUpdate(r.u.id),
    bulk:[['b-report','summarize','Create Action Reports'],['b-export','download','Export']],
    primary:`<button class="btn primary" data-cmd="new-stock-update">${ic('add')}New Stock Update</button>`
  },
  warehouse:{
    title:'Warehouse Management', icon:'shelves', noun:'shelves',
    sub:'One row per shelf.',
    rows:()=>allShelves().map(s=>({id:s.id, s})),
    cols:[
      {k:'loc', t:'Location', type:'text', get:r=>r.s.w.name, r:r=>`<button class="link" data-cmd="g-filter" data-k="loc" data-v="${esc(r.s.w.name)}">${esc(r.s.w.name)}</button><div class="muted" style="font-size:11.5px">${esc(r.s.w.city)}</div>`},
      {k:'aisle', t:'Aisle', type:'text', get:r=>r.s.w.kind==='3PL'?'Zone':r.s.a, r:r=>r.s.w.kind==='3PL'?'<span class="muted">Zone</span>':r.s.a},
      {k:'shelf', t:'Shelf', type:'text', get:r=>r.s.id, r:r=>`<span class="mono strong">${r.s.id}</span>${r.s.note?`<div class="muted" style="font-size:11.5px">${esc(r.s.note)}</div>`:''}`},
      {k:'3pl', t:'3PL', type:'text', get:r=>r.s.w.kind==='3PL'?r.s.w.name.split('·').pop().trim():'', r:r=>r.s.w.kind==='3PL'?pill(r.s.w.name.split('·').pop().trim(),'blue',false):'<span class="faint">—</span>'},
      {k:'status', t:'Capacity Status', type:'text', get:r=>SH_STATUS[r.s.status][0], r:r=>pill(...SH_STATUS[r.s.status])},
      {k:'cap', t:'Shelf Capacity', type:'num', agg:'sum', unit:' ft³', get:r=>r.s.cap, r:r=>`${num(r.s.cap,1)} ft³`},
      {k:'min', t:'Minimum Level', type:'num', get:r=>r.s.min, r:r=>`${r.s.min} units`},
      {k:'used', t:'Used Space', type:'num', agg:'sum', unit:' ft³', get:r=>+r.s.used.toFixed(2), r:r=>`<div class="usedcell"><div class="bar ${r.s.status==='full'?'red':r.s.status==='near'?'amber':'green'}"><i style="width:${Math.min(100,r.s.pct*100)}%"></i></div>${num(r.s.used,1)} ft³</div>`},
      {k:'avail', t:'Available Space', type:'num', agg:'sum', unit:' ft³', get:r=>+r.s.avail.toFixed(2), r:r=>`${num(r.s.avail,1)} ft³`},
      {k:'products', t:'Products', type:'text', get:r=>r.s.items.map(x=>x.p.sku).join(', '), r:r=> r.s.items.length ? `<div class="serials">${r.s.items.slice(0,2).map(x=>`<button class="tag mono" data-cmd="open-product" data-id="${x.p.id}">${esc(x.p.sku)} · ${x.q}</button>`).join('')}${r.s.items.length>2?`<span class="tag">+${r.s.items.length-2}</span>`:''}</div>` : '<span class="faint">Empty</span>'},
      {k:'ship', t:'Shipping Management', type:'action', get:r=>SHIPMENTS.filter(x=>x.wh===r.s.w.id && !['Delivered','Received'].includes(x.status)).length, r:r=>{ const n = SHIPMENTS.filter(x=>x.wh===r.s.w.id && !['Delivered','Received'].includes(x.status)).length; return `<button class="btn xs" data-cmd="ship-for" data-id="${r.s.w.id}" data-shelf="${r.s.id}">${ic('local_shipping')}${n} open</button>`; }}
    ],
    open:r=>shelfDrawer(r.s.id),
    bulk:[['b-move','drive_file_move','Move stock'],['b-count','fact_check','Count these shelves'],['b-export','download','Export']],
    primary:`<button class="btn primary" data-cmd="add-shelf">${ic('add')}Add shelf</button>`
  }
};
function repOf(u){ return REPORTS.find(r=>r.updates.includes(u.id)); }
const TBL_OF = { workbench:()=>S.view==='catalog'?'products':'inventory', updates:()=>'updates', warehouse:()=>'warehouse' };
function curTable(){ const f = TBL_OF[S.route]; return f ? f() : null; }

/* Column filters (any column, added on demand) */
function cfPass(r, c, f){
  const v = c.get ? c.get(r) : null; const s = String(v??'').toLowerCase(); const x = String(f.v??'').toLowerCase();
  switch(f.op){
    case 'contains': return s.includes(x);
    case 'is': return s===x;
    case 'starts': return s.startsWith(x);
    case 'empty': return v==null || v==='';
    case 'notempty': return !(v==null || v==='');
    case 'gt': return v!=null && +v > +f.v;
    case 'lt': return v!=null && +v < +f.v;
    case 'eq': return v!=null && +v === +f.v;
    case 'before': return v && v < f.v;
    case 'after': return v && v > f.v;
  } return true;
}
function gRows(key){
  const T = TABLES[key], st = gs(key);
  let rows = T.rows();
  if(st.q){ const q = st.q.toLowerCase(); rows = rows.filter(r=>colsOf(key).some(c=>c.get && String(c.get(r)??'').toLowerCase().includes(q))); }
  st.cf.forEach(f=>{ const c = colsOf(key).find(x=>x.k===f.k); if(c) rows = rows.filter(r=>cfPass(r,c,f)); });
  if(st.sort.k){ const c = colsOf(key).find(x=>x.k===st.sort.k); if(c&&c.get) rows = [...rows].sort((a,b)=>{ let x=c.get(a), y=c.get(b); if(x==null||x==='') return 1; if(y==null||y==='') return -1; return (x>y?1:x<y?-1:0)*st.sort.dir; }); }
  return rows;
}
const OPS = { text:[['contains','contains'],['is','is'],['starts','starts with'],['empty','is empty'],['notempty','is not empty']], num:[['gt','>'],['lt','<'],['eq','='],['empty','is empty'],['notempty','is not empty']], money:[['gt','>'],['lt','<'],['eq','=']], date:[['before','before'],['after','after'],['empty','is empty']] };
const OP_T = Object.fromEntries(Object.values(OPS).flat());

function pTable(key){
  const T = TABLES[key], st = gs(key);
  crumbs([T.title]);
  $('#page').classList.add('page-grid');
  $('#page').innerHTML = `<div class="page-inner tbl-page">
    <div class="ph"><div><h1>${T.title}</h1><p>${T.sub}</p></div><div class="ph-actions">${key==='warehouse'?`<div class="seg"><button class="${S.whLayout!=='map'?'on':''}" data-cmd="wh-layout" data-l="table">${ic('table_rows')}Table</button><button class="${S.whLayout==='map'?'on':''}" data-cmd="wh-layout" data-l="map">${ic('grid_view')}Floor map</button></div>`:''}${T.primary}</div></div>
    <div class="tbl-card ${S.dense?'dense':''}">
      <div class="toolbar">
        <div class="search">${ic('search')}<input id="gSearch" placeholder="Search ${T.noun}" value="${esc(st.q)}" autocomplete="off"/></div>
        <button class="btn sm" data-cmd="g-filter-menu" data-t="${key}">${ic('filter_list')}Filter</button>
        <button class="btn sm ghost" data-cmd="g-cols" data-t="${key}">${ic('view_column')}Columns</button>
        <div class="search sq">${ic('auto_awesome')}<input id="wbAsk" placeholder="Ask Stitch — “low stock in aisle C”" autocomplete="off"/></div>
        <div class="tb-right"><span class="rowcount" id="rowCount"></span>
          <button class="icon-btn" data-cmd="g-export" data-t="${key}" title="Export CSV">${ic('download')}</button>
          <button class="icon-btn" data-cmd="density" title="Density">${ic(S.dense?'density_medium':'density_small')}</button>
        </div>
      </div>
      <div class="chips-row" id="chips"></div>
      <div class="bulk" id="bulk"></div>
      <div id="tbl"></div>
    </div></div>`;
  const gsI = $('#gSearch'); gsI.addEventListener('input', e=>{ st.q = e.target.value; drawTable(); });
  const ask = $('#wbAsk'); ask.addEventListener('keydown', e=>{ if(e.key==='Enter' && ask.value.trim()){ applyInterpretation(interpret(ask.value)); ask.value=''; } });
  drawTable();
}
function drawChips(key){
  const T = TABLES[key], st = gs(key), f = S.f, out = [];
  const add = (lbl, val, cmd, k, v) => out.push(`<span class="chip"><b>${lbl}</b>${esc(val)}<button data-cmd="${cmd}" data-key="${k||''}" data-val="${esc(v||'')}" aria-label="Remove filter">${ic('close')}</button></span>`);
  if(T.product){
    f.area.forEach(v=>add('Area', v, 'rm-facet', 'area', v));
    f.mfr.forEach(v=>add('Manufacturers', mfr(v).name, 'rm-facet', 'mfr', v));
    f.loc.forEach(v=>add('Locations', v==='M'?'Memphis 3PL':v==='E'?'Tupelo':'Aisle '+v, 'rm-facet', 'loc', v));
    if(f.name) add('Name', `contains “${f.name}”`, 'rm-x', 'name');
    if(f.sku) add('SKU', `starts with ${f.sku}`, 'rm-x', 'sku');
    f.ftype.forEach(v=>add('Labels', FT_LABEL[v], 'rm-facet', 'ftype', v));
    f.labels.forEach(v=>add('Labels', v, 'rm-facet', 'labels', v));
    f.channel.forEach(v=>add('Distribution Channel', v, 'rm-facet', 'channel', v));
    if(f.wh) add('Inventory Warehouse', WAREHOUSES.find(w=>w.id===f.wh).name, 'rm-x', 'wh');
    if(f.shelf) add('Shelf', f.shelf, 'rm-x', 'shelf');
    if(f.kpi) add('Show', {instock:'In stock', low:'Low or out', out:'Out of stock', reorder:'Reorder needed', overdue:'Stock check overdue', 'open-po':'Open order', stocked:'Stocked items'}[f.kpi], 'rm-x', 'kpi');
    if(f.priceMin!=null) add('Unit Price', '≥ '+money(f.priceMin,0), 'rm-x', 'priceMin');
    if(f.priceMax!=null) add('Unit Price', '≤ '+money(f.priceMax,0), 'rm-x', 'priceMax');
    if(f.qtyMax!=null) add('Quantity', '< '+f.qtyMax, 'rm-x', 'qtyMax');
  }
  st.cf.forEach((c,i)=>{ const col = colsOf(key).find(x=>x.k===c.k); if(!col) return; add(col.t, `${OP_T[c.op]}${['empty','notempty'].includes(c.op)?'':' '+c.v}`, 'g-rm-cf', key, String(i)); });
  if(out.length) out.push(`<button class="btn xs ghost" data-cmd="g-clear" data-t="${key}">Clear all</button>`);
  const el = $('#chips'); el.innerHTML = out.join(''); el.classList.toggle('show', out.length>0);
}
function drawTable(){
  const key = curTable(); if(!key || !$('#tbl')) return;
  if(key==='warehouse' && S.whLayout==='map'){ drawChips(key); $('#rowCount').textContent=''; $('#bulk').classList.remove('show'); $('#tbl').innerHTML = whMapHTML(); return; }
  const T = TABLES[key], st = gs(key);
  const rows = gRows(key); const cols = colsOf(key).filter(c=>!st.hidden.has(c.k));
  const total = T.rows().length;
  $('#rowCount').textContent = `${rows.length} ${T.noun}`;
  drawChips(key);
  [...st.sel].forEach(id=>{ if(!rows.find(r=>r.id===id)) st.sel.delete(id); });
  const b = $('#bulk'); b.classList.toggle('show', st.sel.size>0);
  b.innerHTML = st.sel.size ? `<span class="bc">${st.sel.size} selected</span>${T.bulk.map(a=>`<button class="btn sm" data-cmd="g-bulk" data-t="${key}" data-a="${a[0]}">${ic(a[1])}${a[2]}</button>`).join('')}<button class="icon-btn" data-cmd="g-clear-sel" data-t="${key}" aria-label="Clear selection">${ic('close')}</button>` : '';
  if(!rows.length){ $('#tbl').innerHTML = `<div class="empty">${ic('filter_alt_off')}No ${T.noun} match.<div style="margin-top:12px"><button class="btn sm" data-cmd="g-clear" data-t="${key}">Clear filters</button></div></div>`; return; }
  const allSel = rows.every(r=>st.sel.has(r.id));
  const isR = c => ['num','money'].includes(c.type);
  const aggs = cols.map(c=>{ if(c.agg!=='sum') return ''; const s = rows.reduce((a,r)=>a+(+c.get(r)||0),0); return c.type==='money'?money(s,0):num(s, c.unit?1:0)+(c.unit||''); });
  $('#tbl').innerHTML = `<div class="tbl-scroll"><table class="t grid-t"><thead><tr><th class="w-cb"><input type="checkbox" class="cbx" data-cmd="g-sel-all" data-t="${key}" ${allSel?'checked':''} aria-label="Select all"/></th>${cols.map((c,i)=>`<th class="${isR(c)?'r':''} ${i===0?'sticky1':''} ${c.custom?'is-custom':''}" draggable="true" data-col="${c.k}" data-t="${key}" ${st.widths[c.k]?`style="width:${st.widths[c.k]}px;min-width:${st.widths[c.k]}px;max-width:${st.widths[c.k]}px"`:''}><button class="th-btn" data-cmd="g-col-menu" data-t="${key}" data-k="${c.k}" title="${esc(c.t)} — click for options, drag to move">${c.custom?ic(CTYPES.find(t=>t[0]===c.ctype)[2]):''}<span class="th-t">${esc(c.t)}</span>${st.sort.k===c.k?ic(st.sort.dir>0?'arrow_upward':'arrow_downward'):''}${st.cf.some(f=>f.k===c.k)?ic('filter_alt'):''}<span class="th-caret">${ic('expand_more')}</span></button><span class="rs" data-rs="${c.k}" aria-hidden="true"></span></th>`).join('')}<th class="add-col"><button class="th-add" data-cmd="g-add-col" data-t="${key}" title="Add a column" aria-label="Add a column">${ic('add')}</button></th></tr></thead>
    <tbody>${rows.map(r=>`<tr class="click ${st.sel.has(r.id)?'sel':''}" data-grow="${r.id}" data-t="${key}"><td class="w-cb"><input type="checkbox" class="cbx" data-cmd="g-sel" data-t="${key}" data-id="${r.id}" ${st.sel.has(r.id)?'checked':''} aria-label="Select row"/></td>${cols.map((c,i)=>`<td class="${isR(c)?'r num':''} ${i===0?'sticky1':''} ${st.widths[c.k]?'fixw':''}" ${st.widths[c.k]?`style="max-width:${st.widths[c.k]}px"`:''}>${c.r(r)}</td>`).join('')}<td class="add-col"></td></tr>`).join('')}</tbody>
    ${aggs.some(Boolean)?`<tfoot><tr><td class="w-cb"></td>${aggs.map((a,i)=>`<td class="${isR(cols[i])?'r num':''} ${i===0?'sticky1':''}">${a?`<span class="agg-l">Sum</span> ${a}`:i===0?`<span class="agg-l">${rows.length} of ${total}</span>`:''}</td>`).join('')}<td class="add-col"></td></tr></tfoot>`:''}
  </table></div>`;
}
function filterMenu(anchor, key){
  const T = TABLES[key];
  const base = T.product ? [['area','Area'],['mfr','Manufacturers'],['loc','Locations (in-stock)'],['name','Search by Name (any part)'],['sku','Search by SKU (starts with)'],['ftype','Labels']] : [];
  openMenu(anchor, `${base.length?`<div class="mh2">Filter by</div>${base.map(b=>`<button class="mi" data-cmd="g-pf" data-f="${b[0]}">${b[1]}</button>`).join('')}<div class="msep"></div>`:''}<div class="mh2">Any column</div><div class="mscroll">${colsOf(key).filter(c=>c.get).map(c=>`<button class="mi" data-cmd="g-cf-new" data-t="${key}" data-k="${c.k}">${esc(c.t)}</button>`).join('')}</div>`);
}
function pfMenu(anchor, f){
  const opts = {
    area:[...new Set(PRODUCTS.map(p=>p.area))].map(a=>[a,a]),
    mfr:MANUFACTURERS.map(m=>[m.id,m.name]),
    loc:WAREHOUSES.flatMap(w=>w.aisles.map(a=>[a, w.kind==='3PL'?w.name:w.aisles.length>1?`${w.name} · Aisle ${a}`:w.name])),
    ftype:LABEL_OPTS.map(t=>[t,FT_LABEL[t]])
  }[f];
  const ttl = {area:'Area',mfr:'Manufacturers',loc:'Locations (in-stock)',name:'Search by Name (any part)',sku:'Search by SKU (starts with)',ftype:'Labels'}[f];
  if(!opts){ openMenu(anchor, `<div class="mh2">${ttl}</div><div style="padding:6px 8px 10px;display:flex;gap:6px"><input class="inp" id="pfIn" value="${esc(S.f[f])}" placeholder="${f==='sku'?'e.g. TEE-001':'e.g. candle'}" style="height:30px"/><button class="btn xs primary" data-cmd="g-pf-text" data-f="${f}">Apply</button></div>`); setTimeout(()=>{ const i=$('#pfIn'); i&&i.focus(); i&&i.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); CMD['g-pf-text']({dataset:{f}}); } }); },30); return; }
  const cnt = v => PRODUCTS.filter(p=>matches(p,f)).filter(p=> f==='area'?p.area===v : f==='mfr'?p.mfr===v : f==='ftype'?p.ftype===v : p.locs.some(l=>l.q>0&&aisleOf(l.s)===v)).length;
  openMenu(anchor, `<div class="mh2">${ttl}</div><div class="mscroll">${opts.map(o=>`<button class="mi ${S.f[f].has(o[0])?'on':''}" data-cmd="g-pf-toggle" data-f="${f}" data-v="${esc(o[0])}"><span class="cb"></span>${f==='ftype'?`<span class="lbl l-${FT_CLS[o[0]]}">${esc(o[1])}</span>`:esc(o[1])}<span class="k">${cnt(o[0])}</span></button>`).join('')}</div>`);
}
function cfMenu(anchor, key, k){
  const c = colsOf(key).find(x=>x.k===k); const ops = OPS[c.type] || OPS.text;
  openMenu(anchor, `<div class="mh2">${esc(c.t)}</div><div style="padding:4px 8px 10px;display:grid;gap:6px;min-width:240px"><select class="inp" id="cfOp" style="height:30px">${ops.map(o=>`<option value="${o[0]}">${o[1]}</option>`).join('')}</select><input class="inp" id="cfV" type="${c.type==='date'?'date':['num','money'].includes(c.type)?'number':'text'}" placeholder="Value" style="height:30px"/><button class="btn xs primary" data-cmd="g-cf-add" data-t="${key}" data-k="${k}">Add filter</button></div>`);
  setTimeout(()=>{ const v=$('#cfV'); v&&v.focus(); v&&v.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); CMD['g-cf-add']({dataset:{t:key,k}}); } }); },30);
}
function colMenu(anchor, key, k){
  const cs = colsOf(key), st = gs(key); const idx = cs.findIndex(x=>x.k===k); const c = cs[idx];
  openMenu(anchor, `<div class="mh2">${esc(c.t)}${c.custom?` · ${CT_NAME[c.ctype]}`:''}</div>
    ${c.get?`<button class="mi" data-cmd="g-sort" data-t="${key}" data-k="${k}" data-d="1">${ic('arrow_upward')}Sort ascending</button><button class="mi" data-cmd="g-sort" data-t="${key}" data-k="${k}" data-d="-1">${ic('arrow_downward')}Sort descending</button><button class="mi" data-cmd="g-cf-new" data-t="${key}" data-k="${k}">${ic('filter_list')}Filter this column</button><div class="msep"></div>`:''}
    <button class="mi" data-cmd="g-rename" data-t="${key}" data-k="${k}">${ic('edit')}Rename column</button>
    <button class="mi" data-cmd="g-move" data-t="${key}" data-k="${k}" data-d="-1" ${idx===0?'disabled':''}>${ic('arrow_back')}Move left</button>
    <button class="mi" data-cmd="g-move" data-t="${key}" data-k="${k}" data-d="1" ${idx===cs.length-1?'disabled':''}>${ic('arrow_forward')}Move right</button>
    <button class="mi" data-cmd="g-add-col" data-t="${key}" data-at="${k}" data-side="left">${ic('add')}Insert column left</button>
    <button class="mi" data-cmd="g-add-col" data-t="${key}" data-at="${k}" data-side="right">${ic('add')}Insert column right</button>
    ${st.widths[k]?`<button class="mi" data-cmd="g-autofit" data-t="${key}" data-k="${k}">${ic('fit_width')}Reset width</button>`:''}
    <div class="msep"></div>
    <button class="mi" data-cmd="g-hide" data-t="${key}" data-k="${k}">${ic('visibility_off')}Hide column</button>
    ${c.custom?`<button class="mi danger" data-cmd="g-del-col" data-t="${key}" data-k="${k}">${ic('delete')}Delete column</button>`:''}`);
}
function addColMenu(anchor, key, at, side){
  openMenu(anchor, `<div class="mh2">New column</div><div style="padding:4px 8px 6px;display:grid;gap:8px;min-width:240px"><input class="inp" id="ncName" placeholder="Column name" style="height:32px" autocomplete="off"/></div>
    <div class="mh2">Type</div><div class="ctype-grid">${CTYPES.map((t,i)=>`<label class="ctype"><input type="radio" name="ncType" value="${t[0]}" ${i===0?'checked':''}/>${ic(t[2])}${t[1]}</label>`).join('')}</div>
    <div style="padding:8px"><button class="btn sm primary" style="width:100%;justify-content:center" data-cmd="g-add-col-go" data-t="${key}" data-at="${at||''}" data-side="${side||''}">Add column</button></div>`);
  setTimeout(()=>{ const i=$('#ncName'); if(i){ i.focus(); i.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); CMD['g-add-col-go']({dataset:{t:key, at:at||'', side:side||''}}); } }); } },30);
}
function renameMenu(anchor, key, k){
  const c = colsOf(key).find(x=>x.k===k);
  openMenu(anchor, `<div class="mh2">Rename column</div><div style="padding:4px 8px 10px;display:grid;gap:6px;min-width:240px"><input class="inp" id="rnIn" value="${esc(c.t)}" style="height:32px"/>${c.orig?`<div class="muted" style="font-size:11.5px">Field: ${esc(c.orig)}</div>`:''}<button class="btn xs primary" data-cmd="g-rename-go" data-t="${key}" data-k="${k}">Save</button></div>`);
  setTimeout(()=>{ const i=$('#rnIn'); if(i){ i.focus(); i.select(); i.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); CMD['g-rename-go']({dataset:{t:key,k}}); } }); } },30);
}
function ccEdit(el){
  const key = el.dataset.t, k = el.dataset.k, id = el.dataset.id; const cc = gs(key).custom.find(x=>x.k===k); if(!cc) return;
  const v = cc.vals[id] ?? '';
  if(cc.type==='select'){
    openMenu(el, `<div class="mh2">${esc(cc.t)}</div><div class="mscroll">${(cc.opts||[]).map(o=>`<button class="mi ${o===v?'on':''}" data-cmd="g-cc-set" data-t="${key}" data-k="${k}" data-id="${esc(id)}" data-v="${esc(o)}"><span class="opt-pill">${esc(o)}</span></button>`).join('')}${v?`<button class="mi" data-cmd="g-cc-set" data-t="${key}" data-k="${k}" data-id="${esc(id)}" data-v="">${ic('close')}Clear</button>`:''}</div><div class="msep"></div><div style="padding:6px 8px 8px;display:flex;gap:6px"><input class="inp" id="optIn" placeholder="New option" style="height:30px"/><button class="btn xs" data-cmd="g-cc-opt" data-t="${key}" data-k="${k}" data-id="${esc(id)}">Add</button></div>`);
    setTimeout(()=>{ const i=$('#optIn'); i&&i.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); CMD['g-cc-opt']({dataset:{t:key,k,id}}); } }); },30);
    return;
  }
  const td = el.closest('td'); const type = cc.type==='date'?'date':['num','money'].includes(cc.type)?'number':'text';
  td.innerHTML = `<input class="inp cc-in" type="${type}" value="${esc(v)}" ${type==='number'?'step="any"':''}/>`;
  const inp = td.querySelector('input'); inp.focus(); inp.select && type==='text' && inp.select();
  let done = false;
  const commit = save => { if(done) return; done = true; if(save){ const nv = inp.value; if(nv===''){ delete cc.vals[id]; } else cc.vals[id] = type==='number' ? +nv : nv; saveGrid(); } drawTable(); };
  inp.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); commit(true); } if(e.key==='Escape'){ e.stopPropagation(); commit(false); } });
  inp.addEventListener('blur', ()=>commit(true));
  inp.addEventListener('click', e=>e.stopPropagation());
}
function colsMenu(anchor, key){
  const T = TABLES[key], st = gs(key);
  openMenu(anchor, `<div class="mh2">Columns · drag headers to reorder</div><div class="mscroll">${colsOf(key).map(c=>`<button class="mi ${st.hidden.has(c.k)?'':'on'}" data-cmd="g-toggle-col" data-t="${key}" data-k="${c.k}"><span class="cb"></span>${esc(c.t)}</button>`).join('')}</div><div class="msep"></div><button class="mi" data-cmd="g-show-all" data-t="${key}">${ic('visibility')}Show all</button><button class="mi" data-cmd="g-add-col" data-t="${key}">${ic('add')}Add a column</button><button class="mi" data-cmd="g-reset-cols" data-t="${key}">${ic('restart_alt')}Reset to field list</button>`);
}
function shelfDrawer(id){
  const s = shelfInfo(id);
  openDrawer(`<div class="dh"><div class="li-ic">${ic('shelves')}</div><div><div class="dh-t">Shelf ${s.id}</div><div class="dh-s">${esc(s.w.name)} · ${s.w.kind==='3PL'?'Zone':'Aisle '+s.a} · ${SH_STATUS[s.status][0]}</div></div><div class="dh-x"><button class="icon-btn" data-cmd="close-drawer" aria-label="Close">${ic('close')}</button></div></div>
    <div class="db" id="shelfPanel">${shelfPanel(s)}</div>`);
}
function whMapHTML(){
  const shelves = allShelves(); const w = WAREHOUSES.find(x=>x.id===S.wh) || WAREHOUSES[0];
  return `<div class="map-wrap"><div class="wh-pick">${WAREHOUSES.map(x=>`<button class="btn sm ${x.id===w.id?'on-tint':''}" data-cmd="wh-pick" data-id="${x.id}">${esc(x.name)}</button>`).join('')}</div>
    <div class="map">${w.aisles.map(a=>`<div class="aisle"><div class="aisle-l">${w.kind==='3PL'?'Zones':'Aisle '+a}</div><div class="shelves" style="grid-template-columns:repeat(${w.shelvesPerAisle},minmax(0,1fr))">${shelves.filter(s=>s.w===w && s.a===a).map(s=>`<button class="shelf st-${s.status}" data-cmd="shelf-drawer" data-id="${s.id}"><div class="sid">${s.id}</div><div class="sp">${s.items.length} SKU · ${Math.round(s.pct*100)}%</div><div class="fill" style="width:${Math.min(100,s.pct*100)}%"></div></button>`).join('')}</div></div>`).join('')}</div></div>`;
}

function pWorkbench(){ pTable(curTable()); }
function updateWB(){ drawTable(); }
function renderTable(){ drawTable(); }
function viewRows(){ const k = curTable(); return k ? gRows(k).map(r=>r.p).filter(Boolean) : []; }
function colsFor(){ return []; }
function varianceCell(){ return ''; }

/* ============ PRODUCT DRAWER ============ */
function openProduct(id, tab='overview', edit=false){
  const p = prod(id); if(!p) return;
  const s = stockStatus(p);
  const tabs = [['overview','Overview'],['stock','Stock Levels'],['tx','Transaction'],['channels','Distribution Channel']];
  if(S.mode==='expert') tabs.push(['json','Record']);
  openDrawer(`<div class="dh">${thumb(p,'lg')}<div style="min-width:0"><div class="dh-t">${esc(p.name)}</div><div class="dh-s"><span class="mono">${esc(p.sku)}</span> · ${ftype(p)} · ${pill(s.t,s.c)}</div></div><div class="dh-x"><button class="icon-btn" data-cmd="row-menu" data-id="${p.id}" aria-label="More">${ic('more_horiz')}</button><button class="icon-btn" data-cmd="close-drawer" aria-label="Close">${ic('close')}</button></div></div>
    <div class="dtabs">${tabs.map(t=>`<button class="${t[0]===tab?'on':''}" data-cmd="ptab" data-id="${p.id}" data-tab="${t[0]}">${t[1]}</button>`).join('')}</div>
    <div class="db" id="pBody">${productTab(p, tab, edit)}</div>
    <div class="df">${edit?`<button class="btn" data-cmd="ptab" data-id="${p.id}" data-tab="overview">Cancel</button><span class="sp"></span><button class="btn primary" data-cmd="save-product" data-id="${p.id}">Save changes</button>`:`<button class="btn" data-cmd="edit-product" data-id="${p.id}">${ic('edit')}Edit</button>${isStocked(p)?`<button class="btn" data-cmd="open-move" data-id="${p.id}">${ic('drive_file_move')}Move</button>`:''}<span class="sp"></span>${isStocked(p)?`<button class="btn primary" data-cmd="new-stock-update" data-id="${p.id}">${ic('add')}Update stock</button>`:`<button class="btn primary" data-cmd="toggle-pub" data-id="${p.id}">${p.status==='Published'?'Unpublish':'Publish'}</button>`}`}</div>`);
}
function productTab(p, tab, edit){
  if(tab==='overview' && edit){
    return `<div class="fields">
      <div class="fld full"><label>Product name</label><input class="inp" id="eName" value="${esc(p.name)}"/></div>
      <div class="fld"><label>SKU</label><input class="inp mono" id="eSku" value="${esc(p.sku)}"/></div>
      <div class="fld"><label>Product category</label><input class="inp" id="eCat" value="${esc(p.category)}"/></div>
      <div class="fld"><label>Price per unit ($)</label><input class="inp" type="number" step="0.01" id="ePrice" value="${p.price}"/></div>
      <div class="fld"><label>Unit cost ($)</label><input class="inp" type="number" step="0.01" id="eCost" value="${p.cost}"/></div>
      <div class="fld"><label>Minimum level</label><input class="inp" type="number" id="eMin" value="${p.min}"/><div class="help">Stitch suggests <button class="link" data-cmd="apply-min-inline" data-v="${suggestMin(p)}">${suggestMin(p)}</button> from ${p.vel}/day × ${mfr(p.mfr).lead + 5} days</div></div>
      <div class="fld"><label>Product volume (ft³ / unit)</label><input class="inp" type="number" step="0.001" id="eVol" value="${p.vol}"/></div>
      <div class="fld"><label>Manufacturer</label><select class="inp" id="eMfr">${MANUFACTURERS.map(m=>`<option value="${m.id}" ${m.id===p.mfr?'selected':''}>${m.name}</option>`).join('')}</select></div>
      <div class="fld"><label>Labels</label><select class="inp" id="eFt">${['POD','Dropship','Wholesale','In-House'].map(t=>`<option value="${t}" ${t===p.ftype?'selected':''}>${FT_LABEL[t]}</option>`).join('')}</select></div>
      <div class="fld full"><label style="display:flex;justify-content:space-between">Description <button class="link" data-cmd="ai-desc" data-id="${p.id}" style="color:var(--ai)">${ic('auto_awesome')} Write with Stitch</button></label><textarea class="inp" id="eDesc" rows="4">${esc(p.desc)}</textarea></div>

    </div>`;
  }
  if(tab==='overview'){
    const m = mfr(p.mfr); const lt = lastTx(p);
    return `<div class="hero"><div class="hero-img">${ic('image')}<img src="img/${p.img}.png" alt="${esc(p.name)}" onerror="this.remove()" style="position:absolute;inset:0"/></div><div style="min-width:0"><div class="chips">${labelTag(p)}</div><p>${esc(p.desc)}</p><div style="margin-top:10px;display:flex;gap:6px"><button class="btn xs ai-solid" data-cmd="ai-desc-view" data-id="${p.id}">${ic('auto_awesome')}Improve description</button></div></div></div>
      <div class="kv" style="margin-bottom:20px">
        <div><div class="k">Product category</div><div class="v">${esc(p.category)}</div></div>
        <div><div class="k">Area</div><div class="v">${esc(p.area)}</div></div>
        <div><div class="k">Manufacturer</div><div class="v">${esc(m.name)}</div></div>
        <div><div class="k">Current quantity</div><div class="v">${isStocked(p)?num(onHand(p)):p.ftype==='POD'?'On demand':num(p.supplierQty)+' at supplier'}</div></div>
        <div><div class="k">Minimum level</div><div class="v">${p.min||'—'}</div></div>
        <div><div class="k">Price per unit</div><div class="v">${money(p.price)}</div></div>
        <div><div class="k">Unit cost</div><div class="v">${money(p.cost)} <span class="muted" style="font-weight:400;font-size:12px">${Math.round((1-p.cost/p.price)*100)}% margin</span></div></div>
        <div><div class="k">Stock value</div><div class="v">${isStocked(p)?money(stockValue(p)):'—'}</div></div>
        <div><div class="k">Product volume</div><div class="v">${p.vol} ft³ <span class="muted" style="font-weight:400;font-size:12px">${isStocked(p)?'· '+num(stockVol(p),1)+' total':''}</span></div></div>
        <div><div class="k">First day added</div><div class="v">${fmtD(p.added)}</div></div>
        <div><div class="k">Stock check date</div><div class="v">${fmtD(p.lastCount)}</div></div>
        <div><div class="k">Last transaction</div><div class="v">${lt?`<button class="link" data-cmd="open-update" data-id="${lt.id}">${lt.type} ${lt.qty>0?'+':''}${lt.qty}</button>`:'—'}</div></div>
      </div>
      ${isStocked(p)&&p.min!==suggestMin(p)?`<div class="ai-box" style="margin-bottom:16px"><h4>${ic('auto_awesome')}Minimum level suggestion</h4><p>At ${p.vel} units/day and a ${m.lead}-day lead time from ${esc(m.name)}, a minimum of <b>${suggestMin(p)}</b> keeps 5 days of safety stock. Current: ${p.min}.</p><div style="margin-top:8px;display:flex;gap:6px"><button class="btn xs" data-cmd="apply-min" data-id="${p.id}">Apply ${suggestMin(p)}</button><button class="btn xs ghost" data-cmd="dismiss-ai">Dismiss</button></div></div>`:''}
      <div class="dsec"><div class="dsec-h"><h4>Distribution channels</h4><button class="btn xs ghost" data-cmd="ptab" data-id="${p.id}" data-tab="channels">Manage</button></div><div class="chips">${p.channels.map(c=>`<span class="tag">${c}</span>`).join('')||'<span class="faint">Not listed anywhere</span>'}</div></div>`;
  }
  if(tab==='stock'){
    if(!isStocked(p)) return `<div class="ai-box"><h4>${ic('info')}${p.ftype==='POD'?'Printed on demand':'Dropshipped'}</h4><p>${p.ftype==='POD'?`${esc(mfr(p.mfr).name)} prints each order. No stock is held, so there are no shelves or counts.`:`${esc(mfr(p.mfr).name)} holds the stock and ships direct. Supplier quantity syncs hourly: <b>${p.supplierQty}</b> units.`}</p></div>`;
    const q = onHand(p);
    return `<div class="kv" style="margin-bottom:20px"><div><div class="k">On hand</div><div class="v">${num(q)}</div></div><div><div class="k">Days of cover</div><div class="v">${num(daysCover(p),1)}</div></div><div><div class="k">Forecast 30d</div><div class="v" style="color:var(--ai)">${forecast30(p)}</div></div></div>
      <div class="dsec"><div class="dsec-h"><h4>Stock levels by location</h4><button class="btn xs" data-cmd="open-move" data-id="${p.id}">${ic('drive_file_move')}Move</button></div>
      ${p.locs.filter(l=>l.q>0).map(l=>{ const si = shelfInfo(l.s); return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--line)"><button class="tag mono" data-cmd="open-shelf" data-id="${l.s}">${l.s}</button><div style="flex:1"><div style="font-size:12.5px">${esc(si.w.name)} · Aisle ${si.a}</div><div class="bar ${si.status==='full'?'red':si.status==='near'?'amber':'green'}" style="margin-top:6px"><i style="width:${Math.min(100,si.pct*100)}%"></i></div></div><div class="r num" style="width:80px;text-align:right"><b style="font-weight:500">${l.q}</b> <span class="muted" style="font-size:12px">units</span></div></div>`; }).join('') || '<div class="muted">Not on any shelf.</div>'}</div>
      <div class="dsec"><div class="dsec-h"><h4>Reorder</h4></div><div class="kv"><div><div class="k">Reorder level</div><div class="v">${p.min}</div></div><div><div class="k">Open order</div><div class="v">${p.po?`${p.po.id} · ${p.po.status}`:'None'}</div></div><div><div class="k">Stitch suggested qty</div><div class="v" style="color:var(--ai)">${suggestQty(p)}</div></div></div>
      ${!p.po?`<div style="margin-top:10px"><button class="btn sm" data-cmd="create-po" data-id="${p.id}">${ic('add')}Create PO for ${suggestQty(p)}</button></div>`:''}</div>`;
  }
  if(tab==='tx'){
    const tx = STOCK_UPDATES.filter(u=>u.pid===p.id);
    return tx.length ? `<div class="tl">${tx.map(u=>`<button class="tl-i" style="text-align:left;width:100%" data-cmd="open-update" data-id="${u.id}"><div class="tl-d">${fmtD(u.date)}</div><div style="flex:1"><div style="font-weight:500;font-size:13px">${u.type} <span class="num ${u.qty<0?'var-neg':'var-pos'}">${u.qty>0?'+':''}${u.qty}</span> · <span class="mono">${u.loc}</span></div><div class="muted" style="font-size:12px">${esc(u.comments)} — ${esc(u.owner)}</div></div><span class="mono faint">${u.id}</span></button>`).join('')}</div>` : `<div class="empty">${ic('receipt_long')}No transactions yet.</div>`;
  }
  if(tab==='channels'){
    return `<p class="muted" style="margin:0 0 12px">Distribution Channel is a column on the product, not a separate screen. Turn a channel on to list this product there. Channels are whatever you sell through.</p>${CHANNELS_ALL.map(c=>{ const on=p.channels.includes(c); return `<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid var(--line)"><div style="flex:1"><div style="font-weight:500">${esc(c)}</div><div class="muted" style="font-size:12px">${PRODUCTS.filter(x=>x.channels.includes(c)).length} products listed</div></div><span class="muted" style="font-size:12px">${on?'Listed':'Not listed'}</span><button class="toggle ${on?'on':''}" data-cmd="toggle-channel" data-id="${p.id}" data-c="${esc(c)}" aria-label="Toggle ${esc(c)}"></button></div>`; }).join('')}<div style="display:flex;gap:6px;padding-top:12px;border-top:1px solid var(--line)"><input class="inp" id="newChan" placeholder="Add your own channel"/><button class="btn" data-cmd="add-chan-d" data-id="${p.id}">${ic('add')}Add</button></div>`;
  }
  if(tab==='json') return `<div class="code">${esc(JSON.stringify(Object.assign({}, p, {onHand:onHand(p), stockValue:stockValue(p), stockStatus:stockStatus(p).t}), null, 2))}</div><div style="margin-top:10px;display:flex;gap:6px"><button class="btn sm" data-cmd="copy-json" data-id="${p.id}">${ic('content_copy')}Copy</button><button class="btn sm" data-cmd="api-modal">${ic('api')}API endpoint</button></div>`;
  return '';
}
/* ============ STOCK UPDATE FORM ============ */
function stockUpdateForm(opts={}){
  const p = opts.pid ? prod(opts.pid) : null;
  const type = opts.type || 'Receive';
  const id = 'SU-'+(SU_SEQ+1), auto = SU_SEQ+1-10000;
  const stocked = PRODUCTS.filter(isStocked);
  const types = ['Receive','Return','Adjust','Count','Transfer','Produce','Ship'];
  openDrawer(`<div class="dh"><div class="li-ic">${ic('swap_vert')}</div><div><div class="dh-t">Update Stock</div><div class="dh-s">Every change is logged to the stock ledger with an owner and reason.</div></div><div class="dh-x"><button class="icon-btn" data-cmd="close-drawer" aria-label="Close">${ic('close')}</button></div></div>
  <div class="db">
    <div class="ai-box" style="margin-bottom:18px"><h4>${ic('auto_awesome')}Describe it or paste a packing slip</h4>
      <textarea class="inp" id="suAI" rows="2" style="background:#fff;margin-top:6px" placeholder="e.g. Received 96 Cedar candles from Magnolia at $8.25, put on C-01"></textarea>
      <div style="display:flex;gap:6px;margin-top:8px"><button class="btn xs" data-cmd="su-ai">${ic('auto_awesome')}Fill the form</button><button class="btn xs ghost" data-cmd="su-ai-sample">Use sample slip</button></div></div>
    <div class="fields">
      <div class="fld"><label>Stock Update ID</label><input class="inp mono" readonly value="${id}"/></div>
      <div class="fld"><label>Auto Number</label><input class="inp num" readonly value="${auto}"/></div>
      <div class="fld full"><label>Activity</label><div class="seg" id="suType" style="flex-wrap:wrap">${types.map(t=>`<button type="button" data-t="${t}" class="${t===type?'on':''}">${ic(TX_ICON[t])}${t}</button>`).join('')}</div></div>
      <div class="fld full"><label>Product</label><select class="inp" id="suP">${stocked.map(x=>`<option value="${x.id}" ${p&&x.id===p.id?'selected':''}>${esc(x.sku)} — ${esc(x.name)}</option>`).join('')}</select></div>
      <div class="fld"><label id="suLocL">Location</label><select class="inp mono" id="suLoc"></select></div>
      <div class="fld" id="suToWrap" style="display:none"><label>To location</label><select class="inp mono" id="suTo">${allShelves().map(s=>`<option>${s.id}</option>`).join('')}</select></div>
      <div class="fld"><label>Transaction Date</label><input class="inp" type="date" id="suDate" value="${todayISO}"/></div>
      <div class="fld"><label>Action Owner</label><select class="inp" id="suOwner">${OWNERS.map(o=>`<option ${o==='Etnologic Inc'?'selected':''}>${o}</option>`).join('')}</select></div>
      <div class="fld" data-show="Receive Adjust Transfer Produce Ship"><label id="suQtyL">Quantity</label><input class="inp num" type="number" id="suQty" value="${opts.qty||''}" placeholder="0"/></div>
      <div class="fld" data-show="Count"><label>New Stock <span class="opt">(counted)</span></label><input class="inp num" type="number" id="suNew" placeholder="0"/></div>
      <div class="fld" data-show="Return"><label>Usable Return</label><input class="inp num" type="number" id="suUse" min="0" placeholder="0"/><div class="help">Restocked to the location</div></div>
      <div class="fld" data-show="Return"><label>Unusable Return</label><input class="inp num" type="number" id="suUnuse" min="0" placeholder="0"/><div class="help">Logged, written off</div></div>
      <div class="fld"><label>Unit Cost ($)</label><input class="inp num" type="number" step="0.01" id="suCost"/></div>
      <div class="fld full"><label>Serial Numbers <span class="opt">separate serial numbers with commas</span></label><textarea class="inp mono" id="suSer" rows="2" placeholder="SN-0001, SN-0002"></textarea><div class="serials" id="suSerChips"></div><div class="help" id="suSerHelp"></div></div>
      <div class="fld full"><label>Comments</label><textarea class="inp" id="suCom" rows="2" placeholder="Reason, PO, RMA…">${esc(opts.comments||'')}</textarea></div>
      <div class="fld full"><label class="check" style="color:var(--ink2)"><button type="button" class="toggle" id="suRpt" data-cmd="toggle-self" aria-label="Create Action Reports"></button>Create Action Reports from this update</label></div>
    </div>
    <div style="margin-top:18px" id="suPrev"></div>
  </div>
  <div class="df"><button class="btn" data-cmd="close-drawer">Cancel</button><span class="sp"></span><button class="btn" data-cmd="su-save" data-more="1">Save and new</button><button class="btn primary" data-cmd="su-save">Save update</button></div>`, d => {
    let t = type;
    const sync = () => {
      const pp = prod($('#suP').value);
      $$('#drawer [data-show]').forEach(el=>el.style.display = el.dataset.show.split(' ').includes(t) ? '' : 'none');
      $('#suToWrap').style.display = t==='Transfer' ? '' : 'none';
      $('#suLocL').textContent = t==='Transfer' ? 'From location' : 'Location';
      $('#suQtyL').textContent = t==='Adjust' ? 'Quantity (+/−)' : t==='Ship' ? 'Quantity shipped' : (t==='Receive'||t==='Produce') ? 'New Stock' : 'Quantity';
      const cur = $('#suLoc').value;
      const locs = [...new Set([...pp.locs.map(l=>l.s), ...(t==='Receive'||t==='Produce'||t==='Return'?allShelves().map(s=>s.id):[])])];
      $('#suLoc').innerHTML = locs.map(s=>`<option ${s===cur?'selected':''}>${s}</option>`).join('');
      if(!$('#suCost').value) $('#suCost').value = pp.cost;
      preview();
    };
    const preview = () => {
      const pp = prod($('#suP').value), r = readSU(t); const before = onHand(pp); const after = before + r.delta;
      const ser = $('#suSer').value.split(',').map(s=>s.trim()).filter(Boolean);
      $('#suSerChips').innerHTML = ser.slice(0,24).map(s=>`<span class="tag mono">${esc(s)}</span>`).join('') + (ser.length>24?`<span class="tag">+${ser.length-24}</span>`:'');
      const need = pp.serialized && ['Receive','Produce'].includes(t) ? Math.abs(r.qty) : 0;
      $('#suSerHelp').className = 'help' + (need && ser.length!==need ? ' err':'');
      $('#suSerHelp').textContent = pp.serialized ? `Serialized item — ${ser.length} of ${need||'—'} serials entered` : ser.length ? `${ser.length} serial numbers` : '';
      $('#suPrev').innerHTML = `<div class="preview-delta"><div><div class="pl">Current</div><div class="pv">${num(before)}</div></div>${ic('arrow_forward','faint')}<div><div class="pl">New stock</div><div class="pv">${num(after)}</div></div><div style="margin-left:auto;text-align:right"><div class="pl">Value change</div><div class="num ${r.delta<0?'var-neg':r.delta>0?'var-pos':''}" style="font-weight:500">${r.delta>0?'+':''}${money(r.delta*(+$('#suCost').value||pp.cost))}</div></div></div>${after < pp.min && after>=0 ? `<div class="help" style="margin-top:6px;color:var(--amber)">Below minimum level (${pp.min}). A reorder will be suggested.</div>`:''}${after<0?`<div class="help err" style="margin-top:6px">Resulting stock can’t be negative.</div>`:''}`;
    };
    d._sync = sync; d._type = () => t; d._setType = nt => { t = nt; $$('#suType button').forEach(b=>b.classList.toggle('on', b.dataset.t===t)); sync(); };
    $('#suType').addEventListener('click', e=>{ const b = e.target.closest('button[data-t]'); if(b) d._setType(b.dataset.t); });
    $('#suP').addEventListener('change', ()=>{ $('#suCost').value=''; sync(); });
    ['#suQty','#suNew','#suUse','#suUnuse','#suSer','#suCost','#suLoc'].forEach(s=> $(s).addEventListener('input', preview));
    if(opts.loc) setTimeout(()=>{ $('#suLoc').value = opts.loc; }, 0);
    sync();
  });
}
function readSU(t){
  const pp = prod($('#suP').value); const loc = $('#suLoc').value;
  const q = +$('#suQty').value || 0, use = +$('#suUse').value || 0, unuse = +$('#suUnuse').value || 0, nw = $('#suNew').value;
  let delta = 0, qty = 0;
  if(t==='Receive'||t==='Produce'){ delta = Math.abs(q); qty = Math.abs(q); }
  else if(t==='Ship'){ delta = -Math.abs(q); qty = -Math.abs(q); }
  else if(t==='Adjust'){ delta = q; qty = q; }
  else if(t==='Transfer'){ delta = 0; qty = Math.abs(q); }
  else if(t==='Return'){ delta = use; qty = use + unuse; }
  else if(t==='Count'){ const atLoc = qtyAt(pp, loc); delta = nw==='' ? 0 : (+nw) - atLoc; qty = delta; }
  return { delta, qty, use, unuse };
}
function saveSU(more){
  const d = $('#drawer'); const t = d._type(); const pp = prod($('#suP').value); const loc = $('#suLoc').value; const r = readSU(t);
  if(t!=='Count' && t!=='Return' && !r.qty){ $('#suQty').classList.add('err'); $('#suQty').focus(); toast('Enter a quantity'); return; }
  if(t==='Return' && !r.qty){ $('#suUse').classList.add('err'); toast('Enter usable or unusable returns'); return; }
  if(onHand(pp) + r.delta < 0 || (t!=='Receive'&&t!=='Produce'&&t!=='Return'&&t!=='Count' && qtyAt(pp,loc) + Math.min(0,r.delta) < 0) || (t==='Transfer' && qtyAt(pp,loc) < r.qty)){ toast('Not enough stock at that location'); return; }
  const snap = JSON.stringify(pp.locs);
  if(t==='Transfer'){ moveQty(pp, loc, $('#suTo').value, r.qty); }
  else applyDelta(pp, loc, r.delta);
  const u = su({ date:$('#suDate').value||todayISO, type:t, pid:pp.id, loc: t==='Transfer'?`${loc}→${$('#suTo').value}`:loc, qty:r.qty, usable:r.use, unusable:r.unuse, unitCost:+$('#suCost').value||pp.cost, owner:$('#suOwner').value, serials:$('#suSer').value.trim(), comments:$('#suCom').value.trim() });
  STOCK_UPDATES.unshift(u); pp.updated = u.date; if(t==='Count') pp.lastCount = u.date;
  const mkRpt = $('#suRpt').classList.contains('on');
  if(mkRpt){ createReport([u.id], true); }
  toast(`${u.id} saved · ${pp.sku} now ${onHand(pp)}`, ()=>{ pp.locs = JSON.parse(snap); const i = STOCK_UPDATES.indexOf(u); if(i>=0) STOCK_UPDATES.splice(i,1); });
  if(more){ stockUpdateForm({type:t}); } else closeDrawer();
  render();
}
function applyDelta(p, s, delta){ let l = p.locs.find(x=>x.s===s); if(!l){ l = {s, q:0}; p.locs.push(l); } l.q = Math.max(0, l.q + delta); }
function moveQty(p, from, to, q){ applyDelta(p, from, -q); applyDelta(p, to, q); p.locs = p.locs.filter(l=>l.q>0); p.updated = todayISO; }
function doMove(p, from, to, q, why){
  const snap = JSON.stringify(p.locs); moveQty(p, from, to, q);
  const u = su({ date:todayISO, type:'Transfer', pid:p.id, loc:`${from}→${to}`, qty:q, unitCost:p.cost, owner:'Etnologic Inc', comments:why||'Moved' }); STOCK_UPDATES.unshift(u);
  toast(`Moved ${q} × ${p.sku} ${from} → ${to}`, ()=>{ p.locs = JSON.parse(snap); STOCK_UPDATES.splice(STOCK_UPDATES.indexOf(u),1); });
  render();
}
function aiFillSU(text){
  const t = text.toLowerCase();
  const type = /return|rma/.test(t)?'Return': /count|counted/.test(t)?'Count': /move|transfer/.test(t)?'Transfer': /ship|sold|sent/.test(t)?'Ship': /made|produced|printed|batch/.test(t)?'Produce': /damage|broken|lost|write/.test(t)?'Adjust':'Receive';
  const d = $('#drawer'); d._setType(type);
  let p = PRODUCTS.filter(isStocked).find(x=>t.includes(x.sku.toLowerCase())) || PRODUCTS.filter(isStocked).find(x=> x.name.toLowerCase().split(/[\s—\/]+/).filter(w=>w.length>3 && !['soy','candle','classic','black'].includes(w)).some(w=>t.includes(w)));
  if(p){ $('#suP').value = p.id; $('#suCost').value=''; d._sync(); }
  const loc = text.match(/\b([A-EM]-0\d)\b/i); if(loc){ $('#suLoc').value = loc[1].toUpperCase(); }
  const cost = text.match(/\$\s?(\d+(?:\.\d+)?)/); if(cost) $('#suCost').value = cost[1];
  const nums = (text.replace(/\$\s?\d+(\.\d+)?/g,'').replace(/\b[A-Z]{2,}-[\w-]+/g,'').match(/\b\d+\b/g)||[]).map(Number);
  if(type==='Return'){ const u = text.match(/(\d+)\s*(usable|good)/i), b = text.match(/(\d+)\s*(unusable|damaged|bad|broken)/i); $('#suUse').value = u?u[1]:(nums[0]||''); $('#suUnuse').value = b?b[1]:''; }
  else if(type==='Count'){ $('#suNew').value = nums[0]||''; }
  else { $('#suQty').value = (type==='Adjust' && /damage|broken|lost|write/.test(t) ? -1 : 1) * (nums[0]||0) || ''; }
  const ser = text.match(/serials?:?\s*([\w-]+(?:\s*,\s*[\w-]+)+)/i); if(ser) $('#suSer').value = ser[1];
  $('#suCom').value = text.slice(0,140);
  d._sync(); toast(`Stitch filled: ${type}${p?' · '+p.sku:''}`);
}

/* ============ MOVE / PO / EMAIL ============ */
function moveModal(pid){
  const stocked = PRODUCTS.filter(isStocked).filter(p=>onHand(p)>0); const p = pid ? prod(pid) : stocked[0];
  openModal(`<div class="mh">${ic('drive_file_move')}<div class="t">Move stock</div><button class="icon-btn" data-cmd="close-modal" aria-label="Close">${ic('close')}</button></div>
    <div class="mb"><div class="fields">
      <div class="fld full"><label>Product</label><select class="inp" id="mvP">${stocked.map(x=>`<option value="${x.id}" ${x.id===p.id?'selected':''}>${esc(x.sku)} — ${esc(x.name)}</option>`).join('')}</select></div>
      <div class="fld"><label>From</label><select class="inp mono" id="mvF"></select></div>
      <div class="fld"><label>To</label><select class="inp mono" id="mvT">${allShelves().map(s=>`<option value="${s.id}">${s.id} · ${Math.round(s.pct*100)}% used</option>`).join('')}</select></div>
      <div class="fld"><label>Quantity</label><input class="inp num" type="number" id="mvQ" min="1"/></div>
      <div class="fld"><label>Reason</label><input class="inp" id="mvR" value="Re-slot"/></div>
    </div><div class="ai-box" style="margin-top:14px" id="mvAI"></div></div>
    <div class="mf"><button class="btn" data-cmd="close-modal">Cancel</button><button class="btn primary" data-cmd="do-move">Move</button></div>`, false, () => {
      const sync = () => { const pp = prod($('#mvP').value); $('#mvF').innerHTML = pp.locs.filter(l=>l.q>0).map(l=>`<option value="${l.s}">${l.s} · ${l.q} units</option>`).join(''); $('#mvQ').value = pp.locs.find(l=>l.q>0)?.q||1; const best = bestShelf(pp); $('#mvT').value = best.id; $('#mvAI').innerHTML = `<h4>${ic('auto_awesome')}Suggested destination: ${best.id}</h4><p>${best.why}</p>`; };
      $('#mvP').addEventListener('change', sync); sync();
    });
}
function bestShelf(p){
  const fast = p.vel >= 1.5; const vol = (onHand(p)||1)*p.vol;
  const cands = allShelves().filter(s=>!p.locs.some(l=>l.s===s.id) && s.avail > vol*0.5 && s.w.kind!=='3PL');
  const pick = fast ? cands.filter(s=>s.a==='A'||s.a==='B').sort((a,b)=>b.avail-a.avail)[0] : cands.filter(s=>s.a==='E'||s.a==='D').sort((a,b)=>b.avail-a.avail)[0];
  const s = pick || cands.sort((a,b)=>b.avail-a.avail)[0] || allShelves()[0];
  return Object.assign({}, s, { why: fast ? `Fast mover (${p.vel}/day). Aisle ${s.a} is closest to packing with ${num(s.avail,1)} ft³ free.` : `Slow mover (${p.vel}/day). ${s.w.name} ${s.id} has ${num(s.avail,1)} ft³ free and keeps front aisles open.` });
}
function createPO(p){ p.po = { id:'PO-2026-0'+(++S.poSeq), status:'Draft', qty:suggestQty(p), eta:null }; toast(`${p.po.id} drafted · ${p.po.qty} × ${p.sku}`, ()=>{ p.po=null; }); render(); }
function poModal(p){
  const m = mfr(p.mfr); const po = p.po;
  openModal(`<div class="mh">${ic('receipt_long')}<div class="t">${po.id}</div>${pill(po.status,'blue',false)}<button class="icon-btn" data-cmd="close-modal" aria-label="Close">${ic('close')}</button></div>
    <div class="mb"><div class="kv" style="margin-bottom:14px"><div><div class="k">Manufacturer</div><div class="v">${esc(m.name)}</div></div><div><div class="k">Expected</div><div class="v">${po.eta?fmtD(po.eta):'Not sent'}</div></div><div><div class="k">Total</div><div class="v">${money(po.qty*p.cost)}</div></div></div>
    <table class="t"><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Unit cost</th><th class="r">Line</th></tr></thead><tbody><tr><td><div class="prod">${thumb(p)}<div><div class="prod-name">${esc(p.name)}</div><div class="prod-sub">${p.sku}</div></div></div></td><td class="r"><input class="count-in" id="poQty" type="number" value="${po.qty}" ${po.status!=='Draft'?'disabled':''}/></td><td class="r num">${money(p.cost)}</td><td class="r num">${money(po.qty*p.cost)}</td></tr></tbody></table></div>
    <div class="mf">${po.status==='Draft'?`<button class="btn danger" data-cmd="cancel-po" data-id="${p.id}">Delete draft</button><span style="flex:1"></span><button class="btn" data-cmd="email" data-id="${p.id}">${ic('mail')}Preview email</button><button class="btn primary" data-cmd="send-po" data-id="${p.id}">Send PO</button>`:`<button class="btn" data-cmd="close-modal">Close</button><button class="btn primary" data-cmd="receive-po" data-id="${p.id}">Receive into stock</button>`}</div>`);
}
function sendPO(p){ const q = $('#poQty'); if(q && p.po.status==='Draft') p.po.qty = +q.value || p.po.qty; p.po.status = 'Sent'; p.po.eta = iso(new Date(TODAY.getTime() + mfr(p.mfr).lead*864e5)); closeModal(); toast(`${p.po.id} sent to ${mfr(p.mfr).email}`); render(); }
function emailModal(p, kind='reorder'){
  const m = mfr(p.mfr);
  const body = kind==='expedite' ? `Hi ${m.contact},\n\nCould you expedite ${p.po?.id||'our open order'} for ${p.sku} (${p.name})? We’re at ${onHand(p)} units with about ${num(daysCover(p),1)} days of cover. Any partial shipment this week would help.\n\nThanks,\nEtnologic Inc — Corinth, MS`
    : kind==='stock' ? `Hi ${m.contact},\n\nYour feed shows ${p.supplierQty} units of ${p.sku}. When is the next restock expected? We sell about ${p.vel}/day across ${p.channels.length} channels.\n\nThanks,\nEtnologic Inc`
    : `Hi ${m.contact},\n\nPlease confirm ${p.po?.id||'a new order'}: ${p.po?.qty||suggestQty(p)} × ${p.sku} (${p.name}) at ${money(p.cost)} / unit. Ship to Etnologic Corinth DC, 1200 Harper Rd, Corinth, MS 38834.\n\nThank you,\nEtnologic Inc`;
  openModal(`<div class="mh">${ic('mail')}<div class="t">Email ${esc(m.name)}</div><span class="pill ai">${ic('auto_awesome')}Stitch draft</span><button class="icon-btn" data-cmd="close-modal" aria-label="Close">${ic('close')}</button></div>
    <div class="mb"><div class="fields"><div class="fld full"><label>To</label><input class="inp" value="${esc(m.email)}"/></div><div class="fld full"><label>Subject</label><input class="inp" value="${kind==='expedite'?'Expedite request':kind==='stock'?'Restock timing':'Purchase order'} — ${esc(p.sku)}"/></div><div class="fld full"><label>Message</label><textarea class="inp" rows="9">${esc(body)}</textarea></div></div></div>
    <div class="mf"><button class="btn" data-cmd="close-modal">Cancel</button><button class="btn primary" data-cmd="send-email" data-to="${esc(m.email)}">${ic('send')}Send</button></div>`);
}

/* ============ SCANNER ============ */
function scanModal(){
  const bars = Array.from({length:42},(_,i)=>`<i style="width:${[1,2,3,1,2][i%5]}px"></i>`).join('');
  openModal(`<div class="mh">${ic('barcode_scanner')}<div class="t">Scan or code</div><button class="icon-btn" data-cmd="close-modal" aria-label="Close">${ic('close')}</button></div>
    <div class="mb"><div class="viewfinder"><div class="frame"><div class="line"></div></div><div class="vf-t">Point camera at a barcode, QR or shelf tag</div></div>
    <form data-form="scan" style="display:flex;gap:8px"><input class="inp mono" id="scanIn" placeholder="Type or paste SKU, serial, PO or shelf (e.g. CND-SOY-CED, B-02)" autocomplete="off"/><button class="btn primary" type="submit">Look up</button></form>
    <div style="display:flex;gap:6px;margin-top:8px"><button class="btn xs ghost" data-cmd="sim-scan">${ic('qr_code_scanner')}Simulate a scan</button><span class="faint" style="font-size:12px;align-self:center">Camera access is simulated in this preview.</span></div>
    <div id="scanRes" style="margin-top:14px"></div></div>`, false, () => setTimeout(()=>$('#scanIn')?.focus(), 50));
}
function scanLookup(code){
  code = code.trim(); if(!code) return; const c = code.toUpperCase();
  const r = $('#scanRes');
  const p = PRODUCTS.find(x=>x.sku.toUpperCase()===c) || PRODUCTS.find(x=>x.sku.toUpperCase().startsWith(c));
  const ser = !p && STOCK_UPDATES.find(u=>u.serials.toUpperCase().split(/\s*,\s*/).includes(c));
  const sh = /^[A-EM]-0\d$/.test(c) && allShelves().find(s=>s.id===c);
  const po = PRODUCTS.find(x=>x.po && x.po.id===c);
  if(p || ser){ const pp = p || prod(ser.pid);
    r.innerHTML = `<div class="card card-pad"><div class="prod" style="margin-bottom:12px">${thumb(pp,'lg')}<div><div class="prod-name">${esc(pp.name)}</div><div class="prod-sub">${pp.sku}${ser?` · serial ${esc(code)} (${ser.id})`:''}</div><div style="margin-top:4px">${pill(stockStatus(pp).t, stockStatus(pp).c)} <span class="muted" style="font-size:12px">${isStocked(pp)?onHand(pp)+' on hand · '+pp.locs.map(l=>l.s).join(', '):''}</span></div></div></div>
      ${isStocked(pp)?`<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm primary" data-cmd="scan-plus" data-id="${pp.id}">${ic('add')}Receive +1</button><button class="btn sm" data-cmd="scan-act" data-a="Receive" data-id="${pp.id}">Receive…</button><button class="btn sm" data-cmd="scan-act" data-a="Count" data-id="${pp.id}">Count</button><button class="btn sm" data-cmd="scan-move" data-id="${pp.id}">Move</button><button class="btn sm ghost" data-cmd="scan-open" data-id="${pp.id}">Open</button></div>`:`<button class="btn sm" data-cmd="scan-open" data-id="${pp.id}">Open product</button>`}</div>`;
  } else if(sh){ r.innerHTML = `<div class="card card-pad"><div style="font-weight:500">Shelf ${sh.id} · ${esc(sh.w.name)}</div><div class="muted" style="font-size:12.5px;margin:2px 0 10px">${sh.items.length} products · ${Math.round(sh.pct*100)}% used</div><div style="display:flex;gap:6px"><button class="btn sm primary" data-cmd="scan-shelf" data-id="${sh.id}">Open shelf</button><button class="btn sm" data-cmd="scan-count-shelf" data-id="${sh.id}">Count this shelf</button></div></div>`; }
  else if(po){ r.innerHTML = `<div class="card card-pad"><div style="font-weight:500">${po.po.id} · ${po.po.status}</div><div class="muted" style="font-size:12.5px;margin:2px 0 10px">${po.po.qty} × ${po.sku}</div><button class="btn sm primary" data-cmd="receive-po" data-id="${po.id}">Receive into stock</button></div>`; }
  else r.innerHTML = `<div class="empty" style="padding:20px">${ic('search_off')}No match for “${esc(code)}”.<div style="margin-top:10px"><button class="btn sm" data-cmd="new-product" data-sku="${esc(c)}">Create product with this SKU</button></div></div>`;
}

/* ============ NATURAL LANGUAGE ENGINE ============ */
function interpret(q){
  const raw = q.trim(); const t = raw.toLowerCase(); const out = { q:raw, chips:[], f:{}, view:null, route:null, action:null, answer:null };
  const set = (k,v,lbl) => { (out.f[k] = out.f[k] || new Set()).add(v); out.chips.push(lbl); };
  // actions
  let m;
  if((m = raw.match(/\b(receive|received|add)\s+(\d+)\s+(?:x\s+|units?\s+(?:of\s+)?)?([A-Z0-9][A-Z0-9-]+)/i))){ const p = PRODUCTS.find(x=>x.sku.toLowerCase().startsWith(m[3].toLowerCase())); if(p){ out.action = {k:'receive', p, qty:+m[2]}; out.chips.push(`Receive ${m[2]} × ${p.sku}`); return out; } }
  if((m = raw.match(/\bmove\s+(?:(\d+)\s+)?([A-Z0-9][A-Z0-9-]+)\s+to\s+([A-EM]-0\d)/i))){ const p = PRODUCTS.find(x=>x.sku.toLowerCase().startsWith(m[2].toLowerCase())); if(p){ out.action = {k:'move', p, to:m[3].toUpperCase(), qty:m[1]?+m[1]:null}; out.chips.push(`Move ${p.sku} → ${m[3].toUpperCase()}`); return out; } }
  if(/\bemail\b/.test(t)){ const mf = MANUFACTURERS.find(x=>t.includes(x.name.toLowerCase().split(' ')[0])); const p = mf && PRODUCTS.find(x=>x.mfr===mf.id && isStocked(x)) ; if(p){ out.action = {k:'email', p}; out.chips.push(`Email ${mf.name}`); return out; } }
  if(/ship(ping)? exception|exceptions?/.test(t)){ out.route = 'shipping'; out.shipTab='exceptions'; out.chips.push('Shipping · Exceptions'); return out; }
  if(/near capacity|capacity|full shel|space/.test(t)){ out.route='warehouse'; out.chips.push('Warehouse · capacity'); return out; }
  if(/action report|create report/.test(t)){ out.route='reports'; out.chips.push('Action reports'); return out; }
  if(/^(ship|shipping|shipments?)$/.test(t)){ out.route='shipping'; out.chips.push('Shipping'); return out; }
  // views
  if(/\breorder|purchase order|\bpo\b|to order/.test(t)){ out.view='reorder'; out.f.kpi='reorder'; out.chips.push('Reorder needed'); }
  if(/\bcount|cycle|overdue|audit/.test(t)){ out.view='counts'; if(/overdue|not counted/.test(t)) { out.f.kpi='overdue'; out.chips.push('Count overdue'); } else out.chips.push('Counts view'); }
  if(/\bwhere|location|shelf|shelves|slot/.test(t) && !out.view) out.view='locations';
  if(/publish|listing|catalog|draft/.test(t) && !out.view){ out.view='catalog'; if(/draft/.test(t)) out.chips.push('Drafts'); }
  // status
  if(/out of stock|stockout|zero stock/.test(t)){ out.f.kpi='out'; out.chips.push('Out of stock'); }
  else if(/\blow\b|running low|below min/.test(t)){ out.f.kpi='low'; out.chips.push('Low or out'); }
  else if(/in stock/.test(t)){ out.f.kpi='instock'; out.chips.push('In stock'); }
  // fulfillment
  if(/\bpod\b|print on demand|print-on-demand/.test(t)) set('ftype','POD','POD');
  if(/dropship/.test(t)) set('ftype','Dropship','Dropship');
  if(/wholesale/.test(t)) set('ftype','Wholesale','Wholesale');
  if(/in[- ]house|made in corinth|manufactured|we make/.test(t)) set('ftype','In-House','In-house made');
  // locations
  if((m = t.match(/aisle\s+([a-e])\b/))) set('loc', m[1].toUpperCase(), 'Aisle '+m[1].toUpperCase());
  if(/memphis|3pl|shipbob/.test(t)) set('loc','M','Memphis 3PL');
  if(/tupelo|overflow/.test(t)) set('loc','E','Tupelo');
  if((m = raw.match(/\b([A-EM]-0\d)\b/i))){ out.f.shelf = m[1].toUpperCase(); out.chips.push('Shelf '+out.f.shelf); }
  // manufacturers
  MANUFACTURERS.forEach(mf=>{ const k = mf.name.toLowerCase().split(/[\s&.]+/)[0]; if(k.length>3 && t.includes(k) && !(k==='corinth' && /made in corinth/.test(t))) set('mfr', mf.id, mf.name); });
  // areas & categories
  const AREA_K = { apparel:'Apparel', shirt:'Apparel', tee:'Apparel', hoodie:'Apparel', drinkware:'Drinkware', mug:'Drinkware', 'home':'Home & Living', candle:'Home & Living', 'wall art':'Wall Art', print:'Wall Art', poster:'Wall Art', accessor:'Accessories', cap:'Accessories', hat:'Accessories', tote:'Accessories', stationery:'Stationery', journal:'Stationery', sticker:'Stationery', packaging:'Packaging', box:'Packaging' };
  const nameK = { candle:'candle', mug:'mug', hoodie:'hoodie', tee:'tee', journal:'journal', cap:'cap', tote:'tote', box:'box', coffee:'coffee', sticker:'sticker', poster:'print' };
  Object.entries(AREA_K).forEach(([k,a])=>{ if(new RegExp('\\b'+k).test(t) && !(k==='print'&&/print on demand|print-on-demand/.test(t))){ if(nameK[k] && !['apparel','drinkware','home','stationery','packaging','accessor','wall art'].includes(k)){ if(!out.f.name){ out.f.name = nameK[k]; out.chips.push(`Name contains “${nameK[k]}”`); } } else set('area', a, a); } });
  LABELS_ALL.forEach(l=>{ if(t.includes(l.toLowerCase())) set('labels', l, l); });

  CHANNELS_ALL.forEach(c=>{ const k=c.toLowerCase().split(' ')[0]; if(k.length>3 && t.includes(k)) set('channel', c, c); });
  if((m = t.match(/(?:over|above|more than|>)\s*\$?(\d+)/))){ out.f.priceMin = +m[1]; out.chips.push('Price ≥ $'+m[1]); }
  if((m = t.match(/(?:under|below|less than|<)\s*(\$?)(\d+)/)) && !/below min/.test(t)){ if(m[1] || /price|cost|\$/.test(t)){ out.f.priceMax = +m[2]; out.chips.push('Price ≤ $'+m[2]); } else { out.f.qtyMax = +m[2]; out.chips.push('Qty < '+m[2]); } }
  if((m = raw.match(/\b(?:sku\s+)?([A-Z]{2,5}-[A-Z0-9-]*)\b/))){ out.f.sku = m[1]; out.chips.push('SKU '+m[1]+'…'); }
  // metrics
  if(/how many|count of|number of|value|worth|volume|total/.test(t) && !/count aisle|cycle/.test(t)) out.answer = /value|worth/.test(t) ? 'value' : /volume/.test(t) ? 'volume' : 'count';
  if(!out.chips.length && !out.answer){ out.f.name = raw; out.chips.push(`Name contains “${raw}”`); }
  return out;
}
function applyInterpretation(it, silent){
  if(it.action){ const a = it.action; closePalette();
    if(a.k==='receive'){ go('workbench',{v:'stock'}); stockUpdateForm({pid:a.p.id, type:'Receive', qty:a.qty}); }
    if(a.k==='move'){ const from = a.p.locs.find(l=>l.q>0); if(from) doMove(a.p, from.s, a.to, a.qty||from.q, 'Moved via Stitch command'); }
    if(a.k==='email') emailModal(a.p);
    return;
  }
  if(it.route){ closePalette(); if(it.shipTab) S.shipTab = it.shipTab; go(it.route); return; }
  clearFilters();
  const f = it.f; Object.entries(f).forEach(([k,v])=>{ if(v instanceof Set) v.forEach(x=>S.f[k].add(x)); else S.f[k]=v; });
  S.aiChips = it.chips;
  closePalette();
  go('workbench', {v: it.view || (S.route==='workbench' ? (S.counting?'counts':S.view) : 'stock')});
  if(!silent) toast(`Applied: ${it.chips.join(' · ')}`);
}
function answerFor(it){
  const save = JSON.stringify({f:[...Object.entries(S.f)].map(([k,v])=>[k, v instanceof Set?[...v]:v])});
  const prev = {}; Object.entries(S.f).forEach(([k,v])=>prev[k]= v instanceof Set ? new Set(v) : v);
  clearFilters(); Object.entries(it.f).forEach(([k,v])=>{ if(v instanceof Set) v.forEach(x=>S.f[k].add(x)); else S.f[k]=v; });
  const rows = filtered(); const st = rows.filter(isStocked);
  Object.assign(S.f, prev);
  const scope = it.chips.length ? ` for ${it.chips.join(' · ')}` : '';
  if(it.answer==='value') return `Stock value${scope}: <b>${money(st.reduce((a,p)=>a+stockValue(p),0))}</b> at cost (${money(st.reduce((a,p)=>a+retailValue(p),0),0)} retail) across ${st.length} stocked SKUs.`;
  if(it.answer==='volume') return `Stock volume${scope}: <b>${num(st.reduce((a,p)=>a+stockVol(p),0),1)} ft³</b> across ${st.length} SKUs.`;
  return `<b>${rows.length} products</b>${scope}${st.length?` — ${num(st.reduce((a,p)=>a+onHand(p),0))} units on hand`:''}.`;
}

/* ============ PALETTE ============ */
let palIdx = 0;
function openPalette(prefill=''){
  $('#paletteWrap').classList.add('open');
  $('#palette').innerHTML = `<div class="pal-in">${ic('auto_awesome')}<input id="palIn" placeholder="Ask, filter, or jump — “dropship mugs low stock”, “receive 24 TEE-001-BLK-L”" value="${esc(prefill)}" autocomplete="off"/><kbd>esc</kbd></div><div class="pal-list" id="palList"></div>`;
  const inp = $('#palIn'); inp.focus(); palIdx = 0; palRender();
  inp.addEventListener('input', ()=>{ palIdx=0; palRender(); });
  inp.addEventListener('keydown', e=>{ const items = $$('#palList .pal-i'); if(e.key==='ArrowDown'){ palIdx=Math.min(items.length-1,palIdx+1); palHi(); e.preventDefault(); } else if(e.key==='ArrowUp'){ palIdx=Math.max(0,palIdx-1); palHi(); e.preventDefault(); } else if(e.key==='Enter'){ items[palIdx]?.click(); e.preventDefault(); } });
}
function palHi(){ $$('#palList .pal-i').forEach((x,i)=>x.classList.toggle('on', i===palIdx)); }
function closePalette(){ $('#paletteWrap').classList.remove('open'); document.activeElement?.blur(); }
const PAL_NAV = [ ['Home','home','home'], ['Inventory Management','inventory_2','workbench','stock'], ['Product Catalog','category','workbench','catalog'], ['New Stock Counts','fact_check','workbench','counts'], ['Stock Updates','swap_vert','updates'], ['Action Reports','summarize','reports'], ['Warehouse Management','shelves','warehouse'], ['Shipping Management','local_shipping','shipping'] ];
const PAL_ACT = [ ['Update stock','add','new-stock-update'], ['Scan or code','barcode_scanner','open-scan'], ['Move stock','drive_file_move','open-move'], ['New product','add_box','new-product'], ['New shipment','local_shipping','new-shipment'], ['Create action report','summarize','new-report'] ];
function palRender(){
  const q = $('#palIn').value.trim(); const ql = q.toLowerCase(); let html = '';
  if(q){
    const it = interpret(q); window._palIt = it;
    const ans = it.answer ? answerFor(it) : null;
    html += `<div class="interp"><div class="interp-h">${ic('auto_awesome')}Interpreted as</div><div class="chips">${it.chips.map(c=>`<span class="chip ai" style="padding-right:9px">${esc(c)}</span>`).join('')}</div>${ans?`<div style="font-size:13px;margin-bottom:10px">${ans}</div>`:''}<button class="pal-i on" data-cmd="pal-apply" style="background:var(--bg);border:1px solid var(--ai-l)">${ic(it.action?'bolt':it.route?'arrow_forward':'filter_alt')}${it.action?'Run this action':it.route?'Go there':'Apply to inventory table'}<span class="ph2">↵</span></button></div>`;
    const ps = PRODUCTS.filter(p=>p.name.toLowerCase().includes(ql)||p.sku.toLowerCase().startsWith(ql)).slice(0,5);
    if(ps.length) html += `<div class="pal-g">Products</div>` + ps.map(p=>`<button class="pal-i" data-cmd="pal-prod" data-id="${p.id}">${thumb(p)}<span>${esc(p.name)}</span><span class="ph2 mono">${p.sku}</span></button>`).join('');
  }
  const nav = PAL_NAV.filter(n=>!q || n[0].toLowerCase().includes(ql));
  const act = PAL_ACT.filter(n=>!q || n[0].toLowerCase().includes(ql));
  if(act.length) html += `<div class="pal-g">Actions</div>` + act.map(a=>`<button class="pal-i" data-cmd="pal-act" data-a="${a[2]}">${ic(a[1])}${a[0]}</button>`).join('');
  if(nav.length) html += `<div class="pal-g">Go to</div>` + nav.map(n=>`<button class="pal-i" data-cmd="pal-go" data-r="${n[2]}" data-v="${n[3]||''}">${ic(n[1])}${n[0]}</button>`).join('');
  if(!q) html = `<div class="pal-g">Try asking</div>` + ['Low stock candles in aisle C','POD apparel on TikTok','Reorder needed from Cotton Source','What is my stock value in Memphis 3PL?','Receive 24 CND-SOY-CED','Move JRN-LIN-SND to E-04'].map(s=>`<button class="pal-i" data-cmd="pal-try" data-q="${esc(s)}">${ic('auto_awesome')}${esc(s)}</button>`).join('') + html;
  $('#palList').innerHTML = html; palHi();
}

/* ============ COPILOT ============ */
function renderCopilot(){
  const ins = insights();
  const intro = `<div class="msg bot">Here’s what I’m watching across catalog, stock, shelves and shipping. Ask me anything — I’ll filter the table, answer with numbers, or take the action.</div>`;
  const cards = ins.map(x=>`<div class="insight"><div class="ih"><span class="li-ic ${x.c}" style="width:24px;height:24px">${ic(x.i)}</span>${x.t.length>60?x.t.slice(0,58)+'…':x.t}<span class="conf">${x.conf}%</span></div><p>${x.d}</p><div class="acts">${x.acts.map((a,j)=>`<button class="btn xs ${j?'ghost':''}" data-cmd="insight" data-id="${x.id}" data-n="${j}">${a.t}</button>`).join('')}</div></div>`).join('');
  const chat = S.chat.map(m=>`<div class="msg ${m.who}">${m.html}${m.acts?`<div class="acts">${m.acts}</div>`:''}</div>`).join('');
  $('#cpBody').innerHTML = intro + cards + chat;
  $('#cpBody').scrollTop = 1e6;
}
function copilotAsk(q){
  S.chat.push({who:'user', html:esc(q)});
  const it = interpret(q); window._cpIts = window._cpIts || []; window._cpIts.push(it); const idx = window._cpIts.length-1;
  let html, acts;
  if(it.action){ html = `I can do that: <b>${esc(it.chips[0])}</b>.`; acts = `<button class="btn xs" data-cmd="cp-apply" data-i="${idx}">Do it</button>`; }
  else if(it.route){ html = `That lives in <b>${esc(it.chips[0])}</b>.`; acts = `<button class="btn xs" data-cmd="cp-apply" data-i="${idx}">Open</button>`; }
  else { html = answerFor(it) + `<div class="muted" style="font-size:12px;margin-top:4px">${it.chips.length?"Filters: "+it.chips.map(esc).join(" · "):""}</div>`; acts = `<button class="btn xs" data-cmd="cp-apply" data-i="${idx}">Show in table</button>${it.view==='reorder'?`<button class="btn xs ghost" data-cmd="draft-all">Draft POs</button>`:''}`; }
  S.chat.push({who:'bot', html, acts});
  renderCopilot();
}

/* ============ STOCK UPDATES PAGE ============ */
function pUpdates(){ pTable('updates'); }
function kpiStatic(i,l,v,s){ return `<div class="kpi"><div class="kpi-l">${ic(i)}${l}</div><div class="kpi-v">${v}</div><div class="kpi-s">${s}</div></div>`; }
function openUpdate(id){
  const u = STOCK_UPDATES.find(x=>x.id===id); if(!u) return; const p = prod(u.pid);
  openDrawer(`<div class="dh"><div class="li-ic">${ic(TX_ICON[u.type])}</div><div><div class="dh-t">${u.type} · ${u.id}</div><div class="dh-s">Auto #${u.auto} · ${fmtD(u.date)} · ${esc(u.owner)}</div></div><div class="dh-x"><button class="icon-btn" data-cmd="close-drawer" aria-label="Close">${ic('close')}</button></div></div>
    <div class="db"><button class="prod" style="margin-bottom:18px;text-align:left" data-cmd="open-product" data-id="${p.id}">${thumb(p,'lg')}<div><div class="prod-name">${esc(p.name)}</div><div class="prod-sub">${p.sku}</div><div class="muted" style="font-size:12px">Now ${isStocked(p)?onHand(p)+' on hand':'—'}</div></div></button>
    <div class="kv" style="margin-bottom:18px"><div><div class="k">Quantity</div><div class="v">${u.qty>0?'+':''}${u.qty}</div></div><div><div class="k">Location</div><div class="v mono">${u.loc}</div></div><div><div class="k">Unit cost</div><div class="v">${money(u.unitCost)}</div></div><div><div class="k">Usable return</div><div class="v">${u.usable}</div></div><div><div class="k">Unusable return</div><div class="v">${u.unusable}</div></div><div><div class="k">Value</div><div class="v">${money(u.qty*u.unitCost)}</div></div></div>
    <div class="dsec"><div class="dsec-h"><h4>Serial numbers</h4></div>${u.serials?`<div class="serials">${u.serials.split(',').map(s=>`<span class="tag mono">${esc(s.trim())}</span>`).join('')}</div>`:'<span class="faint">None</span>'}</div>
    <div class="dsec"><div class="dsec-h"><h4>Comments</h4></div><p style="margin:0">${esc(u.comments)||'<span class="faint">None</span>'}</p></div></div>
    <div class="df"><button class="btn danger" data-cmd="reverse-update" data-id="${u.id}">${ic('undo')}Reverse</button><span class="sp"></span><button class="btn" data-cmd="report-one" data-id="${u.id}">${ic('summarize')}Create Action Reports</button></div>`);
}

/* ============ WAREHOUSE ============ */
function pWarehouse(){ pTable('warehouse'); }
function shelfPanel(s){
  return `<div class="card-head"><div><h2 class="sh mono">${s.id}</h2><p class="muted" style="margin:2px 0 0;font-size:12.5px">${esc(s.w.name)} · ${s.w.kind==='3PL'?'3PL zone':'Aisle '+s.a}${s.note?' · '+esc(s.note):''}</p></div>${pill(...SH_STATUS[s.status])}</div>
  <div class="card-pad">
    <div class="kv" style="grid-template-columns:1fr 1fr;margin-bottom:16px"><div><div class="k">Shelf capacity</div><div class="v">${s.cap} ft³</div></div><div><div class="k">Minimum level</div><div class="v">${s.min} units ${s.below?'<span class="var-neg" style="font-size:12px">· below</span>':''}</div></div><div><div class="k">Used space</div><div class="v">${num(s.used,1)} ft³ · ${Math.round(s.pct*100)}%</div></div><div><div class="k">Available space</div><div class="v">${num(s.avail,1)} ft³</div></div></div>
    <div class="dsec-h"><h4 style="margin:0;font-size:13px;font-weight:600">Products · ${s.units} units</h4></div>
    ${s.items.length ? s.items.map(x=>`<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--line)"><button class="prod" style="min-width:0;flex:1;text-align:left" data-cmd="open-product" data-id="${x.p.id}">${thumb(x.p)}<div style="min-width:0"><div class="prod-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(x.p.name)}</div><div class="prod-sub">${x.p.sku} · ${num(x.q*x.p.vol,1)} ft³</div></div></button><span class="num" style="font-weight:500">${x.q}</span><button class="icon-btn" data-cmd="open-move" data-id="${x.p.id}" title="Move" aria-label="Move">${ic('drive_file_move')}</button></div>`).join('') : '<p class="muted" style="margin:0 0 10px">Empty shelf.</p>'}
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:14px"><button class="btn sm primary" data-cmd="shelf-to-table" data-id="${s.id}">${ic('table_rows')}Open in table</button><button class="btn sm" data-cmd="scan-count-shelf" data-id="${s.id}">${ic('fact_check')}Count shelf</button><button class="btn sm" data-cmd="new-stock-update" data-loc="${s.id}">${ic('add')}Put away</button><button class="btn sm ghost" data-cmd="print-tag" data-id="${s.id}">${ic('qr_code_2')}Shelf tag</button></div>
  </div>`;
}

/* ============ SHIPPING ============ */
function pShipping(){
  crumbs(['Warehouse Management','Shipping Management']);
  const tabs = [['all','All'],['Outbound','Outbound'],['Inbound','Inbound'],['exceptions','Exceptions']];
  const list = SHIPMENTS.filter(s=> (!S.shipWh || s.wh===S.shipWh) && (S.shipTab==='all' || (S.shipTab==='exceptions' ? s.status==='Exception' : s.dir===S.shipTab)));
  const whN = S.shipWh ? WAREHOUSES.find(w=>w.id===S.shipWh).name : null;
  const stc = { 'Label created':'gray', 'In transit':'blue', 'Delivered':'green', 'Exception':'red', 'Awaiting pickup':'amber', 'Scheduled':'gray', 'Received':'green' };
  $('#page').innerHTML = `<div class="page-inner">
    <button class="backlink" data-cmd="go" data-r="warehouse">${ic('arrow_back')}Warehouse Management</button>
    <div class="ph"><div><h1>Shipping Management${whN?' · '+esc(whN):''}</h1><p>Opened from the Shipping Management column. Receiving an inbound shipment updates stock directly.${whN?` <button class="link" data-cmd="ship-all">Show all locations</button>`:''}</p></div>
      <div class="ph-actions"><button class="btn" data-cmd="batch-labels">${ic('print')}Print labels</button><button class="btn primary" data-cmd="new-shipment">${ic('add')}New shipment</button></div></div>
    <div class="kpis">${kpiStatic('outbox','Ready to ship', SHIPMENTS.filter(s=>s.status==='Label created').length, 'Labels created today')}${kpiStatic('local_shipping','In transit', SHIPMENTS.filter(s=>s.status==='In transit').length, 'Outbound and inbound')}${kpiStatic('report','Exceptions', SHIPMENTS.filter(s=>s.status==='Exception').length, 'Need action')}${kpiStatic('move_to_inbox','Inbound units', num(SHIPMENTS.filter(s=>s.dir==='Inbound'&&s.status!=='Received').reduce((a,s)=>a+s.items,0)), 'Expected this week')}</div>
    <div class="tbl-card"><div class="toolbar"><div class="seg">${tabs.map(t=>`<button class="${S.shipTab===t[0]?'on':''}" data-cmd="ship-tab" data-t="${t[0]}">${t[1]}</button>`).join('')}</div><div class="tb-right"><span class="rowcount">${list.length} shipments</span></div></div>
      ${list.length?`<div class="tbl-scroll"><table class="t"><thead><tr><th>Shipment</th><th>Direction</th><th>Reference</th><th>Ship to / from</th><th>Location</th><th>Carrier</th><th class="r">Items</th><th>Status</th><th>ETA</th><th class="r">Cost</th><th></th></tr></thead><tbody>
      ${list.map(s=>`<tr class="click" data-ship="${s.id}"><td class="mono" style="font-weight:500">${s.id}</td><td><span class="ftype">${ic(s.dir==='Inbound'?'south_west':'north_east')}${s.dir}</span></td><td>${esc(s.ref)}</td><td>${esc(s.party)}</td><td>${s.wh==='Dropship'?'<span class="muted">Dropship</span>':esc(WAREHOUSES.find(w=>w.id===s.wh).name)}</td><td>${esc(s.carrier)}</td><td class="r num">${s.items}</td><td>${pill(s.status, stc[s.status])}</td><td>${fmtD(s.eta)}</td><td class="r num">${money(s.cost)}</td><td class="r"><div class="row-act">${s.dir==='Inbound'&&s.status!=='Received'?`<button class="btn xs" data-cmd="receive-ship" data-id="${s.id}">Receive</button>`:s.status==='Exception'?`<button class="btn xs" data-cmd="fix-ship" data-id="${s.id}">Fix</button>`:s.status==='Label created'?`<button class="btn xs" data-cmd="label" data-id="${s.id}">Label</button>`:''}</div></td></tr>`).join('')}
      </tbody></table></div>`:`<div class="empty">${ic('local_shipping')}Nothing here.</div>`}</div></div>`;
}
function openShipment(id){
  const s = SHIPMENTS.find(x=>x.id===id); if(!s) return;
  const steps = s.dir==='Inbound' ? ['Scheduled','Awaiting pickup','In transit','Received'] : ['Label created','In transit','Delivered'];
  const cur = steps.indexOf(s.status);
  openDrawer(`<div class="dh"><div class="li-ic">${ic(s.dir==='Inbound'?'south_west':'north_east')}</div><div><div class="dh-t">${s.id} · ${esc(s.ref)}</div><div class="dh-s">${esc(s.party)}</div></div><div class="dh-x"><button class="icon-btn" data-cmd="close-drawer" aria-label="Close">${ic('close')}</button></div></div>
  <div class="db">${s.status==='Exception'?`<div class="ai-box" style="margin-bottom:16px;border-color:var(--red-l);background:var(--red-t)"><h4 style="color:var(--red)">${ic('report')}${esc(s.note)}</h4><p>Stitch matched the billing address ZIP 30309 for this order. Correct and re-release?</p><div style="margin-top:8px"><button class="btn xs" data-cmd="fix-ship" data-id="${s.id}">Correct and re-release</button></div></div>`:''}
    <div class="kv" style="margin-bottom:18px"><div><div class="k">Carrier</div><div class="v">${esc(s.carrier)}</div></div><div><div class="k">Items</div><div class="v">${s.items}</div></div><div><div class="k">Weight</div><div class="v">${s.weight} lb</div></div><div><div class="k">ETA</div><div class="v">${fmtD(s.eta)}</div></div><div><div class="k">Cost</div><div class="v">${money(s.cost)}</div></div><div><div class="k">Location</div><div class="v">${s.wh==='Dropship'?'Dropship':esc(WAREHOUSES.find(w=>w.id===s.wh).name)}</div></div></div>
    <div class="dsec"><div class="dsec-h"><h4>Tracking</h4></div><div class="tl">${steps.map((st,i)=>`<div class="tl-i"><div class="tl-d">${i<=cur?fmtD(iso(new Date(new Date(s.eta+'T12:00:00').getTime()-(steps.length-1-i)*864e5))):'—'}</div><div style="display:flex;align-items:center;gap:8px">${ic(i<=cur?'check_circle':'radio_button_unchecked', i<=cur?'':'faint')}<span style="${i<=cur?'font-weight:500':'color:var(--ink3)'}">${st}</span></div></div>`).join('')}</div></div></div>
  <div class="df"><button class="btn" data-cmd="label" data-id="${s.id}">${ic('print')}Label</button><span class="sp"></span>${s.dir==='Inbound'&&s.status!=='Received'?`<button class="btn primary" data-cmd="receive-ship" data-id="${s.id}">Receive into stock</button>`:s.status!=='Delivered'&&s.status!=='Received'?`<button class="btn primary" data-cmd="advance-ship" data-id="${s.id}">Mark ${steps[Math.min(steps.length-1,cur+1)]}</button>`:''}</div>`);
}
function shipmentModal(dir='Outbound'){
  openModal(`<div class="mh">${ic('local_shipping')}<div class="t">New shipment</div><button class="icon-btn" data-cmd="close-modal" aria-label="Close">${ic('close')}</button></div>
    <div class="mb"><div class="fields">
      <div class="fld"><label>Direction</label><select class="inp" id="shDir"><option ${dir==='Outbound'?'selected':''}>Outbound</option><option ${dir==='Inbound'?'selected':''}>Inbound</option></select></div>
      <div class="fld"><label>From location</label><select class="inp" id="shWh">${WAREHOUSES.map(w=>`<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select></div>
      <div class="fld full"><label>Reference</label><input class="inp" id="shRef" placeholder="Order #, PO or ASN" value="${dir==='Inbound'?'ASN '+(88241+S.shpSeq-7782):'#'+(1043+S.shpSeq-7782)+' · Shopify'}"/></div>
      <div class="fld full"><label>${dir==='Inbound'?'From (supplier)':'Ship to'}</label><input class="inp" id="shParty" value="${dir==='Inbound'?'Cotton Source Co.':'Riley Brooks · Starkville, MS'}"/></div>
      <div class="fld"><label>Items</label><input class="inp num" type="number" id="shItems" value="2"/></div>
      <div class="fld"><label>Weight (lb)</label><input class="inp num" type="number" step="0.1" id="shW" value="1.6"/></div>
    </div>
    <div class="dsec" style="margin-top:18px;margin-bottom:0"><div class="dsec-h"><h4 style="display:flex;align-items:center;gap:6px">${ic('auto_awesome','ai-ic')}Stitch rate shop</h4><span class="muted" style="font-size:12px">Cheapest that meets the promise date</span></div><div id="shRates"></div></div></div>
    <div class="mf"><button class="btn" data-cmd="close-modal">Cancel</button><button class="btn primary" data-cmd="create-ship">Create shipment</button></div>`, false, () => {
      const rates = () => { const w = +$('#shW').value || 1; const opts = [
        {c:'USPS Ground Advantage', d:4, p:4.6 + w*1.9}, {c:'UPS Ground', d:3, p:6.9 + w*1.5}, {c:'USPS Priority', d:2, p:8.4 + w*1.7}, {c:'FedEx 2Day', d:2, p:13.5 + w*2.2}];
        const best = opts.filter(o=>o.d<=4).sort((a,b)=>a.p-b.p)[0];
        $('#shRates').innerHTML = opts.map(o=>`<button class="route ${o===best?'on':''}" data-cmd="pick-rate" data-c="${o.c}" data-p="${o.p.toFixed(2)}"><div class="rb">${ic('local_shipping')}</div><div style="flex:1"><div style="font-weight:500">${o.c}</div><div class="muted" style="font-size:12px">${o.d} business days</div></div><div class="num" style="font-weight:500">${money(o.p)}</div>${o===best?pill('Best value','ai',false):''}</button>`).join('');
        S._rate = {c:best.c, p:best.p};
      };
      $('#shW').addEventListener('input', rates); rates();
    });
}
function createShipment(){
  const dir = $('#shDir').value; const id = (dir==='Inbound'?'INB-':'SHP-') + (dir==='Inbound'? 2217 + (S.shpSeq-7782) : S.shpSeq); S.shpSeq++;
  const s = { id, dir, ref:$('#shRef').value||'—', party:$('#shParty').value||'—', carrier:S._rate.c, items:+$('#shItems').value||1, wh:$('#shWh').value, status: dir==='Inbound'?'Scheduled':'Label created', eta: iso(new Date(TODAY.getTime()+3*864e5)), cost:+S._rate.p, weight:+$('#shW').value||1 };
  SHIPMENTS.unshift(s); closeModal(); toast(`${id} created · ${s.carrier} ${money(s.cost)}`, ()=>{ SHIPMENTS.splice(SHIPMENTS.indexOf(s),1); }); if(S.route!=='shipping') go('shipping'); else render();
}
function labelModal(id){
  const s = SHIPMENTS.find(x=>x.id===id);
  const bars = Array.from({length:60},(_,i)=>`<i style="width:${[1,2,3,1,2,1,3][i%7]}px;background:#111"></i>`).join('');
  openModal(`<div class="mh">${ic('print')}<div class="t">Shipping label · ${s.id}</div><button class="icon-btn" data-cmd="close-modal" aria-label="Close">${ic('close')}</button></div>
    <div class="mb"><div style="border:1px solid var(--ink);border-radius:6px;padding:16px;font-size:12.5px;max-width:360px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--ink);padding-bottom:8px;margin-bottom:8px"><b style="font-weight:600">${esc(s.carrier)}</b><span class="mono">${s.weight} LB</span></div>
      <div class="muted" style="font-size:11px">FROM</div><div style="margin-bottom:8px">Etnologic Inc · 1200 Harper Rd · Corinth, MS 38834</div>
      <div class="muted" style="font-size:11px">${s.dir==='Inbound'?'SHIPPER':'SHIP TO'}</div><div style="font-weight:500;margin-bottom:10px">${esc(s.party)}</div>
      <div class="barcode" style="height:56px;opacity:1">${bars}</div><div class="mono" style="text-align:center;margin-top:4px">9400 1118 9922 ${s.id.replace(/\D/g,'')} 41</div>
      <div style="border-top:1px solid var(--ink);margin-top:8px;padding-top:6px" class="mono">REF ${esc(s.ref)}</div></div></div>
    <div class="mf"><button class="btn" data-cmd="close-modal">Close</button><button class="btn primary" data-cmd="dl-label" data-id="${s.id}">${ic('download')}Download label</button></div>`);
}

/* ============ NEW PRODUCT ============ */
function newProductForm(sku=''){
  openDrawer(`<div class="dh"><div class="li-ic">${ic('add_box')}</div><div><div class="dh-t">New product</div><div class="dh-s">Lands in the same table as everything else — catalog, stock and shelves.</div></div><div class="dh-x"><button class="icon-btn" data-cmd="close-drawer" aria-label="Close">${ic('close')}</button></div></div>
    <div class="db"><div class="ai-box" style="margin-bottom:18px"><h4>${ic('auto_awesome')}Describe the product</h4><textarea class="inp" id="npAI" rows="2" style="background:#fff;margin-top:6px" placeholder="e.g. Olive green dad cap, wholesale from Cotton Source at $5.80, sell for $24"></textarea><div style="margin-top:8px;display:flex;gap:6px"><button class="btn xs" data-cmd="np-ai">${ic('auto_awesome')}Fill details</button><button class="btn xs ghost" data-cmd="np-sample">Use example</button></div></div>
    <div class="fields">
      <div class="fld full"><label>Product name</label><input class="inp" id="npName" placeholder="Product name"/></div>
      <div class="fld"><label>SKU</label><input class="inp mono" id="npSku" value="${esc(sku)}" placeholder="AREA-000-VAR"/></div>
      <div class="fld"><label>Product category</label><input class="inp" id="npCat" placeholder="e.g. Headwear"/></div>
      <div class="fld"><label>Area</label><select class="inp" id="npArea">${[...new Set(PRODUCTS.map(p=>p.area))].map(a=>`<option>${a}</option>`).join('')}</select></div>
      <div class="fld"><label>Labels</label><select class="inp" id="npFt">${['Wholesale','In-House','POD','Dropship'].map(t=>`<option value="${t}">${FT_LABEL[t]}</option>`).join('')}</select></div>
      <div class="fld"><label>Manufacturer</label><select class="inp" id="npMfr">${MANUFACTURERS.map(m=>`<option value="${m.id}">${m.name}</option>`).join('')}</select></div>
      <div class="fld"><label>Price per unit ($)</label><input class="inp num" type="number" step="0.01" id="npPrice"/></div>
      <div class="fld"><label>Unit cost ($)</label><input class="inp num" type="number" step="0.01" id="npCost"/></div>
      <div class="fld"><label>Minimum level</label><input class="inp num" type="number" id="npMin" value="20"/></div>
      <div class="fld"><label>Product volume (ft³ / unit)</label><input class="inp num" type="number" step="0.001" id="npVol" value="0.05"/></div>
      <div class="fld"><label>Image</label><select class="inp" id="npImg">${[...new Set(PRODUCTS.map(p=>p.img))].map(i=>`<option>${i}</option>`).join('')}</select></div>
      <div class="fld full"><label>Description</label><textarea class="inp" id="npDesc" rows="3"></textarea></div>
    </div></div>
    <div class="df"><button class="btn" data-cmd="close-drawer">Cancel</button><span class="sp"></span><button class="btn primary" data-cmd="np-save">Create product</button></div>`);
}
function npAI(text){
  const t = text.toLowerCase();
  const ft = /print on demand|\bpod\b|printify|printful|gelato/.test(t)?'POD':/dropship|delta/.test(t)?'Dropship':/in[- ]house|we make|corinth works|made/.test(t)?'In-House':'Wholesale';
  const mf = MANUFACTURERS.find(m=>t.includes(m.name.toLowerCase().split(/[\s&.]+/)[0])) || MANUFACTURERS.find(m=>m.type===ft);
  const kinds = [['cap','Accessories','Headwear','CAP','cap'],['hat','Accessories','Headwear','CAP','cap'],['tee','Apparel','T-Shirts','TEE','tee_black'],['shirt','Apparel','T-Shirts','TEE','tee_white'],['hoodie','Apparel','Hoodies','HD','hoodie'],['mug','Drinkware','Mugs','MUG','mug'],['candle','Home & Living','Candles','CND','candle_lav'],['tote','Accessories','Bags','TOTE','tote'],['journal','Stationery','Notebooks','JRN','journal'],['print','Wall Art','Framed Prints','PRT','poster'],['apron','Accessories','Aprons','APR','apron'],['coaster','Home & Living','Coasters','CST','coaster']];
  const k = kinds.find(x=>t.includes(x[0])) || ['', 'Accessories', 'General', 'GEN', 'box'];
  const prices = (text.match(/\$\s?(\d+(?:\.\d+)?)/g)||[]).map(x=>+x.replace(/[^\d.]/g,''));
  const color = (t.match(/\b(olive|black|white|navy|sage|sand|red|green|blue|gray|grey|cream|natural)\b/)||[])[1];
  const name = text.replace(/,.*$/,'').replace(/^(a|an)\s+/i,'').trim();
  $('#npName').value = name.charAt(0).toUpperCase()+name.slice(1);
  $('#npSku').value = $('#npSku').value || `${k[3]}-${String(100+PRODUCTS.length).slice(-3)}${color?'-'+color.slice(0,3).toUpperCase():''}`;
  $('#npCat').value = k[2]; $('#npArea').value = k[1]; $('#npFt').value = ft; if(mf) $('#npMfr').value = mf.id; $('#npImg').value = k[4];
  if(prices.length>1){ $('#npCost').value = Math.min(...prices); $('#npPrice').value = Math.max(...prices); } else if(prices.length){ $('#npPrice').value = prices[0]; $('#npCost').value = (prices[0]*0.32).toFixed(2); }
  const vols = {Headwear:0.1,'T-Shirts':0.05,Hoodies:0.12,Mugs:0.08,Candles:0.06,Bags:0.04,Notebooks:0.03,'Framed Prints':0.5,Aprons:0.06,Coasters:0.02}; $('#npVol').value = vols[k[2]]||0.05;
  $('#npMin').value = ft==='POD'?0:24;
  $('#npDesc').value = `${$('#npName').value}. ${ft==='POD'?'Printed on demand by '+(mf?mf.name:'partner')+'.':ft==='Dropship'?'Ships direct from '+(mf?mf.name:'supplier')+'.':ft==='In-House'?'Made in Corinth, MS.':'Sourced wholesale from '+(mf?mf.name:'supplier')+' and stocked at Corinth DC.'} Designed for everyday use.`;
  toast('Stitch filled 11 fields — review and create');
}
function npSave(){
  const name = $('#npName').value.trim(), sku = $('#npSku').value.trim().toUpperCase();
  if(!name){ $('#npName').classList.add('err'); toast('Add a product name'); return; }
  if(!sku || PRODUCTS.some(p=>p.sku===sku)){ $('#npSku').classList.add('err'); toast(sku?'SKU already exists':'Add a SKU'); return; }
  const p = P({ id:'p'+(PRODUCTS.length+1)+'x'+Date.now()%1000, sku, name, area:$('#npArea').value, category:$('#npCat').value||'General', mfr:$('#npMfr').value, ftype:$('#npFt').value, labels:['New'], channels:[], img:$('#npImg').value, price:+$('#npPrice').value||0, cost:+$('#npCost').value||0, min:+$('#npMin').value||0, rq:+$('#npMin').value*3||0, vol:+$('#npVol').value||0.05, added:todayISO, lastCount:null, updated:todayISO, vel:0.5, desc:$('#npDesc').value, status:'Draft', supplierQty: $('#npFt').value==='Dropship'?0:null });
  PRODUCTS.unshift(p); closeDrawer(); toast(`${sku} created as draft`, ()=>{ PRODUCTS.splice(PRODUCTS.indexOf(p),1); });
  clearFilters(); go('workbench',{v:'catalog'}); setTimeout(()=>openProduct(p.id), 60);
}

/* ============ REPORTS ============ */
function createReport(ids, quiet){
  const ups = ids.map(id=>STOCK_UPDATES.find(u=>u.id===id)).filter(Boolean);
  if(!ups.length){ toast('Select stock updates first'); return null; }
  const byType = {}; ups.forEach(u=>{ byType[u.type]=(byType[u.type]||0)+1; });
  const val = ups.reduce((a,u)=>a+Math.abs(u.qty)*u.unitCost,0);
  const bad = ups.reduce((a,u)=>a+u.unusable,0);
  const neg = ups.filter(u=>u.qty<0 && ['Adjust','Count'].includes(u.type));
  const body = `${ups.length} stock update${ups.length>1?'s':''} (${Object.entries(byType).map(([k,v])=>`${v} ${k.toLowerCase()}`).join(', ')}) touching ${new Set(ups.map(u=>u.pid)).size} SKUs and ${money(val)} at cost.`
    + (bad?` ${bad} unusable return unit${bad>1?'s were':' was'} written off.`:'')
    + (neg.length?` Negative adjustments on ${neg.map(u=>prod(u.pid).sku).join(', ')} — recommend a recount and pick-path review.`:'')
    + ` Owners: ${[...new Set(ups.map(u=>u.owner))].join(', ')}.`;
  const r = { id:'AR-00'+(S.rptSeq++), title: ups.length===1 ? `${ups[0].type} · ${prod(ups[0].pid).sku}` : `Action report · ${ups.length} updates`, date:todayISO, owner:'Etnologic Inc', updates:ids, body };
  REPORTS.unshift(r);
  if(!quiet){ toast(`${r.id} created`); S.updSel.clear(); go('reports'); setTimeout(()=>openReport(r.id),50); }
  return r;
}
function pReports(){
  crumbs(['Stock Updates','Action Reports']);
  $('#page').innerHTML = `<div class="page-inner">
    <button class="backlink" data-cmd="go" data-r="updates">${ic('arrow_back')}Stock Updates</button>
    <div class="ph"><div><h1>Action Reports</h1><p>Opened from the Create Action Reports column. Action reports summarize stock activity with an action owner and next steps. Stitch drafts them from the ledger.</p></div>
      <div class="ph-actions"><button class="btn" data-cmd="report-week">${ic('auto_awesome')}Stitch: this week’s report</button><button class="btn primary" data-cmd="new-report">${ic('summarize')}Create Action Reports</button></div></div>
    <div class="tbl-card"><div class="tbl-scroll"><table class="t"><thead><tr><th>Report</th><th>Title</th><th>Date</th><th>Action Owner</th><th class="r">Updates</th><th></th></tr></thead><tbody>
    ${REPORTS.map(r=>`<tr class="click" data-report="${r.id}"><td class="mono" style="font-weight:500">${r.id}</td><td>${esc(r.title)}</td><td class="muted">${fmtD(r.date)}</td><td>${esc(r.owner)}</td><td class="r num">${r.updates.length}</td><td class="r"><button class="btn xs" data-cmd="open-report" data-id="${r.id}">Open</button></td></tr>`).join('')}
    </tbody></table></div></div></div>`;
}
function openReport(id){
  const r = REPORTS.find(x=>x.id===id); const ups = r.updates.map(i=>STOCK_UPDATES.find(u=>u.id===i)).filter(Boolean);
  openModal(`<div class="mh">${ic('summarize')}<div class="t">${r.id} · ${esc(r.title)}</div><button class="icon-btn" data-cmd="close-modal" aria-label="Close">${ic('close')}</button></div>
    <div class="mb"><div class="fields" style="margin-bottom:14px"><div class="fld"><label>Action owner</label><select class="inp" id="rOwner">${OWNERS.map(o=>`<option ${o===r.owner?'selected':''}>${o}</option>`).join('')}</select></div><div class="fld"><label>Date</label><input class="inp" readonly value="${fmtD(r.date)}"/></div></div>
      <div class="ai-box" style="margin-bottom:14px"><h4>${ic('auto_awesome')}Summary</h4><p id="rBody">${esc(r.body)}</p></div>
      <table class="t"><thead><tr><th>Update</th><th>Activity</th><th>Product</th><th class="r">Qty</th><th>Owner</th></tr></thead><tbody>${ups.map(u=>`<tr><td class="mono">${u.id}</td><td>${u.type}</td><td>${esc(prod(u.pid).sku)}</td><td class="r num">${u.qty>0?'+':''}${u.qty}</td><td>${esc(u.owner)}</td></tr>`).join('')||'<tr><td colspan="5" class="muted">No linked updates</td></tr>'}</tbody></table></div>
    <div class="mf"><button class="btn" data-cmd="dl-report" data-id="${r.id}">${ic('download')}Download</button><button class="btn" data-cmd="email-report" data-id="${r.id}">${ic('mail')}Email owner</button><button class="btn primary" data-cmd="save-report" data-id="${r.id}">Done</button></div>`, true);
}

/* ============ MENUS ============ */
function rowMenu(anchor, id){
  const p = prod(id);
  openMenu(anchor, `<div class="mh2">${esc(p.sku)}</div>
    <button class="mi" data-cmd="open-product" data-id="${id}">${ic('open_in_new')}Open details</button>
    <button class="mi" data-cmd="edit-product" data-id="${id}">${ic('edit')}Edit</button>
    ${isStocked(p)?`<button class="mi" data-cmd="new-stock-update" data-id="${id}">${ic('swap_vert')}Update stock</button><button class="mi" data-cmd="open-move" data-id="${id}">${ic('drive_file_move')}Move</button><button class="mi" data-cmd="count-one" data-id="${id}">${ic('fact_check')}New stock count</button>`:''}
    ${isStocked(p)&&!p.po?`<button class="mi" data-cmd="create-po" data-id="${id}">${ic('shopping_cart')}Create PO</button>`:''}
    <button class="mi" data-cmd="email" data-id="${id}">${ic('mail')}Email manufacturer</button>
    <div class="msep"></div>
    <button class="mi" data-cmd="dup-product" data-id="${id}">${ic('content_copy')}Duplicate</button>
    <button class="mi" data-cmd="filter-mfr" data-id="${id}">${ic('filter_alt')}Filter to ${esc(mfr(p.mfr).name)}</button>
    <div class="msep"></div>
    <button class="mi danger" data-cmd="archive-product" data-id="${id}">${ic('archive')}Archive</button>`);
}
function createMenu(anchor){
  openMenu(anchor, `<div class="mh2">Create</div>
    <button class="mi" data-cmd="new-stock-update">${ic('swap_vert')}Stock update<span class="k">U</span></button>
    <button class="mi" data-cmd="new-stock-update" data-a="Receive">${ic('move_to_inbox')}Receive stock</button>
    <button class="mi" data-cmd="new-stock-update" data-a="Return">${ic('assignment_return')}Return</button>
    <button class="mi" data-cmd="go-counts">${ic('fact_check')}New Stock Counts</button>
    <button class="mi" data-cmd="open-move">${ic('drive_file_move')}Move stock</button>
    <div class="msep"></div>
    <button class="mi" data-cmd="new-product">${ic('add_box')}Product</button>
    <button class="mi" data-cmd="new-shipment">${ic('local_shipping')}Shipment</button>
    <button class="mi" data-cmd="new-report">${ic('summarize')}Action Report</button>
`);
}
function simpleInputModal(title, label, value, cmd, extra=''){
  openModal(`<div class="mh">${ic('edit')}<div class="t">${esc(title)}</div><button class="icon-btn" data-cmd="close-modal" aria-label="Close">${ic('close')}</button></div>
    <div class="mb"><div class="fld"><label>${esc(label)}</label>${value instanceof Array ? `<select class="inp" id="simpleIn">${value.map(v=>`<option>${esc(v)}</option>`).join('')}</select>` : `<input class="inp" id="simpleIn" value="${esc(value)}"/>`}</div>${extra}</div>
    <div class="mf"><button class="btn" data-cmd="close-modal">Cancel</button><button class="btn primary" data-cmd="${cmd}">Apply</button></div>`, false, ()=>setTimeout(()=>$('#simpleIn')?.focus(),40));
}

/* ============ COMMANDS ============ */
const selected = () => [...S.sel].map(prod).filter(Boolean);
function postCount(p){
  const c = S.counts[p.id]; if(c==null) return 0;
  const delta = c - onHand(p); const loc = (p.locs.slice().sort((a,b)=>b.q-a.q)[0]||{s:'A-01'}).s;
  applyDelta(p, loc, delta); p.locs = p.locs.filter(l=>l.q>0); p.lastCount = todayISO; p.updated = todayISO;
  STOCK_UPDATES.unshift(su({ date:todayISO, type:'Count', pid:p.id, loc, qty:delta, unitCost:p.cost, owner:'Etnologic Inc', comments: delta? `Cycle count variance ${delta>0?'+':''}${delta}` : 'Count matched system.' }));
  delete S.counts[p.id]; return delta;
}
const CMD = {
  'go': el => { if(el.dataset.r==='workbench' && el.closest('#nav')) { clearFilters(); } go(el.dataset.r, {v:el.dataset.v, tab:el.dataset.tab}); },

  'open-palette': () => openPalette(),
  'toggle-copilot': () => { const c = $('#copilot'); c.classList.toggle('open'); if(c.classList.contains('open')){ renderCopilot(); setTimeout(()=>$('#cpInput').focus(),220); } },
  'open-scan': () => scanModal(),
  'create-menu': el => createMenu(el),
  'new-stock-update': el => { closeMenu(); closeModal(); stockUpdateForm({ pid:el.dataset.id, type:el.dataset.a, loc:el.dataset.loc }); },
  'ask': el => { const it = interpret(el.dataset.q); if(it.answer && !it.view){ $('#copilot').classList.add('open'); copilotAsk(el.dataset.q); } else applyInterpretation(it); },
  'insight': el => { const x = insights().find(i=>i.id===el.dataset.id); if(x) x.acts[+el.dataset.n].fn(); else toast('Already handled'); },
  'open-wh': el => { closeDrawer(); S.wh = el.dataset.id; const st = gs('warehouse'); st.cf = [{k:'loc', op:'is', v:WAREHOUSES.find(w=>w.id===el.dataset.id).name}]; go('warehouse'); },
  'open-update': el => openUpdate(el.dataset.id),
  'kpi': el => { const k = el.dataset.k; const was = S.f.kpi===k && S.route==='workbench'; if(S.route!=='workbench'){ clearFilters(); } S.f.kpi = was ? null : k; const v = k==='reorder'?'reorder':k==='overdue'?'counts':(S.route==='workbench'&&S.view!=='catalog'?S.view:'stock'); go('workbench',{v}); },
  'kpi-low': () => { S.f.kpi='low'; updateWB(); },
  'go-wh': () => go('warehouse'),
  'filter-drafts': () => { S.f.name=''; S._drafts = true; S.aiChips = ['Drafts']; updateWB(); const rows = PRODUCTS.filter(p=>p.status==='Draft'); if(rows[0]) openProduct(rows[0].id); },
  'sort-shelf': () => { S.sort = {k:'wh', dir:1}; updateWB(); toast('Sorted by shelf for the shortest walk'); },
  'toggle-pub': el => { const p = prod(el.dataset.id); const prev = p.status; p.status = p.status==='Published' ? 'Draft' : 'Published'; closeMenu(); toast(`${p.sku} ${p.status==='Published'?'published':'unpublished'}`, ()=>{p.status=prev;}); render(); if($('#drawer').classList.contains('open') && $('#pBody')) openProduct(p.id); },
  'row-menu': el => rowMenu(el, el.dataset.id),
  'open-shelf': el => { closeModal(); shelfDrawer(el.dataset.id); },
  'open-move': el => { closeMenu(); closeDrawer(); moveModal(el.dataset.id); },
  'open-po': el => poModal(prod(el.dataset.id)),
  'email': el => { closeMenu(); emailModal(prod(el.dataset.id), 'reorder'); },
  'send-po': el => sendPO(prod(el.dataset.id)),
  'receive-po': el => { const p = prod(el.dataset.id); closeModal(); const po = p.po; stockUpdateForm({ pid:p.id, type:'Receive', qty:po.qty, comments:`${po.id} received` }); S._receivingPO = p.id; },
  'create-po': el => { closeMenu(); createPO(prod(el.dataset.id)); },
  'cancel-po': el => { const p = prod(el.dataset.id); const prev = p.po; p.po = null; closeModal(); toast(`${prev.id} deleted`, ()=>{p.po=prev;}); render(); },
  'post-count': el => { const id = el.dataset.id; const p = prod(id.split('@')[0]); const d = postCountRow(id); toast(`New stock count posted · ${p.sku} variance ${d>0?'+':''}${d}`); render(); },
  'go-counts': () => { closeMenu(); go('workbench',{v:'counts'}); toast('New Stock Counts column added — type counted quantities and post'); },
  'count-one': el => { closeMenu(); clearFilters(); S.f.sku = prod(el.dataset.id).sku; go('workbench',{v:'counts'}); setTimeout(()=>$(`[data-count="${el.dataset.id}"]`)?.focus(),50); },
  'export-table': () => { const cols = colsFor(S.view).filter(c=>c.get); const rows = viewRows(); download(`etnologic-${S.view}.csv`, toCSV([['SKU',...cols.map(c=>c.t)], ...rows.map(p=>[p.sku, ...cols.map(c=>c.get(p))])]), 'text/csv'); },
  'new-product': el => { closeMenu(); closeModal(); newProductForm(el.dataset.sku||''); },
  'clear-filters': () => { clearFilters(); S._drafts=false; updateWB(); if(S.route!=='workbench') render(); const fn=$('#fName'), fs=$('#fSku'); if(fn) fn.value=''; if(fs) fs.value=''; },
  'view': el => { S.view = el.dataset.v; if(S.view==='catalog') S.counting=false; S.sort = {k:null,dir:1}; S.sel.clear(); render(); },
  'toggle-counts': () => { closeMenu(); S.route='workbench'; S.view='stock'; S.counting = !S.counting; S.sel.clear(); render(); toast(S.counting?'New Stock Counts column added — type counted quantities and post':'Counting closed'); },
  'add-chan-d': el => { const p = prod(el.dataset.id); const c = ($('#newChan')?.value||'').trim(); if(!c) return toast('Type a channel name'); if(!CHANNELS_ALL.includes(c)) CHANNELS_ALL.push(c); if(!p.channels.includes(c)) p.channels.push(c); render(); openProduct(p.id,'channels'); toast(`${p.sku} listed on ${c}`); },
  'g-sel': el => { const st = gs(el.dataset.t), id = el.dataset.id; st.sel.has(id) ? st.sel.delete(id) : st.sel.add(id); drawTable(); },
  'g-sel-all': el => { const k = el.dataset.t, st = gs(k); const rows = gRows(k); const all = rows.every(r=>st.sel.has(r.id)); rows.forEach(r=> all ? st.sel.delete(r.id) : st.sel.add(r.id)); drawTable(); },
  'g-clear-sel': el => { gs(el.dataset.t).sel.clear(); drawTable(); },
  'g-col-menu': el => { if(DRAG.justResized) return; colMenu(el, el.dataset.t, el.dataset.k); },
  'g-add-col': el => { const th = el.closest('th'); const anchor = el.closest('#menu') ? ($(`th[data-col="${el.dataset.at}"]`) || $('.th-add') || el) : el; addColMenu(anchor, el.dataset.t, el.dataset.at, el.dataset.side); },
  'g-add-col-go': el => { const key = el.dataset.t, st = gs(key); const name = ($('#ncName')?.value||'').trim(); if(!name){ $('#ncName')?.classList.add('err'); $('#ncName')?.focus(); return; } const type = (document.querySelector('input[name="ncType"]:checked')||{}).value || 'text';
    const k = 'cc_'+Date.now().toString(36); st.custom.push({ k, t:name, type, opts: type==='select'?[]:undefined, vals:{} });
    const ks = colsOf(key).map(c=>c.k).filter(x=>x!==k); if(el.dataset.at){ let i = ks.indexOf(el.dataset.at); if(el.dataset.side==='right') i++; ks.splice(i,0,k); } else ks.push(k); setOrder(key, ks);
    closeMenu(); drawTable(); toast(`Column “${name}” added`, ()=>{ st.custom = st.custom.filter(c=>c.k!==k); saveGrid(); drawTable(); });
    setTimeout(()=>{ const th = $(`th[data-col="${k}"]`); th && th.scrollIntoView({inline:'center', block:'nearest'}); th && th.classList.add('flash'); }, 40); },
  'g-rename': el => { closeMenu(); const th = $(`th[data-col="${el.dataset.k}"]`); renameMenu(th||el, el.dataset.t, el.dataset.k); },
  'g-rename-go': el => { const key = el.dataset.t, k = el.dataset.k, st = gs(key); const v = ($('#rnIn')?.value||'').trim(); if(!v) return; const cc = st.custom.find(c=>c.k===k); if(cc) cc.t = v; else { const base = TABLES[key].cols.find(c=>c.k===k); if(base && base.t===v) delete st.names[k]; else st.names[k] = v; } saveGrid(); closeMenu(); drawTable(); toast('Column renamed'); },
  'g-move': el => { if(el.disabled) return; const key = el.dataset.t, k = el.dataset.k, d = +el.dataset.d; const ks = colsOf(key).map(c=>c.k); const i = ks.indexOf(k), j = i+d; if(j<0||j>=ks.length) return; [ks[i],ks[j]] = [ks[j],ks[i]]; setOrder(key, ks); closeMenu(); drawTable(); const th = $(`th[data-col="${k}"]`); th && th.classList.add('flash'); },
  'g-autofit': el => { delete gs(el.dataset.t).widths[el.dataset.k]; saveGrid(); closeMenu(); drawTable(); },
  'g-del-col': el => { const key = el.dataset.t, k = el.dataset.k, st = gs(key); const i = st.custom.findIndex(c=>c.k===k); if(i<0) return; const [cc] = st.custom.splice(i,1); st.cf = st.cf.filter(f=>f.k!==k); if(st.sort.k===k) st.sort = {k:null,dir:1}; saveGrid(); closeMenu(); drawTable(); toast(`Deleted “${cc.t}”`, ()=>{ st.custom.splice(i,0,cc); saveGrid(); drawTable(); }); },
  'g-reset-cols': el => { const st = gs(el.dataset.t); st.order = null; st.widths = {}; st.names = {}; st.hidden.clear(); saveGrid(); closeMenu(); drawTable(); toast('Columns reset to the field list (your added columns are kept at the end)'); },
  'g-cc-edit': el => ccEdit(el),
  'g-cc-check': el => { const cc = gs(el.dataset.t).custom.find(c=>c.k===el.dataset.k); if(!cc) return; if(el.checked) cc.vals[el.dataset.id] = true; else delete cc.vals[el.dataset.id]; saveGrid(); },
  'g-cc-set': el => { const cc = gs(el.dataset.t).custom.find(c=>c.k===el.dataset.k); if(!cc) return; if(el.dataset.v) cc.vals[el.dataset.id] = el.dataset.v; else delete cc.vals[el.dataset.id]; saveGrid(); closeMenu(); drawTable(); },
  'g-cc-opt': el => { const cc = gs(el.dataset.t).custom.find(c=>c.k===el.dataset.k); const v = ($('#optIn')?.value||'').trim(); if(!cc||!v) return; cc.opts = cc.opts||[]; if(!cc.opts.includes(v)) cc.opts.push(v); cc.vals[el.dataset.id] = v; saveGrid(); closeMenu(); drawTable(); },
  'g-sort': el => { closeMenu(); gs(el.dataset.t).sort = {k:el.dataset.k, dir:+el.dataset.d}; drawTable(); },
  'g-hide': el => { closeMenu(); gs(el.dataset.t).hidden.add(el.dataset.k); saveGrid(); drawTable(); toast('Column hidden', ()=>{ gs(el.dataset.t).hidden.delete(el.dataset.k); saveGrid(); drawTable(); }); },
  'g-cols': el => colsMenu(el, el.dataset.t),
  'g-toggle-col': el => { const st = gs(el.dataset.t), k = el.dataset.k; st.hidden.has(k) ? st.hidden.delete(k) : st.hidden.add(k); saveGrid(); el.classList.toggle('on'); drawTable(); },
  'g-show-all': el => { closeMenu(); gs(el.dataset.t).hidden.clear(); saveGrid(); drawTable(); },
  'g-filter-menu': el => filterMenu(el, el.dataset.t),
  'g-pf': el => { const a = $('[data-cmd="g-filter-menu"]') || el; pfMenu(a, el.dataset.f); },
  'g-pf-toggle': el => { const set = S.f[el.dataset.f], v = el.dataset.v; set.has(v) ? set.delete(v) : set.add(v); el.classList.toggle('on'); drawTable(); },
  'g-pf-text': el => { const f = el.dataset.f; S.f[f] = ($('#pfIn')?.value||'').trim(); closeMenu(); drawTable(); },
  'g-cf-new': el => { const a = $('[data-cmd="g-filter-menu"]') || el; cfMenu(a, el.dataset.t, el.dataset.k); },
  'g-cf-add': el => { const op = $('#cfOp').value, v = $('#cfV').value; if(!['empty','notempty'].includes(op) && v==='') return toast('Enter a value'); gs(el.dataset.t).cf.push({k:el.dataset.k, op, v}); closeMenu(); drawTable(); },
  'g-rm-cf': el => { gs(el.dataset.key).cf.splice(+el.dataset.val,1); drawTable(); },
  'g-clear': el => { const k = el.dataset.t; gs(k).cf = []; gs(k).q=''; if(TABLES[k].product) clearFilters(); render(); },
  'g-filter': el => { const k = curTable(); gs(k).cf.push({k:el.dataset.k, op:'is', v:el.dataset.v}); drawTable(); },
  'g-export': el => { const k = el.dataset.t, T = TABLES[k], st = gs(k); const cols = colsOf(k).filter(c=>c.get && !st.hidden.has(c.k)); const rows = gRows(k); download(`etnologic-${k}.csv`, toCSV([cols.map(c=>c.t), ...rows.map(r=>cols.map(c=>c.get(r)))]), 'text/csv'); toast(`Exported ${rows.length} ${T.noun}`); },
  'g-bulk': el => { const k = el.dataset.t, a = el.dataset.a, st = gs(k); const T = TABLES[k]; const rows = T.rows().filter(r=>st.sel.has(r.id)); const ps = [...new Set(rows.map(r=>r.p).filter(Boolean))];
    if(a==='b-update'){ const p = ps.find(isStocked); if(!p) return toast('Select stocked products'); stockUpdateForm({pid:p.id}); toast(`Updating ${p.sku}${ps.length>1?` — ${ps.length-1} more queued`:''}`); return; }
    if(a==='b-post'){ let t=0,n=0; rows.forEach(r=>{ if(S.counts[r.id]!=null){ t+=postCountRow(r.id); n++; } }); st.sel.clear(); render(); return toast(n?`Posted ${n} new stock counts · net variance ${t>0?'+':''}${t}`:'Type counts in New Stock Counts first'); }
    if(a==='b-po'){ const ro = ps.filter(p=>isStocked(p)&&!p.po); if(!ro.length) return toast('Selected items already have orders'); draftPOs(ro); st.sel.clear(); return; }
    if(a==='b-email'){ emailModal(ps[0], 'reorder'); return; }
    if(a==='b-channel'){ S.sel = new Set(ps.map(p=>p.id)); return simpleInputModal(`Add ${ps.length} products to a distribution channel`, 'Distribution Channel', '', 'bulk-channel-ok', `<div class="help" style="margin-top:6px">Type any channel — existing: ${CHANNELS_ALL.map(esc).join(', ')}</div>`); }
    if(a==='b-report'){ createReport([...st.sel]); st.sel.clear(); return; }
    if(a==='b-move'){ const sh = rows.map(r=>r.s).find(s=>s.items.length); if(!sh) return toast('Selected shelves are empty'); moveModal(sh.items[0].p.id); return; }
    if(a==='b-count'){ const ids = rows.map(r=>r.id); clearFilters(); S.f.shelf = ids[0]; st.sel.clear(); go('workbench',{v:'counts'}); toast(`Counting ${ids[0]}${ids.length>1?` — ${ids.length-1} more shelves next`:''}`); return; }
    if(a==='b-export'){ CMD['g-export']({dataset:{t:k}}); } },
  'ship-all': () => { S.shipWh = null; render(); },
  'scan-code': el => { scanModal(); setTimeout(()=>{ const i=$('#scanIn'); if(i){ i.value = el.dataset.id; scanLookup(el.dataset.id); } },80); },
  'ship-for': el => { S.shipWh = el.dataset.id; S.shipTab='all'; go('shipping'); },
  'wh-layout': el => { S.whLayout = el.dataset.l; render(); },
  'wh-pick': el => { S.wh = el.dataset.id; drawTable(); },
  'shelf-drawer': el => shelfDrawer(el.dataset.id),
  'unlist': el => { const p = prod(el.dataset.id), c = el.dataset.c; const i = p.channels.indexOf(c); if(i<0) return; p.channels.splice(i,1); render(); toast(`${p.sku} removed from ${c}`, ()=>{ p.channels.splice(i,0,c); render(); }); },
  'chan-menu': el => { const p = prod(el.dataset.id); const rest = CHANNELS_ALL.filter(c=>!p.channels.includes(c)); openMenu(el, `<div class="mh2">Distribution Channel</div>${rest.map(c=>`<button class="mi" data-cmd="list-chan" data-id="${p.id}" data-c="${esc(c)}">${ic('add')}${esc(c)}</button>`).join('')}${rest.length?'<div class="msep"></div>':''}<div style="padding:6px 8px;display:flex;gap:6px"><input class="inp" id="newChan" placeholder="Your channel name" style="height:30px;font-size:12.5px"/><button class="btn xs primary" data-cmd="add-chan" data-id="${p.id}">Add</button></div><div class="muted" style="font-size:11.5px;padding:0 10px 8px">Channels are yours to define — any store, marketplace, wholesale account or retail location.</div>`); setTimeout(()=>{ const i=$('#newChan'); i&&i.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); CMD['add-chan']({dataset:{id:p.id}}); } }); },30); },
  'list-chan': el => { const p = prod(el.dataset.id), c = el.dataset.c; closeMenu(); if(!p.channels.includes(c)) p.channels.push(c); render(); toast(`${p.sku} listed on ${c}`, ()=>{ p.channels = p.channels.filter(x=>x!==c); render(); }); },
  'add-chan': el => { const p = prod(el.dataset.id); const c = ($('#newChan')?.value||'').trim(); if(!c) return toast('Type a channel name'); if(!CHANNELS_ALL.includes(c)) CHANNELS_ALL.push(c); CMD['list-chan']({dataset:{id:p.id, c}}); },
  'toggle-rail': () => { S.railOpen = !S.railOpen; render(); },
  'layout': el => { S.layout = el.dataset.l; render(); },
  'density': () => { S.dense = !S.dense; render(); },
  'facet': el => { const set = S.f[el.dataset.key]; set.has(el.dataset.val) ? set.delete(el.dataset.val) : set.add(el.dataset.val); updateWB(); },
  'rm-facet': el => { S.f[el.dataset.key].delete(el.dataset.val); updateWB(); },
  'rm-x': el => { const k = el.dataset.key; S.f[k] = (k==='name'||k==='sku') ? '' : null; if(k==='name'&&$('#fName')) $('#fName').value=''; if(k==='sku'&&$('#fSku')) $('#fSku').value=''; updateWB(); },
  'save-view': () => simpleInputModal('Save view', 'View name', S.aiChips?S.aiChips.join(' · '):'My view', 'save-view-ok'),
  'save-view-ok': () => { const n = $('#simpleIn').value||'My view'; const snap = {}; Object.entries(S.f).forEach(([k,v])=>snap[k]= v instanceof Set? new Set(v): v); (S.saved = S.saved||[]).push({n, f:snap, v:S.view}); NAV[1].items.push({r:'workbench', v:S.view, i:'bookmark', t:n, saved:S.saved.length-1}); closeModal(); toast(`Saved “${n}” to the header`); renderNav(); },
  'open-product': el => { closeMenu(); closeModal(); closePalette(); openProduct(el.dataset.id); },
  'sel': el => { const id = el.dataset.id; S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id); renderTable(); },
  'sel-all': el => { const rows = viewRows(); const all = rows.every(r=>S.sel.has(r.id)); rows.forEach(r=> all ? S.sel.delete(r.id) : S.sel.add(r.id)); renderTable(); },
  'clear-sel': () => { S.sel.clear(); renderTable(); },
  'sort': el => { const k = el.dataset.k; S.sort = S.sort.k===k ? {k, dir:-S.sort.dir} : {k, dir:1}; renderTable(); },
  'bulk': el => bulk(el.dataset.a),
  'close-drawer': () => closeDrawer(),
  'close-modal': () => closeModal(),
  'ptab': el => openProduct(el.dataset.id, el.dataset.tab),
  'edit-product': el => { closeMenu(); openProduct(el.dataset.id, 'overview', true); },
  'save-product': el => { const p = prod(el.dataset.id); const prev = JSON.stringify(p);
    p.name = $('#eName').value; p.sku = $('#eSku').value; p.category = $('#eCat').value; p.price = +$('#ePrice').value; p.cost = +$('#eCost').value; p.min = +$('#eMin').value; p.vol = +$('#eVol').value; p.mfr = $('#eMfr').value; p.ftype = $('#eFt').value; p.desc = $('#eDesc').value;  p.updated = todayISO;
    toast(`${p.sku} saved`, ()=>{ Object.assign(p, JSON.parse(prev)); }); render(); openProduct(p.id); },
  'apply-min-inline': el => { $('#eMin').value = el.dataset.v; },
  'apply-min': el => { const p = prod(el.dataset.id); const prev = p.min; p.min = suggestMin(p); toast(`Minimum level ${prev} → ${p.min}`, ()=>{p.min=prev;}); render(); openProduct(p.id); },
  'ai-desc': el => { const p = prod(el.dataset.id); const m = mfr(p.mfr); $('#eDesc').value = `${p.name.split(' — ')[0]}${p.ftype==='In-House'?', made in Corinth, Mississippi':''}. ${p.desc.split('.')[0]}. ${p.labels.includes('Gift-ready')?'Arrives gift-ready. ':''}${p.ftype==='POD'?`Printed to order by ${m.name}.`:p.ftype==='Dropship'?`Ships direct from ${m.name}.`:'Ships in 1–2 days from our Corinth warehouse.'}`; toast('Description rewritten'); },
  'ai-desc-view': el => { openProduct(el.dataset.id, 'overview', true); setTimeout(()=>CMD['ai-desc'](el), 30); },
  'toggle-chip': el => el.classList.toggle('on'),
  'dismiss-ai': el => el.closest('.ai-box')?.remove(),
  'toggle-channel': el => { const p = prod(el.dataset.id), c = el.dataset.c; const i = p.channels.indexOf(c); i>=0 ? p.channels.splice(i,1) : p.channels.push(c); toast(`${p.sku} ${i>=0?'removed from':'listed on'} ${c}`); render(); openProduct(p.id, 'channels'); },
  'copy-json': el => { try{ navigator.clipboard.writeText(JSON.stringify(prod(el.dataset.id),null,2)); toast('Copied record JSON'); }catch(e){ toast('Copy blocked — select the text instead'); } },
  'api-modal': () => openModal(`<div class="mh">${ic('code')}<div class="t">Inventory API</div><button class="icon-btn" data-cmd="close-modal" aria-label="Close">${ic('close')}</button></div><div class="mb"><p class="muted" style="margin:0 0 10px">Same records as the table. Example request:</p><div class="code">POST /v1/stock-updates
Authorization: Bearer ••••••••
{
  "type": "Receive",
  "sku": "CND-SOY-CED",
  "location": "C-01",
  "quantity": 96,
  "unit_cost": 8.25,
  "serials": [],
  "owner": "Marcus Bell",
  "comments": "PO-2026-0421"
}

GET /v1/products?ftype=Wholesale&reorder_needed=true
GET /v1/shelves?warehouse=CDC&status=near</div></div><div class="mf"><button class="btn" data-cmd="close-modal">Close</button><button class="btn primary" data-cmd="gen-key">Generate key</button></div>`),
  'gen-key': () => { closeModal(); toast('API key created: etn_live_••••7f2c'); },
  'pick-route': el => { el.parentElement.querySelectorAll('.route').forEach(r=>r.classList.remove('on')); el.classList.add('on'); toast(`Routing set to ${el.querySelector('div[style*="flex:1"] div').textContent}`); },
  'pick-rate': el => { $$('#shRates .route').forEach(r=>r.classList.remove('on')); el.classList.add('on'); S._rate = {c:el.dataset.c, p:+el.dataset.p}; },
  'gen-variants': el => { const p = prod(el.dataset.id); toast(`8 variants generated for ${p.sku.split('-').slice(0,2).join('-')} (Black/White × S–XL)`); },
  'design-studio': () => toast('Design studio opens in the Designer module'),
  'su-ai': () => { const v = $('#suAI').value.trim(); if(!v){ $('#suAI').focus(); toast('Describe the update first'); return; } aiFillSU(v); },
  'su-ai-sample': () => { $('#suAI').value = 'Received 96 Cedar candles CND-SOY-CED from Magnolia at $8.25 per unit, put on C-01. PO-2026-0421'; aiFillSU($('#suAI').value); },
  'toggle-self': el => el.classList.toggle('on'),
  'su-save': el => { saveSU(!!el.dataset.more); if(S._receivingPO){ const p = prod(S._receivingPO); if(p && p.po){ p.po.status='Received'; const po=p.po; setTimeout(()=>{ p.po=null; render(); }, 10); toast(`${po.id} marked received`); } S._receivingPO=null; } },
  'do-move': () => { const p = prod($('#mvP').value), f = $('#mvF').value, t = $('#mvT').value, q = +$('#mvQ').value; if(!q || q<1){ toast('Enter a quantity'); return; } if(q > qtyAt(p,f)){ toast(`Only ${qtyAt(p,f)} at ${f}`); return; } if(f===t){ toast('Pick a different shelf'); return; } closeModal(); doMove(p, f, t, q, $('#mvR').value); },
  'send-email': el => { closeModal(); toast(`Email sent to ${el.dataset.to}`); },
  'sim-scan': () => { const pool = ['CND-SOY-CED','TEE-001-BLK-L','B-02','ZH-0007','HD-211-GRY-M','PO-2026-0418']; const c = pool[Math.floor(Math.random()*pool.length)]; $('#scanIn').value = c; scanLookup(c); },
  'scan-plus': el => { const p = prod(el.dataset.id); const loc = (p.locs.slice().sort((a,b)=>b.q-a.q)[0]||{s:bestShelf(p).id}).s; applyDelta(p, loc, 1); STOCK_UPDATES.unshift(su({date:todayISO, type:'Receive', pid:p.id, loc, qty:1, unitCost:p.cost, owner:'Etnologic Inc', comments:'Scan +1'})); p.updated=todayISO; toast(`+1 ${p.sku} at ${loc} · now ${onHand(p)}`); scanLookup(p.sku); render(); },
  'scan-act': el => { closeModal(); stockUpdateForm({pid:el.dataset.id, type:el.dataset.a}); },
  'scan-move': el => { closeModal(); moveModal(el.dataset.id); },
  'scan-open': el => { closeModal(); openProduct(el.dataset.id); },
  'scan-shelf': el => { closeModal(); S.shelf = el.dataset.id; S.wh = whOfAisle(aisleOf(el.dataset.id)).id; go('warehouse'); },
  'scan-count-shelf': el => { closeModal(); clearFilters(); S.f.shelf = el.dataset.id; S.aiChips=['Shelf '+el.dataset.id]; go('workbench',{v:'counts'}); },
  'pal-apply': () => applyInterpretation(window._palIt),
  'pal-prod': el => { closePalette(); openProduct(el.dataset.id); },
  'pal-act': el => { closePalette(); const a = el.dataset.a; if(a==='mode-simple') return setMode('simple'); if(a==='mode-expert') return setMode('expert'); CMD[a]({dataset:{}}); },
  'pal-go': el => { closePalette(); clearFilters(); go(el.dataset.r, {v:el.dataset.v||undefined}); },
  'pal-try': el => { $('#palIn').value = el.dataset.q; palRender(); $('#palIn').focus(); },
  'cp-apply': el => { const it = window._cpIts[+el.dataset.i]; applyInterpretation(it); },
  'draft-all': () => { const ro = PRODUCTS.filter(p=>reorderNeeded(p)&&!p.po); if(!ro.length){ toast('Nothing to draft — all covered'); return; } draftPOs(ro); },
  'export-json': () => download('stock-updates.json', JSON.stringify(STOCK_UPDATES, null, 2), 'application/json'),
  'export-updates': el => { const list = el.dataset.sel ? STOCK_UPDATES.filter(u=>S.updSel.has(u.id)) : STOCK_UPDATES; download('stock-updates.csv', toCSV([['Stock Update ID','Auto Number','Transaction Date','Activity','SKU','Location','Quantity','Usable Return','Unusable Return','Unit Cost ($)','Serial Numbers','Action Owner','Comments'], ...list.map(u=>[u.id,u.auto,u.date,u.type,prod(u.pid).sku,u.loc,u.qty,u.usable,u.unusable,u.unitCost,u.serials,u.owner,u.comments])]), 'text/csv'); },
  'new-report': () => { closeMenu(); if(S.route==='updates' && S.updSel.size) return createReport([...S.updSel]); const recent = STOCK_UPDATES.filter(u=>daysAgo(u.date)<=3).map(u=>u.id); createReport(recent.length?recent:STOCK_UPDATES.slice(0,5).map(u=>u.id)); },
  'report-week': () => createReport(STOCK_UPDATES.filter(u=>daysAgo(u.date)<=7).map(u=>u.id)),
  'upd-clear': () => { S.updSel.clear(); window._drawUpd && window._drawUpd(); },
  'upd-sel': el => { const id = el.dataset.id; S.updSel.has(id) ? S.updSel.delete(id) : S.updSel.add(id); window._drawUpd && window._drawUpd(); },
  'reverse-update': el => { const u = STOCK_UPDATES.find(x=>x.id===el.dataset.id); const p = prod(u.pid);
    if(u.type==='Transfer'){ const [f,t] = u.loc.split('→'); if(t && qtyAt(p,t)>=u.qty) moveQty(p, t, f, u.qty); }
    else { const d = u.type==='Return' ? u.usable : u.qty; applyDelta(p, u.loc, -d); p.locs = p.locs.filter(l=>l.q>0); }
    const r = su({date:todayISO, type:'Adjust', pid:p.id, loc:u.loc.split('→')[0], qty:-(u.type==='Return'?u.usable:u.type==='Transfer'?0:u.qty), unitCost:u.unitCost, owner:'Etnologic Inc', comments:`Reversal of ${u.id}`}); STOCK_UPDATES.unshift(r);
    closeDrawer(); toast(`${u.id} reversed with ${r.id}`); render(); },
  'report-one': el => { closeDrawer(); createReport([el.dataset.id]); },
  'new-shipment': el => { closeMenu(); shipmentModal(el.dataset.dir||'Outbound'); },
  'create-ship': () => createShipment(),
  'add-shelf': () => { const w = WAREHOUSES.find(x=>x.id===S.wh); w.shelvesPerAisle++; const a = w.aisles[w.aisles.length-1]; toast(`Added ${a}-${String(w.shelvesPerAisle).padStart(2,'0')} to ${w.name}`, ()=>{ w.shelvesPerAisle--; }); render(); },
  'export-shelves': () => download('shelves.csv', toCSV([['Shelf','Location','Aisle','Type','Capacity status','Shelf capacity (ft3)','Minimum level','Used space (ft3)','Available space (ft3)','Products'], ...allShelves().map(s=>[s.id, s.w.name, s.a, s.w.kind, SH_STATUS[s.status][0], s.cap, s.min, s.used.toFixed(2), s.avail.toFixed(2), s.items.map(x=>`${x.p.sku}×${x.q}`).join(' ')])]), 'text/csv'),
  'shelf-to-table': el => { clearFilters(); S.f.shelf = el.dataset.id; S.aiChips = ['Shelf '+el.dataset.id]; go('workbench',{v:'locations'}); },
  'print-tag': el => { openModal(`<div class="mh">${ic('qr_code_2')}<div class="t">Shelf tag ${el.dataset.id}</div><button class="icon-btn" data-cmd="close-modal" aria-label="Close">${ic('close')}</button></div><div class="mb" style="text-align:center"><div style="display:inline-block;border:1px solid var(--ink);border-radius:8px;padding:18px 28px"><div class="mono" style="font-size:28px;font-weight:600">${el.dataset.id}</div><div class="barcode" style="margin:10px 0">${Array.from({length:40},(_,i)=>`<i style="width:${[1,2,3,1][i%4]}px;background:#111"></i>`).join('')}</div><div class="muted" style="font-size:12px">${esc(whOfAisle(aisleOf(el.dataset.id)).name)}</div></div></div><div class="mf"><button class="btn" data-cmd="close-modal">Close</button><button class="btn primary" data-cmd="dl-tag" data-id="${el.dataset.id}">${ic('download')}Download</button></div>`); },
  'dl-tag': el => { download(`shelf-${el.dataset.id}.txt`, `SHELF ${el.dataset.id}\n${whOfAisle(aisleOf(el.dataset.id)).name}`); closeModal(); },
  'batch-labels': () => { const n = SHIPMENTS.filter(s=>s.status==='Label created'); if(!n.length) return toast('No labels waiting'); download('labels-batch.txt', n.map(s=>`${s.id} | ${s.carrier} | ${s.party} | ${s.ref}`).join('\n')); },
  'ship-tab': el => { S.shipTab = el.dataset.t; render(); },
  'receive-ship': el => { const s = SHIPMENTS.find(x=>x.id===el.dataset.id); closeDrawer(); const p = PRODUCTS.find(x=>x.po && x.po.id===s.ref);
    if(p){ S._receivingPO = p.id; S._receivingShip = s.id; stockUpdateForm({pid:p.id, type:'Receive', qty:p.po.qty, comments:`${s.ref} via ${s.id}`}); } else { s.status='Received'; toast(`${s.id} received`); render(); } },
  'fix-ship': el => { const s = SHIPMENTS.find(x=>x.id===el.dataset.id); s.status='In transit'; s.note=''; closeDrawer(); toast(`${s.id} address corrected and re-released`); render(); },
  'label': el => labelModal(el.dataset.id),
  'dl-label': el => { const s = SHIPMENTS.find(x=>x.id===el.dataset.id); download(`label-${s.id}.txt`, `${s.carrier}\nFROM Etnologic Inc, Corinth MS\nTO ${s.party}\nREF ${s.ref}\nWEIGHT ${s.weight} lb`); if(s.status==='Label created') {} closeModal(); },
  'advance-ship': el => { const s = SHIPMENTS.find(x=>x.id===el.dataset.id); const steps = s.dir==='Inbound' ? ['Scheduled','Awaiting pickup','In transit','Received'] : ['Label created','In transit','Delivered']; const i = steps.indexOf(s.status); s.status = steps[Math.min(steps.length-1, (i<0?0:i)+1)]; toast(`${s.id} → ${s.status}`); render(); openShipment(s.id); },
  'ugc': el => { const i = S.ugc.findIndex(u=>u.id===el.dataset.id); const u = S.ugc.splice(i,1)[0]; toast(`Review ${el.dataset.a==='approve'?'published':'rejected'}`, ()=>{ S.ugc.splice(i,0,u); }); render(); },
  'ch-table': el => { clearFilters(); S.f.channel.add(el.dataset.id); go('workbench',{v:'catalog'}); },
  'price-cat': el => { S.priceCat = el.dataset.c; render(); },
  'open-report': el => openReport(el.dataset.id),
  'save-report': el => { const r = REPORTS.find(x=>x.id===el.dataset.id); r.owner = $('#rOwner').value; closeModal(); toast(`${r.id} saved · owner ${r.owner}`); render(); },
  'dl-report': el => { const r = REPORTS.find(x=>x.id===el.dataset.id); download(`${r.id}.md`, `# ${r.id} — ${r.title}\n\nDate: ${r.date}\nAction owner: ${r.owner}\n\n${r.body}\n\nUpdates: ${r.updates.join(', ')}\n`, 'text/markdown'); },
  'email-report': el => { const r = REPORTS.find(x=>x.id===el.dataset.id); closeModal(); toast(`${r.id} emailed to ${r.owner}`); },
  'new-rule': () => { closeMenu(); ruleModal(); },
  'rule-ai': () => { const t = ($('#rlAI').value||'').toLowerCase(); if(!t) return toast('Describe the rule first'); $('#rlName').value = $('#rlAI').value.slice(0,48); $('#rlWhen').value = /count|check/.test(t)?'Last stock check > 30 days':/shelf|space|full/.test(t)?'Shelf used > 90%':/return/.test(t)?'Unusable return logged':/exception|ship/.test(t)?'Shipment exception':/supplier|dropship/.test(t)?'Supplier stock < 25':'Stock < Reorder level'; $('#rlCond').value = /candle|home/.test(t)?'Area is Home & Living':/dropship/.test(t)?'Fulfillment is Dropship':/wholesale|in-house/.test(t)?'Fulfillment is Wholesale or In-House':'Area is any'; $('#rlThen').value = /po|order|email/.test(t)?'Draft PO to manufacturer · Email owner':/pause/.test(t)?'Pause on TikTok Shop · Notify':/count/.test(t)?'Add to next cycle count':/move|overflow/.test(t)?'Suggest overflow move to Tupelo':'Create action report'; toast('Rule built — review and create'); },
  'rule-save': () => { RULES.push({ id:'R'+(RULES.length+1), on:true, name:$('#rlName').value, when:$('#rlWhen').value, cond:$('#rlCond').value, then:$('#rlThen').value, runs:0 }); closeModal(); toast('Rule created and active'); render(); },
  'rule-toggle': el => { const r = RULES.find(x=>x.id===el.dataset.id); r.on = !r.on; toast(`${r.name} ${r.on?'on':'off'}`); render(); },
  'rule-run': el => { const r = RULES.find(x=>x.id===el.dataset.id); r.runs++; if(r.id==='R1'){ const ro = PRODUCTS.filter(p=>reorderNeeded(p)&&!p.po); if(ro.length) draftPOs(ro); else toast('Rule ran · nothing below reorder level'); } else { toast(`${r.name} ran · ${r.id==='R4'?allShelves().filter(s=>s.status==='near'||s.status==='full').length+' shelves flagged':'0 matches'}`); } render(); },
  'dup-product': el => { closeMenu(); const p = prod(el.dataset.id); const n = P(JSON.parse(JSON.stringify(p))); n.id = p.id+'c'+Date.now()%1000; n.sku = p.sku+'-COPY'; n.name = p.name+' (copy)'; n.locs = []; n.po = null; n.status='Draft'; n.added = todayISO; PRODUCTS.splice(PRODUCTS.indexOf(p)+1, 0, n); toast(`Duplicated as ${n.sku}`, ()=>{ PRODUCTS.splice(PRODUCTS.indexOf(n),1); }); render(); },
  'filter-mfr': el => { closeMenu(); closeDrawer(); const p = prod(el.dataset.id); clearFilters(); S.f.mfr.add(p.mfr); if(S.route!=='workbench') go('workbench'); else updateWB(); },
  'archive-product': el => { closeMenu(); closeDrawer(); const p = prod(el.dataset.id); const i = PRODUCTS.indexOf(p); PRODUCTS.splice(i,1); ARCHIVED.push(p); toast(`${p.sku} archived`, ()=>{ ARCHIVED.splice(ARCHIVED.indexOf(p),1); PRODUCTS.splice(i,0,p); }); render(); },
  'np-ai': () => { const v = $('#npAI').value.trim(); if(!v) { $('#npAI').focus(); return toast('Describe the product first'); } npAI(v); },
  'np-sample': () => { $('#npAI').value = 'Olive washed dad cap, wholesale from Cotton Source at $5.80, sell for $24'; npAI($('#npAI').value); },
  'np-save': () => npSave(),
  // bulk-specific simple modals
  'bulk-label-ok': () => { const l = $('#simpleIn').value; selected().forEach(p=>{ if(!p.labels.includes(l)) p.labels.push(l); }); closeModal(); toast(`Added “${l}” to ${S.sel.size} products`); S.sel.clear(); render(); },
  'bulk-channel-ok': () => { const c = $('#simpleIn').value; selected().forEach(p=>{ if(!p.channels.includes(c)) p.channels.push(c); }); closeModal(); toast(`Listed ${S.sel.size} products on ${c}`); S.sel.clear(); render(); },
  'bulk-reprice-ok': () => { const v = $('#simpleIn').value.trim(); const ps = selected(); const prev = ps.map(p=>p.price); const m = v.match(/^([+-]?\d+(?:\.\d+)?)\s*%$/); ps.forEach(p=>{ p.price = m ? Math.round(p.price*(1+ +m[1]/100)*100)/100 : (+v || p.price); }); closeModal(); toast(`Repriced ${ps.length} products`, ()=>ps.forEach((p,i)=>p.price=prev[i])); S.sel.clear(); render(); },
  'bulk-move-ok': () => { const to = $('#simpleIn').value; selected().filter(isStocked).forEach(p=>{ [...p.locs].forEach(l=>{ if(l.s!==to) moveQty(p, l.s, to, l.q); }); STOCK_UPDATES.unshift(su({date:todayISO,type:'Transfer',pid:p.id,loc:'→'+to,qty:onHand(p),unitCost:p.cost,owner:'Etnologic Inc',comments:'Bulk move'})); }); closeModal(); toast(`Moved ${S.sel.size} products to ${to}`); S.sel.clear(); render(); },
  'bulk-assign-ok': () => { const o = $('#simpleIn').value; closeModal(); toast(`${S.sel.size} counts assigned to ${o}`); S.sel.clear(); renderTable(); },
  'bulk-formula-ok': () => { const f = $('#simpleIn').value; const field = $('#fmField').value; const ps = selected(); let ok = 0; ps.forEach(p=>{ try{ const v = Function('price','cost','min','vel','qty', `return (${f})`)(p.price, p.cost, p.min, p.vel, onHand(p)||0); if(!isNaN(v)){ p[field] = field==='min' ? Math.round(v) : Math.round(v*100)/100; ok++; } }catch(e){} }); closeModal(); toast(`Formula applied to ${ok} of ${ps.length}`); S.sel.clear(); render(); },
  'batch-ok': () => { const q = +$('#simpleIn').value; if(!q) return toast('Enter a quantity'); selected().filter(isStocked).forEach(p=>{ const loc = (p.locs[0]||{s:bestShelf(p).id}).s; applyDelta(p, loc, q); STOCK_UPDATES.unshift(su({date:todayISO,type:'Receive',pid:p.id,loc,qty:q,unitCost:p.cost,owner:'Etnologic Inc',comments:'Batch receive'})); p.updated=todayISO; }); closeModal(); toast(`Received +${q} on ${S.sel.size} products`); S.sel.clear(); render(); }
};
function bulk(a){
  const ps = selected(); const n = ps.length;
  if(a==='export'){ download('selection.csv', toCSV([['SKU','Name','Qty','Value'], ...ps.map(p=>[p.sku,p.name,onHand(p)??'',stockValue(p)])]), 'text/csv'); return; }
  if(a==='publish'||a==='unpublish'){ const prev = ps.map(p=>p.status); ps.forEach(p=>{ if(p.status!=='Internal') p.status = a==='publish'?'Published':'Draft'; }); toast(`${n} products ${a}ed`, ()=>ps.forEach((p,i)=>p.status=prev[i])); S.sel.clear(); render(); return; }
  if(a==='label') return simpleInputModal(`Add label to ${n} products`, 'Label', LABELS_ALL, 'bulk-label-ok');
  if(a==='channel') return simpleInputModal(`List ${n} products on`, 'Channel', CHANNELS_ALL, 'bulk-channel-ok');
  if(a==='reprice') return simpleInputModal(`Reprice ${n} products`, 'New price or % change (e.g. 24 or -10%)', '-10%', 'bulk-reprice-ok');
  if(a==='batch-update') return simpleInputModal(`Receive stock on ${n} products`, 'Quantity to add to each', '12', 'batch-ok');
  if(a==='to-counts'){ const skus = ps.map(p=>p.sku); clearFilters(); S.aiChips=[`${n} selected`]; S._only = new Set(ps.map(p=>p.id)); go('workbench',{v:'counts'}); toast(`${skus.length} SKUs ready to count`); return; }
  if(a==='bulk-move') return simpleInputModal(`Move ${n} products`, 'To shelf', allShelves().map(s=>s.id), 'bulk-move-ok');
  if(a==='to-3pl'){ ps.filter(isStocked).forEach(p=>{ const l = p.locs.find(x=>aisleOf(x.s)!=='M'); if(l){ const q = Math.ceil(l.q/2); moveQty(p, l.s, 'M-04', q); STOCK_UPDATES.unshift(su({date:todayISO,type:'Transfer',pid:p.id,loc:`${l.s}→M-04`,qty:q,unitCost:p.cost,owner:'Etnologic Inc',comments:'Sent to ShipBob Memphis'})); } }); SHIPMENTS.unshift({ id:'INB-'+(2300+S.shpSeq++), dir:'Inbound', ref:'ASN '+(88300+S.shpSeq), party:'Corinth DC → ShipBob Memphis', carrier:'Own truck', items:n, wh:'MEM', status:'Scheduled', eta:iso(new Date(TODAY.getTime()+2*864e5)), cost:0, weight:n*4 }); toast(`Half of stock for ${n} products sent to Memphis 3PL · ASN created`); S.sel.clear(); render(); return; }
  if(a==='report'){ const ids = STOCK_UPDATES.filter(u=>S.sel.has(u.pid)).slice(0,12).map(u=>u.id); createReport(ids); return; }
  if(a==='bulk-po'){ const ro = ps.filter(p=>isStocked(p)&&!p.po); if(!ro.length) return toast('Selected items already have POs'); draftPOs(ro); S.sel.clear(); return; }
  if(a==='bulk-email'){ const ms = [...new Set(ps.map(p=>mfr(p.mfr).name))]; toast(`Stitch drafted ${ms.length} email${ms.length>1?'s':''}: ${ms.join(', ')}`); emailModal(ps[0], 'reorder'); return; }
  if(a==='post-all'){ let t = 0, k = 0; ps.forEach(p=>{ if(S.counts[p.id]!=null){ t += postCount(p); k++; } }); toast(k?`Posted ${k} counts · net variance ${t>0?'+':''}${t}`:'Type counted quantities first'); S.sel.clear(); render(); return; }
  if(a==='assign') return simpleInputModal(`Assign ${n} counts`, 'Counter', OWNERS, 'bulk-assign-ok');
  if(a==='sheet'){ download('count-sheet.csv', toCSV([['Shelf','SKU','Product','System qty','Counted'], ...ps.flatMap(p=>p.locs.map(l=>[l.s,p.sku,p.name,l.q,''])).sort((x,y)=>x[0]<y[0]?-1:1)]), 'text/csv'); return; }
  if(a==='formula') return simpleInputModal(`Formula edit · ${n} products`, 'Expression (price, cost, min, vel, qty)', 'cost * 2.8', 'bulk-formula-ok', `<div class="fld" style="margin-top:12px"><label>Field</label><select class="inp" id="fmField"><option value="price">Price per unit</option><option value="min">Minimum level</option><option value="cost">Unit cost</option></select></div><div class="help" style="margin-top:8px">Example: <span class="mono">Math.ceil(vel * 14)</span> for minimum level</div>`);
}
function setMode(m){ S.mode = m; S.railOpen = false; if(m!=='expert' && S.route==='automations') S.route='home'; toast(`${m[0].toUpperCase()+m.slice(1)} mode`); render(); }

/* ============ EVENTS ============ */
document.addEventListener('click', e => {
  const menuOpen = $('#menu').classList.contains('open');
  const el = e.target.closest('[data-cmd]');
  if(menuOpen && !e.target.closest('#menu') && !(el && ['row-menu','create-menu'].includes(el.dataset.cmd))) closeMenu();
  if(el){
    const c = el.dataset.cmd;
    if(el.tagName==='INPUT' && el.type==='checkbox'){ e.stopPropagation(); }
    if(CMD[c]){ e.preventDefault && el.tagName!=='INPUT' && e.preventDefault(); try{ CMD[c](el, e); }catch(err){ console.error(c, err); toast('Something went wrong — '+c); } return; }
    console.warn('No command', c); return;
  }
  const tg = e.target.closest('tr[data-grow]'); if(tg && !e.target.closest('input,button,select,a')) { const T = TABLES[tg.dataset.t]; const r = T.rows().find(x=>x.id===tg.dataset.grow); if(r) T.open(r); return; }
  const tr = e.target.closest('tr[data-row]'); if(tr && !e.target.closest('input,button,select')) { openProduct(tr.dataset.row); return; }
  const tu = e.target.closest('tr[data-upd]'); if(tu && !e.target.closest('input,button')) { openUpdate(tu.dataset.upd); return; }
  const ts = e.target.closest('tr[data-shelf]'); if(ts && !e.target.closest('button')) { S.shelf = ts.dataset.shelf; S.wh = whOfAisle(aisleOf(ts.dataset.shelf)).id; render(); $('#page').scrollTop = 0; return; }
  const tsh = e.target.closest('tr[data-ship]'); if(tsh && !e.target.closest('button')) { openShipment(tsh.dataset.ship); return; }
  const trp = e.target.closest('tr[data-report]'); if(trp) { openReport(trp.dataset.report); return; }
  if(e.target.id==='scrim'){ closeDrawer(); }
  if(e.target.id==='modalWrap'){ closeModal(); }
  if(e.target.id==='paletteWrap'){ closePalette(); }
});
document.addEventListener('submit', e => {
  const f = e.target.closest('form'); if(!f) return; e.preventDefault();
  if(f.dataset.form==='ask'){ const q = f.q.value.trim(); if(!q) return; const it = interpret(q); if(it.answer && !it.view && !it.action && !it.route){ $('#copilot').classList.add('open'); copilotAsk(q); } else applyInterpretation(it); }
  if(f.dataset.form==='scan'){ scanLookup($('#scanIn').value); }
  if(f.id==='cpForm'){ const v = $('#cpInput').value.trim(); if(v){ copilotAsk(v); $('#cpInput').value=''; } }
});
document.addEventListener('input', e => {
  const c = e.target.closest('[data-count]');
  if(c){ const id = c.dataset.count; S.counts[id] = c.value==='' ? null : +c.value; if(S.counts[id]==null) delete S.counts[id];
    const row = id.includes('@') ? invRows().find(x=>x.id===id) : null; const cell = $(`[data-var="${id}"]`); if(cell && row) cell.innerHTML = varHTML(row);
    const btn = c.closest('td')?.querySelector('[data-cmd="post-count"]'); if(btn) btn.disabled = S.counts[id]==null; }
  if(e.target.classList.contains('err')) e.target.classList.remove('err');
});
document.addEventListener('keydown', e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='k'){ e.preventDefault(); $('#paletteWrap').classList.contains('open') ? closePalette() : openPalette(); return; }
  if(e.key==='Escape'){ if($('#paletteWrap').classList.contains('open')) closePalette(); else if($('#modalWrap').classList.contains('open')) closeModal(); else if($('#drawer').classList.contains('open')) closeDrawer(); else closeMenu(); return; }
  if(typing) return;
  if(e.key==='s'||e.key==='S'){ e.preventDefault(); scanModal(); }
  if(e.key==='u'||e.key==='U'){ e.preventDefault(); stockUpdateForm({}); }
  if(e.key==='/'){ const x = $('#wbAsk') || null; if(x){ e.preventDefault(); x.focus(); } else { e.preventDefault(); openPalette(); } }
  if(e.key==='.'){ CMD['toggle-copilot'](); }
});
/* Column drag-to-reorder and drag-to-resize */
const DRAG = { k:null, t:null, rs:null, justResized:false };
document.addEventListener('mousedown', e => {
  const h = e.target.closest('.rs'); if(!h) return;
  e.preventDefault(); e.stopPropagation();
  const th = h.closest('th'); const key = th.dataset.t, k = h.dataset.rs; const x0 = e.clientX, w0 = th.getBoundingClientRect().width;
  th.setAttribute('draggable','false'); document.body.classList.add('col-resizing');
  const cells = () => $$(`#tbl tr > :nth-child(${[...th.parentNode.children].indexOf(th)+1})`);
  const mv = ev => { const w = Math.max(64, Math.round(w0 + ev.clientX - x0)); th.style.width = th.style.minWidth = th.style.maxWidth = w+'px'; cells().forEach(td=>{ if(td!==th){ td.style.maxWidth = w+'px'; td.classList.add('fixw'); } }); DRAG.w = w; };
  const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); document.body.classList.remove('col-resizing'); th.setAttribute('draggable','true'); if(DRAG.w){ gs(key).widths[k] = DRAG.w; saveGrid(); DRAG.w = null; DRAG.justResized = true; setTimeout(()=>DRAG.justResized=false, 120); } };
  document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
}, true);
document.addEventListener('dblclick', e => { const h = e.target.closest('.rs'); if(!h) return; const th = h.closest('th'); delete gs(th.dataset.t).widths[h.dataset.rs]; saveGrid(); drawTable(); });
document.addEventListener('dragstart', e => { const th = e.target.closest && e.target.closest('th[data-col]'); if(!th) return; DRAG.k = th.dataset.col; DRAG.t = th.dataset.t; th.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try{ e.dataTransfer.setData('text/plain', DRAG.k); }catch(_){} closeMenu(); });
document.addEventListener('dragover', e => { if(!DRAG.k) return; const sc = $('.tbl-scroll'); if(sc){ const r = sc.getBoundingClientRect(); if(e.clientX < r.left+60) sc.scrollLeft -= 18; else if(e.clientX > r.right-60) sc.scrollLeft += 18; } const th = e.target.closest && e.target.closest('th[data-col]'); $$('th.drop-l,th.drop-r').forEach(x=>x.classList.remove('drop-l','drop-r')); if(!th || th.dataset.col===DRAG.k) return; e.preventDefault(); const r = th.getBoundingClientRect(); th.classList.add(e.clientX < r.left + r.width/2 ? 'drop-l' : 'drop-r'); });
document.addEventListener('drop', e => { if(!DRAG.k) return; const th = e.target.closest && e.target.closest('th[data-col]'); if(th && th.dataset.col!==DRAG.k){ e.preventDefault(); const after = th.classList.contains('drop-r'); moveCol(DRAG.t, DRAG.k, th.dataset.col, after); const k = DRAG.k; DRAG.k = null; drawTable(); const n = $(`th[data-col="${k}"]`); n && n.classList.add('flash'); } });
document.addEventListener('dragend', () => { DRAG.k = null; $$('th.dragging,th.drop-l,th.drop-r').forEach(x=>x.classList.remove('dragging','drop-l','drop-r')); });






/*ERP-START*/
/* ================= CAPABILITIES — create actions on the same four tables =================
   Products carry Supplier, Purchase Cost, Customer Pricing, Bill of Materials and Tracking as columns.
   Every create action (quote, order, PO, assembly, return, transfer, stock take) is a row in Stock Updates
   and moves real stock when its status advances. Pick, Pack and Dispatch are columns on Warehouse Management. */

Object.assign(TX_ICON, { 'Sales Quote':'request_quote', 'Sales Order':'shopping_bag', 'Purchase Order':'shopping_cart', 'Assembly':'precision_manufacturing', 'Disassembly':'call_split', 'Supplier Return':'keyboard_return', 'Stock Take':'inventory', 'Recost':'price_change', 'Consume':'package_2' });

/* --- Suppliers (same records as Manufacturer) --- */
MANUFACTURERS.push(
  { id:'gulf', name:'Gulf Coast Ink Supply', type:'Wholesale', email:'orders@gulfcoastink.example', lead:6, contact:'Rhonda Lee' },
  { id:'natchez', name:'Natchez Trace Hardwoods', type:'Wholesale', email:'sales@natchezhardwoods.example', lead:9, contact:'Eli Brooks' }
);
const SUP_META = { cotton:{terms:'Net 30', ontime:92, phone:'(662) 555-0141'}, magnolia:{terms:'Net 30', ontime:88, phone:'(601) 555-0177'}, riverbend:{terms:'Net 45', ontime:95, phone:'(615) 555-0112'}, packship:{terms:'Net 15', ontime:98, phone:'(901) 555-0190'}, delta:{terms:'Prepaid', ontime:90, phone:'(662) 555-0133'}, corinth:{terms:'Internal', ontime:97, phone:'(662) 555-0100'}, gulf:{terms:'Net 30', ontime:93, phone:'(228) 555-0155'}, natchez:{terms:'Net 30', ontime:86, phone:'(601) 555-0168'} };
MANUFACTURERS.forEach(m=>Object.assign(m, { terms:'Net 30', ontime:95, phone:'' }, SUP_META[m.id]||{}));

/* --- Components are products too (they live in the Product Catalog) --- */
const MAT = o => P(Object.assign({ area:'Materials', ftype:'Wholesale', status:'Internal', channels:[], labels:[], added:'2025-09-01', lastCount:'2026-11-05', updated:'2026-11-12', price:0, img:'box', desc:'Component — consumed by a Bill of Materials.' }, o));
PRODUCTS.push(
  MAT({ id:'p29', sku:'RM-HD-FLC-L', name:'Blank Fleece Hoodie — Heather / L', category:'Blanks', mfr:'cotton', cost:9.8, min:30, rq:60, vol:0.1, vel:2.2, img:'hoodie', locs:[{s:'B-05',q:40}] }),
  MAT({ id:'p30', sku:'RM-HD-FLC-M', name:'Blank Fleece Hoodie — Heather / M', category:'Blanks', mfr:'cotton', cost:9.8, min:30, rq:60, vol:0.1, vel:1.8, img:'hoodie', locs:[{s:'B-06',q:26}] }),
  MAT({ id:'p31', sku:'RM-INK-PLS-WHT', name:'Plastisol Ink — White (oz)', category:'Inks', mfr:'gulf', cost:0.35, min:200, rq:640, vol:0.002, vel:14, locs:[{s:'A-05',q:520}] }),
  MAT({ id:'p32', sku:'RM-WAL-BLK-4', name:'Walnut Blank 4×4', category:'Wood', mfr:'natchez', cost:1.1, min:48, rq:192, vol:0.008, vel:3.2, img:'coaster', locs:[{s:'C-05',q:96}] }),
  MAT({ id:'p33', sku:'RM-CORK-4', name:'Cork Pad 4in', category:'Wood', mfr:'packship', cost:0.12, min:100, rq:500, vol:0.001, vel:3.2, locs:[{s:'C-05',q:300}] }),
  MAT({ id:'p34', sku:'RM-OAK-FRM-1824', name:'Reclaimed Oak Frame Kit 18×24', category:'Frames', mfr:'natchez', cost:14, min:6, rq:24, vol:0.5, vel:0.4, img:'poster', locs:[{s:'D-06',q:9}] }),
  MAT({ id:'p35', sku:'RM-PAP-1824', name:'Archival Print Paper 18×24', category:'Paper', mfr:'packship', cost:3.2, min:20, rq:100, vol:0.02, vel:0.4, img:'poster', locs:[{s:'D-06',q:40}] }),
  MAT({ id:'p36', sku:'RM-JRN-CVR', name:'Linen Cover + Text Block', category:'Paper', mfr:'packship', cost:3.9, min:20, rq:100, vol:0.02, vel:0.25, img:'journal', locs:[{s:'C-06',q:30}] }),
  MAT({ id:'p37', sku:'RM-HD-ZIP-L', name:'Blank Zip Hoodie — Black / L', category:'Blanks', mfr:'cotton', cost:12.5, min:12, rq:36, vol:0.13, vel:1.1, img:'hoodie', locs:[{s:'E-04',q:10}] }),
  P({ id:'p38', sku:'KIT-COF-CST', name:'Coffee & Coaster Gift Box', area:'Home & Living', category:'Gift Sets', mfr:'corinth', ftype:'In-House', labels:['Gift-ready'], channels:['Shopify','Etsy'], img:'beans', price:46, cost:14.3, min:6, rq:12, vol:0.1, added:'2026-10-25', lastCount:'2026-11-05', updated:'2026-11-12', vel:0.5, desc:'Kit: House Blend 12oz + Walnut Coaster Set, packed in an 8×6×4 box.', locs:[{s:'C-06',q:4}] }),
  P({ id:'p39', sku:'BND-TEE-3PK-M', name:'Classic Tee 3-Pack — Black / M', area:'Apparel', category:'Bundles', mfr:'cotton', ftype:'Wholesale', labels:['Bestseller'], channels:['Shopify','Amazon'], img:'tee_black', price:60, cost:19.2, min:0, rq:0, vol:0.15, added:'2026-06-01', lastCount:null, updated:'2026-11-12', vel:0.9, desc:'Bundle: three Classic Tees, picked from stock at order time.' }),
  P({ id:'p40', sku:'BND-CND-DUO', name:'Candle Duo — Lavender + Cedar', area:'Home & Living', category:'Bundles', mfr:'magnolia', ftype:'Wholesale', labels:['Gift-ready'], channels:['Shopify','Etsy'], img:'candle_lav', price:40, cost:16.5, min:0, rq:0, vol:0.12, added:'2026-09-15', lastCount:null, updated:'2026-11-12', vel:0.7, desc:'Bundle: one Lavender and one Cedar soy candle.' })
);
const BOM_SEED = {
  p04:{type:'Assembly', comps:[['p29',1],['p31',3]], labor:4.5}, p05:{type:'Assembly', comps:[['p30',1],['p31',3]], labor:4.5},
  p17:{type:'Assembly', comps:[['p32',4],['p33',4]], labor:1.5}, p15:{type:'Assembly', comps:[['p34',1],['p35',1]], labor:9},
  p21:{type:'Assembly', comps:[['p36',1]], labor:2}, p28:{type:'Assembly', comps:[['p37',1],['p31',4]], labor:5},
  p38:{type:'Kit', comps:[['p18',1],['p17',1],['p24',1]], labor:0.5},
  p39:{type:'Bundle', comps:[['p01',3]], labor:0}, p40:{type:'Bundle', comps:[['p11',1],['p12',1]], labor:0}
};
Object.entries(BOM_SEED).forEach(([id,b])=>{ prod(id).bom = { type:b.type, comps:b.comps.map(([pid,qty])=>({pid,qty})), labor:b.labor }; });
const TRACK_SEED = { p28:'Serial', p15:'Serial', p18:'Batch', p11:'Batch', p12:'Batch', p13:'Batch' };
PRODUCTS.forEach(p=>{ p.track = TRACK_SEED[p.id] || 'None'; });

const isBundle = p => !!(p && p.bom && p.bom.type==='Bundle');
const bundleAvail = p => Math.min(...p.bom.comps.map(c=>{ const cp = prod(c.pid); return Math.floor(Math.max(0, availableQty(cp))/c.qty); }));
const _stockStatus = stockStatus;
stockStatus = p => isBundle(p) ? (bundleAvail(p)>0 ? {k:'ok', t:'Bundle · '+bundleAvail(p)+' available', c:'blue'} : {k:'out', t:'Bundle · components out', c:'red'}) : _stockStatus(p);
const bomCost = p => p.bom ? p.bom.comps.reduce((a,c)=>a + c.qty*(prod(c.pid)?.cost||0), 0) + (+p.bom.labor||0) : null;

/* --- Customer pricing lives on the product --- */
const TIERS = ['Retail','Wholesale','Distributor'];
const tierDefault = (p, t) => t==='Retail' ? p.price : t==='Wholesale' ? +(p.price*0.5).toFixed(2) : +(p.price*0.42).toFixed(2);
function pricing(p){ if(!p.pricing) p.pricing = { tiers:Object.fromEntries(TIERS.map(t=>[t, tierDefault(p,t)])), breaks:[], customers:[] }; return p.pricing; }
PRODUCTS.forEach(pricing);
prod('p11').pricing.breaks.push({ tier:'Wholesale', min:48, price:10.25 }); prod('p12').pricing.breaks.push({ tier:'Wholesale', min:48, price:10.25 });
prod('p04').pricing.customers.push({ name:'Tupelo Outfitters', price:27 }); prod('p17').pricing.customers.push({ name:'Delta Hotel Group', price:18 });
function priceFor(p, custName, qty){
  const c = CUSTOMERS.find(x=>x.name===custName); const tier = c ? c.tier : 'Retail'; const pr = pricing(p);
  let price = pr.tiers[tier] ?? p.price, why = tier+' tier';
  pr.breaks.filter(b=>b.tier===tier && qty>=b.min && b.price<price).forEach(b=>{ price=b.price; why=`${tier} break ${b.min}+`; });
  const cs = pr.customers.find(x=>x.name===custName); if(cs && cs.price<price){ price = cs.price; why = 'Customer price'; }
  return { price, why };
}
const CUSTOMERS = [
  { name:'Tupelo Outfitters', tier:'Wholesale', email:'buyer@tupelooutfitters.example', terms:'Net 30', channel:'Wholesale B2B' },
  { name:'Oxford Gift House', tier:'Wholesale', email:'orders@oxfordgift.example', terms:'Net 15', channel:'Wholesale B2B' },
  { name:'Delta Hotel Group', tier:'Distributor', email:'procurement@deltahotels.example', terms:'Net 30', channel:'Wholesale B2B' },
  { name:'Magnolia Market Co-op', tier:'Wholesale', email:'buying@magnoliamarket.example', terms:'Net 30', channel:'Wholesale B2B' },
  { name:'Ava Thompson', tier:'Retail', email:'ava.t@example.com', terms:'Prepaid', channel:'Shopify' },
  { name:'Kim Nguyen', tier:'Retail', email:'kim.n@example.com', terms:'Prepaid', channel:'TikTok Shop' },
  { name:'Amazon FBA', tier:'Retail', email:'fba@amazon.example', terms:'Marketplace', channel:'Amazon' }
];

/* --- Freight & Charges presets (applied inside orders) --- */
const CHARGE_PRESETS = [
  { name:'Standard freight', basis:'flat', rate:9.95, side:'Sales' }, { name:'LTL freight', basis:'per lb', rate:0.38, side:'Both' },
  { name:'Handling fee', basis:'flat', rate:4, side:'Sales' }, { name:'Gift wrap', basis:'per unit', rate:2.5, side:'Sales' },
  { name:'Fuel surcharge', basis:'%', rate:2, side:'Both' }, { name:'Inbound freight', basis:'flat', rate:85, side:'Purchases' },
  { name:'Duty & tariffs', basis:'%', rate:6.5, side:'Purchases' }, { name:'Discount', basis:'%', rate:-5, side:'Sales' }
];

/* --- Serial & batch registers --- */
const SERIALS = [];
for(let i=1;i<=14;i++) SERIALS.push({ no:'ZH-'+String(i).padStart(4,'0'), pid:'p28', loc:'B-03', status:'In stock', doc:'Run #1' });
['DLT-041','DLT-042','DLT-043','DLT-044','DLT-045','DLT-046'].forEach(no=>SERIALS.push({ no, pid:'p15', loc:'D-02', status:'In stock', doc:'SU-10492' }));
const BATCHES = [
  { lot:'LOT-2234', pid:'p18', qty:onHand(prod('p18')), exp:'2027-02-15', loc:'C-03' },
  { lot:'LOT-C1109', pid:'p11', qty:onHand(prod('p11')), exp:'2028-11-01', loc:'C-01' },
  { lot:'LOT-C1110', pid:'p12', qty:onHand(prod('p12')), exp:'2028-11-01', loc:'C-01' }
];
const serialsIn = p => SERIALS.filter(s=>s.pid===p.id && s.status==='In stock');
const lotsOf = p => BATCHES.filter(b=>b.pid===p.id && b.qty>0).sort((a,b)=>a.exp<b.exp?-1:1);

/* --- Documents: every create action is a row in Stock Updates --- */
const DOC_PREFIX = { 'Sales Quote':'QT', 'Sales Order':'SO', 'Purchase Order':'PO', 'Assembly':'AS', 'Disassembly':'DA', 'Supplier Return':'SR', 'Transfer':'TR', 'Stock Take':'ST', 'Recost':'RC' };
const DOC_SEQ = { 'Sales Quote':1008, 'Sales Order':1046, 'Purchase Order':423, 'Assembly':52, 'Disassembly':3, 'Supplier Return':4, 'Transfer':10, 'Stock Take':12, 'Recost':7 };
const docNo = k => k==='Purchase Order' ? 'PO-2026-0'+(++DOC_SEQ[k]) : DOC_PREFIX[k]+'-'+String(++DOC_SEQ[k]).padStart(4,'0');
STOCK_UPDATES.forEach(u=>{ if(!u.status) u.status = 'Logged'; });
const isDoc = u => !!u.kind;
function newDoc(kind, o={}){
  const lines = o.lines || [];
  const u = su(Object.assign({ date:todayISO, type:kind, kind, pid:lines[0]?.pid || o.pid || 'p01', loc:'—', qty:0, unitCost:0, owner:'Etnologic Inc', status:'Draft', party:'', wh:'CDC', lines, charges:[], log:[], lots:'', comments:'' }, o));
  u.no = o.no || docNo(kind); u.log = u.log.length ? u.log : [{ d:todayISO, t:`${kind} created` }];
  STOCK_UPDATES.unshift(u); return u;
}
const docByNo = no => STOCK_UPDATES.find(u=>u.no===no);
const docById = id => STOCK_UPDATES.find(u=>u.id===id);
const docs = (kind, sts) => STOCK_UPDATES.filter(u=>u.kind===kind && (!sts || sts.includes(u.status)));
function logDoc(u, t){ u.log.unshift({ d:todayISO, t }); }
const lineSub = u => u.lines.reduce((a,l)=>a + l.qty*(l.price ?? l.cost ?? prod(l.pid)?.cost ?? 0), 0);
function chargeAmt(u, c){ const units = u.lines.reduce((a,l)=>a+l.qty,0); const lbs = u.lines.reduce((a,l)=>a+l.qty*(prod(l.pid)?.vol||0)*8,0); const sub = lineSub(u);
  return c.basis==='flat' ? c.rate : c.basis==='per unit' ? c.rate*units : c.basis==='per lb' ? c.rate*lbs : sub*c.rate/100; }
const chargesTotal = u => (u.charges||[]).reduce((a,c)=>a+chargeAmt(u,c),0);
const docTotal = u => lineSub(u) + chargesTotal(u);
function setUnitCost(u){ const units = u.lines.reduce((a,l)=>a+l.qty,0); u.unitCost = units ? +(u.lines.reduce((a,l)=>a+l.qty*(l.cost ?? prod(l.pid)?.cost ?? 0),0)/units).toFixed(2) : 0; u.pid = u.lines[0]?.pid || u.pid; }

/* explode bundles into components for stock purposes */
const stockLines = l => { const p = prod(l.pid); return isBundle(p) ? p.bom.comps.map(c=>({ pid:c.pid, qty:c.qty*l.qty, of:p.id })) : [{ pid:l.pid, qty:l.qty }]; };

/* --- Derived positions (real time) --- */
const ALLOC_STS = ['Allocated','Picking','Picked','Packed'];
const committedQty = p => docs('Sales Order', ALLOC_STS).reduce((a,u)=>a + u.lines.flatMap(stockLines).filter(x=>x.pid===p.id).reduce((s,x)=>s+x.qty,0), 0);
const onOrderQty = p => docs('Purchase Order', ['Sent','Confirmed','Partially received']).reduce((a,u)=>a + u.lines.filter(l=>l.pid===p.id).reduce((s,l)=>s+l.qty-(l.rcv||0),0), 0);
const inProdQty = p => docs('Assembly', ['Planned','In progress']).filter(u=>u.lines[0]?.pid===p.id).reduce((a,u)=>a+u.lines[0].qty,0);
const compDemand = p => docs('Assembly', ['Planned','In progress']).reduce((a,u)=>{ const fp = prod(u.lines[0].pid); return a + (fp.bom?.comps||[]).filter(c=>c.pid===p.id).reduce((s,c)=>s+c.qty*u.lines[0].qty,0); }, 0);
function availableQty(p){ if(!p) return 0; if(isBundle(p)) return bundleAvail(p); if(!isStocked(p)) return Infinity; return onHand(p) - committedQty(p) - compDemand(p); }
const backorderQty = p => docs('Sales Order', ['Open','Backordered']).reduce((a,u)=>a + u.lines.flatMap(stockLines).filter(x=>x.pid===p.id).reduce((s,x)=>s+x.qty,0), 0);

/* --- Stitch: forecasts + sales orders + production plans → purchasing decisions --- */
function stitchPlan(p){
  if(!isStocked(p)) return null;
  const lead = p.ftype==='In-House' ? Math.max(3, mfr(p.mfr).lead) : mfr(p.mfr).lead;
  const vel = p.vel || 0, fc = forecast30(p);
  const projected = onHand(p) - committedQty(p) - compDemand(p) - backorderQty(p) + onOrderQty(p) + inProdQty(p);
  const safety = Math.ceil(vel*7), rop = Math.ceil(vel*lead) + safety;
  const target = Math.ceil(vel*(lead+21)) + safety;
  const over = vel>0 ? projected > Math.max(vel*90, p.rq*2) : projected > p.rq*2 && projected>0;
  let flag = 'Healthy', qty = 0;
  if(projected < rop || projected < p.min){ flag = 'Understock'; qty = Math.max(p.rq||0, target - projected); }
  else if(over) flag = 'Overstock';
  const parts = [`forecast ${fc}/30d`]; if(committedQty(p)) parts.push(`${committedQty(p)} on sales orders`); if(backorderQty(p)) parts.push(`${backorderQty(p)} backordered`); if(compDemand(p)) parts.push(`${compDemand(p)} for production`); if(onOrderQty(p)) parts.push(`${onOrderQty(p)} on order`); if(inProdQty(p)) parts.push(`${inProdQty(p)} in production`);
  const cover = vel ? Math.round(projected/vel) : null;
  return { flag, qty, projected, rop, cover, make: p.ftype==='In-House' && p.bom && p.bom.type!=='Bundle', why: parts.join(' · ') + (cover!=null?(cover<0?' · short now':` · ${cover} days of cover`):'') };
}

/* keep the inventory 'Order ID' / 'Order Status' columns tied to real purchase orders */
function syncPO(){
  PRODUCTS.forEach(p=>{ p.po = null; });
  docs('Purchase Order', ['Draft','Sent','Confirmed','Partially received']).slice().reverse().forEach(u=>u.lines.forEach(l=>{ const p = prod(l.pid); if(p && !p.po) p.po = { id:u.no, status:u.status, qty:l.qty-(l.rcv||0), eta:u.eta, doc:u.id }; }));
}

/* --- Stock movement helpers --- */
function takeFrom(p, qty, prefer){
  const out = []; let need = qty;
  const bins = p.locs.filter(l=>l.q>0).sort((a,b)=> (b.s===prefer) - (a.s===prefer) || b.q - a.q);
  for(const l of bins){ if(need<=0) break; const t = Math.min(l.q, need); l.q -= t; need -= t; out.push({ s:l.s, q:t }); }
  p.locs = p.locs.filter(l=>l.q>0); p.updated = todayISO; return out;
}
function planPicks(p, qty, wh){
  const out = []; let need = qty;
  const bins = p.locs.filter(l=>l.q>0).sort((a,b)=> ((whOfAisle(aisleOf(b.s))?.id===wh) - (whOfAisle(aisleOf(a.s))?.id===wh)) || b.q - a.q);
  for(const l of bins){ if(need<=0) break; const t = Math.min(l.q, need); need -= t; out.push({ s:l.s, q:t, pid:p.id, done:false }); }
  return out;
}
function bestBin(p, wh){ const own = p.locs.find(l=>whOfAisle(aisleOf(l.s))?.id===wh); if(own) return own.s; const sh = allShelves().filter(s=>s.w.id===wh).sort((a,b)=>b.avail-a.avail)[0]; return sh ? sh.id : (p.locs[0]?.s || 'A-01'); }
function avgIn(p, q, cost){ const oh = onHand(p) || 0; p.cost = +(((oh*p.cost) + q*cost)/Math.max(1, oh+q)).toFixed(2); }
function consumeLots(p, qty){ const used = []; let need = qty; lotsOf(p).forEach(b=>{ if(need<=0) return; const t = Math.min(b.qty, need); b.qty -= t; need -= t; used.push(`${b.lot}×${t}`); }); return used.join(', '); }
function shipSerials(p, qty, ref){ const s = serialsIn(p).slice(0, qty); s.forEach(x=>{ x.status='Shipped'; x.doc=ref; }); return s.map(x=>x.no); }
function newSerials(p, qty, loc, ref){ const pre = p.sku.split('-').slice(0,2).map(x=>x[0]).join('') + '-'; const n0 = SERIALS.filter(s=>s.pid===p.id).length; const out = []; for(let i=1;i<=qty;i++){ const no = pre+String(n0+i).padStart(4,'0'); SERIALS.push({ no, pid:p.id, loc, status:'In stock', doc:ref }); out.push(no); } return out; }

/* ================= Seed documents ================= */
(function seedDocs(){
  const L = (pid, qty, extra={}) => Object.assign({ pid, qty, price:null, cost:null }, extra);
  // Purchase orders (from the products' existing open orders)
  const byPO = {}; PRODUCTS.forEach(p=>{ if(p.po){ (byPO[p.po.id] = byPO[p.po.id] || { po:p.po, ps:[] }).ps.push(p); } });
  Object.values(byPO).forEach(({po, ps})=>{ const u = newDoc('Purchase Order', { no:po.id, date:'2026-11-'+(po.status==='Draft'?'18':'12'), status:po.status, party:mfr(ps[0].mfr).name, sup:ps[0].mfr, eta:po.eta, wh:'CDC',
    lines: ps.map(p=>L(p.id, Math.round(po.qty/ps.length), { cost:p.cost, rcv:0 })), charges: po.status==='Draft'?[]:[{ name:'Inbound freight', basis:'flat', rate:po.id==='PO-2026-0418'?142:46.5 }] }); u.log = [{d:u.date, t:'Purchase Order created'}]; setUnitCost(u); });
  const rcv = newDoc('Purchase Order', { no:'PO-2026-0402', date:'2026-11-04', status:'Received', party:'Cotton Source Co.', sup:'cotton', eta:'2026-11-18', wh:'TUP', lines:[L('p01',120,{cost:6.4, rcv:120})], charges:[{ name:'Inbound freight', basis:'flat', rate:96 }], qty:120, loc:'E-02', comments:'Received complete. 5 cartons.' });
  rcv.log = [{d:'2026-11-18', t:'Received 120 into E-02'},{d:'2026-11-04', t:'Purchase Order created'}]; setUnitCost(rcv);
  const rv = newDoc('Purchase Order', { no:'PO-2026-0415', date:'2026-10-20', status:'Received', party:'Riverbend Leather', sup:'riverbend', eta:'2026-11-01', wh:'CDC', lines:[L('p20',36,{cost:16, rcv:36})], qty:36, loc:'B-04' }); setUnitCost(rv);
  newDoc('Purchase Order', { status:'Draft', party:'Gulf Coast Ink Supply', sup:'gulf', wh:'CDC', lines:[L('p31',640,{cost:0.35, rcv:0})], comments:'Drafted by Stitch — ink demand from planned hoodie runs.' });
  // Sales quotes
  newDoc('Sales Quote', { status:'Sent', party:'Oxford Gift House', channel:'Wholesale B2B', expires:'2026-12-03', lines:[L('p11',48,{price:10.25}),L('p12',48,{price:10.25}),L('p17',12,{price:14})], charges:[{ name:'LTL freight', basis:'per lb', rate:0.38 }], date:'2026-11-16' });
  newDoc('Sales Quote', { status:'Accepted', party:'Delta Hotel Group', channel:'Wholesale B2B', expires:'2026-12-10', lines:[L('p17',20,{price:18}),L('p21',20,{price:10.92})], charges:[{ name:'Standard freight', basis:'flat', rate:9.95 }], date:'2026-11-17' });
  newDoc('Sales Quote', { status:'Draft', party:'Magnolia Market Co-op', channel:'Wholesale B2B', expires:'2026-12-15', lines:[L('p16',60,{price:10})], date:'2026-11-19' });
  // Sales orders at every stage
  const so1 = newDoc('Sales Order', { status:'Invoiced', party:'Tupelo Outfitters', channel:'Wholesale B2B', date:'2026-11-12', lines:[L('p04',12,{price:27})], qty:-12, loc:'B-01', pay:'Paid', comments:'Shipped SHP-7778' });
  const so2 = newDoc('Sales Order', { status:'Open', party:'Oxford Gift House', channel:'Wholesale B2B', date:'2026-11-17', lines:[L('p13',24,{price:11}),L('p12',12,{price:11})], charges:[{ name:'Standard freight', basis:'flat', rate:9.95 }] });
  const so3 = newDoc('Sales Order', { status:'Allocated', party:'Ava Thompson', channel:'Shopify', date:'2026-11-18', lines:[L('p01',2,{price:24}),L('p11',1,{price:22})], charges:[{ name:'Standard freight', basis:'flat', rate:9.95 }], pay:'Paid' });
  const so4 = newDoc('Sales Order', { status:'Picking', party:'Kim Nguyen', channel:'TikTok Shop', date:'2026-11-18', lines:[L('p26',1,{price:24}),L('p08',1,{price:24})], charges:[{ name:'Standard freight', basis:'flat', rate:9.95 }], pay:'Paid' });
  const so5 = newDoc('Sales Order', { status:'Packed', party:'Amazon FBA', channel:'Amazon', wh:'MEM', date:'2026-11-18', lines:[L('p25',6,{price:58})], pay:'Paid', box:'BOX-SHP-1210', weight:9.6 });
  const so6 = newDoc('Sales Order', { status:'Picked', party:'Tupelo Outfitters', channel:'Wholesale B2B', date:'2026-11-19', lines:[L('p39',2,{price:60}),L('p16',10,{price:10})], charges:[{ name:'Handling fee', basis:'flat', rate:4 }] });
  [so3, so4, so5, so6].forEach(u=>{ u.lines.forEach(l=>{ l.alloc = l.qty; l.picks = stockLines(l).flatMap(x=>planPicks(prod(x.pid), x.qty, u.wh)); if(['Picked','Packed'].includes(u.status)) l.picks.forEach(k=>k.done=true); }); });
  so4.lines[0].picks.forEach(k=>k.done=true);
  // Production
  newDoc('Assembly', { status:'Planned', date:'2026-11-19', due:'2026-11-24', wh:'CDC', loc:'B-01', lines:[L('p04',24)], comments:'Holiday hoodie run' });
  newDoc('Assembly', { status:'In progress', date:'2026-11-18', due:'2026-11-21', wh:'CDC', loc:'C-02', lines:[L('p17',12)], comments:'CNC batch 11-18' });
  newDoc('Assembly', { status:'Planned', date:'2026-11-19', due:'2026-11-27', wh:'CDC', loc:'B-03', lines:[L('p28',8)], comments:'Run #2, numbered tags' });
  newDoc('Disassembly', { status:'Draft', date:'2026-11-19', wh:'CDC', loc:'C-06', lines:[L('p38',2)], comments:'Unsold gift boxes — return coffee and coasters to stock' });
  // Returns, transfers, counts, recosting
  newDoc('Supplier Return', { status:'Draft', party:'Riverbend Leather', sup:'riverbend', ref:'PO-2026-0415', date:'2026-11-19', lines:[L('p20',2,{cost:16, loc:'B-04'})], reason:'Stitching defect', comments:'Stitching defect on 2 aprons' });
  newDoc('Transfer', { status:'In transit', date:'2026-11-18', from:'E-03', to:'M-01', lines:[L('p16',60)], comments:'Restock Memphis 3PL for Amazon' });
  newDoc('Transfer', { status:'Draft', date:'2026-11-19', from:'E-02', to:'A-01', lines:[L('p01',30)], comments:'Replenish fast pick face from overflow' });
  const st = newDoc('Stock Take', { status:'Counting', date:'2026-11-19', wh:'CDC', aisles:['C'], lines:[] });
  PRODUCTS.forEach(p=>p.locs.filter(l=>aisleOf(l.s)==='C').forEach(l=>st.lines.push({ pid:p.id, loc:l.s, sys:l.q, qty:l.q, cnt:null })));
  newDoc('Recost', { status:'Draft', date:'2026-11-19', ref:'PO-2026-0402', party:'Cotton Source Co.', method:'value', costs:[{ name:'Inbound freight', amt:96 },{ name:'Duty & tariffs', amt:38.4 }], lines:[L('p01',120,{cost:6.4})] });
  STOCK_UPDATES.filter(isDoc).forEach(setUnitCost);
  STOCK_UPDATES.sort((a,b)=> a.date<b.date?1:a.date>b.date?-1:0);
  syncPO();
})();

/* ================= Status flows and actions ================= */
const FLOW = {
  'Sales Quote':['Draft','Sent','Accepted','Converted'], 'Sales Order':['Open','Allocated','Picking','Picked','Packed','Dispatched','Invoiced'],
  'Purchase Order':['Draft','Sent','Confirmed','Partially received','Received'], 'Supplier Return':['Draft','Shipped','Credited'],
  'Assembly':['Planned','In progress','Completed'], 'Disassembly':['Draft','Completed'], 'Transfer':['Draft','In transit','Received'],
  'Stock Take':['Counting','Posted'], 'Recost':['Draft','Posted']
};
const ACTS = {
  'Sales Quote':[ {a:'send', t:'Send quote', i:'send', from:['Draft'], to:'Sent'}, {a:'accept', t:'Mark accepted', i:'check', from:['Sent'], to:'Accepted'}, {a:'convert', t:'Convert to sales order', i:'shopping_bag', from:['Sent','Accepted'], to:'Converted'}, {a:'decline', t:'Declined', i:'close', from:['Draft','Sent'], to:'Declined', ghost:1} ],
  'Sales Order':[ {a:'allocate', t:'Allocate stock', i:'inventory_2', from:['Open','Backordered'], to:'Allocated'}, {a:'pick', t:'Release to pick', i:'pan_tool_alt', from:['Allocated'], to:'Picking'}, {a:'pickall', t:'Confirm picked', i:'task_alt', from:['Picking'], to:'Picked'}, {a:'pack', t:'Pack', i:'package_2', from:['Picked'], to:'Packed'}, {a:'dispatch', t:'Dispatch', i:'local_shipping', from:['Packed'], to:'Dispatched'}, {a:'invoice', t:'Invoice', i:'receipt_long', from:['Dispatched'], to:'Invoiced'}, {a:'cancel', t:'Cancel order', i:'block', from:['Open','Backordered','Allocated'], to:'Cancelled', ghost:1} ],
  'Purchase Order':[ {a:'send', t:'Send to supplier', i:'send', from:['Draft'], to:'Sent'}, {a:'confirm', t:'Supplier confirmed', i:'check', from:['Sent'], to:'Confirmed'}, {a:'receive', t:'Receive', i:'move_to_inbox', from:['Sent','Confirmed','Partially received'], to:'Received'}, {a:'recost', t:'Recost', i:'price_change', from:['Partially received','Received'], to:null}, {a:'rtv', t:'Return to supplier', i:'keyboard_return', from:['Partially received','Received'], to:null, ghost:1}, {a:'cancel', t:'Cancel', i:'block', from:['Draft','Sent'], to:'Cancelled', ghost:1} ],
  'Supplier Return':[ {a:'ship', t:'Ship to supplier', i:'local_shipping', from:['Draft'], to:'Shipped'}, {a:'credit', t:'Credit received', i:'payments', from:['Shipped'], to:'Credited'} ],
  'Assembly':[ {a:'start', t:'Start', i:'play_arrow', from:['Planned'], to:'In progress'}, {a:'complete', t:'Complete', i:'task_alt', from:['Planned','In progress'], to:'Completed'}, {a:'cancel', t:'Cancel', i:'block', from:['Planned'], to:'Cancelled', ghost:1} ],
  'Disassembly':[ {a:'complete', t:'Complete disassembly', i:'call_split', from:['Draft'], to:'Completed'} ],
  'Transfer':[ {a:'dispatch', t:'Dispatch', i:'local_shipping', from:['Draft'], to:'In transit'}, {a:'receive', t:'Receive', i:'move_to_inbox', from:['In transit'], to:'Received'} ],
  'Stock Take':[ {a:'post', t:'Post counts', i:'task_alt', from:['Counting'], to:'Posted'} ],
  'Recost':[ {a:'post', t:'Post recost', i:'task_alt', from:['Draft'], to:'Posted'} ]
};
const actsFor = u => (ACTS[u.kind]||[]).filter(x=>x.from.includes(u.status));
const STATUS_C = { Draft:'gray', Open:'blue', Backordered:'amber', Sent:'blue', Accepted:'green', Converted:'gray', Declined:'gray', Allocated:'blue', Picking:'ai', Picked:'ai', Packed:'ai', Dispatched:'green', Invoiced:'green', Cancelled:'gray', Confirmed:'blue', 'Partially received':'amber', Received:'green', Shipped:'blue', Credited:'green', Planned:'gray', 'In progress':'ai', Completed:'green', 'In transit':'ai', Counting:'amber', Posted:'green', Logged:'gray' };

function after(u, msg){ logDoc(u, msg); setUnitCost(u); syncPO(); render(); if($('#drawer').classList.contains('open') && $('#drawer').dataset.doc===u.id) docDrawer(u.id); toast(msg); }
function runAct(u, a){
  const k = u.kind, R = RUN[k] && RUN[k][a]; if(!R) return;
  R(u);
}
const RUN = {
  'Sales Quote':{
    send:u=>{ u.status='Sent'; after(u, `${u.no} sent to ${u.party}`); },
    accept:u=>{ u.status='Accepted'; after(u, `${u.no} accepted`); },
    decline:u=>{ u.status='Declined'; after(u, `${u.no} declined`); },
    convert:u=>{ const so = newDoc('Sales Order', { status:'Open', party:u.party, channel:u.channel, ref:u.no, lines:u.lines.map(l=>({ pid:l.pid, qty:l.qty, price:l.price })), charges:(u.charges||[]).map(c=>({...c})) }); setUnitCost(so); u.status='Converted'; u.ref = so.no; logDoc(so, `Converted from ${u.no}`); after(u, `${u.no} converted to ${so.no}`); docDrawer(so.id); }
  },
  'Sales Order':{
    allocate:u=>{ let short = [];
      u.lines.forEach(l=>{ const need = stockLines(l); const ok = need.every(x=>{ const p = prod(x.pid); return !isStocked(p) || availableQty(p) >= x.qty; });
        if(ok){ l.alloc = l.qty; l.picks = need.filter(x=>isStocked(prod(x.pid))).flatMap(x=>planPicks(prod(x.pid), x.qty, u.wh)); } else { l.alloc = 0; l.picks = []; short.push(prod(l.pid).sku); } });
      if(short.length){ u.status='Backordered'; after(u, `${u.no} backordered — short ${short.join(', ')}. Stitch added it to replenishment.`); }
      else { u.status='Allocated'; after(u, `${u.no} allocated — stock reserved`); } },
    pick:u=>{ u.status='Picking'; after(u, `${u.no} released to pick — see Pick on Warehouse Management`); },
    pickall:u=>{ u.lines.forEach(l=>(l.picks||[]).forEach(k=>k.done=true)); u.status='Picked'; after(u, `${u.no} picked`); },
    pack:u=>packModal(u),
    dispatch:u=>dispatchModal(u),
    invoice:u=>{ u.status='Invoiced'; u.pay = u.pay||'Unpaid'; after(u, `${u.no} invoiced · ${money(docTotal(u))}`); },
    cancel:u=>{ u.status='Cancelled'; u.lines.forEach(l=>{ l.alloc=0; l.picks=[]; }); after(u, `${u.no} cancelled — allocation released`); }
  },
  'Purchase Order':{
    send:u=>{ u.status='Sent'; u.eta = u.eta || iso(new Date(TODAY.getTime() + mfr(u.sup).lead*864e5)); after(u, `${u.no} sent to ${mfr(u.sup).email}`); },
    confirm:u=>{ u.status='Confirmed'; after(u, `${u.no} confirmed by ${u.party}`); },
    receive:u=>receiveModal(u),
    recost:u=>recostModal(u),
    rtv:u=>docForm('Supplier Return', { party:u.party, sup:u.sup, ref:u.no, lines:u.lines.filter(l=>l.rcv).map(l=>({ pid:l.pid, qty:1, cost:l.cost, loc:prod(l.pid).locs[0]?.s })) }),
    cancel:u=>{ u.status='Cancelled'; after(u, `${u.no} cancelled`); }
  },
  'Supplier Return':{
    ship:u=>{ const moved = []; u.lines.forEach(l=>{ const p = prod(l.pid); takeFrom(p, l.qty, l.loc).forEach(t=>moved.push(t.s)); if(p.track==='Serial') u.serials = shipSerials(p, l.qty, u.no).join(', '); if(p.track==='Batch') u.lots = consumeLots(p, l.qty); });
      u.qty = -u.lines.reduce((a,l)=>a+l.qty,0); u.loc = [...new Set(moved)].join(', '); u.status='Shipped'; after(u, `${u.no} shipped to ${u.party} · stock reduced ${-u.qty}`); },
    credit:u=>{ u.status='Credited'; u.credit = lineSub(u); after(u, `${u.no} credited ${money(u.credit)}`); }
  },
  'Assembly':{
    start:u=>{ u.status='In progress'; after(u, `${u.no} started — components reserved`); },
    complete:u=>{ const l = u.lines[0], p = prod(l.pid); const short = p.bom.comps.filter(c=>onHand(prod(c.pid)) < c.qty*l.qty);
      if(short.length) return toast(`Can't complete — short ${short.map(c=>prod(c.pid).sku).join(', ')}`, null) || shortModal(u, short);
      u.used = p.bom.comps.map(c=>{ const cp = prod(c.pid); const lots = cp.track==='Batch' ? consumeLots(cp, c.qty*l.qty) : ''; takeFrom(cp, c.qty*l.qty); return { pid:c.pid, qty:c.qty*l.qty, cost:cp.cost, lots }; });
      const unit = +(u.used.reduce((a,x)=>a+x.qty*x.cost,0)/l.qty + (+p.bom.labor||0)).toFixed(2);
      avgIn(p, l.qty, unit); applyDelta(p, u.loc, l.qty); p.updated = todayISO; l.cost = unit;
      if(p.track==='Serial') u.serials = newSerials(p, l.qty, u.loc, u.no).join(', ');
      if(p.track==='Batch'){ const lot = 'LOT-'+u.no.split('-')[1]; BATCHES.push({ lot, pid:p.id, qty:l.qty, exp:iso(new Date(TODAY.getTime()+365*864e5)), loc:u.loc }); u.lots = lot; }
      u.qty = l.qty; u.status='Completed'; after(u, `${u.no} completed · +${l.qty} ${p.sku} into ${u.loc} at ${money(unit)}/unit`); },
    cancel:u=>{ u.status='Cancelled'; after(u, `${u.no} cancelled`); }
  },
  'Disassembly':{
    complete:u=>{ const l = u.lines[0], p = prod(l.pid); if(onHand(p) < l.qty) return toast(`Only ${onHand(p)} ${p.sku} on hand`);
      takeFrom(p, l.qty, u.loc); p.bom.comps.forEach(c=>{ const cp = prod(c.pid); applyDelta(cp, bestBin(cp, u.wh), c.qty*l.qty); cp.updated = todayISO; });
      u.qty = -l.qty; u.status='Completed'; after(u, `${u.no} completed · ${l.qty} ${p.sku} broken into components`); }
  },
  'Transfer':{
    dispatch:u=>{ const l = u.lines[0], p = prod(l.pid); if(qtyAt(p, u.from) < l.qty) return toast(`Only ${qtyAt(p,u.from)} at ${u.from}`); takeFrom(p, l.qty, u.from); u.loc = `${u.from}→${u.to}`; u.status='In transit'; after(u, `${u.no} dispatched · ${l.qty} ${p.sku} in transit to ${u.to}`); },
    receive:u=>{ const l = u.lines[0], p = prod(l.pid); applyDelta(p, u.to, l.qty); p.updated = todayISO; u.loc = `${u.from}→${u.to}`; u.status='Received'; after(u, `${u.no} received · ${l.qty} ${p.sku} at ${u.to}`); }
  },
  'Stock Take':{
    post:u=>{ let net = 0; u.lines.forEach(l=>{ if(l.cnt==null) return; const p = prod(l.pid); const d = l.cnt - qtyAt(p, l.loc); if(d) applyDelta(p, l.loc, d); p.locs = p.locs.filter(x=>x.q>0); p.lastCount = todayISO; net += d; l.var = d; });
      u.qty = net; u.status='Posted'; after(u, `${u.no} posted · net variance ${net>0?'+':''}${net}`); }
  },
  'Recost':{
    post:u=>{ const alloc = recostAlloc(u); alloc.forEach(x=>{ const p = prod(x.pid); x.before = p.cost; p.cost = +(p.cost + x.perUnit).toFixed(2); x.after = p.cost; p.updated = todayISO; });
      u.alloc = alloc; u.status='Posted'; const po = docByNo(u.ref); if(po) logDoc(po, `Recost ${u.no} posted`); after(u, `${u.no} posted · landed cost added to ${alloc.length} product${alloc.length>1?'s':''}`); }
  }
};
function recostAlloc(u){
  const add = (u.costs||[]).reduce((a,c)=>a+(+c.amt||0),0);
  const w = l => u.method==='qty' ? l.qty : u.method==='volume' ? l.qty*(prod(l.pid).vol||0) : l.qty*(l.cost||0);
  const tot = u.lines.reduce((a,l)=>a+w(l),0) || 1;
  return u.lines.map(l=>{ const share = add*w(l)/tot; return { pid:l.pid, qty:l.qty, share, perUnit: l.qty ? share/l.qty : 0 }; });
}

/* ================= Create actions: one form engine for every document ================= */
const FM = { kind:null, d:{}, lines:[], charges:[], edit:null };
const KIND_META = {
  'Sales Quote':   { party:'Customer', price:true,  charges:'Sales',     primary:'Save & send',     go:'send',     hint:'Prices come from each product\u2019s Customer Pricing column.' },
  'Sales Order':   { party:'Customer', price:true,  charges:'Sales',     primary:'Save & allocate', go:'allocate', hint:'Allocating reserves stock and plans picks by bin.' },
  'Purchase Order':{ party:'Supplier', cost:true,   charges:'Purchases', primary:'Save & send',     go:'send',     hint:'Costs come from each product\u2019s Purchase Cost column.' },
  'Supplier Return':{ party:'Supplier', cost:true,  charges:null,        primary:'Save & ship',     go:'ship',     hint:'Shipping the return takes the units out of the bin you pick.' },
  'Assembly':      { single:'bom', primary:'Save & start', go:'start', hint:'Completing consumes components from the Bill of Materials and adds the finished goods.' },
  'Disassembly':   { single:'bom', primary:'Save & complete', go:'complete', hint:'Breaks finished goods or kits back into components.' },
  'Transfer':      { single:'any', primary:'Save & dispatch', go:'dispatch', hint:'Moves stock between shelves, buildings or your 3PL.' },
  'Stock Take':    { take:true, primary:'Start count', go:null, hint:'Freezes the system quantities for the shelves you pick. Enter counts, then post the variance.' }
};
const stockedProducts = () => PRODUCTS.filter(p=>isStocked(p) || isBundle(p));
const sellable = () => PRODUCTS.filter(p=>p.status!=='Internal');
const shelfOpts = (sel, only) => allShelves().filter(s=>!only || only.includes(s.id)).map(s=>`<option value="${s.id}" ${s.id===sel?'selected':''}>${s.id} · ${esc(s.w.name.split(' ·')[0])}</option>`).join('');
const optList = (arr, sel) => arr.map(([v,t])=>`<option value="${esc(v)}" ${v===sel?'selected':''}>${esc(t)}</option>`).join('');

function docForm(kind, preset={}, editId){
  const M = KIND_META[kind]; const ed = editId ? docById(editId) : null;
  FM.kind = kind; FM.edit = editId || null;
  if(ed){ FM.d = { party:ed.party, sup:ed.sup, channel:ed.channel, wh:ed.wh, eta:ed.eta, expires:ed.expires, due:ed.due, loc:ed.loc, from:ed.from, to:ed.to, ref:ed.ref, reason:ed.reason, comments:ed.comments, aisles:ed.aisles||[] }; FM.lines = ed.lines.map(l=>({...l})); FM.charges = (ed.charges||[]).map(c=>({...c})); }
  else {
    const c0 = CUSTOMERS[0];
    FM.d = Object.assign({ party: M.party==='Customer' ? c0.name : M.party==='Supplier' ? mfr(preset.sup||'cotton').name : '', sup:preset.sup||'cotton', channel:c0.channel, wh:'CDC', eta:'', expires:iso(new Date(TODAY.getTime()+14*864e5)), due:iso(new Date(TODAY.getTime()+5*864e5)), comments:'', aisles:['A'] }, preset);
    FM.lines = (preset.lines || []).map(l=>({...l}));
    FM.charges = (preset.charges || []).map(c=>({...c}));
    if(M.single && !FM.lines.length){ const p = preset.pid ? prod(preset.pid) : (M.single==='bom' ? PRODUCTS.find(x=>x.bom && (kind==='Disassembly' ? x.bom.type!=='Bundle' && onHand(x)>0 : x.bom.type!=='Bundle')) : PRODUCTS.find(isStocked)); FM.lines = [{ pid:p.id, qty:preset.qty||1 }]; }
    if(kind==='Assembly' || kind==='Disassembly'){ const p = prod(FM.lines[0].pid); FM.d.loc = FM.d.loc || p.locs[0]?.s || bestBin(p,'CDC'); }
    if(kind==='Transfer'){ const p = prod(FM.lines[0].pid); FM.d.from = FM.d.from || p.locs[0]?.s || 'A-01'; FM.d.to = FM.d.to || allShelves().find(s=>s.id!==FM.d.from && s.w.id==='TUP')?.id; }
    if(!M.single && !M.take && !FM.lines.length) fmAddLine();
  }
  if(M.party==='Customer' && !FM.edit) FM.lines.forEach(l=>{ if(l.price==null) l.price = priceFor(prod(l.pid), FM.d.party, l.qty).price; });
  if(M.cost) FM.lines.forEach(l=>{ if(l.cost==null) l.cost = prod(l.pid).cost; });
  openDrawer(`<div class="dh"><div class="li-ic">${ic(TX_ICON[kind])}</div><div><div class="dh-t">${ed?'Edit '+ed.no:'New '+kind}</div><div class="dh-s">${M.hint} Saves as a row in Stock Updates.</div></div><div class="dh-x"><button class="icon-btn" data-cmd="close-drawer" aria-label="Close">${ic('close')}</button></div></div>
    <div class="db" id="fmBody"></div>
    <div class="df"><button class="btn" data-cmd="close-drawer">Cancel</button><span class="sp"></span>${M.take?'':`<button class="btn" data-cmd="fm-save" data-go="">Save draft</button>`}<button class="btn primary" data-cmd="fm-save" data-go="${M.go||''}">${M.primary}</button></div>`);
  $('#drawer').dataset.doc = '';
  fmRender();
}
function fmAddLine(pid){
  const M = KIND_META[FM.kind];
  let pool = M.party==='Customer' ? sellable() : M.party==='Supplier' ? PRODUCTS.filter(p=>p.mfr===FM.d.sup && isStocked(p)) : stockedProducts();
  if(!pool.length) pool = PRODUCTS.filter(isStocked);
  const p = pid ? prod(pid) : pool.find(x=>!FM.lines.some(l=>l.pid===x.id)) || pool[0];
  const l = { pid:p.id, qty:1 };
  if(M.price) l.price = priceFor(p, FM.d.party, 1).price;
  if(M.cost) l.cost = p.cost;
  if(FM.kind==='Supplier Return') l.loc = p.locs[0]?.s || '';
  FM.lines.push(l);
}
function fmProductPool(){
  const M = KIND_META[FM.kind];
  if(M.party==='Customer') return sellable();
  if(M.party==='Supplier') return PRODUCTS.filter(isStocked).sort((a,b)=>(b.mfr===FM.d.sup)-(a.mfr===FM.d.sup));
  if(M.single==='bom') return PRODUCTS.filter(p=>p.bom && p.bom.type!=='Bundle');
  return PRODUCTS.filter(isStocked);
}
function fmLineTotal(l){ return l.qty*(KIND_META[FM.kind].price ? (l.price||0) : (l.cost||0)); }
function fmTotals(){ const tmp = { lines:FM.lines, charges:FM.charges }; return { sub:lineSub(tmp), ch:chargesTotal(tmp), tot:docTotal(tmp), chg:FM.charges.map(c=>chargeAmt(tmp,c)) }; }
function fmTotHTML(){ const t = fmTotals(); return `<div class="tot-row"><span>Lines</span><b class="num">${money(t.sub)}</b></div>${FM.charges.length?`<div class="tot-row"><span>Freight & charges</span><b class="num">${money(t.ch)}</b></div>`:''}<div class="tot-row grand"><span>Total</span><b class="num">${money(t.tot)}</b></div>`; }
function bomNeedHTML(p, qty, dir){
  if(!p.bom) return '';
  return `<table class="t mini"><thead><tr><th>Component</th><th class="r">Per unit</th><th class="r">${dir<0?'Returns':'Needs'}</th><th class="r">On hand</th><th class="r">Available</th></tr></thead><tbody>${p.bom.comps.map(c=>{ const cp = prod(c.pid), need = c.qty*qty, av = availableQty(cp); return `<tr><td><button class="link" data-cmd="open-product" data-id="${cp.id}">${esc(cp.name)}</button><div class="muted mono" style="font-size:11.5px">${cp.sku}</div></td><td class="r num">${c.qty}</td><td class="r num">${num(need)}</td><td class="r num">${num(onHand(cp))}</td><td class="r num ${dir>0 && onHand(cp)<need?'var-neg':''}">${num(av)}</td></tr>`; }).join('')}</tbody></table>
  <div class="muted" style="font-size:12px;margin-top:6px">Unit cost from BOM ${money(bomCost(p))} (components + ${money(p.bom.labor)} labor)${dir>0 && p.bom.comps.some(c=>onHand(prod(c.pid))<c.qty*qty) ? ` · <span class="var-neg">short on components</span> <button class="btn xs" data-cmd="fm-short-po">${ic('shopping_cart')}Draft PO for shortfall</button>`:''}</div>`;
}
function fmRender(){
  const k = FM.kind, M = KIND_META[k], d = FM.d; const el = $('#fmBody'); if(!el) return;
  let head = '';
  if(M.party==='Customer'){ const c = CUSTOMERS.find(x=>x.name===d.party);
    head = `<div class="fld"><label>Customer</label><select class="inp" data-ff="party">${optList(CUSTOMERS.map(c=>[c.name, c.name+' · '+c.tier]), d.party)}</select></div>
      <div class="fld"><label>Distribution Channel</label><select class="inp" data-ff="channel">${optList(CHANNELS_ALL.map(x=>[x,x]), d.channel)}</select></div>
      ${k==='Sales Quote' ? `<div class="fld"><label>Valid until</label><input class="inp" type="date" data-ff="expires" value="${d.expires||''}"/></div>` : `<div class="fld"><label>Ship from</label><select class="inp" data-ff="wh">${optList(WAREHOUSES.map(w=>[w.id,w.name]), d.wh)}</select></div>`}
      <div class="fld"><label>Terms</label><input class="inp" readonly value="${esc(c?c.terms+' · '+c.tier+' pricing':'—')}"/></div>`; }
  else if(M.party==='Supplier'){ const m = mfr(d.sup);
    head = `<div class="fld"><label>Supplier</label><select class="inp" data-ff="sup">${optList(MANUFACTURERS.map(m=>[m.id,m.name]), d.sup)}</select></div>
      ${k==='Purchase Order' ? `<div class="fld"><label>Deliver to</label><select class="inp" data-ff="wh">${optList(WAREHOUSES.map(w=>[w.id,w.name]), d.wh)}</select></div><div class="fld"><label>Expected</label><input class="inp" type="date" data-ff="eta" value="${d.eta||iso(new Date(TODAY.getTime()+m.lead*864e5))}"/></div>` : `<div class="fld"><label>Against PO</label><select class="inp" data-ff="ref">${optList([['','—'], ...docs('Purchase Order',['Received','Partially received']).filter(u=>u.sup===d.sup).map(u=>[u.no,u.no])], d.ref||'')}</select></div><div class="fld"><label>Reason</label><select class="inp" data-ff="reason">${optList(['Damaged','Stitching defect','Wrong item','Over-shipped','Quality'].map(x=>[x,x]), d.reason||'Damaged')}</select></div>`}
      <div class="fld"><label>Terms</label><input class="inp" readonly value="${esc(m.terms+' · '+m.lead+'-day lead · '+m.ontime+'% on time')}"/></div>`; }
  else if(M.single){ const l = FM.lines[0], p = prod(l.pid);
    head = `<div class="fld full"><label>${k==='Transfer'?'Product':'Finished product'}</label><select class="inp" data-lf="pid" data-li="0">${optList(fmProductPool().map(x=>[x.id, x.sku+' — '+x.name+(x.bom?' · '+x.bom.type:'')]), l.pid)}</select></div>
      <div class="fld"><label>Quantity</label><input class="inp num" type="number" min="1" data-lf="qty" data-li="0" value="${l.qty}"/></div>
      ${k==='Transfer' ? `<div class="fld"><label>Status after save</label><input class="inp" readonly value="Draft"/></div><div class="fld"><label>From shelf <span class="opt">· ${qtyAt(p,d.from)} there</span></label><select class="inp" data-ff="from">${shelfOpts(d.from, p.locs.map(x=>x.s))}</select></div><div class="fld"><label>To shelf</label><select class="inp" data-ff="to">${shelfOpts(d.to)}</select></div>`
        : `<div class="fld"><label>${k==='Assembly'?'Output shelf':'Take from shelf'}</label><select class="inp" data-ff="loc">${shelfOpts(d.loc, k==='Disassembly'?p.locs.map(x=>x.s):null)}</select></div>${k==='Assembly'?`<div class="fld"><label>Due</label><input class="inp" type="date" data-ff="due" value="${d.due||''}"/></div>`:''}`}`;
  }
  else if(M.take){ head = `<div class="fld"><label>Warehouse</label><select class="inp" data-ff="wh">${optList(WAREHOUSES.map(w=>[w.id,w.name]), d.wh)}</select></div>
      <div class="fld"><label>Aisles to count</label><div class="seg" style="flex-wrap:wrap">${WAREHOUSES.find(w=>w.id===d.wh).aisles.map(a=>`<button type="button" class="${d.aisles.includes(a)?'on':''}" data-cmd="fm-aisle" data-a="${a}">${a}</button>`).join('')}</div></div>`; }
  let body = '';
  if(M.single==='bom'){ const l = FM.lines[0]; body = `<div class="dsec"><div class="dsec-h"><h4>Bill of Materials</h4><button class="btn xs ghost" data-cmd="bom-edit" data-id="${l.pid}">${ic('edit')}Edit BOM</button></div>${bomNeedHTML(prod(l.pid), l.qty, k==='Assembly'?1:-1)}</div>`; }
  else if(M.take){ const bins = allShelves().filter(s=>s.w.id===d.wh && d.aisles.includes(s.a)); const n = bins.reduce((a,s)=>a+s.items.length,0); body = `<div class="dsec"><div class="muted">${bins.length} shelves · ${n} product positions will be frozen for counting.</div></div>`; }
  else if(!M.single){
    const pool = fmProductPool();
    body = `<div class="dsec"><div class="dsec-h"><h4>Lines</h4><button class="btn xs" data-cmd="fm-add-line">${ic('add')}Add line</button></div>
      <table class="t mini lines"><thead><tr><th>Product</th><th class="r" style="width:72px">Qty</th>${k==='Supplier Return'?'<th style="width:96px">From shelf</th>':''}<th class="r" style="width:96px">${M.price?'Unit price':'Unit cost'}</th><th class="r" style="width:90px">Line</th><th style="width:30px"></th></tr></thead>
      <tbody>${FM.lines.map((l,i)=>{ const p = prod(l.pid); const pf = M.price ? priceFor(p, d.party, l.qty) : null; const av = availableQty(p);
        return `<tr><td><select class="inp sm" data-lf="pid" data-li="${i}">${optList(pool.map(x=>[x.id, x.sku+' — '+x.name]), l.pid)}</select>
          <div class="muted" style="font-size:11.5px;margin-top:3px">${M.price ? `${esc(pf.why)}${isStocked(p)||isBundle(p)?` · ${av===Infinity?'':num(av)+' available'}`:` · ${FT_LABEL[p.ftype]}`}${isBundle(p)?' · bundle':''}` : `${num(onHand(p))} on hand · ${p.mfr===d.sup?'from this supplier':'<span class="var-neg">usually from '+esc(mfr(p.mfr).name)+'</span>'}`}</div></td>
          <td class="r"><input class="inp sm num r" type="number" min="1" data-lf="qty" data-li="${i}" value="${l.qty}"/></td>
          ${k==='Supplier Return'?`<td><select class="inp sm" data-lf="loc" data-li="${i}">${shelfOpts(l.loc, p.locs.map(x=>x.s))}</select></td>`:''}
          <td class="r"><input class="inp sm num r" type="number" step="0.01" min="0" data-lf="${M.price?'price':'cost'}" data-li="${i}" value="${M.price?l.price:l.cost}"/></td>
          <td class="r num" data-lt="${i}">${money(fmLineTotal(l))}</td>
          <td><button class="icon-btn sm" data-cmd="fm-rm-line" data-li="${i}" aria-label="Remove line">${ic('close')}</button></td></tr>`; }).join('')}</tbody></table></div>`;
    if(M.charges) body += `<div class="dsec"><div class="dsec-h"><h4>Freight & charges</h4><button class="btn xs" data-cmd="fm-add-charge">${ic('add')}Add charge</button></div>
      ${FM.charges.length ? `<table class="t mini"><thead><tr><th>Charge</th><th style="width:110px">Basis</th><th class="r" style="width:90px">Rate</th><th class="r" style="width:90px">Amount</th><th style="width:30px"></th></tr></thead><tbody>${FM.charges.map((c,i)=>`<tr>
        <td><input class="inp sm" data-cf="name" data-ci="${i}" value="${esc(c.name)}"/></td>
        <td><select class="inp sm" data-cf="basis" data-ci="${i}">${optList([['flat','Flat'],['per unit','Per unit'],['per lb','Per lb'],['%','% of lines']], c.basis)}</select></td>
        <td class="r"><input class="inp sm num r" type="number" step="0.01" data-cf="rate" data-ci="${i}" value="${c.rate}"/></td>
        <td class="r num" data-ct="${i}">${money(fmTotals().chg[i])}</td>
        <td><button class="icon-btn sm" data-cmd="fm-rm-charge" data-ci="${i}" aria-label="Remove charge">${ic('close')}</button></td></tr>`).join('')}</tbody></table>` : `<div class="faint" style="font-size:12.5px">No charges. Add freight, handling, duty, fuel or a discount.</div>`}</div>`;
    body += `<div class="totals" id="fmTot">${fmTotHTML()}</div>`;
  }
  el.innerHTML = `<div class="fields" style="margin-bottom:20px">${head}</div>${body}<div class="fld" style="margin-top:16px"><label>Comments</label><textarea class="inp" rows="2" data-ff="comments">${esc(d.comments||'')}</textarea></div>`;
}
function fmField(t){
  const k = FM.kind, M = KIND_META[k];
  if(t.dataset.ff){ const f = t.dataset.ff; FM.d[f] = t.type==='number' ? +t.value : t.value;
    if(f==='party' && M.price){ const c = CUSTOMERS.find(x=>x.name===t.value); if(c) FM.d.channel = c.channel; FM.lines.forEach(l=>l.price = priceFor(prod(l.pid), FM.d.party, l.qty).price); }
    if(f==='sup'){ FM.d.party = mfr(t.value).name; }
    if(f==='wh' && M.take){ FM.d.aisles = [WAREHOUSES.find(w=>w.id===t.value).aisles[0]]; }
    return f!=='comments'; }
  if(t.dataset.lf){ const i = +t.dataset.li, f = t.dataset.lf, l = FM.lines[i];
    if(f==='pid'){ l.pid = t.value; const p = prod(t.value); if(M.price) l.price = priceFor(p, FM.d.party, l.qty).price; if(M.cost) l.cost = p.cost; if(k==='Supplier Return') l.loc = p.locs[0]?.s;
      if(k==='Transfer'){ FM.d.from = p.locs[0]?.s || FM.d.from; } if(k==='Assembly'||k==='Disassembly'){ FM.d.loc = p.locs[0]?.s || bestBin(p,'CDC'); } return true; }
    if(f==='loc'){ l.loc = t.value; return false; }
    l[f] = +t.value || 0;
    if(f==='qty' && M.price){ const np = priceFor(prod(l.pid), FM.d.party, l.qty).price; if(np!==l.price){ l.price = np; return 'soft'; } }
    if(M.single) return 'soft';
    return 'soft'; }
  if(t.dataset.cf){ const i = +t.dataset.ci, f = t.dataset.cf; FM.charges[i][f] = f==='rate' ? (+t.value||0) : t.value; return f==='basis' ? true : 'soft'; }
  return false;
}
function fmSoft(){
  FM.lines.forEach((l,i)=>{ const c = $(`[data-lt="${i}"]`); if(c) c.textContent = money(fmLineTotal(l)); const pi = $(`[data-lf="price"][data-li="${i}"]`); if(pi && document.activeElement!==pi && +pi.value!==l.price) pi.value = l.price; });
  const t = fmTotals(); t.chg.forEach((a,i)=>{ const c = $(`[data-ct="${i}"]`); if(c) c.textContent = money(a); });
  const tot = $('#fmTot'); if(tot) tot.innerHTML = fmTotHTML();
  if(KIND_META[FM.kind].single==='bom'){ const sec = $('#fmBody .dsec'); if(sec){ const l = FM.lines[0]; sec.innerHTML = `<div class="dsec-h"><h4>Bill of Materials</h4><button class="btn xs ghost" data-cmd="bom-edit" data-id="${l.pid}">${ic('edit')}Edit BOM</button></div>${bomNeedHTML(prod(l.pid), l.qty, FM.kind==='Assembly'?1:-1)}`; } }
}
document.addEventListener('input', e=>{ const t = e.target; if(!t.closest || !t.closest('#fmBody')) return; if(t.tagName==='SELECT') return; const r = fmField(t); if(r) fmSoft(); });
document.addEventListener('change', e=>{ const t = e.target; if(!t.closest || !t.closest('#fmBody')) return; if(t.tagName!=='SELECT') return; const r = fmField(t); if(r===true) fmRender(); else if(r) fmSoft(); });

function fmSave(goAct){
  const k = FM.kind, M = KIND_META[k], d = FM.d;
  if(!M.take && !FM.lines.length) return toast('Add at least one line');
  if(FM.lines.some(l=>!(l.qty>0))) return toast('Every line needs a quantity');
  let u;
  if(M.take){
    const bins = allShelves().filter(s=>s.w.id===d.wh && d.aisles.includes(s.a));
    if(!d.aisles.length) return toast('Pick at least one aisle');
    u = newDoc('Stock Take', { status:'Counting', wh:d.wh, aisles:[...d.aisles], comments:d.comments, lines:[] });
    bins.forEach(s=>s.items.forEach(x=>u.lines.push({ pid:x.p.id, loc:s.id, sys:x.q, qty:x.q, cnt:null })));
    u.loc = `${d.aisles.join(', ')} · ${WAREHOUSES.find(w=>w.id===d.wh).name}`;
  } else {
    const o = { party:d.party, sup:d.sup, channel:d.channel, wh:d.wh, eta:d.eta || (k==='Purchase Order'?iso(new Date(TODAY.getTime()+mfr(d.sup).lead*864e5)):''), expires:d.expires, due:d.due, loc:d.loc||'—', from:d.from, to:d.to, ref:d.ref, reason:d.reason, comments:d.comments, lines:FM.lines.map(l=>({...l})), charges:FM.charges.map(c=>({...c})) };
    if(M.single) o.party = '';
    if(k==='Purchase Order') o.lines.forEach(l=>{ l.rcv = l.rcv||0; });
    if(k==='Transfer'){ if(d.from===d.to) return toast('Pick two different shelves'); o.loc = `${d.from}→${d.to}`; }
    if(k==='Supplier Return') o.loc = [...new Set(o.lines.map(l=>l.loc))].join(', ');
    if(FM.edit){ u = docById(FM.edit); Object.assign(u, o); logDoc(u, 'Edited'); }
    else u = newDoc(k, Object.assign(o, { status: k==='Sales Order' ? 'Open' : k==='Assembly' ? 'Planned' : 'Draft' }));
  }
  setUnitCost(u); syncPO();
  if(goAct && actsFor(u).some(a=>a.a===goAct)){ runAct(u, goAct); if(!$('#modalWrap').classList.contains('open')) docDrawer(u.id); }
  else { toast(`${u.no} saved · ${u.status}`); render(); docDrawer(u.id); }
}
Object.assign(CMD, {
  'new-doc': el => { closeMenu(); closeModal(); closePalette && closePalette(); const pre = {}; if(el.dataset.id){ const p = prod(el.dataset.id); if(['Purchase Order','Supplier Return'].includes(el.dataset.k)) { pre.sup = p.mfr; pre.party = mfr(p.mfr).name; pre.lines = [{ pid:p.id, qty: el.dataset.k==='Purchase Order' ? (stitchPlan(p)?.qty || suggestQty(p)) : 1, cost:p.cost, loc:p.locs[0]?.s }]; } else if(['Sales Quote','Sales Order'].includes(el.dataset.k)) pre.lines = [{ pid:p.id, qty:1 }]; else { pre.pid = p.id; pre.qty = +el.dataset.q || (el.dataset.k==='Assembly' ? (stitchPlan(p)?.qty||p.rq||1) : 1); } }
    if(el.dataset.sup){ pre.sup = el.dataset.sup; pre.party = mfr(el.dataset.sup).name; }
    if(el.dataset.cust){ pre.party = el.dataset.cust; const c = CUSTOMERS.find(x=>x.name===el.dataset.cust); if(c) pre.channel = c.channel; }
    if(el.dataset.from){ pre.from = el.dataset.from; }
    if(el.dataset.wh){ pre.wh = el.dataset.wh; }
    docForm(el.dataset.k, pre); },
  'fm-save': el => fmSave(el.dataset.go),
  'fm-add-line': () => { fmAddLine(); fmRender(); },
  'fm-rm-line': el => { FM.lines.splice(+el.dataset.li, 1); fmRender(); },
  'fm-add-charge': el => { const side = KIND_META[FM.kind].charges; const pre = CHARGE_PRESETS.filter(c=>c.side===side||c.side==='Both');
    openMenu(el, `<div class="mh2">Freight & charges</div>${pre.map((c,i)=>`<button class="mi" data-cmd="fm-charge-pick" data-i="${CHARGE_PRESETS.indexOf(c)}">${ic(c.rate<0?'percent':'local_shipping')}${esc(c.name)}<span class="k">${c.basis==='%'?c.rate+'%':money(c.rate)+(c.basis==='flat'?'':' '+c.basis)}</span></button>`).join('')}<div class="msep"></div><button class="mi" data-cmd="fm-charge-pick" data-i="-1">${ic('add')}Custom charge</button>`); },
  'fm-charge-pick': el => { closeMenu(); const c = CHARGE_PRESETS[+el.dataset.i] || { name:'Custom charge', basis:'flat', rate:0 }; FM.charges.push({ name:c.name, basis:c.basis, rate:c.rate }); fmRender(); },
  'fm-rm-charge': el => { FM.charges.splice(+el.dataset.ci, 1); fmRender(); },
  'fm-aisle': el => { const a = el.dataset.a, s = FM.d.aisles; const i = s.indexOf(a); i<0 ? s.push(a) : s.splice(i,1); fmRender(); },
  'fm-short-po': () => { const l = FM.lines[0], p = prod(l.pid); const short = p.bom.comps.filter(c=>onHand(prod(c.pid)) < c.qty*l.qty).map(c=>({ p:prod(c.pid), q:c.qty*l.qty - onHand(prod(c.pid)) })); const made = draftCompPOs(short); toast(`Drafted ${made.join(', ')} for component shortfall`); fmRender(); }
});
function draftCompPOs(items){
  const by = {}; items.forEach(x=>{ (by[x.p.mfr] = by[x.p.mfr] || []).push(x); });
  const made = []; Object.entries(by).forEach(([m, xs])=>{ const u = newDoc('Purchase Order', { status:'Draft', party:mfr(m).name, sup:m, wh:'CDC', comments:'Drafted by Stitch', lines:xs.map(x=>({ pid:x.p.id, qty:Math.max(x.q, x.p.rq||0), cost:x.p.cost, rcv:0 })) }); setUnitCost(u); made.push(u.no); });
  syncPO(); return made;
}

/* ================= Operation modals (receive, pack, dispatch, recost) ================= */
function receiveModal(u){
  const open = u.lines.map((l,i)=>({ l, i, rem:l.qty-(l.rcv||0) })).filter(x=>x.rem>0);
  if(!open.length) return toast('Nothing left to receive');
  const lc = chargesTotal(u), sub = lineSub(u) || 1;
  openModal(`<div class="mh">${ic('move_to_inbox')}<div class="t">Receive ${u.no}</div>${pill(u.status, STATUS_C[u.status], false)}<button class="icon-btn" data-cmd="close-modal" aria-label="Close">${ic('close')}</button></div>
    <div class="mb"><p class="muted" style="margin:0 0 12px">From ${esc(u.party)}. Freight on this PO (${money(lc)}) is added to the landed unit cost.</p>
    <table class="t mini"><thead><tr><th>Product</th><th class="r" style="width:80px">Receive</th><th style="width:118px">Into bin</th><th>Tracking</th></tr></thead><tbody>
    ${open.map(({l,i,rem})=>{ const p = prod(l.pid); const land = l.cost + (lc*(l.cost/ sub)); return `<tr><td><div class="prod-name">${esc(p.name)}</div><div class="muted mono" style="font-size:11.5px">${p.sku} · ${rem} of ${l.qty} open · landed ${money(land)}</div></td>
      <td class="r"><input class="inp sm num r" type="number" min="0" max="${rem}" id="rq${i}" value="${rem}"/></td>
      <td><select class="inp sm" id="rb${i}">${shelfOpts(bestBin(p, u.wh))}</select></td>
      <td>${p.track==='Batch' ? `<div style="display:flex;gap:4px"><input class="inp sm mono" id="rl${i}" value="LOT-${u.no.slice(-4)}${i}" aria-label="Lot"/><input class="inp sm" type="date" id="re${i}" value="${iso(new Date(TODAY.getTime()+365*864e5))}" aria-label="Expiry"/></div>` : p.track==='Serial' ? `<input class="inp sm mono" id="rs${i}" placeholder="Auto-assign or paste, comma separated"/>` : '<span class="faint">None</span>'}</td></tr>`; }).join('')}
    </tbody></table></div>
    <div class="mf"><button class="btn" data-cmd="close-modal">Cancel</button><button class="btn primary" data-cmd="do-receive" data-id="${u.id}">${ic('move_to_inbox')}Receive into stock</button></div>`, true);
}
function doReceive(u){
  const lc = chargesTotal(u), sub = lineSub(u) || 1; let tot = 0; const bins = new Set(), lots = [], sers = [];
  u.lines.forEach((l,i)=>{ const q = Math.min(+($('#rq'+i)?.value||0), l.qty-(l.rcv||0)); if(!(q>0)) return; const p = prod(l.pid), bin = $('#rb'+i).value;
    const land = +(l.cost + lc*(l.cost/sub)).toFixed(2);
    avgIn(p, q, land); applyDelta(p, bin, q); p.updated = todayISO; l.rcv = (l.rcv||0) + q; tot += q; bins.add(bin);
    if(p.track==='Batch'){ const lot = $('#rl'+i).value || ('LOT-'+u.no.slice(-4)); BATCHES.push({ lot, pid:p.id, qty:q, exp:$('#re'+i).value, loc:bin }); lots.push(lot); }
    if(p.track==='Serial'){ const typed = ($('#rs'+i).value||'').split(',').map(s=>s.trim()).filter(Boolean); const s = typed.length ? typed : newSerials(p, q, bin, u.no); if(typed.length) typed.forEach(no=>SERIALS.push({ no, pid:p.id, loc:bin, status:'In stock', doc:u.no })); sers.push(...s); } });
  if(!tot) return toast('Enter a quantity to receive');
  u.qty += tot; u.loc = [...bins].join(', '); if(lots.length) u.lots = [u.lots, ...lots].filter(Boolean).join(', '); if(sers.length) u.serials = [u.serials, ...sers].filter(Boolean).join(', ');
  u.status = u.lines.every(l=>(l.rcv||0)>=l.qty) ? 'Received' : 'Partially received'; closeModal();
  after(u, `${u.no} · received ${tot} into ${u.loc}. Purchase cost updated (weighted average, landed).`);
}
const boxes = () => PRODUCTS.filter(p=>p.area==='Packaging' && onHand(p)>0);
function packModal(u){
  const units = u.lines.reduce((a,l)=>a+l.qty,0); const wt = +u.lines.reduce((a,l)=>a+l.qty*(prod(l.pid).vol||0)*8, 0.4).toFixed(1);
  const bx = boxes(); const pick = units>4 ? bx.find(p=>p.sku.includes('1210')) : bx.find(p=>p.sku.includes('0806')) || bx[0];
  openModal(`<div class="mh">${ic('package_2')}<div class="t">Pack ${u.no}</div><button class="icon-btn" data-cmd="close-modal" aria-label="Close">${ic('close')}</button></div>
    <div class="mb"><div class="fields">
      <div class="fld"><label>Box <span class="opt">· consumed from stock</span></label><select class="inp" id="pkBox">${bx.map(p=>`<option value="${p.id}" ${p===pick?'selected':''}>${p.sku} · ${onHand(p)} left</option>`).join('')}</select></div>
      <div class="fld"><label>Cartons</label><input class="inp num" id="pkN" type="number" min="1" value="${Math.max(1, Math.ceil(units/24))}"/></div>
      <div class="fld"><label>Weight (lb)</label><input class="inp num" id="pkW" type="number" step="0.1" value="${wt}"/></div>
      <div class="fld"><label>Packed by</label><select class="inp" id="pkBy">${OWNERS.map(o=>`<option>${o}</option>`).join('')}</select></div>
    </div><div class="stitch-hint" style="margin-top:12px">${ic('auto_awesome')}Stitch picked ${pick?pick.sku:'a box'} for ${units} unit${units>1?'s':''}.</div></div>
    <div class="mf"><button class="btn" data-cmd="close-modal">Cancel</button><button class="btn primary" data-cmd="do-pack" data-id="${u.id}">${ic('package_2')}Mark packed</button></div>`);
}
function doPack(u){ const b = prod($('#pkBox').value), n = +$('#pkN').value||1; if(b) takeFrom(b, n); u.box = b?.sku; u.cartons = n; u.weight = +$('#pkW').value||1; u.packer = $('#pkBy').value; u.status = 'Packed'; closeModal(); after(u, `${u.no} packed · ${n} × ${u.box} · ${u.weight} lb`); }
const CARRIERS = [['USPS Ground Advantage', 0.9, 4.2],['UPS Ground', 1.1, 5.4],['FedEx Home Delivery', 1.05, 5.9],['LTL · Estes', 0.32, 68]];
function dispatchModal(u){
  const w = u.weight || 2; const rates = CARRIERS.map(([c,per,base])=>({ c, p:+(base + per*w).toFixed(2) })); if(u.wh==='MEM') rates.unshift({ c:'ShipBob · UPS', p:+(3.9+0.7*w).toFixed(2) });
  const best = rates.slice().sort((a,b)=>a.p-b.p)[0];
  openModal(`<div class="mh">${ic('local_shipping')}<div class="t">Dispatch ${u.no}</div><button class="icon-btn" data-cmd="close-modal" aria-label="Close">${ic('close')}</button></div>
    <div class="mb"><p class="muted" style="margin:0 0 10px">${esc(u.party)} · ${u.cartons||1} carton · ${w} lb. Dispatching deducts stock from the picked bins${u.lines.some(l=>['Serial','Batch'].includes(prod(l.pid).track))?' and records serials / lots':''}.</p>
    <div class="list">${rates.map(r=>`<label class="li" style="cursor:pointer"><input type="radio" name="dRate" value="${esc(r.c)}" data-p="${r.p}" ${r===best?'checked':''}/><div class="li-main"><div class="li-t">${esc(r.c)}</div><div class="li-s">${r===best?'Cheapest · Stitch pick':'&nbsp;'}</div></div><div class="li-r num">${money(r.p)}</div></label>`).join('')}</div></div>
    <div class="mf"><button class="btn" data-cmd="close-modal">Cancel</button><button class="btn primary" data-cmd="do-dispatch" data-id="${u.id}">${ic('local_shipping')}Buy label & dispatch</button></div>`);
}
function doDispatch(u){
  const r = document.querySelector('input[name="dRate"]:checked'); const carrier = r.value, cost = +r.dataset.p;
  let units = 0; const bins = new Set(), sers = [], lots = [];
  u.lines.forEach(l=>{ stockLines(l).forEach(x=>{ const p = prod(x.pid); if(!isStocked(p)) return; const picks = (l.picks||[]).filter(k=>k.pid===x.pid);
      let need = x.qty; picks.forEach(k=>{ const t = Math.min(k.q, qtyAt(p,k.s), need); if(t>0){ applyDelta(p, k.s, -t); need -= t; bins.add(k.s); } }); if(need>0) takeFrom(p, need).forEach(t=>bins.add(t.s));
      p.locs = p.locs.filter(z=>z.q>0); p.updated = todayISO; units += x.qty;
      if(p.track==='Serial') sers.push(...shipSerials(p, x.qty, u.no)); if(p.track==='Batch') lots.push(consumeLots(p, x.qty)); }); });
  const id = 'SHP-' + (S.shpSeq++);
  SHIPMENTS.unshift({ id, dir:'Outbound', ref:`${u.no} · ${u.channel||'Direct'}`, party:u.party, carrier, items:units, wh:u.wh, status:'Label created', eta:iso(new Date(TODAY.getTime()+3*864e5)), cost, weight:u.weight||1 });
  u.ship = id; u.carrier = carrier; u.qty = -units; u.loc = [...bins].join(', ') || u.loc; if(sers.length) u.serials = sers.join(', '); if(lots.length) u.lots = lots.filter(Boolean).join(', ');
  u.status = 'Dispatched'; closeModal(); after(u, `${u.no} dispatched · ${id} · ${carrier} ${money(cost)} · −${units} from stock`);
}
function recostModal(po){
  const rc = newDoc('Recost', { status:'Draft', ref:po.no, party:po.party, method:'value', costs:[{ name:'Duty & tariffs', amt:+(lineSub(po)*0.065).toFixed(2) }, { name:'Customs broker', amt:35 }], lines:po.lines.filter(l=>l.rcv).map(l=>({ pid:l.pid, qty:l.rcv, cost:l.cost })) });
  setUnitCost(rc); logDoc(po, `Recost ${rc.no} drafted`); toast(`${rc.no} drafted from ${po.no}`); render(); docDrawer(rc.id);
}
function shortModal(u, short){
  const l = u.lines[0];
  openModal(`<div class="mh">${ic('warning')}<div class="t">Short on components</div><button class="icon-btn" data-cmd="close-modal" aria-label="Close">${ic('close')}</button></div>
    <div class="mb"><table class="t mini"><thead><tr><th>Component</th><th class="r">Need</th><th class="r">On hand</th><th class="r">Short</th></tr></thead><tbody>${short.map(c=>{ const cp = prod(c.pid); return `<tr><td>${esc(cp.name)}</td><td class="r num">${c.qty*l.qty}</td><td class="r num">${onHand(cp)}</td><td class="r num var-neg">${c.qty*l.qty-onHand(cp)}</td></tr>`; }).join('')}</tbody></table></div>
    <div class="mf"><button class="btn" data-cmd="close-modal">Close</button><button class="btn primary" data-cmd="short-po" data-id="${u.id}">${ic('shopping_cart')}Draft purchase orders</button></div>`);
}

/* ================= Document drawer ================= */
const partyLabel = u => ['Purchase Order','Supplier Return'].includes(u.kind) ? 'Supplier' : ['Sales Quote','Sales Order'].includes(u.kind) ? 'Customer' : '';
function stepper(u){ const f = FLOW[u.kind] || []; let i = f.indexOf(u.status); if(u.status==='Backordered') i = 0;
  const off = ['Cancelled','Declined'].includes(u.status);
  return `<div class="stepper">${f.map((s,j)=>`<div class="st ${!off && j<i?'done':''} ${!off && j===i?'cur':''}"><i></i><span>${s==='Open'&&u.status==='Backordered'?'Backordered':s}</span></div>`).join('')}${off?`<div class="st cur off"><i></i><span>${u.status}</span></div>`:''}</div>`; }
function docLinesHTML(u){
  const k = u.kind, sale = ['Sales Quote','Sales Order'].includes(k), po = k==='Purchase Order';
  if(k==='Stock Take'){ const can = u.status==='Counting';
    return `<table class="t mini"><thead><tr><th>Shelf</th><th>Product</th><th class="r">System</th><th class="r" style="width:90px">Counted</th><th class="r">Variance</th></tr></thead><tbody>${u.lines.map((l,i)=>{ const p = prod(l.pid); const v = l.cnt==null ? null : l.cnt - (can ? qtyAt(p,l.loc) : l.sys); return `<tr><td class="mono">${l.loc}</td><td><div class="prod-name">${esc(p.name)}</div><div class="muted mono" style="font-size:11.5px">${p.sku}</div></td><td class="r num">${can?qtyAt(p,l.loc):l.sys}</td><td class="r">${can?`<input class="inp sm num r" type="number" min="0" data-stc="${u.id}" data-i="${i}" value="${l.cnt??''}" placeholder="${l.sys}"/>`:num(l.cnt)}</td><td class="r num ${v>0?'var-pos':v<0?'var-neg':''}" data-stv="${i}">${v==null?'—':(v>0?'+':'')+v}</td></tr>`; }).join('')}</tbody></table>${can?`<div style="margin-top:8px;display:flex;gap:6px"><button class="btn xs" data-cmd="st-fill" data-id="${u.id}">Counted = system for blanks</button></div>`:''}`; }
  if(k==='Recost'){ const al = u.status==='Posted' ? u.alloc : recostAlloc(u); const can = u.status==='Draft';
    return `<div class="dsec"><div class="dsec-h"><h4>Additional costs</h4>${can?`<button class="btn xs" data-cmd="rc-add" data-id="${u.id}">${ic('add')}Add cost</button>`:''}</div>
      <table class="t mini"><tbody>${u.costs.map((c,i)=>`<tr><td>${can?`<input class="inp sm" data-rc="${u.id}" data-i="${i}" data-f="name" value="${esc(c.name)}"/>`:esc(c.name)}</td><td class="r" style="width:120px">${can?`<input class="inp sm num r" type="number" step="0.01" data-rc="${u.id}" data-i="${i}" data-f="amt" value="${c.amt}"/>`:money(c.amt)}</td></tr>`).join('')}</tbody></table>
      <div style="margin-top:10px;display:flex;gap:8px;align-items:center"><span class="muted" style="font-size:12px">Allocate by</span><div class="seg">${[['value','Value'],['qty','Quantity'],['volume','Volume']].map(([m,t])=>`<button class="${u.method===m?'on':''}" ${can?'':'disabled'} data-cmd="rc-method" data-id="${u.id}" data-m="${m}">${t}</button>`).join('')}</div></div></div>
      <table class="t mini"><thead><tr><th>Product</th><th class="r">Qty</th><th class="r">Share</th><th class="r">+ per unit</th><th class="r">Purchase cost</th></tr></thead><tbody>${al.map(x=>{ const p = prod(x.pid); return `<tr><td>${esc(p.name)}<div class="muted mono" style="font-size:11.5px">${p.sku}</div></td><td class="r num">${x.qty}</td><td class="r num">${money(x.share)}</td><td class="r num">${money(x.perUnit)}</td><td class="r num">${u.status==='Posted'?`${money(x.before)} → <b>${money(x.after)}</b>`:`${money(p.cost)} → <b>${money(p.cost+x.perUnit)}</b>`}</td></tr>`; }).join('')}</tbody></table>`; }
  const rows = u.lines.map(l=>{ const p = prod(l.pid); const pk = (l.picks||[]);
    return `<tr><td><button class="link" data-cmd="open-product" data-id="${p.id}">${esc(p.name)}</button><div class="muted mono" style="font-size:11.5px">${p.sku}${isBundle(p)?' · bundle of '+p.bom.comps.map(c=>c.qty+'× '+prod(c.pid).sku).join(' + '):''}${pk.length?` · pick ${pk.map(k=>`${k.s}×${k.q}${k.done?' ✓':''}`).join(', ')}`:''}</div></td>
      <td class="r num">${l.qty}</td>${po?`<td class="r num">${l.rcv||0}</td>`:''}${k==='Sales Order'?`<td class="r num">${l.alloc||0}</td>`:''}<td class="r num">${money(sale?l.price:(l.cost??p.cost))}</td><td class="r num">${money(l.qty*(sale?l.price:(l.cost??p.cost)))}</td></tr>`; }).join('');
  const ch = (u.charges||[]).map(c=>`<tr class="sub"><td colspan="${2+(po?1:0)+(k==='Sales Order'?1:0)}">${esc(c.name)} <span class="muted">· ${c.basis==='%'?c.rate+'%':money(c.rate)+(c.basis==='flat'?'':' '+c.basis)}</span></td><td></td><td class="r num">${money(chargeAmt(u,c))}</td></tr>`).join('');
  return `<table class="t mini"><thead><tr><th>Product</th><th class="r">Qty</th>${po?'<th class="r">Received</th>':''}${k==='Sales Order'?'<th class="r">Allocated</th>':''}<th class="r">${sale?'Price':'Cost'}</th><th class="r">Line</th></tr></thead><tbody>${rows}${ch}</tbody>
    <tfoot><tr><td colspan="${3+(po?1:0)+(k==='Sales Order'?1:0)}"><b>Total</b></td><td class="r num"><b>${money(docTotal(u))}</b></td></tr></tfoot></table>`;
}
function docDrawer(id){
  const u = docById(id); if(!u) return; const k = u.kind;
  if(!isDoc(u)) return openUpdateLegacy(id);
  const acts = actsFor(u); const p = prod(u.pid);
  const meta = [];
  if(partyLabel(u)) meta.push([partyLabel(u), u.sup ? `<button class="link" data-cmd="open-supplier" data-id="${u.sup}">${esc(u.party)}</button>` : esc(u.party)]);
  if(u.channel) meta.push(['Distribution Channel', esc(u.channel)]);
  if(['Sales Order','Purchase Order','Stock Take'].includes(k)) meta.push([k==='Purchase Order'?'Deliver to':'Warehouse', esc(WAREHOUSES.find(w=>w.id===u.wh)?.name||u.wh)]);
  if(u.eta && k==='Purchase Order') meta.push(['Expected', fmtD(u.eta)]);
  if(u.expires) meta.push(['Valid until', fmtD(u.expires)]);
  if(u.due) meta.push(['Due', fmtD(u.due)]);
  if(k==='Transfer') meta.push(['Route', `<span class="mono">${u.from} → ${u.to}</span>`]);
  if(['Assembly','Disassembly'].includes(k)) meta.push([k==='Assembly'?'Output shelf':'From shelf', `<span class="mono">${u.loc}</span>`]);
  if(u.ref) meta.push(['Reference', docByNo(u.ref) ? `<button class="link mono" data-cmd="open-doc" data-id="${docByNo(u.ref).id}">${u.ref}</button>` : esc(u.ref)]);
  if(u.ship) meta.push(['Shipment', `<button class="link mono" data-cmd="open-shipment" data-id="${u.ship}">${u.ship}</button> · ${esc(u.carrier)}`]);
  if(u.box) meta.push(['Packed', `${u.cartons||1} × ${esc(u.box)} · ${u.weight} lb`]);
  if(u.reason) meta.push(['Reason', esc(u.reason)]);
  if(u.credit) meta.push(['Credit', money(u.credit)]);
  meta.push(['Quantity moved', `<span class="${u.qty<0?'var-neg':''}">${u.qty>0?'+':''}${u.qty}</span>`]);
  const bom = ['Assembly','Disassembly'].includes(k) && p.bom ? `<div class="dsec"><div class="dsec-h"><h4>${u.status==='Completed'&&u.used?'Components consumed':'Bill of Materials'}</h4></div>${u.status==='Completed'&&u.used ? `<table class="t mini"><tbody>${u.used.map(x=>`<tr><td>${esc(prod(x.pid).name)}${x.lots?` <span class="muted mono">${x.lots}</span>`:''}</td><td class="r num">−${x.qty}</td><td class="r num">${money(x.cost)}</td></tr>`).join('')}</tbody></table>` : bomNeedHTML(p, u.lines[0].qty, k==='Assembly'?1:-1)}</div>` : '';
  const trk = (u.serials || u.lots) ? `<div class="dsec"><div class="dsec-h"><h4>Serial & batch</h4></div>${u.serials?`<div class="serials">${u.serials.split(',').map(s=>`<span class="tag mono">${esc(s.trim())}</span>`).join('')}</div>`:''}${u.lots?`<div class="muted mono" style="margin-top:6px">${esc(u.lots)}</div>`:''}</div>` : '';
  const prim = acts.filter(a=>!a.ghost), sec = acts.filter(a=>a.ghost);
  const editable = ['Draft','Open','Planned','Counting','Backordered'].includes(u.status) && !['Stock Take','Recost'].includes(k);
  openDrawer(`<div class="dh"><div class="li-ic">${ic(TX_ICON[k])}</div><div><div class="dh-t">${k} · <span class="mono">${u.no}</span></div><div class="dh-s">${u.id} · Auto #${u.auto} · ${fmtD(u.date)} · ${esc(u.owner)}</div></div><div class="dh-x">${pill(u.status, STATUS_C[u.status]||'gray')}<button class="icon-btn" data-cmd="close-drawer" aria-label="Close">${ic('close')}</button></div></div>
    <div class="db">${stepper(u)}
      <div class="kv" style="margin:16px 0 20px">${meta.map(([a,b])=>`<div><div class="k">${a}</div><div class="v">${b}</div></div>`).join('')}${'<div></div>'.repeat((3-meta.length%3)%3)}</div>
      ${k==='Stock Take' ? '' : ''}<div class="dsec"><div class="dsec-h"><h4>${k==='Stock Take'?'Counts':k==='Recost'?'Landed cost':'Lines'}</h4></div>${['Assembly','Disassembly','Transfer'].includes(k) ? `<table class="t mini"><tbody><tr><td><button class="link" data-cmd="open-product" data-id="${p.id}">${esc(p.name)}</button><div class="muted mono" style="font-size:11.5px">${p.sku} · ${num(onHand(p))} on hand</div></td><td class="r num">${u.lines[0].qty}</td><td class="r num">${money(u.lines[0].cost ?? (k==='Assembly'?bomCost(p):p.cost))}</td></tr></tbody></table>` : docLinesHTML(u)}</div>
      ${bom}${trk}
      ${u.comments?`<div class="dsec"><div class="dsec-h"><h4>Comments</h4></div><p style="margin:0">${esc(u.comments)}</p></div>`:''}
      <div class="dsec"><div class="dsec-h"><h4>Activity</h4></div><div class="log">${u.log.map(x=>`<div><span class="muted">${fmtD(x.d)}</span> ${esc(x.t)}</div>`).join('')}</div></div>
    </div>
    <div class="df">${sec.map(a=>`<button class="btn ghost" data-cmd="doc-act" data-id="${u.id}" data-a="${a.a}">${ic(a.i)}${a.t}</button>`).join('')}${editable?`<button class="btn ghost" data-cmd="doc-edit" data-id="${u.id}">${ic('edit')}Edit</button>`:''}<span class="sp"></span>${!acts.length?`<button class="btn" data-cmd="report-one" data-id="${u.id}">${ic('summarize')}Create Action Reports</button>`:''}${prim.map((a,i)=>`<button class="btn ${i===prim.length-1?'primary':''}" data-cmd="doc-act" data-id="${u.id}" data-a="${a.a}">${ic(a.i)}${a.t}</button>`).join('')}</div>`);
  $('#drawer').dataset.doc = u.id;
}
const openUpdateLegacy = openUpdate;
openUpdate = id => { const u = docById(id); if(u && isDoc(u)) return docDrawer(id); openUpdateLegacy(id); };
TABLES.updates.open = r => openUpdate(r.u.id);

document.addEventListener('input', e=>{ const t = e.target;
  if(t.dataset && t.dataset.stc){ const u = docById(t.dataset.stc), i = +t.dataset.i, l = u.lines[i]; l.cnt = t.value==='' ? null : +t.value; const v = l.cnt==null ? null : l.cnt - qtyAt(prod(l.pid), l.loc); const c = $(`[data-stv="${i}"]`); if(c){ c.textContent = v==null?'—':(v>0?'+':'')+v; c.className = 'r num '+(v>0?'var-pos':v<0?'var-neg':''); } }
  if(t.dataset && t.dataset.rc){ const u = docById(t.dataset.rc); const c = u.costs[+t.dataset.i]; c[t.dataset.f] = t.dataset.f==='amt' ? (+t.value||0) : t.value; }
});
document.addEventListener('change', e=>{ const t = e.target; if(t.dataset && t.dataset.rc && t.dataset.f==='amt') docDrawer(t.dataset.rc); });

Object.assign(CMD, {
  'open-doc': el => { closeMenu(); closeModal(); docDrawer(el.dataset.id); },
  'doc-act': el => { closeMenu(); const u = docById(el.dataset.id); runAct(u, el.dataset.a); },
  'doc-edit': el => { const u = docById(el.dataset.id); docForm(u.kind, {}, u.id); },
  'do-receive': el => doReceive(docById(el.dataset.id)),
  'do-pack': el => doPack(docById(el.dataset.id)),
  'do-dispatch': el => doDispatch(docById(el.dataset.id)),
  'short-po': el => { const u = docById(el.dataset.id), l = u.lines[0], p = prod(l.pid); const made = draftCompPOs(p.bom.comps.filter(c=>onHand(prod(c.pid))<c.qty*l.qty).map(c=>({ p:prod(c.pid), q:c.qty*l.qty-onHand(prod(c.pid)) }))); closeModal(); toast(`Drafted ${made.join(', ')}`); render(); },
  'st-fill': el => { const u = docById(el.dataset.id); u.lines.forEach(l=>{ if(l.cnt==null) l.cnt = qtyAt(prod(l.pid), l.loc); }); docDrawer(u.id); },
  'rc-add': el => { const u = docById(el.dataset.id); u.costs.push({ name:'Duty & tariffs', amt:0 }); docDrawer(u.id); },
  'rc-method': el => { const u = docById(el.dataset.id); u.method = el.dataset.m; docDrawer(u.id); },
  'open-shipment': el => { closeDrawer(); typeof openShipment==='function' ? openShipment(el.dataset.id) : go('shipping'); }
});

/* Old single-product PO functions now create real Purchase Order documents */
createPO = p => { const pl = stitchPlan(p); const u = newDoc('Purchase Order', { status:'Draft', party:mfr(p.mfr).name, sup:p.mfr, wh:'CDC', lines:[{ pid:p.id, qty:Math.max(pl?.qty||0, suggestQty(p)), cost:p.cost, rcv:0 }], comments:'Drafted by Stitch' }); setUnitCost(u); syncPO(); toast(`${u.no} drafted · ${u.lines[0].qty} × ${p.sku}`, ()=>{ STOCK_UPDATES.splice(STOCK_UPDATES.indexOf(u),1); syncPO(); }); render(); return u; };
draftPOs = list => { const made = draftCompPOs(list.map(p=>({ p, q:Math.max(stitchPlan(p)?.qty||0, suggestQty(p)) }))); toast(`Drafted ${made.length} PO${made.length>1?'s':''}: ${made.join(', ')}`); render(); };
poModal = p => { if(p && p.po) docDrawer(p.po.doc); };
sendPO = p => { const u = p && p.po && docById(p.po.doc); if(u) runAct(u, 'send'); };
CMD['open-po'] = el => { const p = prod(el.dataset.id); if(p && p.po) docDrawer(p.po.doc); };
CMD['create-po'] = el => { closeMenu(); const p = prod(el.dataset.id); docForm('Purchase Order', { sup:p.mfr, party:mfr(p.mfr).name, lines:[{ pid:p.id, qty:Math.max(stitchPlan(p)?.qty||0, suggestQty(p)), cost:p.cost }] }); };
CMD['send-po'] = el => sendPO(prod(el.dataset.id));
CMD['receive-po'] = el => { closeModal(); const p = prod(el.dataset.id); if(p.po) receiveModal(docById(p.po.doc)); };

/* Create menu (header split button) and command palette */
const CREATE_ITEMS = [
  ['Sales','Sales Quote','request_quote','Sales quote'], ['Sales','Sales Order','shopping_bag','Sales order'],
  ['Purchasing','Purchase Order','shopping_cart','Purchase order'], ['Purchasing','Supplier Return','keyboard_return','Supplier return'],
  ['Production','Assembly','precision_manufacturing','Assembly / kit build'], ['Production','Disassembly','call_split','Disassembly'],
  ['Stock','Transfer','drive_file_move','Transfer'], ['Stock','Stock Take','inventory','Stock take']
];
createMenu = anchor => {
  let g0 = ''; const items = CREATE_ITEMS.map(([g,k,i,t])=>{ const h = g!==g0 ? `${g0?'<div class="msep"></div>':''}<div class="mh2">${g}</div>` : ''; g0 = g; return h + `<button class="mi" data-cmd="new-doc" data-k="${k}">${ic(i)}${t}</button>`; }).join('');
  openMenu(anchor, `${items}<div class="msep"></div><div class="mh2">Ledger</div><button class="mi" data-cmd="new-stock-update">${ic('swap_vert')}Stock update<span class="k">U</span></button><button class="mi" data-cmd="new-stock-update" data-a="Return">${ic('assignment_return')}Customer return</button><button class="mi" data-cmd="new-product">${ic('add_box')}Product</button><button class="mi" data-cmd="stitch-plan">${ic('auto_awesome')}Plan with Stitch</button>`);
};
CREATE_ITEMS.forEach(([g,k,i,t])=>PAL_ACT.push(['New '+t.toLowerCase(), i, 'new-doc:'+k]));
PAL_ACT.push(['Plan with Stitch', 'auto_awesome', 'stitch-plan']);
const _palAct = CMD['pal-act'];
CMD['pal-act'] = el => { const a = el.dataset.a || ''; if(a.startsWith('new-doc:')){ closePalette(); return docForm(a.slice(8)); } if(a==='stitch-plan'){ closePalette(); return CMD['stitch-plan'](); } return _palAct(el); };

/* ================= New columns on the existing four tables ================= */
const colIns = (key, beforeK, defs) => { const cs = TABLES[key].cols; const i = beforeK ? cs.findIndex(c=>c.k===beforeK) : -1; i<0 ? cs.push(...defs) : cs.splice(i, 0, ...defs); };
const faint = '<span class="faint">—</span>';
const sub = t => `<div class="muted" style="font-size:11.5px">${t}</div>`;
const FLAG_C = { Understock:'amber', Overstock:'blue', Healthy:'green' };

/* --- Product Catalog --- */
const qtyCol = TABLES.products.cols.find(c=>c.k==='qty');
const _qtyR = qtyCol.r; qtyCol.r = r => isBundle(r.p) ? `<span class="num">${num(bundleAvail(r.p))}</span>${sub('buildable from components')}` : _qtyR(r);
qtyCol.get = r => isBundle(r.p) ? bundleAvail(r.p) : onHand(r.p);
colIns('products', null, [
  {k:'supplier', t:'Supplier', type:'text', get:r=>mfr(r.p.mfr).name, r:r=>{ const m = mfr(r.p.mfr); return `<button class="link" data-cmd="open-supplier" data-id="${m.id}" style="white-space:nowrap">${esc(m.name)}</button>${sub(`${m.lead}-day lead · ${m.terms}`)}`; }},
  {k:'pcost', t:'Purchase Cost', type:'money', get:r=>r.p.cost, r:r=>`<button class="cc-cell" data-cmd="open-cost" data-id="${r.p.id}" title="Purchase cost and history">${money(r.p.cost)}</button>${r.p.bom&&r.p.bom.type!=='Bundle'?sub('BOM '+money(bomCost(r.p))):r.p.price?sub(Math.round((1-r.p.cost/r.p.price)*100)+'% margin'):''}`},
  {k:'cprice', t:'Customer Pricing', type:'text', get:r=>{ const pr = pricing(r.p); return TIERS.map(t=>t+' '+pr.tiers[t]).join(' / '); }, r:r=>{ if(r.p.status==='Internal') return faint; const pr = pricing(r.p); const ex = pr.breaks.length + pr.customers.length; return `<button class="cc-cell" data-cmd="open-pricing" data-id="${r.p.id}" title="Edit customer pricing"><span class="num">${money(pr.tiers.Wholesale)}</span> <span class="muted">wholesale</span></button>${sub(`${money(pr.tiers.Distributor)} distributor${ex?` · ${ex} rule${ex>1?'s':''}`:''}`)}`; }},
  {k:'bom', t:'Bill of Materials', type:'text', get:r=>r.p.bom ? r.p.bom.type+' · '+r.p.bom.comps.length : '', r:r=> r.p.bom ? `<button class="cc-cell" data-cmd="open-bom" data-id="${r.p.id}">${pill(r.p.bom.type, r.p.bom.type==='Bundle'?'blue':'ai', false)} <span class="muted">${r.p.bom.comps.length} part${r.p.bom.comps.length>1?'s':''}</span></button>${sub(r.p.bom.comps.map(c=>c.qty+'× '+prod(c.pid).sku).slice(0,2).join(', '))}` : (r.p.ftype==='In-House' || r.p.status==='Internal' ? `<button class="btn xs ghost" data-cmd="open-bom" data-id="${r.p.id}">${ic('add')}Add</button>` : faint)},
  {k:'track', t:'Tracking', type:'text', get:r=>r.p.track, r:r=>{ const t = r.p.track; if(!isStocked(r.p)) return faint; return `<button class="cc-cell" data-cmd="open-track" data-id="${r.p.id}">${t==='None'?'<span class="muted">None</span>':pill(t, 'gray', false)}</button>${t==='Serial'?sub(serialsIn(r.p).length+' serials in stock'):t==='Batch'?sub(lotsOf(r.p).map(b=>b.lot).slice(0,2).join(', ')||'no lots'):''}`; }}
]);

/* --- Inventory Management --- */
colIns('inventory', 'mfr', [
  {k:'alloc', t:'Allocated', type:'num', agg:'sum', get:r=>isStocked(r.p)?committedQty(r.p)+compDemand(r.p):null, r:r=>{ if(!isStocked(r.p)) return faint; const a = committedQty(r.p), c = compDemand(r.p); return a+c ? `<button class="cc-cell num" data-cmd="open-alloc" data-id="${r.p.id}">${num(a+c)}</button>${sub([a?a+' orders':'', c?c+' production':''].filter(Boolean).join(' · '))}` : '<span class="muted">0</span>'; }},
  {k:'onorder', t:'On Order', type:'num', agg:'sum', get:r=>isStocked(r.p)?onOrderQty(r.p)+inProdQty(r.p):null, r:r=>{ if(!isStocked(r.p)) return faint; const o = onOrderQty(r.p), m = inProdQty(r.p); return o+m ? `<span class="num">${num(o+m)}</span>${sub([o?o+' purchasing':'', m?m+' in production':''].filter(Boolean).join(' · '))}` : '<span class="muted">0</span>'; }},
  {k:'avail', t:'Available', type:'num', get:r=>isStocked(r.p)?availableQty(r.p):null, r:r=>{ if(!isStocked(r.p)) return faint; const a = availableQty(r.p); return `<span class="num strong ${a<0?'var-neg':''}">${num(a)}</span>${backorderQty(r.p)?sub(`<span class="var-neg">${backorderQty(r.p)} backordered</span>`):''}`; }},
  {k:'fc30', t:'Forecast (30 days)', type:'num', get:r=>isStocked(r.p)?forecast30(r.p):null, r:r=> isStocked(r.p) ? `<span class="num">${num(forecast30(r.p))}</span>${sub(r.p.vel+'/day'+(r.p.labels.includes('Seasonal')?' · seasonal':''))}` : faint},
  {k:'stitch', t:'Stitch', type:'text', get:r=>stitchPlan(r.p)?.flag||'', r:r=>{ const s = stitchPlan(r.p); if(!s) return faint; return `<button class="cc-cell" data-cmd="open-plan" data-id="${r.p.id}" title="${esc(s.why)}">${pill(s.flag, FLAG_C[s.flag])}</button>${s.flag==='Understock'?sub(`${ic('auto_awesome')} ${s.make?'Make':'Buy'} ${num(s.qty)}`):s.flag==='Overstock'?sub(`${s.cover} days cover`):''}`; }}
]);
TABLES.inventory.bulk.push(['b-plan','auto_awesome','Plan with Stitch'],['b-so','shopping_bag','Sales order'],['b-take','inventory','Stock take']);
TABLES.inventory.primary = `<button class="btn ai-solid" data-cmd="stitch-plan">${ic('auto_awesome')}Plan with Stitch</button><button class="btn primary" data-cmd="new-stock-update">${ic('add')}Update Stock</button>`;
TABLES.inventory.bulkRun = { 'b-plan':ps=>stitchPlanModal(ps), 'b-so':ps=>docForm('Sales Order', { lines:ps.filter(p=>p.status!=='Internal').map(p=>({ pid:p.id, qty:1 })) }), 'b-take':ps=>{ const sh = [...new Set(ps.flatMap(p=>p.locs.map(l=>aisleOf(l.s))))]; docForm('Stock Take', { wh:'CDC', aisles:sh.filter(a=>WAREHOUSES[0].aisles.includes(a)) }); } };
TABLES.products.bulk.push(['b-quote','request_quote','Sales quote'],['b-po2','shopping_cart','Purchase order']);
TABLES.products.bulkRun = { 'b-quote':ps=>docForm('Sales Quote', { lines:ps.filter(p=>p.status!=='Internal').map(p=>({ pid:p.id, qty:1 })) }), 'b-po2':ps=>{ const st = ps.filter(isStocked); if(!st.length) return toast('Pick stocked products'); docForm('Purchase Order', { sup:st[0].mfr, party:mfr(st[0].mfr).name, lines:st.map(p=>({ pid:p.id, qty:Math.max(p.rq||1, stitchPlan(p)?.qty||0), cost:p.cost })) }); } };

/* --- Stock Updates --- */
const actCol = TABLES.updates.cols.find(c=>c.k==='activity');
actCol.get = r => isDoc(r.u) ? `${r.u.kind} ${r.u.no}` : r.u.type;
actCol.r = r => { const u = r.u; if(!isDoc(u)) return `<span class="act">${ic(TX_ICON[u.type])}${u.type}</span><div class="muted mono" style="font-size:11.5px">${esc(r.p.sku)} · ${u.loc}</div>`;
  return `<span class="act">${ic(TX_ICON[u.kind])}${u.kind}</span><div class="muted" style="font-size:11.5px"><span class="mono">${u.no}</span>${u.party?' · '+esc(u.party):''}${u.lines.length>1?` · ${u.lines.length} lines`:u.lines[0]?' · <span class="mono">'+esc(prod(u.lines[0].pid).sku)+'</span>':''}</div>`; };
const qCol = TABLES.updates.cols.find(c=>c.k==='qty'); const _qR = qCol.r; qCol.r = r => isDoc(r.u) && !r.u.qty && r.u.lines.length ? `<span class="muted">${r.u.lines.reduce((a,l)=>a+l.qty,0)} ordered</span>` : _qR(r);
const newCol = TABLES.updates.cols.find(c=>c.k==='new'); newCol.get = r => ['Receive','Produce'].includes(r.u.type) || (['Purchase Order','Assembly'].includes(r.u.kind) && r.u.qty>0) ? r.u.qty : null; newCol.r = r => newCol.get(r)!=null ? '+'+newCol.get(r) : faint;
colIns('updates', 'auto', [
  {k:'status', t:'Status', type:'text', get:r=>r.u.status, r:r=> isDoc(r.u) ? `<button class="cc-cell" data-cmd="status-menu" data-id="${r.u.id}">${pill(r.u.status, STATUS_C[r.u.status]||'gray')}${actsFor(r.u).length?ic('expand_more','caret'):''}</button>` : `<span class="muted">Logged</span>`},
  {k:'party', t:'Customer / Supplier', type:'text', get:r=>r.u.party||'', r:r=> r.u.party ? (r.u.sup ? `<button class="link" data-cmd="open-supplier" data-id="${r.u.sup}" style="white-space:nowrap">${esc(r.u.party)}</button>` : `<span style="white-space:nowrap">${esc(r.u.party)}</span>`) + (r.u.channel?sub(esc(r.u.channel)):'') : faint},
  {k:'total', t:'Value', type:'money', agg:'sum', get:r=>isDoc(r.u) && r.u.lines.length ? +docTotal(r.u).toFixed(2) : +(r.u.qty*r.u.unitCost).toFixed(2), r:r=>{ const v = isDoc(r.u)&&r.u.lines.length ? docTotal(r.u) : r.u.qty*r.u.unitCost; return money(v); }}
]);
colIns('updates', 'comments', [
  {k:'lots', t:'Batch / Lot', type:'text', get:r=>r.u.lots||'', r:r=> r.u.lots ? `<span class="mono muted" style="font-size:12px">${esc(r.u.lots)}</span>` : faint}
]);
TABLES.updates.primary = `<button class="btn" data-cmd="create-menu">${ic('add')}Create</button><button class="btn primary" data-cmd="new-stock-update">${ic('add')}New Stock Update</button>`;
TABLES.updates.bulk.unshift(['b-advance','fast_forward','Advance status']);
TABLES.updates.bulkRun = { 'b-advance':(ps, rows)=>{ let n = 0; rows.forEach(r=>{ const a = actsFor(r.u).find(x=>!x.ghost && !['receive','pack','dispatch','recost','rtv','convert'].includes(x.a)); if(a){ runAct(r.u, a.a); n++; } }); toast(`${n} document${n===1?'':'s'} advanced`); } };

/* --- Warehouse Management: pick, pack, dispatch --- */
const pickTasks = shelf => docs('Sales Order', ['Allocated','Picking']).flatMap(u=>u.lines.flatMap((l,li)=>(l.picks||[]).map((k,ki)=>({ u, l, li, k, ki })))).filter(x=>!x.k.done && (!shelf || x.k.s===shelf));
const packQ = wh => docs('Sales Order', ['Picked']).filter(u=>!wh || u.wh===wh);
const dispQ = wh => docs('Sales Order', ['Packed']).filter(u=>!wh || u.wh===wh);
colIns('warehouse', 'ship', [
  {k:'pick', t:'Pick', type:'num', agg:'sum', get:r=>pickTasks(r.s.id).length, r:r=>{ const t = pickTasks(r.s.id); return t.length ? `<button class="btn xs" data-cmd="pick-q" data-id="${r.s.id}">${ic('pan_tool_alt')}${t.length} to pick</button>${sub(t.reduce((a,x)=>a+x.k.q,0)+' units')}` : '<span class="muted">0</span>'; }},
  {k:'pack', t:'Pack', type:'num', get:r=>packQ(r.s.w.id).length, r:r=>{ const n = packQ(r.s.w.id).length; return n ? `<button class="btn xs" data-cmd="pack-q" data-id="${r.s.w.id}">${ic('package_2')}${n} to pack</button>` : '<span class="muted">0</span>'; }},
  {k:'dispatch', t:'Dispatch', type:'num', get:r=>dispQ(r.s.w.id).length, r:r=>{ const n = dispQ(r.s.w.id).length; return n ? `<button class="btn xs" data-cmd="disp-q" data-id="${r.s.w.id}">${ic('local_shipping')}${n} to dispatch</button>` : '<span class="muted">0</span>'; }}
]);
TABLES.warehouse.bulk.push(['b-pick','pan_tool_alt','Pick list'],['b-take','inventory','Stock take']);
TABLES.warehouse.bulkRun = { 'b-pick':(ps, rows)=>pickQueue(rows.map(r=>r.s.id)), 'b-take':(ps, rows)=>{ const s0 = rows[0].s; docForm('Stock Take', { wh:s0.w.id, aisles:[...new Set(rows.filter(r=>r.s.w.id===s0.w.id).map(r=>r.s.a))] }); } };
function pickQueue(shelves){
  const list = shelves ? shelves.flatMap(s=>pickTasks(s)) : pickTasks();
  openModal(`<div class="mh">${ic('pan_tool_alt')}<div class="t">Pick list${shelves&&shelves.length===1?' · '+shelves[0]:''}</div><button class="icon-btn" data-cmd="close-modal" aria-label="Close">${ic('close')}</button></div>
    <div class="mb">${list.length ? `<table class="t mini"><thead><tr><th>Shelf</th><th>Product</th><th>Order</th><th class="r">Qty</th><th></th></tr></thead><tbody>${list.sort((a,b)=>a.k.s<b.k.s?-1:1).map(x=>{ const p = prod(x.k.pid); return `<tr><td class="mono strong">${x.k.s}</td><td>${esc(p.name)}<div class="muted mono" style="font-size:11.5px">${p.sku}</div></td><td><button class="link mono" data-cmd="open-doc" data-id="${x.u.id}">${x.u.no}</button>${sub(esc(x.u.party))}</td><td class="r num">${x.k.q}</td><td class="r"><button class="btn xs" data-cmd="pick-one" data-id="${x.u.id}" data-li="${x.li}" data-ki="${x.ki}" data-sh="${shelves?shelves.join(','):''}">${ic('check')}Picked</button></td></tr>`; }).join('')}</tbody></table>` : `<div class="empty" style="padding:24px">${ic('task_alt')}Nothing to pick here.</div>`}</div>
    <div class="mf"><button class="btn" data-cmd="close-modal">Close</button>${list.length?`<button class="btn primary" data-cmd="pick-all" data-sh="${shelves?shelves.join(','):''}">${ic('done_all')}Confirm all ${list.length}</button>`:''}</div>`, true);
}
function confirmPick(u, li, ki){ const k = u.lines[li].picks[ki]; k.done = true; if(u.status==='Allocated'){ u.status='Picking'; logDoc(u, 'Picking started'); }
  logDoc(u, `Picked ${k.q} × ${prod(k.pid).sku} from ${k.s}`);
  if(u.lines.every(l=>(l.picks||[]).every(z=>z.done))){ u.status = 'Picked'; logDoc(u, 'All lines picked — ready to pack'); } }
function docQueue(title, icon, list, act){
  openModal(`<div class="mh">${ic(icon)}<div class="t">${title}</div><button class="icon-btn" data-cmd="close-modal" aria-label="Close">${ic('close')}</button></div>
    <div class="mb">${list.length ? `<div class="list">${list.map(u=>`<div class="li"><div class="li-main"><div class="li-t"><button class="link mono" data-cmd="open-doc" data-id="${u.id}">${u.no}</button> · ${esc(u.party)}</div><div class="li-s">${u.lines.map(l=>l.qty+'× '+prod(l.pid).sku).join(', ')}${u.box?` · ${u.cartons||1}× ${u.box} · ${u.weight} lb`:''}</div></div><div class="li-r"><button class="btn sm primary" data-cmd="doc-act" data-id="${u.id}" data-a="${act}">${ic(icon)}${act==='pack'?'Pack':'Dispatch'}</button></div></div>`).join('')}</div>` : `<div class="empty" style="padding:24px">${ic('task_alt')}Queue is clear.</div>`}</div>
    <div class="mf"><button class="btn" data-cmd="close-modal">Close</button></div>`, true);
}
Object.assign(CMD, {
  'pick-q': el => pickQueue([el.dataset.id]),
  'pick-one': el => { const u = docById(el.dataset.id); confirmPick(u, +el.dataset.li, +el.dataset.ki); toast(`${u.no} · pick confirmed${u.status==='Picked'?' · ready to pack':''}`); render(); pickQueue(el.dataset.sh ? el.dataset.sh.split(',') : null); },
  'pick-all': el => { const sh = el.dataset.sh ? el.dataset.sh.split(',') : null; const list = sh ? sh.flatMap(s=>pickTasks(s)) : pickTasks(); list.forEach(x=>confirmPick(x.u, x.li, x.ki)); toast(`${list.length} picks confirmed`); closeModal(); render(); },
  'pack-q': el => docQueue(`Pack · ${WAREHOUSES.find(w=>w.id===el.dataset.id).name}`, 'package_2', packQ(el.dataset.id), 'pack'),
  'disp-q': el => docQueue(`Dispatch · ${WAREHOUSES.find(w=>w.id===el.dataset.id).name}`, 'local_shipping', dispQ(el.dataset.id), 'dispatch'),
  'status-menu': el => { const u = docById(el.dataset.id); const a = actsFor(u); if(!a.length) return docDrawer(u.id);
    openMenu(el, `<div class="mh2">${u.no} · ${u.status}</div>${a.map(x=>`<button class="mi" data-cmd="doc-act" data-id="${u.id}" data-a="${x.a}">${ic(x.i)}${x.t}${x.to?`<span class="k">→ ${x.to}</span>`:''}</button>`).join('')}<div class="msep"></div><button class="mi" data-cmd="open-doc" data-id="${u.id}">${ic('open_in_new')}Open</button>`); },
  'open-alloc': el => { const p = prod(el.dataset.id); const so = docs('Sales Order', ALLOC_STS).filter(u=>u.lines.flatMap(stockLines).some(x=>x.pid===p.id)); const asm = docs('Assembly',['Planned','In progress']).filter(u=>prod(u.lines[0].pid).bom?.comps.some(c=>c.pid===p.id));
    openModal(`<div class="mh">${ic('inventory_2')}<div class="t">Allocated · ${esc(p.sku)}</div><button class="icon-btn" data-cmd="close-modal" aria-label="Close">${ic('close')}</button></div><div class="mb"><div class="list">${[...so, ...asm].map(u=>`<button class="li" style="width:100%;text-align:left" data-cmd="open-doc" data-id="${u.id}"><div class="li-ic">${ic(TX_ICON[u.kind])}</div><div class="li-main"><div class="li-t">${u.no} · ${esc(u.party||prod(u.lines[0].pid).name)}</div><div class="li-s">${u.kind} · ${u.status}</div></div></button>`).join('')}</div></div>`); }
});

/* --- Side panels opened from the columns --- */
function openSupplier(id){
  const m = mfr(id); const ps = PRODUCTS.filter(p=>p.mfr===id); const pos = docs('Purchase Order').filter(u=>u.sup===id);
  const spend = pos.filter(u=>!['Draft','Cancelled'].includes(u.status)).reduce((a,u)=>a+docTotal(u),0);
  openDrawer(`<div class="dh"><div class="li-ic">${ic('factory')}</div><div><div class="dh-t">${esc(m.name)}</div><div class="dh-s">${m.type||'Supplier'} · ${esc(m.contact||'')}</div></div><div class="dh-x"><button class="icon-btn" data-cmd="close-drawer" aria-label="Close">${ic('close')}</button></div></div>
    <div class="db"><div class="kv" style="margin-bottom:20px"><div><div class="k">Lead time</div><div class="v">${m.lead} days</div></div><div><div class="k">Terms</div><div class="v">${esc(m.terms)}</div></div><div><div class="k">On time</div><div class="v">${m.ontime}%</div></div><div><div class="k">Email</div><div class="v" style="font-size:12.5px">${esc(m.email)}</div></div><div><div class="k">Phone</div><div class="v">${esc(m.phone||'—')}</div></div><div><div class="k">Spend (open + received)</div><div class="v">${money(spend,0)}</div></div></div>
    <div class="dsec"><div class="dsec-h"><h4>Products (${ps.length})</h4></div><table class="t mini"><thead><tr><th>Product</th><th class="r">On hand</th><th class="r">Purchase cost</th><th>Stitch</th></tr></thead><tbody>${ps.map(p=>{ const s = stitchPlan(p); return `<tr><td><button class="link" data-cmd="open-product" data-id="${p.id}">${esc(p.name)}</button>${sub(`<span class="mono">${p.sku}</span>`)}</td><td class="r num">${isStocked(p)?num(onHand(p)):'—'}</td><td class="r num">${money(p.cost)}</td><td>${s?pill(s.flag, FLAG_C[s.flag], false):faint}</td></tr>`; }).join('')}</tbody></table></div>
    <div class="dsec"><div class="dsec-h"><h4>Purchase orders</h4></div>${pos.length?`<div class="list">${pos.map(u=>`<button class="li" style="width:100%;text-align:left" data-cmd="open-doc" data-id="${u.id}"><div class="li-main"><div class="li-t mono">${u.no}</div><div class="li-s">${fmtD(u.date)} · ${u.lines.length} line${u.lines.length>1?'s':''} · ${money(docTotal(u))}</div></div><div class="li-r">${pill(u.status, STATUS_C[u.status], false)}</div></button>`).join('')}</div>`:'<span class="faint">None yet</span>'}</div></div>
    <div class="df"><button class="btn" data-cmd="new-doc" data-k="Supplier Return" data-sup="${id}">${ic('keyboard_return')}Return to supplier</button><span class="sp"></span><button class="btn primary" data-cmd="new-doc" data-k="Purchase Order" data-sup="${id}">${ic('shopping_cart')}Create PO</button></div>`);
}
function costPanel(id){
  const p = prod(id); const hist = STOCK_UPDATES.filter(u=>(u.kind==='Purchase Order' && u.lines.some(l=>l.pid===id) && u.status!=='Draft') || (u.kind==='Recost' && u.status==='Posted' && u.lines.some(l=>l.pid===id)) || (!u.kind && u.type==='Receive' && u.pid===id)).slice(0,10);
  openDrawer(`<div class="dh"><div class="li-ic">${ic('payments')}</div><div><div class="dh-t">Purchase Cost · ${esc(p.sku)}</div><div class="dh-s">${esc(p.name)} · weighted average, landed</div></div><div class="dh-x"><button class="icon-btn" data-cmd="close-drawer" aria-label="Close">${ic('close')}</button></div></div>
    <div class="db"><div class="fields" style="margin-bottom:18px"><div class="fld"><label>Purchase cost</label><input class="inp num" id="pcIn" type="number" step="0.01" value="${p.cost}"/></div><div class="fld"><label>Supplier</label><input class="inp" readonly value="${esc(mfr(p.mfr).name)}"/></div>
      ${p.bom&&p.bom.type!=='Bundle'?`<div class="fld full"><div class="stitch-hint">${ic('auto_awesome')}Bill of Materials rolls up to ${money(bomCost(p))}. <button class="btn xs" data-cmd="cost-from-bom" data-id="${id}">Use BOM cost</button></div></div>`:''}</div>
    <div class="dsec"><div class="dsec-h"><h4>History</h4></div>${hist.length?`<table class="t mini"><thead><tr><th>Document</th><th>Date</th><th class="r">Qty</th><th class="r">Cost</th></tr></thead><tbody>${hist.map(u=>{ const l = (u.lines||[]).find(x=>x.pid===id); const a = u.alloc && u.alloc.find(x=>x.pid===id); return `<tr><td><button class="link mono" data-cmd="open-update" data-id="${u.id}">${u.no||u.id}</button>${sub(u.kind||u.type)}</td><td>${fmtD(u.date)}</td><td class="r num">${l?l.rcv??l.qty:u.qty}</td><td class="r num">${a?`${money(a.before)} → ${money(a.after)}`:money(l?l.cost:u.unitCost)}</td></tr>`; }).join('')}</tbody></table>`:'<span class="faint">No purchases yet</span>'}</div></div>
    <div class="df"><button class="btn" data-cmd="new-doc" data-k="Purchase Order" data-id="${id}">${ic('shopping_cart')}Create PO</button><span class="sp"></span><button class="btn primary" data-cmd="cost-save" data-id="${id}">Save cost</button></div>`);
}
function pricingPanel(id){
  const p = prod(id), pr = pricing(p);
  openDrawer(`<div class="dh"><div class="li-ic">${ic('sell')}</div><div><div class="dh-t">Customer Pricing · ${esc(p.sku)}</div><div class="dh-s">Quotes and orders price from here: customer price, then quantity break, then tier.</div></div><div class="dh-x"><button class="icon-btn" data-cmd="close-drawer" aria-label="Close">${ic('close')}</button></div></div>
    <div class="db"><div class="dsec"><div class="dsec-h"><h4>Price tiers</h4><span class="muted" style="font-size:12px">Cost ${money(p.cost)}</span></div><div class="fields">${TIERS.map(t=>`<div class="fld"><label>${t} <span class="opt">· ${pr.tiers[t]?Math.round((1-p.cost/pr.tiers[t])*100):0}% margin</span></label><input class="inp num" type="number" step="0.01" data-pt="${t}" value="${pr.tiers[t]}"/></div>`).join('')}</div></div>
    <div class="dsec"><div class="dsec-h"><h4>Quantity breaks</h4><button class="btn xs" data-cmd="pr-add-break" data-id="${id}">${ic('add')}Add break</button></div>${pr.breaks.length?`<table class="t mini"><tbody>${pr.breaks.map((b,i)=>`<tr><td><select class="inp sm" data-pb="${i}" data-f="tier">${optList(TIERS.map(t=>[t,t]), b.tier)}</select></td><td><input class="inp sm num" type="number" data-pb="${i}" data-f="min" value="${b.min}" aria-label="Minimum quantity"/></td><td><input class="inp sm num" type="number" step="0.01" data-pb="${i}" data-f="price" value="${b.price}" aria-label="Price"/></td><td><button class="icon-btn sm" data-cmd="pr-rm-break" data-id="${id}" data-i="${i}" aria-label="Remove">${ic('close')}</button></td></tr>`).join('')}</tbody></table>`:'<span class="faint">None</span>'}</div>
    <div class="dsec"><div class="dsec-h"><h4>Customer prices</h4><button class="btn xs" data-cmd="pr-add-cust" data-id="${id}">${ic('add')}Add customer</button></div>${pr.customers.length?`<table class="t mini"><tbody>${pr.customers.map((c,i)=>`<tr><td><select class="inp sm" data-pc="${i}" data-f="name">${optList(CUSTOMERS.map(x=>[x.name,x.name]), c.name)}</select></td><td><input class="inp sm num" type="number" step="0.01" data-pc="${i}" data-f="price" value="${c.price}" aria-label="Price"/></td><td><button class="icon-btn sm" data-cmd="pr-rm-cust" data-id="${id}" data-i="${i}" aria-label="Remove">${ic('close')}</button></td></tr>`).join('')}</tbody></table>`:'<span class="faint">None</span>'}</div></div>
    <div class="df"><button class="btn" data-cmd="new-doc" data-k="Sales Quote" data-id="${id}">${ic('request_quote')}Quote this</button><span class="sp"></span><button class="btn primary" data-cmd="pr-save" data-id="${id}">Save pricing</button></div>`);
}
function readPricing(p){ const pr = pricing(p); $$('[data-pt]').forEach(i=>pr.tiers[i.dataset.pt] = +i.value||0); $$('[data-pb]').forEach(i=>{ const b = pr.breaks[+i.dataset.pb]; b[i.dataset.f] = i.dataset.f==='tier' ? i.value : +i.value||0; }); $$('[data-pc]').forEach(i=>{ const c = pr.customers[+i.dataset.pc]; c[i.dataset.f] = i.dataset.f==='name' ? i.value : +i.value||0; }); if(pr.tiers.Retail) p.price = pr.tiers.Retail; }
let BOMD = null;
function bomPanel(id){
  const p = prod(id); if(!BOMD || BOMD.id!==id) BOMD = { id, type:p.bom?.type||'Assembly', labor:p.bom?.labor||0, comps:(p.bom?.comps||[]).map(c=>({...c})) };
  const pool = PRODUCTS.filter(x=>x.id!==id && isStocked(x));
  const cost = BOMD.comps.reduce((a,c)=>a+c.qty*(prod(c.pid)?.cost||0),0) + (+BOMD.labor||0);
  const build = BOMD.comps.length ? Math.min(...BOMD.comps.map(c=>Math.floor(Math.max(0,availableQty(prod(c.pid)))/(c.qty||1)))) : 0;
  openDrawer(`<div class="dh"><div class="li-ic">${ic('account_tree')}</div><div><div class="dh-t">Bill of Materials · ${esc(p.sku)}</div><div class="dh-s">Assembly builds stock, Kit is packed from stock, Bundle sells components together without its own stock.</div></div><div class="dh-x"><button class="icon-btn" data-cmd="close-drawer" aria-label="Close">${ic('close')}</button></div></div>
    <div class="db"><div class="fields" style="margin-bottom:18px"><div class="fld"><label>Type</label><div class="seg">${['Assembly','Kit','Bundle'].map(t=>`<button class="${BOMD.type===t?'on':''}" data-cmd="bom-type" data-t="${t}">${t}</button>`).join('')}</div></div><div class="fld"><label>Labor & overhead per unit</label><input class="inp num" type="number" step="0.01" data-bl="1" value="${BOMD.labor}"/></div></div>
    <div class="dsec"><div class="dsec-h"><h4>Components</h4><button class="btn xs" data-cmd="bom-add">${ic('add')}Add component</button></div>
    ${BOMD.comps.length?`<table class="t mini"><thead><tr><th>Component</th><th class="r" style="width:80px">Qty</th><th class="r">Cost</th><th class="r">Available</th><th></th></tr></thead><tbody>${BOMD.comps.map((c,i)=>{ const cp = prod(c.pid); return `<tr><td><select class="inp sm" data-bc="${i}" data-f="pid">${optList(pool.map(x=>[x.id, x.sku+' — '+x.name]), c.pid)}</select></td><td class="r"><input class="inp sm num r" type="number" min="1" step="any" data-bc="${i}" data-f="qty" value="${c.qty}"/></td><td class="r num">${money(c.qty*cp.cost)}</td><td class="r num">${num(availableQty(cp))}</td><td><button class="icon-btn sm" data-cmd="bom-rm" data-i="${i}" aria-label="Remove">${ic('close')}</button></td></tr>`; }).join('')}</tbody></table>`:'<span class="faint">No components yet</span>'}
    <div class="kv" style="margin-top:14px"><div><div class="k">Rolled-up cost</div><div class="v">${money(cost)}</div></div><div><div class="k">Buildable now</div><div class="v">${num(build)}</div></div><div><div class="k">In production</div><div class="v">${num(inProdQty(p))}</div></div></div></div>
    ${p.bom?`<div class="dsec"><div class="dsec-h"><h4>Production history</h4></div>${docs('Assembly').concat(docs('Disassembly')).filter(u=>u.lines[0]?.pid===id).map(u=>`<button class="li" style="width:100%;text-align:left" data-cmd="open-doc" data-id="${u.id}"><div class="li-main"><div class="li-t mono">${u.no}</div><div class="li-s">${u.kind} · ${u.lines[0].qty} units · ${fmtD(u.date)}</div></div><div class="li-r">${pill(u.status, STATUS_C[u.status], false)}</div></button>`).join('') || '<span class="faint">None</span>'}</div>`:''}</div>
    <div class="df">${p.bom && p.bom.type!=='Bundle'?`<button class="btn" data-cmd="new-doc" data-k="Disassembly" data-id="${id}">${ic('call_split')}Disassemble</button><button class="btn" data-cmd="new-doc" data-k="Assembly" data-id="${id}">${ic('precision_manufacturing')}Assemble</button>`:''}${p.bom?`<button class="btn ghost" data-cmd="bom-del" data-id="${id}">Remove BOM</button>`:''}<span class="sp"></span><button class="btn primary" data-cmd="bom-save" data-id="${id}">Save BOM</button></div>`);
}
function trackPanel(id){
  const p = prod(id); const ss = SERIALS.filter(s=>s.pid===id), ls = BATCHES.filter(b=>b.pid===id);
  openDrawer(`<div class="dh"><div class="li-ic">${ic('qr_code_2')}</div><div><div class="dh-t">Tracking · ${esc(p.sku)}</div><div class="dh-s">Serial numbers are recorded on receive, build and dispatch. Lots are consumed first-expiry-first-out.</div></div><div class="dh-x"><button class="icon-btn" data-cmd="close-drawer" aria-label="Close">${ic('close')}</button></div></div>
    <div class="db"><div class="fld" style="margin-bottom:18px"><label>Track by</label><div class="seg">${['None','Serial','Batch'].map(t=>`<button class="${p.track===t?'on':''}" data-cmd="track-set" data-id="${id}" data-t="${t}">${t==='Batch'?'Batch / lot':t}</button>`).join('')}</div></div>
    ${p.track==='Serial'?`<div class="dsec"><div class="dsec-h"><h4>Serial numbers (${ss.length})</h4></div><table class="t mini"><thead><tr><th>Serial</th><th>Status</th><th>Shelf</th><th>Document</th></tr></thead><tbody>${ss.map(s=>`<tr><td class="mono">${s.no}</td><td>${pill(s.status, s.status==='In stock'?'green':'gray', false)}</td><td class="mono">${s.loc}</td><td class="mono muted">${esc(s.doc)}</td></tr>`).join('')}</tbody></table></div>`:''}
    ${p.track==='Batch'?`<div class="dsec"><div class="dsec-h"><h4>Lots</h4></div><table class="t mini"><thead><tr><th>Lot</th><th class="r">Qty</th><th>Expiry</th><th>Shelf</th></tr></thead><tbody>${ls.map(b=>`<tr><td class="mono">${b.lot}</td><td class="r num">${b.qty}</td><td class="${daysUntil(b.exp)<90?'var-neg':''}">${fmtD(b.exp)}</td><td class="mono">${b.loc}</td></tr>`).join('') || '<tr><td colspan="4" class="faint">No lots</td></tr>'}</tbody></table></div>`:''}
    ${p.track==='None'?'<span class="faint">Quantity only. Switch to Serial or Batch to record identities.</span>':''}</div>`);
}
function stitchPlanModal(only){
  const ps = (only || PRODUCTS).filter(isStocked).map(p=>({ p, s:stitchPlan(p) })).filter(x=>x.s && x.s.flag!=='Healthy' && !(x.s.flag==='Understock' && (x.p.po || inProdQty(x.p)>=x.s.qty)));
  const under = ps.filter(x=>x.s.flag==='Understock'), over = ps.filter(x=>x.s.flag==='Overstock');
  const buy = {}; under.filter(x=>!x.s.make).forEach(x=>{ (buy[x.p.mfr] = buy[x.p.mfr] || []).push(x); }); const make = under.filter(x=>x.s.make);
  const cost = under.reduce((a,x)=>a + x.s.qty*(x.s.make?bomCost(x.p):x.p.cost),0);
  S._plan = { buy, make };
  openModal(`<div class="mh">${ic('auto_awesome','ai-ic')}<div class="t">Plan with Stitch</div><button class="icon-btn" data-cmd="close-modal" aria-label="Close">${ic('close')}</button></div>
    <div class="mb"><p class="muted" style="margin:0 0 14px">Stitch reads the 30-day forecast, open sales orders, backorders, production plans and open purchase orders, then covers lead time plus three weeks.</p>
    ${under.length?`${Object.entries(buy).map(([m,xs])=>`<div class="dsec"><div class="dsec-h"><h4>${ic('shopping_cart')} Purchase order · ${esc(mfr(m).name)}</h4><span class="muted num">${money(xs.reduce((a,x)=>a+x.s.qty*x.p.cost,0))}</span></div><table class="t mini"><tbody>${xs.map(x=>`<tr><td>${esc(x.p.name)}${sub(esc(x.s.why))}</td><td class="r num" style="white-space:nowrap">${num(x.s.qty)} × ${money(x.p.cost)}</td></tr>`).join('')}</tbody></table></div>`).join('')}
      ${make.length?`<div class="dsec"><div class="dsec-h"><h4>${ic('precision_manufacturing')} Assemblies</h4></div><table class="t mini"><tbody>${make.map(x=>`<tr><td>${esc(x.p.name)}${sub(esc(x.s.why))}</td><td class="r num">${num(x.s.qty)} units</td></tr>`).join('')}</tbody></table></div>`:''}`:`<div class="empty" style="padding:20px">${ic('task_alt')}Nothing is understocked once open orders and production are counted.</div>`}
    ${over.length?`<div class="dsec"><div class="dsec-h"><h4>${ic('inventory')} Overstocked</h4></div><table class="t mini"><tbody>${over.map(x=>`<tr><td>${esc(x.p.name)}${sub(esc(x.s.why))}</td><td class="r"><button class="btn xs" data-cmd="new-doc" data-k="Transfer" data-id="${x.p.id}">Move to overflow</button></td></tr>`).join('')}</tbody></table></div>`:''}</div>
    <div class="mf"><button class="btn" data-cmd="close-modal">Close</button>${under.length?`<button class="btn primary" data-cmd="plan-go">${ic('auto_awesome')}Create ${Object.keys(buy).length} PO${Object.keys(buy).length===1?'':'s'}${make.length?` + ${make.length} assembl${make.length===1?'y':'ies'}`:''} · ${money(cost,0)}</button>`:''}</div>`, true);
}
Object.assign(CMD, {
  'open-supplier': el => { closeMenu(); closeModal(); openSupplier(el.dataset.id); },
  'open-cost': el => costPanel(el.dataset.id),
  'cost-save': el => { const p = prod(el.dataset.id); const v = +$('#pcIn').value; if(!(v>=0)) return toast('Enter a cost'); const was = p.cost; p.cost = v; p.updated = todayISO; toast(`${p.sku} purchase cost ${money(was)} → ${money(v)}`, ()=>{ p.cost = was; }); render(); costPanel(p.id); },
  'cost-from-bom': el => { const p = prod(el.dataset.id); $('#pcIn').value = bomCost(p).toFixed(2); },
  'open-pricing': el => pricingPanel(el.dataset.id),
  'pr-save': el => { const p = prod(el.dataset.id); readPricing(p); toast(`${p.sku} pricing saved`); render(); pricingPanel(p.id); },
  'pr-add-break': el => { const p = prod(el.dataset.id); readPricing(p); pricing(p).breaks.push({ tier:'Wholesale', min:24, price:+(pricing(p).tiers.Wholesale*0.95).toFixed(2) }); pricingPanel(p.id); },
  'pr-rm-break': el => { const p = prod(el.dataset.id); readPricing(p); pricing(p).breaks.splice(+el.dataset.i,1); pricingPanel(p.id); },
  'pr-add-cust': el => { const p = prod(el.dataset.id); readPricing(p); pricing(p).customers.push({ name:CUSTOMERS[0].name, price:pricing(p).tiers.Wholesale }); pricingPanel(p.id); },
  'pr-rm-cust': el => { const p = prod(el.dataset.id); readPricing(p); pricing(p).customers.splice(+el.dataset.i,1); pricingPanel(p.id); },
  'open-bom': el => { BOMD = null; bomPanel(el.dataset.id); },
  'bom-edit': el => { BOMD = null; bomPanel(el.dataset.id); },
  'bom-type': el => { BOMD.type = el.dataset.t; bomPanel(BOMD.id); },
  'bom-add': () => { const p = PRODUCTS.find(x=>isStocked(x) && x.id!==BOMD.id && !BOMD.comps.some(c=>c.pid===x.id) && x.status==='Internal') || PRODUCTS.find(isStocked); BOMD.comps.push({ pid:p.id, qty:1 }); bomPanel(BOMD.id); },
  'bom-rm': el => { BOMD.comps.splice(+el.dataset.i,1); bomPanel(BOMD.id); },
  'bom-save': el => { const p = prod(el.dataset.id); if(!BOMD.comps.length) return toast('Add at least one component'); p.bom = { type:BOMD.type, labor:+BOMD.labor||0, comps:BOMD.comps.map(c=>({...c})) }; if(p.bom.type==='Bundle') p.locs = p.locs; toast(`${p.sku} Bill of Materials saved · ${money(bomCost(p))}/unit`); render(); BOMD = null; bomPanel(p.id); },
  'bom-del': el => { const p = prod(el.dataset.id); const was = p.bom; delete p.bom; BOMD = null; toast(`${p.sku} BOM removed`, ()=>{ p.bom = was; }); closeDrawer(); render(); },
  'open-track': el => trackPanel(el.dataset.id),
  'track-set': el => { const p = prod(el.dataset.id); p.track = el.dataset.t; if(p.track==='Batch' && !lotsOf(p).length && onHand(p)) BATCHES.push({ lot:'LOT-OPEN-'+p.id.slice(1), pid:p.id, qty:onHand(p), exp:iso(new Date(TODAY.getTime()+365*864e5)), loc:p.locs[0]?.s||'—' }); toast(`${p.sku} tracked by ${p.track}`); render(); trackPanel(p.id); },
  'open-plan': el => stitchPlanModal([prod(el.dataset.id)]),
  'stitch-plan': () => { closeMenu(); stitchPlanModal(); },
  'plan-go': () => { const { buy, make } = S._plan; const made = [];
    Object.entries(buy).forEach(([m, xs])=>{ const u = newDoc('Purchase Order', { status:'Draft', party:mfr(m).name, sup:m, wh:'CDC', comments:'Drafted by Stitch from forecast, orders and production plan', lines:xs.map(x=>({ pid:x.p.id, qty:x.s.qty, cost:x.p.cost, rcv:0 })) }); setUnitCost(u); made.push(u.no); });
    make.forEach(x=>{ const u = newDoc('Assembly', { status:'Planned', wh:'CDC', loc:x.p.locs[0]?.s || bestBin(x.p,'CDC'), due:iso(new Date(TODAY.getTime()+5*864e5)), lines:[{ pid:x.p.id, qty:x.s.qty }], comments:'Planned by Stitch' }); setUnitCost(u); made.push(u.no); });
    syncPO(); closeModal(); toast(`Stitch created ${made.join(', ')}`); render(); }
});
document.addEventListener('input', e=>{ const t = e.target; if(!BOMD || !t.dataset) return; if(t.dataset.bl) BOMD.labor = +t.value||0; if(t.dataset.bc && t.dataset.f==='qty') BOMD.comps[+t.dataset.bc].qty = +t.value||1; });
document.addEventListener('change', e=>{ const t = e.target; if(!BOMD || !t.dataset) return; if(t.dataset.bc && t.dataset.f==='pid'){ BOMD.comps[+t.dataset.bc].pid = t.value; bomPanel(BOMD.id); } if(t.dataset.bc && t.dataset.f==='qty' || t.dataset.bl) bomPanel(BOMD.id); });

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

CMD['pick-all-q'] = () => pickQueue(null);
/*ERP-END*/

render();
})();
